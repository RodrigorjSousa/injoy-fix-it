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
    const { getReservationsFromPayload, reservationMatchesRoom } = await import(
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

    const guestName =
      match.guestName ||
      [match.firstName ?? match.guestFirstName, match.lastName ?? match.guestLastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      null;

    // Aciona check-out
    const body = new URLSearchParams({
      reservationID: String(match.reservationID),
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
      reservation_id: String(match.reservationID),
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

    return { ok: true, reservationID: String(match.reservationID) };
  });
