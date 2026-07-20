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