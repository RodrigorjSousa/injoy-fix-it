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
  tipoAcomodacao: string;
  checkIn: string;
  checkInTime: string;
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

function moneyNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rateForDate(value: unknown, date: string): number {
  if (!value || typeof value !== "object") return 0;
  const rates = value as Record<string, unknown>;
  return moneyNumber(rates[date]);
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

    // Gestor/admin veem o painel; recepção/camareiras usam os cards operacionais.
    const { data: roles, error: rErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rErr) throw new Error("Falha ao validar permissões");
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!(roleSet.has("gestor") || roleSet.has("admin") || roleSet.has("recepcao") || roleSet.has("camareira"))) {
      throw new Error("Sem permissão");
    }

    const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
    const property = data.property.toLowerCase() as "ipanema" | "botafogo";
    const hoje = data.date ?? todayISO();

    const fetchPage = async (pageNumber: number) => {
      const qs = new URLSearchParams({
        checkInFrom: hoje,
        checkInTo: hoje,
        pageSize: "100",
        pageNumber: String(pageNumber),
        includeGuestsDetails: "true",
        includeAllRooms: "true",
      });
      const res = await cloudbedsFetch(property, `/getReservations?${qs.toString()}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status >= 500) {
          throw new Error(
            `Cloudbeds está temporariamente indisponível (código ${res.status}). Tente novamente em alguns instantes.`,
          );
        }
        throw new Error(`Cloudbeds ${res.status}: ${txt.slice(0, 200)}`);
      }
      return (await res.json()) as {
        success?: boolean;
        data?: Array<Record<string, unknown>>;
        total?: number | string;
        count?: number | string;
      };
    };

    const firstPage = await fetchPage(1);
    if (firstPage.success === false) throw new Error("Cloudbeds retornou erro");
    const rawList = [...(firstPage.data ?? [])];
    const totalReservas = Number(firstPage.total ?? firstPage.count ?? rawList.length) || rawList.length;
    const totalPages = Math.min(Math.ceil(totalReservas / 100), 50);
    if (totalPages > 1) {
      const pages = await Promise.all(Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(i + 2)));
      for (const page of pages) {
        if (page.success !== false && Array.isArray(page.data)) rawList.push(...page.data);
      }
    }

    // Enriquecer com detalhes por reserva (estimatedArrivalTime nem sempre vem no list endpoint).
    const todayIds = new Set<string>();
    for (const r of rawList) {
      const rec = r as Record<string, unknown>;
      const ci = dateOnly(rec.reservationCheckIn ?? rec.startDate ?? rec.checkInDate ?? rec.checkIn);
      const id = String(rec.reservationID ?? "");
      if (ci === hoje && id) todayIds.add(id);
    }
    const detailMap = new Map<string, Record<string, unknown>>();
    await Promise.all(
      Array.from(todayIds).map(async (id) => {
        try {
          const res = await cloudbedsFetch(property, `/getReservation?reservationID=${encodeURIComponent(id)}`);
          if (!res.ok) return;
          const json = (await res.json()) as { success?: boolean; data?: Record<string, unknown> };
          if (json.success !== false && json.data) detailMap.set(id, json.data);
        } catch {}
      }),
    );
    for (const r of rawList) {
      const rec = r as Record<string, unknown>;
      const id = String(rec.reservationID ?? "");
      const det = detailMap.get(id);
      if (!det) continue;
      for (const k of ["estimatedArrivalTime", "arrivalTime", "checkInTime", "guestArrivalTime"]) {
        if (!rec[k] && det[k]) (rec as Record<string, unknown>)[k] = det[k];
      }
      if (Array.isArray(det.rooms) && Array.isArray((rec as { rooms?: unknown }).rooms)) {
        const recRooms = (rec as { rooms: Array<Record<string, unknown>> }).rooms;
        (det.rooms as Array<Record<string, unknown>>).forEach((dr, i) => {
          const rr = recRooms[i];
          if (!rr) return;
          for (const k of ["estimatedArrivalTime", "arrivalTime", "checkInTime"]) {
            if (!rr[k] && dr[k]) rr[k] = dr[k];
          }
        });
      }
    }

    const rows: ReservaHoje[] = [];
    const todayRec = rawList.find((r) => {
      const rec = r as Record<string, unknown>;
      const ci = dateOnly(rec.reservationCheckIn ?? rec.startDate ?? rec.checkInDate ?? rec.checkIn);
      return ci === hoje;
    });
    if (todayRec) {
      try {
        console.log("[chegadas-hoje] hoje=", hoje, "todaySample=", JSON.stringify(todayRec).slice(0, 3500));
      } catch {}
    } else {
      console.log("[chegadas-hoje] hoje=", hoje, "total=", rawList.length, "sem reservas checkIn=hoje");
    }
    for (const r of rawList) {

      const rec = r as {
        reservationID?: string | number;
        guestName?: string;
        guestFirstName?: string;
        guestLastName?: string;
        startDate?: string;
        endDate?: string;
        reservationCheckIn?: string;
        reservationCheckOut?: string;
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
        detailedRates?: Record<string, number | string>;
        balanceDetailed?: { grandTotal?: number | string; subTotal?: number | string };
        checkInDate?: string;
        checkinDate?: string;
        checkin_date?: string;
        checkIn?: string;
        checkInTime?: string;
        estimatedArrivalTime?: string;
        arrivalTime?: string;
        rooms?: Array<{
          roomName?: string;
          roomNumber?: string;
          roomTypeName?: string;
          roomType?: string;
          startDate?: string;
          endDate?: string;
          roomCheckIn?: string;
          roomCheckOut?: string;
          checkInDate?: string;
          checkinDate?: string;
          checkin_date?: string;
          checkIn?: string;
          checkin?: string;
          checkInTime?: string;
          estimatedArrivalTime?: string;
          arrivalTime?: string;
          subtotal?: number | string;
          total?: number | string;
          roomTotal?: number | string;
          grandTotal?: number | string;
          totalRate?: number | string;
          roomRate?: number | string;
          detailedRoomRates?: Record<string, number | string>;
          adults?: number;
          children?: number;
          roomStatus?: string;
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
        rateForDate(rec.detailedRates, hoje) ||
        moneyNumber(
          rec.grandTotal ??
            rec.balanceDetailed?.grandTotal ??
            rec.balanceDetailed?.subTotal ??
            rec.total ??
            rec.totalCost ??
            rec.balanceTotal ??
            rec.totalRate,
        );
      const rateio = roomsArr.length > 0 ? recTotal / roomsArr.length : 0;

      for (const room of roomsArr) {
        const candidates: unknown[] = [
          room &&
            (room.roomCheckIn ||
              room.startDate ||
              room.checkInDate ||
              room.checkinDate ||
              room.checkin_date ||
              room.checkIn ||
              room.checkin),
          rec.reservationCheckIn,
          rec.startDate,
          rec.checkInDate,
          rec.checkinDate,
          rec.checkin_date,
          rec.checkIn,
          rec.checkin,
          (rec as Record<string, unknown>)["arrivalDate"],
          (rec as Record<string, unknown>)["arrival_date"],
        ];
        const matched = candidates.find((c) => dateOnly(c) === hoje);
        if (!matched) continue;
        const ci = dateOnly(matched);
        const co = dateOnly(
          (room && (room.roomCheckOut || room.endDate)) || rec.reservationCheckOut || rec.endDate || rec.checkout || "",
        );

        const receitaRoom =
          room &&
          (rateForDate(room.detailedRoomRates, hoje) ||
            moneyNumber(room.grandTotal ?? room.roomTotal ?? room.total ?? room.subtotal ?? room.totalRate ?? room.roomRate));
        const receita = moneyNumber(receitaRoom) || rateio;
        const noites = diffNoites(ci, co);
        const rawTime = String(
          (room && (room.checkInTime || room.estimatedArrivalTime || room.arrivalTime)) ||
            rec.checkInTime ||
            rec.estimatedArrivalTime ||
            rec.arrivalTime ||
            "",
        );
        const timeMatch = rawTime.match(/\b(\d{1,2}):(\d{2})\b/);
        const checkInTime = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : "";
        const tipoAcomodacao = String((room && (room.roomTypeName || room.roomType)) || "");
        rows.push({
          reservationID: rid,
          hospede: (room && room.guestName) || nomeBase,
          quarto: String((room && (room.roomName || room.roomNumber)) || "—"),
          tipoAcomodacao,
          checkIn: ci,
          checkInTime,
          checkOut: co,
          noites,
          receita,
          status: String((room && room.roomStatus) || status),
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

export type ReservaFeita = {
  reservationID: string;
  hospede: string;
  checkIn: string;
  checkOut: string;
  dateCreated: string;
  status: string;
  receita: number;
};

/**
 * Lista as reservas CRIADAS hoje (novas reservas feitas no dia),
 * espelhando o painel "Reservas Feitas" do Cloudbeds.
 */
export const getReservasFeitasHoje = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles, error: rErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rErr) throw new Error("Falha ao validar permissões");
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!(roleSet.has("gestor") || roleSet.has("admin") || roleSet.has("recepcao") || roleSet.has("camareira"))) {
      throw new Error("Sem permissão");
    }

    const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
    const property = data.property.toLowerCase() as "ipanema" | "botafogo";
    const hoje = data.date ?? todayISO();

    const fetchPage = async (pageNumber: number) => {
      const qs = new URLSearchParams({
        resultsFrom: hoje,
        resultsTo: hoje,
        pageSize: "100",
        pageNumber: String(pageNumber),
        sortByRecent: "true",
      });
      const res = await cloudbedsFetch(property, `/getReservations?${qs.toString()}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        if (res.status >= 500) {
          throw new Error(
            `Cloudbeds está temporariamente indisponível (código ${res.status}). Tente novamente em alguns instantes.`,
          );
        }
        throw new Error(`Cloudbeds ${res.status}: ${txt.slice(0, 200)}`);
      }
      return (await res.json()) as {
        success?: boolean;
        data?: Array<Record<string, unknown>>;
        total?: number | string;
        count?: number | string;
      };
    };

    const firstPage = await fetchPage(1);
    if (firstPage.success === false) throw new Error("Cloudbeds retornou erro");
    const rawList = [...(firstPage.data ?? [])];

    const reservas: ReservaFeita[] = rawList.map((r) => {
      const rec = r as Record<string, unknown>;
      const nome =
        (rec.guestName as string) ||
        [rec.guestFirstName, rec.guestLastName].filter(Boolean).join(" ").trim() ||
        "Hóspede";
      const created = dateOnly(
        rec.dateCreated ?? rec.reservationDateCreated ?? rec.createdAt ?? rec.bookingDate ?? "",
      );
      const ci = dateOnly(rec.reservationCheckIn ?? rec.startDate ?? rec.checkInDate ?? rec.checkIn ?? "");
      const co = dateOnly(rec.reservationCheckOut ?? rec.endDate ?? rec.checkOut ?? "");
      const receita = moneyNumber(
        (rec as Record<string, unknown>).grandTotal ??
          (rec as Record<string, unknown>).total ??
          (rec as Record<string, unknown>).totalCost ??
          (rec as Record<string, unknown>).balanceTotal ??
          0,
      );
      return {
        reservationID: String(rec.reservationID ?? ""),
        hospede: nome,
        checkIn: ci,
        checkOut: co,
        dateCreated: created,
        status: String(rec.status ?? ""),
        receita,
      };
    });

    // Ordena mais recentes primeiro e limita a 10 (como o painel do Cloudbeds).
    reservas.sort((a, b) => (b.dateCreated || "").localeCompare(a.dateCreated || ""));
    const top = reservas.slice(0, 10);
    return { reservas: top, total: reservas.length, data: hoje };
  });
