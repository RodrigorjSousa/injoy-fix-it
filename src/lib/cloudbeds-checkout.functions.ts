import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({
  property: z.enum(["Ipanema", "Botafogo"]),
  roomNumber: z.string().trim().min(1),
});

/**
 * Faz o check-out de uma reserva diretamente no Cloudbeds.
 * Busca a reserva atualmente `checked_in` no quarto informado
 * e altera o status para `checked_out`.
 * Usado nas duas unidades (Botafogo e Ipanema); a Recepção confere no quadro de check-outs,
 * autorizado para gestor/admin ou camareira da unidade.
 */
export const cloudbedsCheckoutRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Autorização: gestor/admin OU camareira
    const { data: roles, error: rErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rErr) throw new Error("Falha ao validar permissões");
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    const allowed =
      roleSet.has("gestor") ||
      roleSet.has("admin") ||
      roleSet.has("camareira") ||
      roleSet.has("funcionario");
    if (!allowed) throw new Error("Sem permissão para realizar check-out");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Nome de quem fez (perfil ou cadastro de funcionário)
    let camareiraName = "Camareira";
    {
      const { data: prof } = await supabase.from("profiles").select("nome").eq("id", userId).maybeSingle();
      if (prof?.nome) camareiraName = prof.nome;
      else {
        const { data: func } = await supabase.from("funcionarios").select("nome").eq("user_id", userId).order("nome").limit(1).maybeSingle();
        if (func?.nome) camareiraName = func.nome;
      }
    }

    // Registro para a Recepção conferir (com service role: não depende de permissão da camareira).
    const registrar = async (row: {
      guest_name: string | null;
      reservation_id: string | null;
      status: "confirmado" | "nao_confirmado" | "falhou";
      cloudbeds_status?: string | null;
      erro?: string | null;
    }) => {
      const base = {
        property: data.property,
        room_number: (data.roomNumber || "").trim(),
        camareira_id: userId,
        camareira_name: camareiraName,
        guest_name: row.guest_name,
        reservation_id: row.reservation_id,
      };
      let { error } = await supabaseAdmin.from("cloudbeds_checkout_logs" as never).insert({ ...base, ...row } as never);
      // Banco ainda sem as colunas novas: grava o básico (só quando deu certo).
      if (error && row.status === "confirmado") ({ error } = await supabaseAdmin.from("cloudbeds_checkout_logs" as never).insert(base as never));
      if (error) console.error("[checkout] falha ao registrar log", error.message);
      const texto =
        row.status === "confirmado"
          ? `✅ Check-out CONFIRMADO no Cloudbeds pela camareira ${camareiraName}. Hóspede: ${row.guest_name ?? "—"}.`
          : row.status === "nao_confirmado"
            ? `⚠️ Camareira ${camareiraName} fez o check-out, mas o Cloudbeds ainda não mostra como concluído. Confira no Cloudbeds. Hóspede: ${row.guest_name ?? "—"}.`
            : `❌ Check-out NÃO foi feito no Cloudbeds (camareira ${camareiraName}). Faça pelo Cloudbeds. Motivo: ${row.erro ?? "—"}`;
      const { error: recErr } = await supabaseAdmin.from("recados_camareiras").insert({
        property: data.property,
        room_number: (data.roomNumber || "").trim(),
        message: texto,
        created_by: userId,
        created_by_name: camareiraName,
        direction: "to_recepcao",
      });
      if (recErr) console.error("[checkout] falha ao avisar recepção", recErr.message);
    };

    let guestNameForLog: string | null = null;
    let reservationForLog: string | null = null;
    try {
      const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
      const { getReservationsFromPayload, reservationMatchesRoom, findMatchingRoomIdentifiers } = await import(
        "@/lib/cloudbeds/checkout-match.server"
      );
      const property = data.property.toLowerCase() as "ipanema" | "botafogo";

      const target = (data.roomNumber || "").trim();

      // Busca reservas hospedadas no Cloudbeds. Algumas contas retornam o status como
      // `checked_in`, outras como `in_house`; por isso consultamos ambos e com os dois
      // endpoints que expõem campos diferentes de quarto.
      const reservationsById = new Map<string, ReturnType<typeof getReservationsFromPayload>[number]>();
      const endpoints = ["/getReservations", "/getReservationsWithRateDetails"];
      const statuses = ["checked_in", "in_house"];

      let successfulQueries = 0;
      let lastCloudbedsError = "";

      for (const endpoint of endpoints) {
        for (const status of statuses) {
          const qs = new URLSearchParams({
            status,
            pageSize: "100",
            includeGuestsDetails: "true",
            includeAllRooms: "true",
          });
          const listRes = await cloudbedsFetch(property, `${endpoint}?${qs.toString()}`);
          if (!listRes.ok) {
            const txt = await listRes.text().catch(() => "");
            lastCloudbedsError = `${endpoint} ${status}: ${listRes.status} ${txt}`;
            continue;
          }
          const listJson = (await listRes.json()) as import("@/lib/cloudbeds/checkout-match.server").CloudbedsReservationResponse;
          if (listJson.success === false) {
            lastCloudbedsError = `${endpoint} ${status}: Cloudbeds retornou erro ao listar reservas`;
            continue;
          }
          successfulQueries += 1;
          for (const reservation of getReservationsFromPayload(listJson)) {
            const key = String(reservation.reservationID ?? `${endpoint}:${status}:${reservationsById.size}`);
            reservationsById.set(key, reservation);
          }
        }
      }

      if (successfulQueries === 0) {
        throw new Error(`Falha ao consultar reservas ativas no Cloudbeds: ${lastCloudbedsError}`);
      }

      const match = [...reservationsById.values()].find((reservation) =>
        reservationMatchesRoom(reservation, target),
      );

      if (!match?.reservationID) {
        throw new Error(`Nenhuma reserva ativa (check-in) encontrada para o quarto ${target}`);
      }

      const guestName: string | null =
        match.guestName ||
        [match.firstName ?? match.guestFirstName, match.lastName ?? match.guestLastName]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        null;
      guestNameForLog = guestName;
      reservationForLog = String(match.reservationID);

      // Identifica o quarto específico dentro da reserva (para reservas
      // multi-quarto — ex.: 107 + 109 no mesmo booking — para evitar
      // check-out em massa dos outros quartos).
      const roomIds = findMatchingRoomIdentifiers(match, target);

      // Aciona o check-out do quarto via endpoint correto do Cloudbeds
      // (postRoomCheckOut). O endpoint antigo /postReservationStatus não
      // existe (retornava 404).
      const body = new URLSearchParams({
        reservationID: String(match.reservationID),
      });
      if (roomIds.subReservationID) body.set("subReservationID", roomIds.subReservationID);
      else if (roomIds.roomID) body.set("roomID", roomIds.roomID);

      const chgRes = await cloudbedsFetch(property, `/postRoomCheckOut`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const chgJson = (await chgRes.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
      };
      if (!chgRes.ok || chgJson.success === false) {
        throw new Error(
          chgJson.message ??
            `Cloudbeds recusou o check-out (${chgRes.status}). Pode haver saldo em aberto.`,
        );
      }


      // Confere no próprio Cloudbeds se a reserva ficou como check-out feito.
      let cloudbedsStatus: string | null = null;
      for (let tentativa = 0; tentativa < 3 && !cloudbedsStatus?.startsWith("checked_out"); tentativa++) {
        if (tentativa > 0) await new Promise((r) => setTimeout(r, 1500));
        try {
          const det = await cloudbedsFetch(property, `/getReservation?reservationID=${encodeURIComponent(String(match.reservationID))}`);
          if (!det.ok) continue;
          const dj = (await det.json()) as { data?: Record<string, unknown> };
          const d = dj.data ?? {};
          const quartos = [
            ...(Array.isArray(d.assigned) ? (d.assigned as Record<string, unknown>[]) : []),
            ...(Array.isArray(d.unassigned) ? (d.unassigned as Record<string, unknown>[]) : []),
          ];
          const alvo = roomIds.subReservationID
            ? quartos.find((q) => String(q.subReservationID ?? "") === roomIds.subReservationID)
            : roomIds.roomID
              ? quartos.find((q) => String(q.roomID ?? "") === roomIds.roomID)
              : undefined;
          cloudbedsStatus = String(alvo?.roomStatus ?? d.status ?? "").toLowerCase() || null;
        } catch {
          /* tenta de novo */
        }
      }
      const confirmado = !!cloudbedsStatus && /checked_out|checkedout/.test(cloudbedsStatus);
      await registrar({
        guest_name: guestName,
        reservation_id: String(match.reservationID),
        status: confirmado ? "confirmado" : "nao_confirmado",
        cloudbeds_status: cloudbedsStatus,
      });
      return { ok: true, reservationID: String(match.reservationID), confirmado, cloudbedsStatus };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await registrar({ guest_name: guestNameForLog, reservation_id: reservationForLog, status: "falhou", erro: msg });
      throw e;
    }
  });
