import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({
  property: z.enum(["Ipanema", "Botafogo"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type ReservaHoje = {
  reservationID: string;
  hospede: string;
  quarto: string;
  checkIn: string;
  checkOut: string;
  noites: number;
  receita: number;
  status: string;
  adultos: number;
  criancas: number;
};

const HOTEL_TIME_ZONE = "America/Sao_Paulo";

function todayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOTEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function dateOnly(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  return trimmed.slice(0, 10);
}

function diffNoites(ci: string, co: string): number {
  if (!ci || !co) return 0;
  const a = new Date(ci);
  const b = new Date(co);
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Lista as reservas com check-in hoje na propriedade informada,
 * puxando direto do Cloudbeds (fonte da verdade).
 */
export const getReservasHoje = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Somente gestor/admin
    const { data: roles, error: rErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rErr) throw new Error("Falha ao validar permissões");
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!(roleSet.has("gestor") || roleSet.has("admin"))) {
      throw new Error("Sem permissão");
    }

    const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
    const property = data.property.toLowerCase() as "ipanema" | "botafogo";
    const hoje = data.date ?? todayISO();

    const qs = new URLSearchParams({
      checkInFrom: hoje,
      checkInTo: hoje,
      pageSize: "100",
      includeGuestsDetails: "true",
      includeAllRooms: "true",
    });
    const res = await cloudbedsFetch(property, `/getReservationsWithRateDetails?${qs.toString()}`);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Cloudbeds ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: Array<Record<string, unknown>>;
    };
    if (json.success === false) throw new Error("Cloudbeds retornou erro");

    const rows: ReservaHoje[] = [];
    const rawList = json.data ?? [];
    if (rawList.length > 0) {
      try {
        console.log("[chegadas-hoje] hoje=", hoje, "sample=", JSON.stringify(rawList[0]).slice(0, 1500));
      } catch {}
    } else {
      console.log("[chegadas-hoje] hoje=", hoje, "sem reservas retornadas");
    }
    for (const r of rawList) {

      const rec = r as {
        reservationID?: string | number;
        guestName?: string;
        guestFirstName?: string;
        guestLastName?: string;
        startDate?: string;
        endDate?: string;
        checkin?: string;
        checkout?: string;
        adults?: number;
        kids?: number;
        children?: number;
        status?: string;
        total?: number | string;
        balance?: number | string;
        totalCost?: number | string;
        grandTotal?: number | string;
        balanceTotal?: number | string;
        totalRate?: number | string;
        checkInDate?: string;
        checkinDate?: string;
        checkin_date?: string;
        checkIn?: string;
        rooms?: Array<{
          roomName?: string;
          roomNumber?: string;
          startDate?: string;
          endDate?: string;
          checkInDate?: string;
          checkinDate?: string;
          checkin_date?: string;
          checkIn?: string;
          checkin?: string;
          subtotal?: number | string;
          total?: number | string;
          roomTotal?: number | string;
          grandTotal?: number | string;
          totalRate?: number | string;
          roomRate?: number | string;
          adults?: number;
          children?: number;
          guestName?: string;
        }>;
      };

      const rid = String(rec.reservationID ?? "");
      const nomeBase =
        rec.guestName ||
        [rec.guestFirstName, rec.guestLastName].filter(Boolean).join(" ").trim() ||
        "Hóspede";
      const status = String(rec.status ?? "");
      const roomsArr = Array.isArray(rec.rooms) && rec.rooms.length > 0 ? rec.rooms : [null];
      const recTotal =
        Number(rec.grandTotal ?? rec.total ?? rec.totalCost ?? rec.balanceTotal ?? rec.totalRate ?? 0) || 0;
      const rateio = roomsArr.length > 0 ? recTotal / roomsArr.length : 0;

      for (const room of roomsArr) {
        const ci = dateOnly(
          (room && (room.startDate || room.checkInDate || room.checkinDate || room.checkin_date || room.checkIn || room.checkin)) ||
            rec.startDate ||
            rec.checkInDate ||
            rec.checkinDate ||
            rec.checkin_date ||
            rec.checkIn ||
            rec.checkin ||
            "",
        );
        if (ci !== hoje) continue;
        const co = String((room && room.endDate) || rec.endDate || rec.checkout || "");
        const receitaRoom =
          room &&
          (room.grandTotal ?? room.roomTotal ?? room.total ?? room.subtotal ?? room.totalRate ?? room.roomRate);
        const receita = Number(receitaRoom ?? rateio) || 0;
        const noites = diffNoites(ci, co);
        rows.push({
          reservationID: rid,
          hospede: (room && room.guestName) || nomeBase,
          quarto: String((room && (room.roomName || room.roomNumber)) || "—"),
          checkIn: ci,
          checkOut: co.slice(0, 10),
          noites,
          receita,
          status,
          adultos: Number((room && room.adults) ?? rec.adults ?? 0) || 0,
          criancas: Number((room && room.children) ?? rec.children ?? rec.kids ?? 0) || 0,
        });
      }
    }

    const EXCLUDED = new Set(["canceled", "cancelled", "cancelada", "checked_out", "checkedout", "no_show"]);
    const filtered = rows.filter((r) => r.checkIn === hoje && !EXCLUDED.has((r.status || "").toLowerCase()));
    const totalReceita = filtered.reduce((s, r) => s + r.receita, 0);
    return { reservas: filtered, totalReceita, data: hoje };
  });
