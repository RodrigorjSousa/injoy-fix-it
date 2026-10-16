// Cliente do Stripe da tela Reservas. SÓ NO SERVIDOR: a chave fica nos segredos do Lovable Cloud
// (STRIPE_KEY_BOTAFOGO / STRIPE_KEY_IPANEMA, chaves RESTRITAS rk_...). Nunca vai para o navegador nem para o código.
import { modoDaChave, type ModoStripe } from "./stripe-regras";

export type Unidade = "Botafogo" | "Ipanema";
type Obj = Record<string, unknown>;

const API = "https://api.stripe.com/v1";

export class StripeErro extends Error {
  constructor(
    message: string,
    public status: number,
    public erro: Obj | null,
  ) {
    super(message);
  }
}

export function chaveStripe(unidade: Unidade): { chave: string; modo: ModoStripe } {
  const nome = `STRIPE_KEY_${unidade.toUpperCase()}`;
  const chave = (process.env[nome] ?? "").trim();
  if (!chave) throw new Error(`O Stripe de ${unidade} ainda não foi configurado (segredo ${nome}).`);
  const modo = modoDaChave(chave);
  if (!modo) {
    throw new Error(
      `A chave do Stripe de ${unidade} não é uma chave restrita (rk_...). Por segurança o app não usa chave secreta (sk_).`,
    );
  }
  return { chave, modo };
}

/** Codifica objetos aninhados no formato do Stripe (metadata[x]=y). */
function formulario(params: Obj, prefixo = "", saida = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const chave = prefixo ? `${prefixo}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) formulario(v as Obj, chave, saida);
    else if (Array.isArray(v)) v.forEach((item, i) => saida.append(`${chave}[${i}]`, String(item)));
    else saida.append(chave, String(v));
  }
  return saida;
}

async function chamar(
  unidade: Unidade,
  metodo: "GET" | "POST",
  caminho: string,
  params: Obj = {},
  idempotencia?: string,
): Promise<Obj> {
  const { chave } = chaveStripe(unidade);
  const corpo = formulario(params);
  const url = metodo === "GET" && corpo.toString() ? `${API}${caminho}?${corpo}` : `${API}${caminho}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${chave}`,
    "Stripe-Version": "2024-06-20",
  };
  if (metodo === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencia) headers["Idempotency-Key"] = idempotencia;
  const res = await fetch(url, { method: metodo, headers, body: metodo === "POST" ? corpo.toString() : undefined });
  const texto = await res.text();
  let json: Obj = {};
  try {
    json = texto ? (JSON.parse(texto) as Obj) : {};
  } catch {
    throw new StripeErro(`Stripe respondeu ${res.status} sem JSON.`, res.status, null);
  }
  if (!res.ok) {
    const erro = (json.error as Obj) ?? null;
    throw new StripeErro(String(erro?.message ?? `Stripe recusou (${res.status}).`), res.status, erro);
  }
  return json;
}

const lista = (json: Obj) => (Array.isArray(json.data) ? (json.data as Obj[]) : []);

/** Clientes com estes e-mails (a mesma pessoa pode ter um Cliente por reserva). */
export async function clientesPorEmail(unidade: Unidade, emails: string[]): Promise<Obj[]> {
  const todos: Obj[] = [];
  // O filtro de e-mail do Stripe diferencia maiúsculas: tenta como veio e em minúsculas.
  const variacoes = emails.flatMap((e) => [e.trim(), e.trim().toLowerCase()]).filter(Boolean);
  for (const email of [...new Set(variacoes)]) {
    todos.push(...lista(await chamar(unidade, "GET", "/customers", { email, limit: 100 })));
  }
  return todos;
}

/**
 * Clientes cuja DESCRIÇÃO cita o nº da reserva ("... - Reservas: <nº>", como o Cloudbeds grava).
 * A busca do Stripe não filtra por descrição, então lista os Clientes criados desde `desdeSeg`
 * (data da reserva − 2 dias) e confere a descrição de cada um. Para de procurar ao achar 2
 * (2 já bloqueia a cobrança) ou depois de `maxPaginas` páginas de 100.
 */
export async function clientesPelaReserva(
  unidade: Unidade,
  reservationId: string,
  desdeSeg: number,
  maxPaginas = 40,
): Promise<{ clientes: Obj[]; vistos: number; completo: boolean }> {
  const achados: Obj[] = [];
  let vistos = 0;
  let depois: string | undefined;
  for (let p = 0; p < maxPaginas; p++) {
    const json = await chamar(unidade, "GET", "/customers", {
      limit: 100,
      created: { gte: Math.max(0, Math.floor(desdeSeg)) },
      ...(depois ? { starting_after: depois } : {}),
    });
    const pagina = lista(json);
    vistos += pagina.length;
    for (const c of pagina) {
      const desc = String(c.description ?? "");
      if (desc.includes(reservationId)) achados.push(c);
    }
    if (achados.length >= 2 || json.has_more !== true || !pagina.length) {
      return { clientes: achados, vistos, completo: json.has_more !== true || achados.length >= 2 };
    }
    depois = String(pagina[pagina.length - 1].id);
  }
  return { clientes: achados, vistos, completo: false };
}

/** Texto seguro dentro de aspas na busca do Stripe. */
const aspas = (v: string) => v.replace(/\\/g, "").replace(/"/g, "").trim();

/**
 * Clientes pelo NOME (busca do Stripe). Usado quando o e-mail do Cliente não bate com o da reserva
 * (ex.: e-mail mascarado da Booking). A escolha final continua exigindo o nº da reserva na descrição.
 */
export async function clientesPorNome(unidade: Unidade, nomes: string[]): Promise<Obj[]> {
  const todos: Obj[] = [];
  for (const nome of [...new Set(nomes.map((n) => aspas(n)).filter((n) => n.length >= 3))]) {
    todos.push(...lista(await chamar(unidade, "GET", "/customers/search", { query: `name~"${nome}"`, limit: 100 })));
  }
  return todos;
}

export async function cartoesDoCliente(unidade: Unidade, clienteId: string): Promise<Obj[]> {
  return lista(
    await chamar(unidade, "GET", `/customers/${encodeURIComponent(clienteId)}/payment_methods`, { type: "card", limit: 100 }),
  );
}

export async function cobrancasDoCliente(unidade: Unidade, clienteId: string): Promise<Obj[]> {
  return lista(await chamar(unidade, "GET", "/payment_intents", { customer: clienteId, limit: 100 }));
}

export async function faturasAbertasDoCliente(unidade: Unidade, clienteId: string): Promise<Obj[]> {
  return lista(await chamar(unidade, "GET", "/invoices", { customer: clienteId, status: "open", limit: 100 }));
}

/** Lê uma fatura (para conferir se o link já foi pago, sem depender do aviso do Stripe). */
export async function lerFatura(unidade: Unidade, faturaId: string): Promise<Obj> {
  return chamar(unidade, "GET", `/invoices/${encodeURIComponent(faturaId)}`);
}

/**
 * Cancela (anula) uma fatura aberta: o link para de aceitar pagamento. Se o hóspede já pagou, o Stripe recusa
 * e o erro sobe (quem chama não deve cobrar de novo).
 */
export async function anularFatura(unidade: Unidade, faturaId: string): Promise<Obj> {
  return chamar(unidade, "POST", `/invoices/${encodeURIComponent(faturaId)}/void`, {}, `injoy-anular-${faturaId}`);
}

export type MetaCobranca = { reservationId: string; unidade: Unidade; tentativa: string; usuario: string };

const metadata = (m: MetaCobranca) => ({
  injoy_reserva: m.reservationId,
  injoy_unidade: m.unidade,
  injoy_tentativa: m.tentativa,
  injoy_usuario: m.usuario,
});

/**
 * Cobra o cartão guardado (sem o hóspede presente). A chave de idempotência é a tentativa gravada no banco:
 * repetir a chamada nunca cobra duas vezes. Recusa e "precisa autenticar" voltam como resultado, não como erro.
 */
export async function cobrarCartao(
  unidade: Unidade,
  p: { clienteId: string; cartaoId: string; valorCentavos: number; descricao: string; meta: MetaCobranca },
): Promise<{ intent: Obj | null; erro: Obj | null }> {
  try {
    const intent = await chamar(
      unidade,
      "POST",
      "/payment_intents",
      {
        amount: p.valorCentavos,
        currency: "brl",
        customer: p.clienteId,
        payment_method: p.cartaoId,
        off_session: true,
        confirm: true,
        description: p.descricao,
        metadata: metadata(p.meta),
      },
      `injoy-cobranca-${p.meta.tentativa}`,
    );
    return { intent, erro: null };
  } catch (e) {
    // Cartão recusado / precisa autenticar: o Stripe responde 402 com o PaymentIntent dentro do erro.
    if (e instanceof StripeErro && e.erro && (e.status === 402 || e.erro.type === "card_error")) {
      return { intent: (e.erro.payment_intent as Obj) ?? null, erro: e.erro };
    }
    throw e;
  }
}

/**
 * Link de pagamento: fatura do Stripe enviada por e-mail ao hóspede (como o próprio Cloudbeds faz).
 * A fatura é criada primeiro e o item vai direto nela, para nunca puxar itens pendentes de outra tentativa.
 */
export async function enviarFatura(
  unidade: Unidade,
  p: { clienteId: string; valorCentavos: number; descricao: string; diasParaPagar: number; meta: MetaCobranca },
): Promise<Obj> {
  const k = `injoy-link-${p.meta.tentativa}`;
  const fatura = await chamar(
    unidade,
    "POST",
    "/invoices",
    {
      customer: p.clienteId,
      collection_method: "send_invoice",
      days_until_due: p.diasParaPagar,
      pending_invoice_items_behavior: "exclude",
      auto_advance: false,
      description: p.descricao,
      metadata: metadata(p.meta),
    },
    `${k}-fatura`,
  );
  const id = String(fatura.id);
  await chamar(
    unidade,
    "POST",
    "/invoiceitems",
    { customer: p.clienteId, invoice: id, amount: p.valorCentavos, currency: "brl", description: p.descricao, metadata: metadata(p.meta) },
    `${k}-item`,
  );
  await chamar(unidade, "POST", `/invoices/${encodeURIComponent(id)}/finalize`, {}, `${k}-finalizar`);
  return chamar(unidade, "POST", `/invoices/${encodeURIComponent(id)}/send`, {}, `${k}-enviar`);
}

// ------------------------------------------------------------------ webhook

/** Confere a assinatura do aviso do Stripe (cabeçalho Stripe-Signature), com tolerância de 5 minutos. */
export async function assinaturaValida(corpo: string, cabecalho: string | null, segredo: string, agoraSeg = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!cabecalho || !segredo) return false;
  const partes = Object.fromEntries(
    cabecalho.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(partes.t);
  if (!t || Math.abs(agoraSeg - t) > 300) return false;
  const assinaturas = cabecalho
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (!assinaturas.length) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const esperado = createHmac("sha256", segredo).update(`${t}.${corpo}`).digest("hex");
  return assinaturas.some((a) => {
    const x = Buffer.from(a, "hex");
    const y = Buffer.from(esperado, "hex");
    return x.length === y.length && timingSafeEqual(x, y);
  });
}
