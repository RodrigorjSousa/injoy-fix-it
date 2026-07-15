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
 * Uso pensado para a unidade Ipanema (sem recepção),
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

    const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
    const property = data.property.toLowerCase() as "ipanema" | "botafogo";

    // Busca reservas em check-in (in_house)
    const qs = new URLSearchParams({
      status: "checked_in",
      pageSize: "100",
      includeGuestsDetails: "false",
    });
    const listRes = await cloudbedsFetch(property, `/getReservations?${qs.toString()}`);
    if (!listRes.ok) {
      const txt = await listRes.text().catch(() => "");
      throw new Error(`Falha ao consultar reservas: ${listRes.status} ${txt}`);
    }
    const listJson = (await listRes.json()) as {
      success?: boolean;
      data?: Array<{
        reservationID?: string;
        rooms?: Array<{ roomName?: string; roomNumber?: string; roomID?: string }>;
      }>;
    };
    if (listJson.success === false) throw new Error("Cloudbeds retornou erro ao listar reservas");

    const target = (data.roomNumber || "").trim();
    const match = (listJson.data ?? []).find((r) =>
      (r.rooms ?? []).some((rm) => {
        const n = String(rm.roomName ?? rm.roomNumber ?? "").trim();
        return n === target;
      }),
    ) as
      | {
          reservationID?: string;
          guestName?: string;
          firstName?: string;
          lastName?: string;
          rooms?: Array<{ roomName?: string; roomNumber?: string }>;
        }
      | undefined;

    if (!match?.reservationID) {
      throw new Error(`Nenhuma reserva ativa (check-in) encontrada para o quarto ${target}`);
    }

    const guestName =
      match.guestName ||
      [match.firstName, match.lastName].filter(Boolean).join(" ").trim() ||
      null;

    // Aciona check-out
    const body = new URLSearchParams({
      reservationID: match.reservationID,
      status: "checked_out",
    });
    const chgRes = await cloudbedsFetch(property, `/postReservationStatus`, {
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

    // Descobre nome da camareira (profile)
    let camareiraName = "Camareira";
    const { data: prof } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", userId)
      .maybeSingle();
    if (prof?.nome) camareiraName = prof.nome;

    // Registra log para o painel de administração
    await supabase.from("cloudbeds_checkout_logs" as never).insert({
      property: data.property,
      room_number: target,
      guest_name: guestName,
      reservation_id: match.reservationID,
      camareira_id: userId,
      camareira_name: camareiraName,
    } as never);

    // Notifica a recepção via recados_camareiras (direction to_recepcao)
    await supabase.from("recados_camareiras").insert({
      property: data.property,
      room_number: target,
      message: `Check-out realizado no Cloudbeds pela camareira ${camareiraName}. Hóspede: ${guestName ?? "—"}.`,
      created_by: userId,
      created_by_name: camareiraName,
      direction: "to_recepcao",
    });

    return { ok: true, reservationID: match.reservationID };
  });
