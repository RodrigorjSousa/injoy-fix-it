// Busca no Cloudbeds as reservas de um mês e grava as noites vendidas (dash_reserva_noites)
// para o dashboard do gestor. As credenciais do Cloudbeds ficam só no servidor.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { noitesNoPeriodo, somarDias, soData, type UnidadeDash } from "@/lib/dashboard/rendimento";

const entrada = z.object({
  unidade: z.enum(["Botafogo", "Ipanema"]),
  mes: z.string().regex(/^\d{4}-\d{2}$/),
});

export type ResultadoSincronizacao = {
  unidade: UnidadeDash;
  mes: string;
  noites: number;
  reservas: number;
  fonte: string;
  avisos: string[];
};

type Rec = Record<string, unknown>;
type Pagina = { success?: boolean; data?: Rec[]; total?: number | string; count?: number | string; message?: string };

const MAX_PAGINAS = 40;

function ultimoDia(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/** Reserva toca o período? (check-in antes do fim e check-out depois do início) */
function tocaPeriodo(r: Rec, de: string, ate: string): boolean {
  const ci = soData(r.reservationCheckIn ?? r.startDate ?? r.checkIn);
  const co = soData(r.reservationCheckOut ?? r.endDate ?? r.checkOut);
  if (!ci || !co) return true; // sem datas no topo: deixa a conversão decidir pelos quartos
  return ci <= ate && co > de;
}

export const sincronizarRendimentoMes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => entrada.parse(input))
  .handler(async ({ data, context }): Promise<ResultadoSincronizacao> => {
    const { supabase, userId } = context;
    const { data: papeis, error: papelErro } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (papelErro) throw new Error("Falha ao validar permissões");
    const set = new Set((papeis ?? []).map((p) => p.role));
    if (!set.has("gestor") && !set.has("admin")) throw new Error("Somente o gestor atualiza o rendimento.");

    const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
    const property = data.unidade.toLowerCase() as "botafogo" | "ipanema";
    const de = `${data.mes}-01`;
    const ate = ultimoDia(data.mes);
    const avisos: string[] = [];

    async function listar(endpoint: string, filtros: Record<string, string>): Promise<Rec[]> {
      const todas: Rec[] = [];
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        const qs = new URLSearchParams({ ...filtros, pageSize: "100", pageNumber: String(pagina) });
        const res = await cloudbedsFetch(property, `${endpoint}?${qs.toString()}`);
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Cloudbeds ${endpoint} ${res.status}: ${txt.slice(0, 200)}`);
        }
        const json = (await res.json()) as Pagina;
        if (json.success === false) throw new Error(`Cloudbeds ${endpoint}: ${json.message ?? "erro ao listar reservas"}`);
        const lote = Array.isArray(json.data) ? json.data : [];
        todas.push(...lote);
        const total = Number(json.total ?? 0);
        if (lote.length < 100 || (total && todas.length >= total)) return todas;
      }
      avisos.push(`Cloudbeds: parei em ${MAX_PAGINAS} páginas (${todas.length} reservas); o mês pode estar incompleto.`);
      return todas;
    }

    let reservas: Rec[] = [];
    let fonte = "";
    try {
      // 1) Listagem com tarifa diária por quarto. Filtra pela saída: pega também quem entrou antes do mês.
      reservas = await listar("/getReservationsWithRateDetails", {
        reservationCheckOutFrom: somarDias(de, 1),
        reservationCheckOutTo: somarDias(ate, 120),
      });
      fonte = "getReservationsWithRateDetails";
    } catch (e) {
      // 2) Plano B: listagem simples + detalhe de cada reserva (traz as diárias).
      avisos.push(`Tarifas detalhadas indisponíveis (${e instanceof Error ? e.message : String(e)}); usei o detalhe de cada reserva.`);
      const lista = await listar("/getReservations", {
        checkInFrom: somarDias(de, -120),
        checkInTo: ate,
        includeAllRooms: "true",
      });
      const doMes = lista.filter((r) => tocaPeriodo(r, de, ate));
      const detalhes: Rec[] = [];
      for (let i = 0; i < doMes.length; i += 6) {
        const lote = await Promise.all(
          doMes.slice(i, i + 6).map(async (r) => {
            const id = String(r.reservationID ?? "");
            if (!id) return r;
            try {
              const res = await cloudbedsFetch(property, `/getReservation?reservationID=${encodeURIComponent(id)}`);
              if (!res.ok) return r;
              const json = (await res.json()) as { success?: boolean; data?: Rec };
              return json.success !== false && json.data ? { ...r, ...json.data } : r;
            } catch {
              return r;
            }
          }),
        );
        detalhes.push(...lote);
      }
      reservas = detalhes;
      fonte = "getReservations+getReservation";
    }

    const noites = noitesNoPeriodo(reservas.filter((r) => tocaPeriodo(r, de, ate)), data.unidade, de, ate);
    const semValor = noites.filter((n) => !(n.valor > 0)).length;
    if (semValor) avisos.push(`${semValor} noite(s) sem valor no Cloudbeds (contam na ocupação, não na diária).`);
    const semQuarto = noites.filter((n) => n.quarto === "Sem quarto").length;
    if (semQuarto) avisos.push(`${semQuarto} noite(s) de reservas ainda sem quarto atribuído.`);
    const qtdReservas = new Set(noites.map((n) => n.reservation_id)).size;

    const rpc = supabase.rpc as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: number | null; error: { message: string } | null }>;
    const { data: gravadas, error } = await rpc("dash_gravar_noites", {
      _unidade: data.unidade,
      _mes: de,
      _noites: noites,
      _reservas: qtdReservas,
      _fonte: fonte,
      _avisos: avisos.join(" | ") || null,
    });
    if (error) throw new Error(`Não gravou o rendimento: ${error.message}`);

    return { unidade: data.unidade, mes: data.mes, noites: Number(gravadas ?? 0), reservas: qtdReservas, fonte, avisos };
  });
