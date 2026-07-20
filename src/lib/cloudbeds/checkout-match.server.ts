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