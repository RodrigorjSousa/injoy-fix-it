// Stone Connect 2.0 — "Pagamento Direto": o servidor cria um pedido na API
// Pagar.me v5 endereçado ao número de série da maquininha; a maquininha abre a
// tela de pagamento sozinha; o resultado chega por webhook (charge.paid) e, como
// resiliência, por consulta ao pedido.
//
// Documentação: https://connect-stone.stone.com.br (criar pedido, pedido direto,
// fechamento de pedido, webhook). Não existe ambiente de testes: teste com
// vendas reais de valor baixo e cancele em seguida.
//
// Segredos (Lovable › Secrets):
//   PAGARME_SECRET_KEY_BOTAFOGO / PAGARME_SECRET_KEY_IPANEMA (ou PAGARME_SECRET_KEY para as duas)
//   STONE_SERVICE_REFERER_NAME  (identificador de parceiro recebido na homologação)

const API = "https://api.pagar.me/core/v5";

export type Unidade = "Botafogo" | "Ipanema";
export type MetodoPagamento = "credito" | "debito" | "pix";

function credenciais(unidade: Unidade) {
  const sk =
    process.env[`PAGARME_SECRET_KEY_${unidade.toUpperCase()}`] ?? process.env.PAGARME_SECRET_KEY ?? "";
  const referer = process.env.STONE_SERVICE_REFERER_NAME ?? "";
  return { sk, referer };
}

export function stoneConfigurada(unidade: Unidade): { ok: boolean; falta: string[] } {
  const { sk, referer } = credenciais(unidade);
  const falta: string[] = [];
  if (!sk) falta.push(`PAGARME_SECRET_KEY_${unidade.toUpperCase()}`);
  if (!referer) falta.push("STONE_SERVICE_REFERER_NAME");
  return { ok: falta.length === 0, falta };
}

async function chamar(unidade: Unidade, metodo: "GET" | "POST" | "PATCH", caminho: string, corpo?: unknown) {
  const { sk, referer } = credenciais(unidade);
  if (!sk || !referer) {
    throw new Error(`Pagamento Stone não configurado: falta ${stoneConfigurada(unidade).falta.join(", ")}.`);
  }
  const res = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Basic ${btoa(`${sk}:`)}`,
      ServiceRefererName: referer,
      Accept: "application/json",
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const texto = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  } catch {
    json = { bruto: texto.slice(0, 500) };
  }
  if (!res.ok) {
    const erros = json.errors ? ` ${JSON.stringify(json.errors).slice(0, 400)}` : "";
    throw new Error(`Stone/Pagar.me ${res.status}: ${String(json.message ?? texto.slice(0, 200))}${erros}`);
  }
  return json;
}

const TIPO_STONE: Record<MetodoPagamento, string> = { credito: "credit", debito: "debit", pix: "pix" };

/** Cria o pedido que a maquininha abre na hora (Pagamento Direto). */
export async function criarPedidoMaquininha(args: {
  unidade: Unidade;
  posSerial: string;
  valorCentavos: number;
  metodo: MetodoPagamento;
  descricao: string;
  nomeNaTela: string;
  cliente: { nome: string; email?: string | null };
  codigo: string;
}): Promise<{ pedidoId: string; status: string }> {
  const json = await chamar(args.unidade, "POST", "/orders", {
    code: args.codigo.slice(0, 52),
    customer: {
      name: args.cliente.nome.slice(0, 64) || "Hospede",
      ...(args.cliente.email ? { email: args.cliente.email } : {}),
    },
    items: [{ amount: args.valorCentavos, description: args.descricao.slice(0, 256), quantity: 1, code: args.codigo.slice(0, 52) }],
    closed: false,
    poi_payment_settings: {
      visible: true,
      print_order_receipt: false,
      devices_serial_number: [args.posSerial],
      display_name: args.nomeNaTela.slice(0, 30),
      payment_setup: {
        type: TIPO_STONE[args.metodo],
        installments: 1,
        installment_type: "merchant",
      },
    },
    metadata: { origem: "totem-injoy", codigo: args.codigo },
  });
  const pedidoId = String(json.id ?? "");
  if (!pedidoId) throw new Error("Stone não devolveu o número do pedido.");
  return { pedidoId, status: String(json.status ?? "pending") };
}

export type SituacaoPedido = {
  status: "pendente" | "pago" | "cancelado" | "falhou";
  cobrancaId: string | null;
  valorPagoCentavos: number;
  bandeira: string | null;
  autorizacao: string | null;
  bruto: Record<string, unknown>;
};

/** Lê o pedido na Pagar.me e resume a situação (usado no webhook e como resiliência). */
export async function consultarPedido(unidade: Unidade, pedidoId: string): Promise<SituacaoPedido> {
  const json = await chamar(unidade, "GET", `/orders/${encodeURIComponent(pedidoId)}`);
  return resumirPedido(json);
}

export function resumirPedido(json: Record<string, unknown>): SituacaoPedido {
  const charges = (Array.isArray(json.charges) ? json.charges : []) as Array<Record<string, unknown>>;
  const paga = charges.find((c) => String(c.status) === "paid");
  const statusPedido = String(json.status ?? "").toLowerCase();
  let status: SituacaoPedido["status"] = "pendente";
  if (paga || statusPedido === "paid") status = "pago";
  else if (statusPedido === "canceled") status = "cancelado";
  else if (statusPedido === "failed") status = "falhou";
  const meta = (paga?.metadata ?? {}) as Record<string, unknown>;
  const ultima = (paga?.last_transaction ?? {}) as Record<string, unknown>;
  const valor = Number(paga?.paid_amount ?? paga?.amount ?? 0);
  return {
    status,
    cobrancaId: paga ? String(paga.id ?? "") || null : null,
    valorPagoCentavos: Number.isFinite(valor) ? valor : 0,
    bandeira: String(meta.scheme_name ?? meta.schemeName ?? ultima.card_brand ?? "") || null,
    autorizacao: String(meta.authorization_code ?? meta.authorizationCode ?? ultima.acquirer_auth_code ?? "") || null,
    bruto: json,
  };
}

/** Fecha o pedido (tira da fila da maquininha). status: paid | canceled | failed. */
export async function fecharPedido(unidade: Unidade, pedidoId: string, status: "paid" | "canceled" | "failed") {
  await chamar(unidade, "PATCH", `/orders/${encodeURIComponent(pedidoId)}/closed`, { status });
}
