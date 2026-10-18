// Regras de segurança da cobrança pelo Stripe (tela Reservas). Puras, sem rede: testadas em stripe-regras.test.ts.
//
// Como o Cloudbeds guarda os cartões: ao salvar um cartão numa reserva, o Cloudbeds cria um Cliente
// ("Customer") no Stripe da unidade com a descrição "Injoy Suítes & Aparts Botafogo - Reservas: <nº>".
// A mesma pessoa pode ter vários Clientes (um por reserva) e vários cartões. Por isso, antes de cobrar:
//   1. o saldo é relido no Cloudbeds na hora e precisa ser o valor que a recepcionista confirmou;
//   2. só vale o Cliente cuja descrição tem EXATAMENTE o nº desta reserva (nenhum ou mais de um = não cobra);
//   3. só vale cartão desse Cliente que também está na reserva do Cloudbeds (bandeira + final) e não venceu;
//   4. não pode haver cobrança do app já aprovada ou em andamento para a reserva.
// Qualquer dúvida = não cobra e manda resolver pelo Cloudbeds.

export type ModoStripe = "teste" | "real";

/** Só chave RESTRITA (rk_). Chave secreta (sk_) dá acesso total e é recusada. */
export function modoDaChave(chave: string | undefined | null): ModoStripe | null {
  const c = String(chave ?? "").trim();
  if (c.startsWith("rk_test_")) return "teste";
  if (c.startsWith("rk_live_")) return "real";
  return null;
}

// ------------------------------------------------------------------ Cliente da reserva

/** Números de reserva listados depois de "Reservas:" (ou "Reserva:") na descrição do Cliente. */
export function reservasDaDescricao(descricao: unknown): string[] {
  const texto = String(descricao ?? "");
  const achados: string[] = [];
  for (const m of texto.matchAll(/reservas?\s*:\s*([^\n]*)/gi)) {
    for (const t of m[1].split(/[^0-9A-Za-z]+/)) if (t) achados.push(t);
  }
  return achados;
}

/** Chave da metadata gravada no Cliente do Stripe para achá-lo pelo nº da reserva (busca exata). */
export const chaveMetaReserva = (reservationId: string) => `injoy_reserva_${String(reservationId).trim()}`;

/** Nºs de reserva da descrição que viram etiqueta (só identificadores plausíveis: 6+ letras/dígitos, máx. 20). */
export function reservasParaIndice(descricao: unknown): string[] {
  return [...new Set(reservasDaDescricao(descricao).filter((t) => /^[0-9A-Za-z]{6,26}$/.test(t)))].slice(0, 20);
}

/** Etiquetas que faltam no Cliente (vazio = já indexado). */
export function metadataFaltando(descricao: unknown, metadata: Record<string, unknown> | null | undefined): Record<string, string> {
  const m = metadata ?? {};
  const falta: Record<string, string> = {};
  for (const r of reservasParaIndice(descricao)) {
    const k = chaveMetaReserva(r);
    if (m[k] !== "1") falta[k] = "1";
  }
  return falta;
}

export type ClienteStripe = {
  id: string;
  description?: string | null;
  email?: string | null;
  deleted?: boolean;
  metadata?: Record<string, unknown> | null;
};

/**
 * Chaves de metadata que o Cloudbeds grava no Cliente com o nº da reserva. No painel do Stripe aparece como
 * "Reservas Id"; as variações cobrem a forma exata gravada. Busca e conferência usam esta mesma lista.
 */
export const CHAVES_META_CLOUDBEDS = ["Reservas Id", "Reservas ID", "reservas_id", "reservasId", "ReservasId", "reservation_id"];

/** Nºs de reserva ligados ao Cliente: descrição "Reservas: <nº>", metadata do Cloudbeds e etiqueta do app. */
export function reservasDoCliente(c: Pick<ClienteStripe, "description" | "metadata">): string[] {
  const ids = new Set(reservasDaDescricao(c.description));
  const m = (c.metadata ?? {}) as Record<string, unknown>;
  for (const k of CHAVES_META_CLOUDBEDS) {
    const v = m[k];
    if (typeof v === "string") for (const t of v.split(/[^0-9A-Za-z]+/)) if (t) ids.add(t);
  }
  for (const [k, v] of Object.entries(m)) {
    const r = k.match(/^injoy_reserva_([0-9A-Za-z]+)$/);
    if (r && v === "1") ids.add(r[1]);
  }
  return [...ids];
}

export type EscolhaCliente =
  | { ok: true; cliente: ClienteStripe }
  | { ok: false; motivo: "nenhum" | "varios"; texto: string };

export function clienteDaReserva(clientes: ClienteStripe[], reservationId: string): EscolhaCliente {
  const id = String(reservationId).trim();
  // Vale a descrição ("Reservas: <nº>") ou a metadata com o nº que o Cloudbeds grava ("Reservas Id").
  const certos = clientes.filter((c) => !c.deleted && reservasDoCliente(c).includes(id));
  // O mesmo Cliente pode vir repetido de buscas diferentes.
  const unicos = [...new Map(certos.map((c) => [c.id, c])).values()];
  if (unicos.length === 1) return { ok: true, cliente: unicos[0] };
  if (unicos.length === 0) {
    return {
      ok: false,
      motivo: "nenhum",
      texto: `Nenhum cliente no Stripe com a reserva ${id}. O cartão pode estar guardado só no Cloudbeds: cobre por lá ou envie o link.`,
    };
  }
  return {
    ok: false,
    motivo: "varios",
    texto: `Há ${unicos.length} clientes no Stripe com a reserva ${id}. Por segurança o app não escolhe: cobre pelo Cloudbeds.`,
  };
}

// ------------------------------------------------------------------ cartões

export type CartaoStripe = {
  id: string;
  card?: { brand?: string | null; last4?: string | null; exp_month?: number | null; exp_year?: number | null } | null;
};
export type CartaoCloudbeds = { cardNumber?: unknown; cardType?: unknown };

const MARCA: Record<string, string> = {
  visa: "visa",
  mastercard: "master",
  master: "master",
  amex: "amex",
  american_express: "amex",
  diners: "diners",
  diners_club: "diners",
  elo: "elo",
  hipercard: "hipercard",
};
const marca = (v: unknown) => {
  const t = String(v ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  return MARCA[t] ?? t;
};
const final4 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-4);

export const NOME_MARCA: Record<string, string> = {
  visa: "Visa",
  master: "Mastercard",
  amex: "Amex",
  diners: "Diners",
  elo: "Elo",
  hipercard: "Hipercard",
};

export type OpcaoCartao = {
  id: string;
  texto: string; // "Visa final 4242, vence 08/27"
  podeCobrar: boolean;
  porque: string | null; // por que não pode
};

/** Mês/ano atual no horário do hotel ("2026-10-16" → 2026, 10). */
function anoMes(hojeISO: string) {
  const [y, m] = hojeISO.split("-").map(Number);
  return y * 12 + m;
}

/**
 * `modo = "teste"`: os cartões de teste do Stripe nunca estão na reserva real do Cloudbeds, então só no
 * modo de teste o cartão fora da reserva fica liberado (com aviso). No modo real ele é bloqueado.
 */
export function opcoesDeCartao(
  cartoes: CartaoStripe[],
  cartoesNaReserva: CartaoCloudbeds[],
  hojeISO: string,
  modo: ModoStripe = "real",
): OpcaoCartao[] {
  const naReserva = new Set(cartoesNaReserva.map((c) => `${marca(c.cardType)}:${final4(c.cardNumber)}`));
  const hoje = anoMes(hojeISO);
  return cartoes.map((pm) => {
    const c = pm.card ?? {};
    const b = marca(c.brand);
    const l4 = final4(c.last4);
    const mes = Number(c.exp_month ?? 0);
    const ano = Number(c.exp_year ?? 0);
    const venc = mes && ano ? `${String(mes).padStart(2, "0")}/${String(ano).slice(-2)}` : "—";
    const texto = `${NOME_MARCA[b] ?? (b || "Cartão")} final ${l4 || "????"}, vence ${venc}`;
    let porque: string | null = null;
    if (!l4) porque = "Cartão sem final legível";
    else if (!mes || !ano || ano * 12 + mes < hoje) porque = "Vencido";
    else if (!naReserva.has(`${b}:${l4}`)) {
      if (modo === "real") porque = "Não está nesta reserva no Cloudbeds";
      else return { id: pm.id, texto: `${texto} (teste: não conferido com o Cloudbeds)`, podeCobrar: true, porque: null };
    }
    return { id: pm.id, texto, podeCobrar: porque === null, porque };
  });
}

// ------------------------------------------------------------------ valor e reserva

export const centavos = (v: number) => Math.round(Number(v) * 100);

const STATUS_COBRAVEIS = new Set(["confirmed", "not_confirmed"]);

export type ConferenciaReserva = { ok: true; saldo: number } | { ok: false; texto: string };

/** Confere, com o dado relido do Cloudbeds agora, se dá para cobrar o valor confirmado na tela. */
export function conferirReserva(
  reserva: { status?: unknown; balance?: unknown },
  valorConfirmado: number | null,
): ConferenciaReserva {
  const status = String(reserva.status ?? "").toLowerCase();
  if (!STATUS_COBRAVEIS.has(status)) {
    return { ok: false, texto: `A reserva está "${status || "sem status"}" no Cloudbeds. Não dá para cobrar por aqui.` };
  }
  const saldo = Math.round(Number(reserva.balance ?? 0) * 100) / 100;
  if (!(saldo > 0)) return { ok: false, texto: "O Cloudbeds mostra saldo zerado: não há nada a cobrar." };
  if (valorConfirmado !== null && centavos(valorConfirmado) !== centavos(saldo)) {
    return {
      ok: false,
      texto: `O saldo no Cloudbeds mudou para ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Confira e confirme de novo.`,
    };
  }
  return { ok: true, saldo };
}

// ------------------------------------------------------------------ cobrança anterior

export type IntentStripe = {
  id: string;
  status: string;
  amount?: number;
  created?: number;
  metadata?: Record<string, string> | null;
};

/**
 * Bloqueia se já existe, no Stripe, cobrança deste app para a reserva aprovada nos últimos 7 dias,
 * ou qualquer cobrança do Cliente ainda em processamento. (Cobranças feitas pelo Cloudbeds já
 * aparecem no saldo relido do Cloudbeds.)
 */
export function bloqueioPorCobrancaAnterior(
  intents: IntentStripe[],
  reservationId: string,
  agoraSeg: number,
): string | null {
  const SETE_DIAS = 7 * 86_400;
  for (const pi of intents) {
    if (pi.status === "processing" || pi.status === "requires_capture") {
      return "Há uma cobrança deste cliente ainda em processamento no Stripe. Espere alguns minutos e atualize.";
    }
    const doApp = pi.metadata?.injoy_reserva === String(reservationId);
    if (doApp && pi.status === "succeeded" && agoraSeg - Number(pi.created ?? 0) < SETE_DIAS) {
      return "Esta reserva já foi cobrada pelo app nos últimos 7 dias. Confira no Stripe e no Cloudbeds antes de cobrar de novo.";
    }
  }
  return null;
}

// ------------------------------------------------------------------ notas no Cloudbeds

export const notaPagamentoOk = (nome: string) => `Pagamento OK // ${nome}`;
export const notaPagamentoNoCheckin = (nome: string) => `Pagamento no check in // ${nome}`;
export const notaLinkEnviado = (nome: string) => `Link de pagamento enviado // ${nome}`;
export const NOTA_AGUARDANDO_AUTENTICACAO = "Aguardando autenticação CC";

// ------------------------------------------------------------------ resultado da cobrança

export type ResultadoIntent = "aprovado" | "autenticacao" | "recusado" | "processando";

export function resultadoDoIntent(status: string | undefined): ResultadoIntent {
  if (status === "succeeded") return "aprovado";
  if (status === "requires_action") return "autenticacao";
  if (status === "processing" || status === "requires_capture") return "processando";
  return "recusado";
}

/** Mensagem de recusa do Stripe em português simples. */
export function textoRecusa(codigo: string | undefined, declineCode?: string | undefined): string {
  const c = declineCode || codigo || "";
  const mapa: Record<string, string> = {
    insufficient_funds: "Cartão sem saldo/limite.",
    card_declined: "Cartão recusado pelo banco.",
    generic_decline: "Cartão recusado pelo banco.",
    do_not_honor: "O banco recusou a cobrança.",
    expired_card: "Cartão vencido.",
    incorrect_cvc: "Código de segurança incorreto.",
    lost_card: "Cartão bloqueado (perdido).",
    stolen_card: "Cartão bloqueado.",
    fraudulent: "O banco bloqueou por suspeita de fraude.",
    authentication_required: "O banco pediu que o hóspede confirme a compra.",
    processing_error: "Erro no processamento. Tente de novo em instantes.",
  };
  return mapa[c] ?? (c ? `Recusado (${c}).` : "Recusado.");
}
