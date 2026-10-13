// Rendimento por unidade: transforma reservas do Cloudbeds em "noites vendidas" (uma linha por
// quarto por noite) e calcula os indicadores do dashboard. Funções puras (testes em rendimento.test.ts).
import { chaveQuarto } from "@/lib/cloudbeds/quarto-numero";

export type UnidadeDash = "Botafogo" | "Ipanema";

/** Quartos de cada unidade (mesma lista da vistoria e dos chamados). */
export const QUARTOS_UNIDADE: Record<UnidadeDash, string[]> = {
  Botafogo: ["01", "02", "03", "05", "06", "107", "108", "109", "110", "111", "112", "113", "114", "115", "117", "118", "301", "401", "501"],
  Ipanema: ["01", "02", "103", "104", "205", "206", "307", "308", "309", "410", "411", "412"],
};

export const SEM_QUARTO = "Sem quarto";

/** Uma noite vendida (o que fica gravado em dash_reserva_noites). */
export type NoiteVendida = {
  data: string; // YYYY-MM-DD (a noite)
  quarto: string;
  tipo_quarto: string | null;
  reservation_id: string;
  valor: number;
  status: string | null;
  origem: string | null;
  checkin: string | null;
  checkout: string | null;
  reservado_em: string | null;
};

const STATUS_FORA = new Set(["canceled", "cancelled", "cancelada", "cancelado", "no_show", "no-show", "noshow"]);

export function statusConta(status: unknown): boolean {
  return !STATUS_FORA.has(String(status ?? "").trim().toLowerCase());
}

export function dinheiro(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const t = value.trim();
  if (!t) return 0;
  const direto = Number(t);
  if (Number.isFinite(direto)) return direto;
  const br = Number(t.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(br) ? br : 0;
}

export function soData(value: unknown): string {
  if (typeof value !== "string") return "";
  const t = value.trim();
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Datas das noites entre check-in (inclusive) e check-out (exclusive). */
export function noitesEntre(checkin: string, checkout: string): string[] {
  if (!checkin || !checkout || checkout <= checkin) return [];
  const out: string[] = [];
  for (let d = checkin; d < checkout && out.length < 400; d = somarDias(d, 1)) out.push(d);
  return out;
}

/** Nome do quarto no Cloudbeds ("APT 107", "1") → nome usado no app ("107", "01"). */
export function quartoDoApp(nome: unknown, unidade: UnidadeDash): string {
  const bruto = String(nome ?? "").trim();
  if (!bruto) return SEM_QUARTO;
  const chave = chaveQuarto(bruto);
  return QUARTOS_UNIDADE[unidade].find((q) => chaveQuarto(q) === chave) ?? bruto;
}

type Rec = Record<string, unknown>;

/** Diárias de um quarto: objeto {data: valor} (getReservationsWithRateDetails) ou lista [{date, rate}] (getReservation). */
function diariasDoQuarto(q: Rec): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const fonte of [q.detailedRoomRates, q.dailyRates, q.detailedRates]) {
    if (Array.isArray(fonte)) {
      for (const d of fonte as Rec[]) {
        const data = soData(d?.date ?? d?.data);
        if (data) mapa.set(data, dinheiro(d?.rate ?? d?.amount ?? d?.valor));
      }
    } else if (fonte && typeof fonte === "object") {
      for (const [k, v] of Object.entries(fonte as Rec)) {
        const data = soData(k);
        if (data) mapa.set(data, dinheiro(v));
      }
    }
    if (mapa.size) break;
  }
  return mapa;
}

function totalDaReserva(r: Rec): number {
  const bd = (r.balanceDetailed ?? {}) as Rec;
  for (const v of [bd.subTotal, r.subTotal, r.total, r.grandTotal, bd.grandTotal, r.totalCost]) {
    const n = dinheiro(v);
    if (n > 0) return n;
  }
  return 0;
}

/**
 * Converte uma reserva do Cloudbeds em noites vendidas. Aceita o formato da listagem com tarifas
 * (`rooms[]` com `detailedRoomRates`) e o do detalhe (`assigned[]`/`unassigned[]` com `dailyRates`).
 * Valor de cada noite: tarifa do dia; se faltar, total do quarto ÷ noites; se faltar, total da reserva
 * dividido igualmente. Reservas canceladas e no-show não entram.
 */
export function noitesDaReserva(reserva: Rec, unidade: UnidadeDash): NoiteVendida[] {
  const status = String(reserva.status ?? "") || null;
  if (!statusConta(status)) return [];
  const id = String(reserva.reservationID ?? reserva.reservationId ?? "");
  if (!id) return [];
  const ciReserva = soData(reserva.reservationCheckIn ?? reserva.startDate ?? reserva.checkIn);
  const coReserva = soData(reserva.reservationCheckOut ?? reserva.endDate ?? reserva.checkOut);
  const origem = String(reserva.sourceName ?? reserva.source ?? "").trim() || null;
  const reservadoEm = soData(reserva.dateCreated ?? reserva.createdAt) || null;

  const quartos: Rec[] = [];
  for (const k of ["rooms", "assigned", "unassigned"]) {
    if (Array.isArray(reserva[k])) quartos.push(...(reserva[k] as Rec[]).filter((q) => q && typeof q === "object"));
  }
  if (!quartos.length) quartos.push({});

  const porQuarto = quartos.map((q) => {
    const ci = soData(q.roomCheckIn ?? q.startDate ?? q.checkIn ?? q.checkInDate) || ciReserva;
    const co = soData(q.roomCheckOut ?? q.endDate ?? q.checkOut ?? q.checkOutDate) || coReserva;
    return { q, ci, co, noites: noitesEntre(ci, co), diarias: diariasDoQuarto(q) };
  });
  const totalNoites = porQuarto.reduce((s, p) => s + p.noites.length, 0);
  const valorReserva = totalDaReserva(reserva);

  const out: NoiteVendida[] = [];
  for (const { q, ci, co, noites, diarias } of porQuarto) {
    if (!noites.length) continue;
    const totalQuarto = dinheiro(q.roomTotal ?? q.total ?? q.subtotal);
    const somaDiarias = noites.reduce((s, d) => s + (diarias.get(d) ?? 0), 0);
    const porNoite =
      somaDiarias > 0 ? 0 : totalQuarto > 0 ? totalQuarto / noites.length : totalNoites ? valorReserva / totalNoites : 0;
    for (const data of noites) {
      const valor = somaDiarias > 0 ? diarias.get(data) ?? 0 : porNoite;
      out.push({
        data,
        quarto: quartoDoApp(q.roomName ?? q.roomNumber, unidade),
        tipo_quarto: String(q.roomTypeName ?? q.roomType ?? "").trim() || null,
        reservation_id: id,
        valor: Math.round(valor * 100) / 100,
        status: String(q.roomStatus ?? "") || status,
        origem,
        checkin: ci || null,
        checkout: co || null,
        reservado_em: reservadoEm,
      });
    }
  }
  return out;
}

/** Junta noites de várias reservas, só no período, sem repetir (mesma reserva, quarto e noite). */
export function noitesNoPeriodo(reservas: Rec[], unidade: UnidadeDash, de: string, ate: string): NoiteVendida[] {
  const vistas = new Map<string, NoiteVendida>();
  for (const r of reservas) {
    for (const n of noitesDaReserva(r, unidade)) {
      if (n.data < de || n.data > ate) continue;
      vistas.set(`${n.reservation_id}|${n.quarto}|${n.data}`, n);
    }
  }
  return [...vistas.values()].sort((a, b) => a.data.localeCompare(b.data) || a.quarto.localeCompare(b.quarto));
}

// ---------------------------------------------------------------------------------------------
// Indicadores

export type NoiteLida = Pick<NoiteVendida, "data" | "quarto" | "reservation_id" | "valor" | "origem">;

export type IndicadorQuarto = { quarto: string; noites: number; receita: number; ocupacao: number; diariaMedia: number };
export type IndicadorDia = { data: string; ocupados: number; ocupacao: number; receita: number };
export type IndicadorFaixa = { de: number; ate: number; noites: number; parte: number };
export type IndicadorCanal = { origem: string; noites: number; receita: number; diariaMedia: number };

export type ResumoRendimento = {
  de: string;
  ate: string;
  dias: number;
  quartos: number;
  receita: number;
  noites: number;
  reservas: number;
  ocupacao: number; // 0..1
  diariaMedia: number; // ADR
  revpar: number;
  ticketMedio: number; // receita por reserva
  estadiaMedia: number; // noites por reserva
  porQuarto: IndicadorQuarto[];
  maisAlugados: IndicadorQuarto[];
  menosAlugados: IndicadorQuarto[];
  porDiaSemana: { dia: number; ocupacao: number; diariaMedia: number }[]; // 0 = domingo
  diasAlta: IndicadorDia[];
  diasBaixa: IndicadorDia[];
  faixas: IndicadorFaixa[];
  faixaMaisVendida: IndicadorFaixa | null;
  canais: IndicadorCanal[];
  noitesSemValor: number;
  noitesSemQuarto: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function diaSemana(data: string): number {
  return new Date(`${data}T12:00:00Z`).getUTCDay();
}

/**
 * Indicadores de uma unidade no período [de, ate]. `quartos` é a lista de quartos vendáveis
 * (base da ocupação). Noites fora do período são ignoradas.
 */
export function resumoRendimento(
  noitesTodas: NoiteLida[],
  opts: { de: string; ate: string; quartos: string[]; faixa?: number; top?: number },
): ResumoRendimento {
  const { de, ate, quartos } = opts;
  const largura = opts.faixa ?? 50;
  const top = opts.top ?? 3;
  const noites = noitesTodas.filter((n) => n.data >= de && n.data <= ate);
  const datas = noitesEntre(de, somarDias(ate, 1));
  const capacidadeDia = quartos.length;
  const capacidade = capacidadeDia * datas.length;

  const receita = noites.reduce((s, n) => s + Number(n.valor || 0), 0);
  const reservas = new Set(noites.map((n) => n.reservation_id)).size;

  const mapaQuarto = new Map<string, { noites: number; receita: number }>();
  for (const q of quartos) mapaQuarto.set(q, { noites: 0, receita: 0 });
  for (const n of noites) {
    if (n.quarto === SEM_QUARTO) continue;
    const atual = mapaQuarto.get(n.quarto) ?? { noites: 0, receita: 0 };
    atual.noites += 1;
    atual.receita += Number(n.valor || 0);
    mapaQuarto.set(n.quarto, atual);
  }
  const porQuarto: IndicadorQuarto[] = [...mapaQuarto.entries()].map(([quarto, v]) => ({
    quarto,
    noites: v.noites,
    receita: r2(v.receita),
    ocupacao: datas.length ? Math.min(1, v.noites / datas.length) : 0,
    diariaMedia: v.noites ? r2(v.receita / v.noites) : 0,
  }));
  const ordem = (a: IndicadorQuarto, b: IndicadorQuarto) =>
    b.noites - a.noites || b.receita - a.receita || a.quarto.localeCompare(b.quarto, "pt-BR", { numeric: true });
  const ordenados = [...porQuarto].filter((q) => quartos.includes(q.quarto)).sort(ordem);
  porQuarto.sort((a, b) => a.quarto.localeCompare(b.quarto, "pt-BR", { numeric: true }));

  // Dia a dia: quartos ocupados (um quarto conta uma vez por noite).
  const porDia = new Map<string, { quartos: Set<string>; receita: number; semQuarto: number }>();
  for (const d of datas) porDia.set(d, { quartos: new Set(), receita: 0, semQuarto: 0 });
  for (const n of noites) {
    const dia = porDia.get(n.data);
    if (!dia) continue;
    if (n.quarto === SEM_QUARTO) dia.semQuarto += 1;
    else dia.quartos.add(n.quarto);
    dia.receita += Number(n.valor || 0);
  }
  const dias: IndicadorDia[] = [...porDia.entries()].map(([data, v]) => {
    const ocupados = Math.min(capacidadeDia || Infinity, v.quartos.size + v.semQuarto);
    return { data, ocupados, ocupacao: capacidadeDia ? ocupados / capacidadeDia : 0, receita: r2(v.receita) };
  });
  const diasAlta = [...dias].sort((a, b) => b.ocupacao - a.ocupacao || b.receita - a.receita || a.data.localeCompare(b.data)).slice(0, 5);
  const diasBaixa = [...dias].sort((a, b) => a.ocupacao - b.ocupacao || a.receita - b.receita || a.data.localeCompare(b.data)).slice(0, 5);

  const porDiaSemana = Array.from({ length: 7 }, (_, dia) => {
    const doDia = dias.filter((d) => diaSemana(d.data) === dia);
    const ocup = doDia.reduce((s, d) => s + d.ocupados, 0);
    const rec = doDia.reduce((s, d) => s + d.receita, 0);
    return {
      dia,
      ocupacao: doDia.length && capacidadeDia ? ocup / (doDia.length * capacidadeDia) : 0,
      diariaMedia: ocup ? r2(rec / ocup) : 0,
    };
  });

  // Faixas de diária (só noites com valor).
  const comValor = noites.filter((n) => Number(n.valor) > 0);
  const mapaFaixa = new Map<number, number>();
  for (const n of comValor) {
    const base = Math.floor(Number(n.valor) / largura) * largura;
    mapaFaixa.set(base, (mapaFaixa.get(base) ?? 0) + 1);
  }
  const faixas: IndicadorFaixa[] = [...mapaFaixa.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([base, qtd]) => ({ de: base, ate: base + largura, noites: qtd, parte: comValor.length ? qtd / comValor.length : 0 }));
  const faixaMaisVendida = faixas.length ? [...faixas].sort((a, b) => b.noites - a.noites || a.de - b.de)[0] : null;

  const mapaCanal = new Map<string, { noites: number; receita: number }>();
  for (const n of noites) {
    const k = n.origem?.trim() || "Não informado";
    const c = mapaCanal.get(k) ?? { noites: 0, receita: 0 };
    c.noites += 1;
    c.receita += Number(n.valor || 0);
    mapaCanal.set(k, c);
  }
  const canais = [...mapaCanal.entries()]
    .map(([origem, c]) => ({ origem, noites: c.noites, receita: r2(c.receita), diariaMedia: c.noites ? r2(c.receita / c.noites) : 0 }))
    .sort((a, b) => b.receita - a.receita);

  return {
    de,
    ate,
    dias: datas.length,
    quartos: capacidadeDia,
    receita: r2(receita),
    noites: noites.length,
    reservas,
    ocupacao: capacidade ? Math.min(1, noites.length / capacidade) : 0,
    diariaMedia: noites.length ? r2(receita / noites.length) : 0,
    revpar: capacidade ? r2(receita / capacidade) : 0,
    ticketMedio: reservas ? r2(receita / reservas) : 0,
    estadiaMedia: reservas ? Math.round((noites.length / reservas) * 10) / 10 : 0,
    porQuarto,
    maisAlugados: ordenados.slice(0, top),
    menosAlugados: [...ordenados].reverse().slice(0, top),
    porDiaSemana,
    diasAlta,
    diasBaixa,
    faixas,
    faixaMaisVendida,
    canais,
    noitesSemValor: noites.length - comValor.length,
    noitesSemQuarto: noites.filter((n) => n.quarto === SEM_QUARTO).length,
  };
}

// ---------------------------------------------------------------------------------------------
// Reclamações e problemas por quarto

export type FontesReclamacao = {
  chamados: { descricao: string; unidade: string }[];
  vistorias: { room_number: string; property: string }[];
  avaliacoes: { quarto: string | null; unidade: string; nota: number }[];
};

export type ReclamacaoQuarto = { quarto: string; total: number; chamados: number; vistorias: number; avaliacoesRuins: number };

/** "[URGENTE] [Quarto 107] vazamento" → "107". Área comum e chamados sem quarto → null. */
export function quartoDoChamado(descricao: string): string | null {
  const m = String(descricao ?? "").match(/\[\s*Quarto\s+([^\]]+)\]/i);
  return m ? m[1].trim() : null;
}

/** Avaliação do totem conta como reclamação com nota até `notaMax` (padrão 3 de 5). */
export function reclamacoesPorQuarto(f: FontesReclamacao, unidade: UnidadeDash, notaMax = 3): ReclamacaoQuarto[] {
  const mapa = new Map<string, ReclamacaoQuarto>();
  const pegar = (nome: string) => {
    const quarto = quartoDoApp(nome, unidade);
    if (quarto === SEM_QUARTO) return null;
    const atual = mapa.get(quarto) ?? { quarto, total: 0, chamados: 0, vistorias: 0, avaliacoesRuins: 0 };
    mapa.set(quarto, atual);
    return atual;
  };
  for (const c of f.chamados) {
    if (c.unidade !== unidade) continue;
    const q = quartoDoChamado(c.descricao);
    const item = q ? pegar(q) : null;
    if (item) item.chamados += 1;
  }
  for (const v of f.vistorias) {
    if (v.property !== unidade) continue;
    const item = pegar(v.room_number);
    if (item) item.vistorias += 1;
  }
  for (const a of f.avaliacoes) {
    if (a.unidade !== unidade || !(Number(a.nota) <= notaMax)) continue;
    const item = pegar(a.quarto ?? "");
    if (item) item.avaliacoesRuins += 1;
  }
  return [...mapa.values()]
    .map((r) => ({ ...r, total: r.chamados + r.vistorias + r.avaliacoesRuins }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || b.avaliacoesRuins - a.avaliacoesRuins || a.quarto.localeCompare(b.quarto, "pt-BR", { numeric: true }));
}
