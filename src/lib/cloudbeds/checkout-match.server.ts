export type CloudbedsRoom = Record<string, unknown>;

export type CloudbedsReservation = Record<string, unknown> & {
  reservationID?: string | number;
  guestName?: string;
  firstName?: string;
  lastName?: string;
  guestFirstName?: string;
  guestLastName?: string;
  rooms?: CloudbedsRoom[];
};

export type CloudbedsReservationResponse = {
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

export function getReservationsFromPayload(payload: CloudbedsReservationResponse): CloudbedsReservation[] {
  const data = payload.data;
  if (Array.isArray(data)) return data as CloudbedsReservation[];
  if (data && typeof data === "object") {
    const rec = data as Record<string, unknown>;
    for (const key of ["reservations", "items", "results", "records"]) {
      if (Array.isArray(rec[key])) return rec[key] as CloudbedsReservation[];
    }
    const values = Object.values(rec).filter(
      (value): value is CloudbedsReservation =>
        !!value &&
        typeof value === "object" &&
        ("reservationID" in value || "rooms" in value || "guestName" in value),
    );
    if (values.length > 0) return values;
  }
  return [];
}

function getRoomCandidates(reservation: CloudbedsReservation): unknown[] {
  const candidates: unknown[] = [];

  const shouldReadKey = (key: string, roomContext: boolean) => {
    const lower = key.toLowerCase();
    if (
      lower.includes("id") ||
      lower.includes("type") ||
      lower.includes("rate") ||
      lower.includes("total") ||
      lower.includes("count") ||
      lower.includes("quantity")
    ) {
      return false;
    }
    if (lower.includes("room") || lower.includes("unit") || lower.includes("accommodation")) {
      return true;
    }
    return roomContext && ["name", "number", "no", "code", "title"].includes(lower);
  };

  const walk = (value: unknown, key = "", roomContext = false, depth = 0) => {
    if (value == null || depth > 4) return;
    const nextRoomContext =
      roomContext || /room|unit|accommodation|quarto|apartamento/i.test(key);

    if (typeof value === "string" || typeof value === "number") {
      if (shouldReadKey(key, roomContext)) candidates.push(value);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) walk(item, key, nextRoomContext, depth + 1);
      return;
    }

    if (typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value)) {
        walk(childValue, childKey, nextRoomContext, depth + 1);
      }
    }
  };

  walk(reservation);

  return candidates;
}

export function reservationMatchesRoom(reservation: CloudbedsReservation, targetRoom: string) {
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
 * Dentro de uma reserva (que pode ter múltiplos quartos), encontra o roomID
 * e subReservationID correspondentes ao quarto solicitado. Necessário para
 * checkout parcial via /postRoomCheckOut quando a reserva agrupa vários
 * quartos (ex.: mesmo hóspede em 107 + 109).
 */
export function findMatchingRoomIdentifiers(
  reservation: CloudbedsReservation,
  targetRoom: string,
): { roomID?: string; subReservationID?: string } {
  const target = normalizeRoom(targetRoom);
  const matchesTarget = (value: unknown) => {
    const normalized = normalizeRoom(value);
    if (!normalized.full && !normalized.digits) return false;
    if (target.full && normalized.full === target.full) return true;
    if (target.digits && normalized.digits && normalized.digits === target.digits) return true;
    return false;
  };

  const result: { roomID?: string; subReservationID?: string } = {};

  const walk = (value: unknown, depth = 0): boolean => {
    if (value == null || depth > 5) return false;
    if (Array.isArray(value)) {
      for (const item of value) if (walk(item, depth + 1)) return true;
      return false;
    }
    if (typeof value !== "object") return false;
    const obj = value as Record<string, unknown>;

    // Verifica se este objeto descreve um quarto que bate com o alvo.
    let hit = false;
    for (const [k, v] of Object.entries(obj)) {
      const key = k.toLowerCase();
      if (
        (key.includes("room") || key.includes("unit") || key.includes("accommodation")) &&
        (key.includes("name") || key.includes("number") || key.includes("no") || key.includes("code") || key === "room") &&
        !key.includes("type") &&
        !key.includes("rate") &&
        (typeof v === "string" || typeof v === "number")
      ) {
        if (matchesTarget(v)) {
          hit = true;
          break;
        }
      }
    }

    if (hit) {
      for (const [k, v] of Object.entries(obj)) {
        const key = k.toLowerCase();
        if (!result.roomID && key === "roomid" && (typeof v === "string" || typeof v === "number")) {
          result.roomID = String(v);
        }
        if (!result.subReservationID && (key === "subreservationid" || key === "subreservationsid") && (typeof v === "string" || typeof v === "number")) {
          result.subReservationID = String(v);
        }
      }
      if (result.roomID || result.subReservationID) return true;
    }

    for (const v of Object.values(obj)) {
      if (walk(v, depth + 1)) return true;
    }
    return false;
  };

  walk(reservation);
  return result;
}