// Regras de cobrança das reservas (tela Reservas da Recepção).
// Documento de origem: "Regras de cobrança – InJoy (NR e Standard)", 14/10/2026.
//
// O app só IDENTIFICA e LISTA as reservas. A cobrança é feita pela recepção dentro do Cloudbeds,
// no cartão guardado na reserva (Stripe). Este arquivo é puro (sem rede/banco) para ser testado.
//
// Definições (todas as datas no horário do hotel, America/Sao_Paulo):
//   antecedência       = check-in − data da reserva (dias)
//   dias desde reserva = hoje − data da reserva (dias)
//   dias até check-in  = check-in − hoje (dias)
//
// Motivos:
//   NR com antecedência < 8           → entra na hora   ("Check-in em menos de 8 dias – cobrar na reserva")
//   NR com antecedência ≥ 8           → entra no 8º dia ("8º dia após a reserva")
//   Standard (não NR), 0 ≤ dias até check-in ≤ 2 → "Standard – 2 dias antes do check-in"

export type MotivoCobranca = "nr_checkin_proximo" | "nr_8o_dia" | "standard";

export const MOTIVO_TEXTO: Record<MotivoCobranca, string> = {
  nr_checkin_proximo: "Check-in em menos de 8 dias – cobrar na reserva",
  nr_8o_dia: "8º dia após a reserva",
  standard: "Standard – 2 dias antes do check-in",
};

export const MOTIVO_CURTO: Record<MotivoCobranca, string> = {
  nr_checkin_proximo: "NR · check-in próximo",
  nr_8o_dia: "NR · 8º dia",
  standard: "Standard",
};

/** Opções da coluna "Cobrado?" preenchida pela recepção. */
export const OPCOES_COBRADO = ["sim", "recusado", "link_enviado", "cancelada"] as const;
export type Cobrado = (typeof OPCOES_COBRADO)[number];
export const COBRADO_TEXTO: Record<Cobrado, string> = {
  sim: "Sim",
  recusado: "Recusado",
  link_enviado: "Link enviado",
  cancelada: "Cancelada",
};

/**
 * Canais que recebem o pagamento do hóspede (a recepção NÃO cobra).
 * Para incluir outro canal (ex.: "expedia collect", "booking.com payments"), basta acrescentar
 * um trecho do nome da origem aqui — é comparado sem acento e sem maiúsculas.
 */
export const CANAIS_QUE_RECEBEM_DO_HOSPEDE: string[] = ["airbnb"];

/** Status que entram na lista. Ficam de fora canceled, no_show, checked_in e checked_out. */
const STATUS_ELEGIVEIS = new Set(["confirmed", "not_confirmed"]);

export const PRAZO_NR_DIAS = 8;
export const JANELA_STANDARD_DIAS = 2;

// ------------------------------------------------------------------ utilidades de texto e data

/** Minúsculas, sem acentos, espaços simples. */
export function normalizarTexto(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "2026-10-14 09:31:00" | "2026-10-14T09:31:00Z" | "2026-10-14" → "2026-10-14" (ou null). */
export function dataISO(v: unknown): string | null {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Diferença em dias de calendário: b − a. */
export function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

export function somarDiasISO(dataISOStr: string, dias: number): string {
  const [y, m, d] = dataISOStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function numero(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// ------------------------------------------------------------------ NR e canais

/**
 * NR = nome do plano contém "nao reembolsavel", "non refundable" (com ou sem hífen) ou a palavra
 * "NR" isolada. Sem acento e sem maiúsculas.
 */
export function planoEhNR(nomePlano: unknown): boolean {
  const t = normalizarTexto(nomePlano);
  if (!t) return false;
  if (t.includes("nao reembolsavel")) return true;
  if (/non[\s-]*refundable/.test(t)) return true;
  return /(^|[^a-z0-9])nr([^a-z0-9]|$)/.test(t);
}

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Campos de nome de plano tarifário que o Cloudbeds pode usar dentro de cada quarto. */
const CHAVE_NOME_PLANO = /^(rate_?plan_?name.*|rate_?name|room_?rate_?name|rate_?plan|plan_?name)$/i;

/** Quartos da reserva (o Cloudbeds usa `rooms`; algumas respostas usam `room` ou `assigned`). */
export function quartosDaReserva(res: Obj): Obj[] {
  for (const chave of ["rooms", "room", "assigned", "unassigned"]) {
    const v = res[chave];
    if (Array.isArray(v)) return v.filter(ehObj);
    if (ehObj(v)) return Object.values(v).filter(ehObj);
  }
  return [];
}

/** Nomes de plano tarifário de todos os quartos da reserva, sem repetição. */
export function planosDaReserva(res: Obj): string[] {
  const nomes = new Set<string>();
  const coletar = (o: Obj) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && v.trim() && CHAVE_NOME_PLANO.test(k)) nomes.add(v.trim());
    }
  };
  for (const q of quartosDaReserva(res)) {
    coletar(q);
    // Detalhe por noite, quando vier (ex.: detailedRates / rates).
    for (const chave of ["detailedRates", "rates", "roomRateDetailed"]) {
      const v = q[chave];
      const itens = Array.isArray(v) ? v : ehObj(v) ? Object.values(v) : [];
      for (const it of itens) if (ehObj(it)) coletar(it);
    }
  }
  if (!nomes.size) coletar(res);
  return [...nomes];
}

/** Origem (canal) da reserva como texto. */
export function origemDaReserva(res: Obj): string {
  const v = res.sourceName ?? res.source ?? res.channelName ?? "";
  if (ehObj(v)) return String(v.name ?? v.sourceName ?? "").trim();
  return String(v ?? "").trim();
}

export function canalRecebeDoHospede(origem: string): boolean {
  const t = normalizarTexto(origem).replace(/\s+/g, "");
  return CANAIS_QUE_RECEBEM_DO_HOSPEDE.some((c) => t.includes(normalizarTexto(c).replace(/\s+/g, "")));
}

/**
 * paymentCollect = "channel" → cobrada pelo canal. Na v1.3 o campo vem dentro de `source`
 * (`source.paymentCollect`); também aceitamos no nível da reserva ou do quarto.
 */
export function cobradaPeloCanal(res: Obj): boolean {
  const eh = (v: unknown) => normalizarTexto(v) === "channel";
  if (eh(res.paymentCollect)) return true;
  if (ehObj(res.source) && eh(res.source.paymentCollect)) return true;
  return quartosDaReserva(res).some((q) => eh(q.paymentCollect));
}

/**
 * Nome do hóspede. Na v1.3 não há `guestName` no nível da reserva: ele vem em cada quarto
 * (`rooms[].guestName`) e na `guestList` (quando pedida).
 */
export function hospedeDaReserva(res: Obj): string {
  const direto = String(res.guestName ?? "").trim();
  if (direto) return direto;
  for (const q of quartosDaReserva(res)) {
    const n = String(q.guestName ?? "").trim();
    if (n) return n;
  }
  const lista = res.guestList;
  const hospedes = Array.isArray(lista) ? lista : ehObj(lista) ? Object.values(lista) : [];
  for (const g of hospedes) {
    if (!ehObj(g)) continue;
    const n = (String(g.guestName ?? "").trim() || `${g.guestFirstName ?? ""} ${g.guestLastName ?? ""}`.trim());
    if (n) return n;
  }
  return "Hóspede";
}

// ------------------------------------------------------------------ avaliação de uma reserva

export type ReservaNormalizada = {
  reservationId: string;
  propertyId: string | null;
  hospede: string;
  dataReserva: string | null;
  checkin: string | null;
  checkout: string | null;
  status: string;
  saldo: number;
  origem: string;
  planos: string[];
  nr: boolean;
};

export type Exclusao =
  | "status"
  | "sem_saldo"
  | "canal_recebe"
  | "cobrada_pelo_canal"
  | "sem_datas"
  | "nr_aguardando_8o_dia"
  | "standard_antes_da_janela"
  | "standard_checkin_passou";

export const EXCLUSAO_TEXTO: Record<Exclusao, string> = {
  status: "Status fora da regra",
  sem_saldo: "Sem saldo em aberto",
  canal_recebe: "Canal recebe do hóspede",
  cobrada_pelo_canal: "Cobrança pelo canal",
  sem_datas: "Reserva sem datas",
  nr_aguardando_8o_dia: "NR aguardando o 8º dia",
  standard_antes_da_janela: "Standard: ainda falta para o check-in",
  standard_checkin_passou: "Standard: check-in já passou",
};

export type Avaliacao = ReservaNormalizada & {
  /** Preenchido quando a reserva entra na lista. */
  motivo: MotivoCobranca | null;
  /** Por que ficou fora (quando não entra). */
  exclusao: Exclusao | null;
  antecedencia: number | null;
  diasDesdeReserva: number | null;
  diasAteCheckin: number | null;
  /** Para quem ainda vai entrar: dia em que entra na lista. */
  entraEm: string | null;
};

export function normalizarReserva(res: Obj): ReservaNormalizada {
  const planos = planosDaReserva(res);
  return {
    reservationId: String(res.reservationID ?? res.reservationId ?? res.id ?? "").trim(),
    propertyId: res.propertyID != null ? String(res.propertyID) : res.propertyId != null ? String(res.propertyId) : null,
    hospede: hospedeDaReserva(res),
    dataReserva: dataISO(res.dateCreated),
    checkin: dataISO(res.reservationCheckIn ?? res.startDate),
    checkout: dataISO(res.reservationCheckOut ?? res.endDate),
    status: normalizarTexto(res.status).replace(/\s+/g, "_"),
    saldo: numero(res.balance),
    origem: origemDaReserva(res),
    planos,
    // Basta um quarto com plano NR para a reserva inteira ser NR.
    nr: planos.some(planoEhNR),
  };
}

export function avaliarReserva(res: Obj, hoje: string): Avaliacao {
  const r = normalizarReserva(res);
  const base: Avaliacao = {
    ...r,
    motivo: null,
    exclusao: null,
    antecedencia: null,
    diasDesdeReserva: null,
    diasAteCheckin: null,
    entraEm: null,
  };
  if (r.dataReserva && r.checkin) {
    base.antecedencia = diasEntre(r.dataReserva, r.checkin);
    base.diasDesdeReserva = diasEntre(r.dataReserva, hoje);
    base.diasAteCheckin = diasEntre(hoje, r.checkin);
  }
  const fora = (exclusao: Exclusao, entraEm: string | null = null): Avaliacao => ({ ...base, exclusao, entraEm });

  // Filtros (todos precisam passar).
  if (!STATUS_ELEGIVEIS.has(r.status)) return fora("status");
  if (!(r.saldo > 0)) return fora("sem_saldo");
  if (canalRecebeDoHospede(r.origem)) return fora("canal_recebe");
  if (cobradaPeloCanal(res)) return fora("cobrada_pelo_canal");
  if (!r.dataReserva || !r.checkin || base.antecedencia === null) return fora("sem_datas");

  // Regras.
  if (r.nr) {
    if (base.antecedencia < PRAZO_NR_DIAS) return { ...base, motivo: "nr_checkin_proximo" };
    if ((base.diasDesdeReserva ?? 0) >= PRAZO_NR_DIAS) return { ...base, motivo: "nr_8o_dia" };
    return fora("nr_aguardando_8o_dia", somarDiasISO(r.dataReserva, PRAZO_NR_DIAS));
  }
  const ate = base.diasAteCheckin ?? 0;
  if (ate >= 0 && ate <= JANELA_STANDARD_DIAS) return { ...base, motivo: "standard" };
  if (ate > JANELA_STANDARD_DIAS) return fora("standard_antes_da_janela", somarDiasISO(r.checkin, -JANELA_STANDARD_DIAS));
  return fora("standard_checkin_passou");
}

// ------------------------------------------------------------------ ordenação da lista

type Ordenavel = { motivo: MotivoCobranca; checkin: string | null; dataReserva: string | null; reservationId: string };

/**
 * Primeiro as que dependem do check-in (NR de check-in próximo e Standard), por check-in;
 * depois as NR do 8º dia, das mais atrasadas (reserva mais antiga) para as mais recentes.
 */
export function compararParaLista(a: Ordenavel, b: Ordenavel): number {
  const grupo = (x: Ordenavel) => (x.motivo === "nr_8o_dia" ? 1 : 0);
  if (grupo(a) !== grupo(b)) return grupo(a) - grupo(b);
  const chave = (x: Ordenavel) => (grupo(x) === 0 ? x.checkin : x.dataReserva) ?? "9999-12-31";
  const c = chave(a).localeCompare(chave(b));
  return c !== 0 ? c : a.reservationId.localeCompare(b.reservationId);
}

/** Por que uma reserva que estava na lista saiu dela. */
export type MotivoSaida = "saldo_zerado" | "cancelada" | "check_in_feito" | "fora_da_regra" | "nao_encontrada";

export const SAIDA_TEXTO: Record<MotivoSaida, string> = {
  saldo_zerado: "Saldo zerado",
  cancelada: "Cancelada no Cloudbeds",
  check_in_feito: "Check-in/out feito",
  fora_da_regra: "Saiu da regra",
  nao_encontrada: "Não encontrada no Cloudbeds",
};

export function motivoDeSaida(av: Avaliacao | undefined): MotivoSaida {
  if (!av) return "nao_encontrada";
  if (av.status === "canceled" || av.status === "cancelled" || av.status === "no_show") return "cancelada";
  if (av.status === "checked_in" || av.status === "checked_out") return "check_in_feito";
  if (!(av.saldo > 0)) return "saldo_zerado";
  return "fora_da_regra";
}

/** Link para abrir a reserva no Cloudbeds. */
export function linkCloudbeds(propertyId: string | null | undefined, reservationId: string): string {
  const id = encodeURIComponent(reservationId);
  return propertyId
    ? `https://hotels.cloudbeds.com/connect/${encodeURIComponent(propertyId)}#/reservations/${id}`
    : `https://hotels.cloudbeds.com/connect#/reservations/${id}`;
}
