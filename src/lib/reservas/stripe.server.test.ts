import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anularFatura, assinaturaValida, clientesPelaReserva, clientesPorNome, lerFatura, chaveStripe, cobrarCartao, enviarFatura } from "./stripe.server";

type Chamada = { url: string; init: RequestInit };
let chamadas: Chamada[] = [];
let respostas: { status: number; body: unknown }[] = [];

beforeEach(() => {
  chamadas = [];
  respostas = [];
  process.env.STRIPE_KEY_BOTAFOGO = "rk_test_FAKE";
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    const r = respostas.shift() ?? { status: 200, body: { id: "x" } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STRIPE_KEY_BOTAFOGO;
  delete process.env.STRIPE_KEY_IPANEMA;
});

const meta = { reservationId: "3994900033060", unidade: "Botafogo" as const, tentativa: "t-1", usuario: "Mayara" };

describe("chave", () => {
  it("lê do segredo da unidade e recusa chave secreta", () => {
    expect(chaveStripe("Botafogo").modo).toBe("teste");
    expect(() => chaveStripe("Ipanema")).toThrow(/ainda não foi configurado/);
    process.env.STRIPE_KEY_IPANEMA = "sk_live_x";
    expect(() => chaveStripe("Ipanema")).toThrow(/chave restrita/);
  });
});

describe("cobrar cartão", () => {
  it("manda off_session, valor em centavos, metadados e trava de idempotência pela tentativa", async () => {
    respostas.push({ status: 200, body: { id: "pi_1", status: "succeeded" } });
    const r = await cobrarCartao("Botafogo", { clienteId: "cus_1", cartaoId: "pm_1", valorCentavos: 82662, descricao: "Reserva X", meta });
    expect(r.intent?.status).toBe("succeeded");
    const c = chamadas[0];
    expect(c.url).toBe("https://api.stripe.com/v1/payment_intents");
    const h = c.init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer rk_test_FAKE");
    expect(h["Idempotency-Key"]).toBe("injoy-cobranca-t-1");
    const corpo = new URLSearchParams(String(c.init.body));
    expect(corpo.get("amount")).toBe("82662");
    expect(corpo.get("currency")).toBe("brl");
    expect(corpo.get("off_session")).toBe("true");
    expect(corpo.get("confirm")).toBe("true");
    expect(corpo.get("customer")).toBe("cus_1");
    expect(corpo.get("payment_method")).toBe("pm_1");
    expect(corpo.get("metadata[injoy_reserva]")).toBe("3994900033060");
  });
  it("cartão recusado ou que pede autenticação volta como resultado (não como erro)", async () => {
    respostas.push({
      status: 402,
      body: { error: { type: "card_error", code: "authentication_required", payment_intent: { id: "pi_2", status: "requires_action" } } },
    });
    const r = await cobrarCartao("Botafogo", { clienteId: "c", cartaoId: "p", valorCentavos: 100, descricao: "d", meta });
    expect(r.intent?.status).toBe("requires_action");
    expect(r.erro?.code).toBe("authentication_required");
  });
  it("erro de permissão da chave sobe como erro", async () => {
    respostas.push({ status: 403, body: { error: { type: "invalid_request_error", message: "The provided key does not have permission" } } });
    await expect(cobrarCartao("Botafogo", { clienteId: "c", cartaoId: "p", valorCentavos: 100, descricao: "d", meta })).rejects.toThrow(/permission/);
  });
});

describe("link (fatura)", () => {
  it("cria a fatura sem itens pendentes, põe o item nela, finaliza e envia", async () => {
    respostas.push({ status: 200, body: { id: "in_1" } }, { status: 200, body: { id: "ii_1" } }, { status: 200, body: { id: "in_1" } }, {
      status: 200,
      body: { id: "in_1", hosted_invoice_url: "https://invoice.stripe.com/i/abc" },
    });
    const f = await enviarFatura("Botafogo", { clienteId: "cus_1", valorCentavos: 82662, descricao: "Reserva X", diasParaPagar: 2, meta });
    expect(f.hosted_invoice_url).toBe("https://invoice.stripe.com/i/abc");
    expect(chamadas.map((c) => c.url.replace("https://api.stripe.com/v1", ""))).toEqual([
      "/invoices",
      "/invoiceitems",
      "/invoices/in_1/finalize",
      "/invoices/in_1/send",
    ]);
    const fatura = new URLSearchParams(String(chamadas[0].init.body));
    expect(fatura.get("pending_invoice_items_behavior")).toBe("exclude");
    expect(fatura.get("collection_method")).toBe("send_invoice");
    const item = new URLSearchParams(String(chamadas[1].init.body));
    expect(item.get("invoice")).toBe("in_1");
    expect(item.get("amount")).toBe("82662");
    // cada passo com a sua chave de idempotência
    const chaves = chamadas.map((c) => (c.init.headers as Record<string, string>)["Idempotency-Key"]);
    expect(new Set(chaves).size).toBe(4);
  });
});

describe("achar cliente pelo nº da reserva", () => {
  it("lista os clientes criados desde a data e filtra pela descrição, página por página", async () => {
    respostas.push(
      { status: 200, body: { has_more: true, data: [{ id: "cus_1", description: "Injoy - Reservas: 111" }, { id: "cus_2", description: null }] } },
      { status: 200, body: { has_more: false, data: [{ id: "cus_3", description: "Injoy Suítes & Aparts Botafogo - Reservas: 9996102405704" }] } },
    );
    const r = await clientesPelaReserva("Botafogo", "9996102405704", 1_760_000_000);
    expect(r.clientes.map((c) => c.id)).toEqual(["cus_3"]);
    expect(r.vistos).toBe(3);
    expect(r.completo).toBe(true);
    const u1 = new URL(chamadas[0].url);
    expect(u1.pathname).toBe("/v1/customers");
    expect(u1.searchParams.get("created[gte]")).toBe("1760000000");
    expect(u1.searchParams.get("limit")).toBe("100");
    expect(new URL(chamadas[1].url).searchParams.get("starting_after")).toBe("cus_2");
  });
  it("para ao achar dois (já bloqueia) e avisa busca parcial no limite de páginas", async () => {
    respostas.push({ status: 200, body: { has_more: true, data: [{ id: "a", description: "Reservas: 9" }, { id: "b", description: "Reservas: 9" }] } });
    const dois = await clientesPelaReserva("Botafogo", "9", 0);
    expect(dois.clientes).toHaveLength(2);
    expect(chamadas).toHaveLength(1);
    chamadas = [];
    respostas.push({ status: 200, body: { has_more: true, data: [{ id: "x", description: "" }] } });
    const parcial = await clientesPelaReserva("Botafogo", "9", 0, 1);
    expect(parcial.completo).toBe(false);
  });
});

describe("achar cliente pelo nome", () => {
  it("usa a busca do Stripe por nome, sem aspas soltas, e ignora nomes curtos", async () => {
    respostas.push({ status: 200, body: { data: [{ id: "cus_A", description: "Injoy - Reservas: 9996102405704" }] } });
    const r = await clientesPorNome("Botafogo", ['Thiago "Linhares"', "Al", "Thiago Linhares"]);
    expect(r).toHaveLength(1);
    expect(chamadas).toHaveLength(1);
    const url = new URL(chamadas[0].url);
    expect(url.pathname).toBe("/v1/customers/search");
    expect(url.searchParams.get("query")).toBe('name~"Thiago Linhares"');
  });
});

describe("conferir link", () => {
  it("lê a fatura pelo GET, sem idempotência nem corpo", async () => {
    respostas.push({ status: 200, body: { id: "in_7", status: "paid", amount_paid: 200 } });
    const f = await lerFatura("Botafogo", "in_7");
    expect(f.status).toBe("paid");
    expect(chamadas[0].url).toBe("https://api.stripe.com/v1/invoices/in_7");
    expect(chamadas[0].init.method).toBe("GET");
    expect(chamadas[0].init.body).toBeUndefined();
  });
});

describe("cancelar link", () => {
  it("anula a fatura pelo endpoint void, com idempotência", async () => {
    respostas.push({ status: 200, body: { id: "in_9", status: "void" } });
    const f = await anularFatura("Botafogo", "in_9");
    expect(f.status).toBe("void");
    expect(chamadas[0].url).toBe("https://api.stripe.com/v1/invoices/in_9/void");
    expect((chamadas[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBe("injoy-anular-in_9");
  });
  it("fatura já paga não pode ser anulada: o erro sobe (o app não cobra de novo)", async () => {
    respostas.push({ status: 400, body: { error: { type: "invalid_request_error", message: "You can only pass in open invoices." } } });
    await expect(anularFatura("Botafogo", "in_paga")).rejects.toThrow(/open invoices/);
  });
});

describe("assinatura do webhook", () => {
  const segredo = "whsec_teste";
  const corpo = '{"type":"invoice.paid"}';
  const agora = 1_760_000_000;
  const assinar = (t: number, c = corpo, s = segredo) => `t=${t},v1=${createHmac("sha256", s).update(`${t}.${c}`).digest("hex")}`;
  it("aceita assinatura certa", async () => {
    expect(await assinaturaValida(corpo, assinar(agora), segredo, agora)).toBe(true);
  });
  it("recusa corpo alterado, segredo errado, aviso velho e cabeçalho ausente", async () => {
    expect(await assinaturaValida('{"type":"x"}', assinar(agora), segredo, agora)).toBe(false);
    expect(await assinaturaValida(corpo, assinar(agora, corpo, "outro"), segredo, agora)).toBe(false);
    expect(await assinaturaValida(corpo, assinar(agora - 600), segredo, agora)).toBe(false);
    expect(await assinaturaValida(corpo, null, segredo, agora)).toBe(false);
    expect(await assinaturaValida(corpo, assinar(agora), "", agora)).toBe(false);
  });
});
