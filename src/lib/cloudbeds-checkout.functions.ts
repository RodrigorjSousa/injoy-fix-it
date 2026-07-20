import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({
  property: z.enum(["Ipanema", "Botafogo"]),
  roomNumber: z.string().trim().min(1),
});

type CloudbedsRoom = Record<string, unknown>;

type CloudbedsReservation = Record<string, unknown> & {
  reservationID?: string | number;
  guestName?: string;
  firstName?: string;
  lastName?: string;
  guestFirstName?: string;
  guestLastName?: string;
  rooms?: CloudbedsRoom[];
};

type CloudbedsReservationResponse = {
  success?: boolean;
  data?: unknown;
};

function normalizeRoom(value: unknown) {
  const full = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\b(APT|APTO|APARTAMENTO|QUARTO|ROOM)\b/g, "")
    .replace(/[ºª#:\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^0+/, "");
  const digits = full.replace(/\D+/g, "").replace(/^0+/, "");
  return { full, digits };
}

function getReservationsFromPayload(payload: CloudbedsReservationResponse): CloudbedsReservation[] {
  const data = payload.data;
  if (Array.isArray(data)) return data as CloudbedsReservation[];
  if (data && typeof data === "object") {
    const rec = data as Record<string, unknown>;
    for (const key of ["reservations", "items", "results", "records"]) {
      if (Array.isArray(rec[key])) return rec[key] as CloudbedsReservation[];
    }
  }
  return [];
}

function getRoomCandidates(reservation: CloudbedsReservation): unknown[] {
  const candidates: unknown[] = [];
  const directKeys = [
    "roomName",
    "roomNumber",
    "roomNo",
    "roomCode",
    "assignedRoomName",
    "assignedRoomNumber",
    "accommodationName",
    "unitName",
  ];

  for (const key of directKeys) candidates.push(reservation[key]);

  const rooms = Array.isArray(reservation.rooms) ? reservation.rooms : [];
  for (const room of rooms) {
    for (const key of directKeys) candidates.push(room[key]);
    for (const [key, value] of Object.entries(room)) {
      const lower = key.toLowerCase();
      if (
        value != null &&
        (typeof value === "string" || typeof value === "number") &&
        (lower.includes("room") || lower.includes("unit") || lower.includes("accommodation")) &&
        !lower.includes("id") &&
        !lower.includes("type") &&
        !lower.includes("rate") &&
        !lower.includes("total")
      ) {
        candidates.push(value);
      }
    }
  }

  return candidates;
}

function reservationMatchesRoom(reservation: CloudbedsReservation, targetRoom: string) {
  const target = normalizeRoom(targetRoom);
  return getRoomCandidates(reservation).some((candidate) => {
    const normalized = normalizeRoom(candidate);
    if (!normalized.full && !normalized.digits) return false;
    if (target.full && normalized.full === target.full) return true;
    if (target.digits && normalized.digits && normalized.digits === target.digits) return true;
    return false;
  });
}

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

    const target = (data.roomNumber || "").trim();

    // Busca reservas hospedadas no Cloudbeds. Algumas contas retornam o status como
    // `checked_in`, outras como `in_house`; por isso consultamos ambos e com os dois
    // endpoints que expõem campos diferentes de quarto.
    const reservationsById = new Map<string, CloudbedsReservation>();
    const endpoints = ["/getReservations", "/getReservationsWithRateDetails"];
    const statuses = ["checked_in", "in_house"];

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
          throw new Error(`Falha ao consultar reservas: ${listRes.status} ${txt}`);
        }
        const listJson = (await listRes.json()) as CloudbedsReservationResponse;
        if (listJson.success === false) throw new Error("Cloudbeds retornou erro ao listar reservas");
        for (const reservation of getReservationsFromPayload(listJson)) {
          const key = String(reservation.reservationID ?? crypto.randomUUID());
          reservationsById.set(key, reservation);
        }
      }
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
