import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Banco falso: guarda o estado do índice por unidade.
const banco: Record<string, Record<string, unknown>> = {};
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: (_c: string, u: string) => ({ maybeSingle: async () => ({ data: banco[u] ?? null }) }) }),
      upsert: async (row: Record<string, unknown>) => {
        banco[String(row.unidade)] = row;
        return { error: null };
      },
    }),
  },
}));

type R = { status: number; body: unknown };
let respostas: R[] = [];
let chamadas: { url: string; init: RequestInit }[] = [];
beforeEach(() => {
  respostas = [];
  chamadas = [];
  for (const k of Object.keys(banco)) delete banco[k];
  process.env.STRIPE_KEY_BOTAFOGO = "rk_test_FAKE";
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    const r = respostas.shift() ?? { status: 200, body: { data: [], has_more: false } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STRIPE_KEY_BOTAFOGO;
});

describe("índice dos Clientes", () => {
  it("etiqueta só quem tem nº na descrição e ainda não tem etiqueta; varre o histórico até o fim", async () => {
    const { indexarClientes } = await import("./stripe-indice.server");
    respostas.push(
      // 1) recentes
      { status: 200, body: { has_more: false, data: [{ id: "cus_novo", description: "Injoy - Reservas: 1111111111111", metadata: {} }] } },
      { status: 200, body: { id: "cus_novo" } }, // grava etiqueta
      // 2) histórico
      {
        status: 200,
        body: {
          has_more: false,
          data: [
            { id: "cus_ja", description: "Injoy - Reservas: 2222222222222", metadata: { injoy_reserva_2222222222222: "1" } },
            { id: "cus_sem", description: "sem nada", metadata: {} },
            { id: "cus_velho", description: "Injoy - Reservas: 3333333333333", metadata: {} },
          ],
        },
      },
      { status: 200, body: { id: "cus_velho" } },
    );
    const r = await indexarClientes("Botafogo");
    expect(r.erro).toBeUndefined();
    expect(r.etiquetados).toBe(2);
    expect(r.historicoConcluido).toBe(true);
    const posts = chamadas.filter((c) => c.init.method === "POST");
    expect(posts.map((c) => c.url.replace("https://api.stripe.com/v1", ""))).toEqual(["/customers/cus_novo", "/customers/cus_velho"]);
    expect(new URLSearchParams(String(posts[0].init.body)).get("metadata[injoy_reserva_1111111111111]")).toBe("1");
    expect(banco.Botafogo.historico_concluido).toBe(true);
    expect(banco.Botafogo.indexados).toBe(2);
  });
  it("sem permissão de gravar: para, registra o motivo e não quebra", async () => {
    const { indexarClientes } = await import("./stripe-indice.server");
    respostas.push(
      { status: 200, body: { has_more: false, data: [{ id: "cus_x", description: "Reservas: 4444444444444", metadata: {} }] } },
      { status: 403, body: { error: { type: "invalid_request_error", message: "The provided key does not have the required permissions" } } },
    );
    const r = await indexarClientes("Botafogo");
    expect(r.erro).toMatch(/Customers → Gravação/);
    expect(banco.Botafogo.erro).toMatch(/Customers → Gravação/);
  });
  it("continua o histórico de onde parou", async () => {
    banco.Botafogo = { unidade: "Botafogo", historico_apos: "cus_parou", historico_concluido: false, indexados: 10 };
    const { indexarClientes } = await import("./stripe-indice.server");
    respostas.push({ status: 200, body: { has_more: false, data: [] } }, { status: 200, body: { has_more: false, data: [] } });
    await indexarClientes("Botafogo");
    const hist = chamadas.map((c) => new URL(c.url)).find((u) => u.searchParams.get("starting_after"));
    expect(hist?.searchParams.get("starting_after")).toBe("cus_parou");
    expect(banco.Botafogo.indexados).toBe(10);
  });
});
