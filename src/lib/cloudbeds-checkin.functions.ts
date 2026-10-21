import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({
  property: z.enum(["Ipanema", "Botafogo"]),
  roomNumber: z.string().trim().min(1),
  reservationId: z.string().trim().min(1),
});

export type ResultadoCheckin = {
  ok: true;
  confirmado: boolean;
  jaEstava: boolean;
  cloudbedsStatus: string | null;
  hospede: string | null;
};

const hospedado = (s: string | null | undefined) => /checked_in|in_house|inhouse/.test(String(s ?? "").toLowerCase());

/**
 * Check-in de VERDADE no Cloudbeds (antes o botão da Recepção só marcava na tela).
 * Usa o quarto certo da reserva (multi-quarto não faz check-in dos outros), confere no Cloudbeds se
 * ficou hospedado e avisa as camareiras do quarto. Recepção, gestor e admin.
 */
export const cloudbedsCheckinRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ResultadoCheckin> => {
    const { supabase, userId } = context;

    const { data: roles, error: rErr } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (rErr) throw new Error("Falha ao validar permissões");
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    let permitido = roleSet.has("gestor") || roleSet.has("admin") || roleSet.has("recepcao");
    let nome = "Recepção";
    {
      const { data: func } = await supabase
        .from("funcionarios")
        .select("nome, telas_permitidas")
        .eq("user_id", userId)
        .order("nome")
        .limit(1)
        .maybeSingle();
      if (func?.nome) nome = func.nome;
      // Quem tem a tela Recepção liberada no cadastro também faz check-in (mesma regra do menu).
      if (Array.isArray(func?.telas_permitidas) && func.telas_permitidas.includes("recepcao")) permitido = true;
      if (!func?.nome) {
        const { data: prof } = await supabase.from("profiles").select("nome").eq("id", userId).maybeSingle();
        if (prof?.nome) nome = prof.nome;
      }
    }
    if (!permitido) throw new Error("Sem permissão para fazer check-in");

    const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
    const { findMatchingRoomIdentifiers } = await import("@/lib/cloudbeds/checkout-match.server");
    const property = data.property.toLowerCase() as "ipanema" | "botafogo";
    const quarto = data.roomNumber.trim();

    const lerReserva = async () => {
      const res = await cloudbedsFetch(property, `/getReservation?reservationID=${encodeURIComponent(data.reservationId)}`);
      if (!res.ok) throw new Error(`Cloudbeds não respondeu a reserva (${res.status}).`);
      const j = (await res.json()) as { success?: boolean; message?: string; data?: Record<string, unknown> };
      if (j.success === false || !j.data) throw new Error(j.message ?? "Reserva não encontrada no Cloudbeds.");
      return j.data;
    };
    const statusDoQuarto = (d: Record<string, unknown>, ids: { roomID?: string; subReservationID?: string }) => {
      const quartos = [
        ...(Array.isArray(d.assigned) ? (d.assigned as Record<string, unknown>[]) : []),
        ...(Array.isArray(d.unassigned) ? (d.unassigned as Record<string, unknown>[]) : []),
      ];
      const alvo = ids.subReservationID
        ? quartos.find((q) => String(q.subReservationID ?? "") === ids.subReservationID)
        : ids.roomID
          ? quartos.find((q) => String(q.roomID ?? "") === ids.roomID)
          : undefined;
      return String(alvo?.roomStatus ?? d.status ?? "").toLowerCase() || null;
    };

    const reserva = await lerReserva();
    const hospede =
      String(reserva.guestName ?? "").trim() ||
      [reserva.guestFirstName, reserva.guestLastName].filter(Boolean).join(" ").trim() ||
      null;
    const ids = findMatchingRoomIdentifiers(reserva as never, quarto);
    if (!ids.roomID && !ids.subReservationID) {
      throw new Error(`O quarto ${quarto} não está atribuído a esta reserva no Cloudbeds. Atribua o quarto e tente de novo.`);
    }
    const antes = statusDoQuarto(reserva, ids);
    if (hospedado(antes)) {
      return { ok: true, confirmado: true, jaEstava: true, cloudbedsStatus: antes, hospede };
    }

    const body = new URLSearchParams({ reservationID: data.reservationId });
    if (ids.subReservationID) body.set("subReservationID", ids.subReservationID);
    else if (ids.roomID) body.set("roomID", ids.roomID);
    const res = await cloudbedsFetch(property, `/postRoomCheckIn`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const rj = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
    if (!res.ok || rj.success === false) {
      throw new Error(rj.message ?? `Cloudbeds recusou o check-in (${res.status}).`);
    }

    // Confere no Cloudbeds se ficou hospedado.
    let cloudbedsStatus: string | null = null;
    for (let t = 0; t < 3 && !hospedado(cloudbedsStatus); t++) {
      if (t > 0) await new Promise((r) => setTimeout(r, 1500));
      try {
        cloudbedsStatus = statusDoQuarto(await lerReserva(), ids);
      } catch {
        /* tenta de novo */
      }
    }
    const confirmado = hospedado(cloudbedsStatus);

    // Avisa as camareiras do quarto (vira push "Recado da recepção").
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: recErr } = await supabaseAdmin.from("recados_camareiras").insert({
      property: data.property,
      room_number: quarto,
      message: confirmado
        ? `✅ Check-in feito: ${hospede ?? "hóspede"} está no quarto (por ${nome}).`
        : `⚠️ Check-in enviado por ${nome}, mas o Cloudbeds ainda não confirmou. Hóspede: ${hospede ?? "—"}.`,
      created_by: userId,
      created_by_name: nome,
      direction: "to_camareira",
    });
    if (recErr) console.error("[checkin] falha ao avisar camareiras", recErr.message);

    return { ok: true, confirmado, jaEstava: false, cloudbedsStatus, hospede };
  });
