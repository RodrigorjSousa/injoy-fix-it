import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({
  property: z.enum(["Ipanema", "Botafogo"]),
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

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 10);
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
    const hoje = todayISO();

    const qs = new URLSearchParams({
      checkInFrom: hoje,
      checkInTo: hoje,
      pageSize: "100",
      includeGuestsDetails: "true",
    });
    const res = await cloudbedsFetch(property, `/getReservations?${qs.toString()}`);
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
    for (const r of json.data ?? []) {
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
        rooms?: Array<{
          roomName?: string;
          roomNumber?: string;
          startDate?: string;
          endDate?: string;
          subtotal?: number | string;
          total?: number | string;
          roomTotal?: number | string;
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

      for (const room of roomsArr) {
        const ci = String((room && room.startDate) || rec.startDate || rec.checkin || "");
        const co = String((room && room.endDate) || rec.endDate || rec.checkout || "");
        const receitaRaw =
          (room && (room.roomTotal ?? room.total ?? room.subtotal)) ??
          rec.total ??
          rec.totalCost ??
          0;
        const receita = Number(receitaRaw) || 0;
        const noites = diffNoites(ci, co);
        rows.push({
          reservationID: rid,
          hospede: (room && room.guestName) || nomeBase,
          quarto: String((room && (room.roomName || room.roomNumber)) || "—"),
          checkIn: ci.slice(0, 10),
          checkOut: co.slice(0, 10),
          noites,
          receita,
          status,
          adultos: Number((room && room.adults) ?? rec.adults ?? 0) || 0,
          criancas: Number((room && room.children) ?? rec.children ?? rec.kids ?? 0) || 0,
        });
      }
    }

    const totalReceita = rows.reduce((s, r) => s + r.receita, 0);
    return { reservas: rows, totalReceita, data: hoje };
  });
