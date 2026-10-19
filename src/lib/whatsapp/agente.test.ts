import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------- banco falso (em memória)
type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {};
let seq = 0;

class Q implements PromiseLike<{ data: unknown; error: null }> {
  private filtros: Array<(l: Linha) => boolean> = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Linha | Linha[] | null = null;
  private ordem: { col: string; asc: boolean } | null = null;
  private lim: number | null = null;
  private unico: "single" | "maybe" | null = null;
  constructor(private tabela: string) {
    tabelas[tabela] ??= [];
  }
  select() {
    return this;
  }
  insert(p: Linha | Linha[]) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  update(p: Linha) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.filtros.push((l) => l[c] === v);
    return this;
  }
  is(c: string, v: unknown) {
    this.filtros.push((l) => (l[c] ?? null) === v);
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.ordem = { col, asc: o?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  single() {
    this.unico = "single";
    return this;
  }
  maybeSingle() {
    this.unico = "maybe";
    return this;
  }
  private executar(): unknown {
    const t = tabelas[this.tabela];
    if (this.op === "insert") {
      const novas = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((p) => ({
        id: `id${++seq}`,
        created_at: new Date(Date.now() + seq).toISOString(),
        meta: {},
        ...p,
      }));
      t.push(...novas);
      return this.unico ? novas[0] : novas;
    }
    let linhas = t.filter((l) => this.filtros.every((f) => f(l)));
    if (this.op === "update") {
      linhas.forEach((l) => Object.assign(l, this.payload));
      return linhas;
    }
    if (this.op === "delete") {
      tabelas[this.tabela] = t.filter((l) => !linhas.includes(l));
      return linhas;
    }
    if (this.ordem) {
      const { col, asc } = this.ordem;
      linhas = [...linhas].sort(
        (a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1),
      );
    }
    if (this.lim !== null) linhas = linhas.slice(0, this.lim);
    return this.unico ? (linhas[0] ?? null) : linhas;
  }
  then<T1, T2>(
    ok?: ((v: { data: unknown; error: null }) => T1 | PromiseLike<T1>) | null,
    ko?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return Promise.resolve({ data: this.executar(), error: null }).then(ok, ko);
  }
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => new Q(t) },
}));

// ---------------------------------------------------------------- Cloudbeds falso
const reservaTeste = { status: "confirmed", chegada: "", saida: "", unidade: "Botafogo" as const };
vi.mock("./cloudbeds-joy.server", () => ({
  consultarDisponibilidade: vi.fn(async () => [
    {
      tipo: "Suíte Standard",
      disponiveis: 2,
      maxHospedes: 2,
      totalEstadia: 600,
      mediaNoite: 300,
      plano: null,
    },
  ]),
  identificarReserva: vi.fn(async (codigo: string, sobrenome: string) =>
    codigo === "123456" && sobrenome.toLowerCase() === "silva"
      ? { unidade: reservaTeste.unidade, reservationID: "123456", rec: {} }
      : null,
  ),
  recarregarReserva: vi.fn(async (unidade: string, id: string) => ({
    unidade,
    reservationID: id,
    rec: {},
  })),
  reservaPorTelefone: vi.fn(async () => null),
  resumoReserva: vi.fn((r: { unidade: string; reservationID: string }) => ({
    codigo_reserva: r.reservationID,
    unidade: r.unidade,
    titular_primeiro_nome: "Ana",
    chegada: reservaTeste.chegada,
    saida: reservaTeste.saida,
    noites: 2,
    status: reservaTeste.status,
    saldo_em_aberto: 0,
    tipos_de_acomodacao: ["Suíte Standard"],
    adultos: 2,
    criancas: 0,
  })),
  dadosParaWifi: vi.fn(() => ({
    status: reservaTeste.status,
    chegada: reservaTeste.chegada,
    saida: reservaTeste.saida,
  })),
}));

// ---------------------------------------------------------------- gateway falso
type Roteiro = Array<{ status?: number; body: unknown }>;
let roteiro: Roteiro = [];
const pedidos: Array<Record<string, unknown>> = [];

function respostaTexto(texto: string, tokens = [100, 20]) {
  return {
    body: {
      choices: [{ message: { content: texto } }],
      usage: { prompt_tokens: tokens[0], completion_tokens: tokens[1] },
    },
  };
}
function respostaFerramenta(nome: string, args: Record<string, unknown>) {
  return {
    body: {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: `c${++seq}`,
                type: "function",
                function: { name: nome, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 10 },
    },
  };
}

beforeEach(() => {
  for (const k of Object.keys(tabelas)) delete tabelas[k];
  roteiro = [];
  pedidos.length = 0;
  process.env.LOVABLE_API_KEY = "teste";
  delete process.env.GOOGLE_MAPS_API_KEY;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: { body?: string }) => {
      if (init?.body) pedidos.push(JSON.parse(init.body));
      const passo = roteiro.shift();
      if (!passo) throw new Error("roteiro do gateway acabou");
      return new Response(JSON.stringify(passo.body), { status: passo.status ?? 200 });
    }),
  );
});

async function preparar(conversa: Partial<Linha> = {}, wifi: Linha = {}) {
  const { CONHECIMENTO_PADRAO, PROMPT_PADRAO } = await import("./conhecimento");
  tabelas.wa_config = [
    {
      id: "joy",
      modelo: "modelo/teste",
      espera_segundos: 5,
      prompt: PROMPT_PADRAO,
      conhecimento: CONHECIMENTO_PADRAO,
      wifi,
    },
  ];
  tabelas.wa_conversas = [
    {
      id: "conv1",
      canal: "simulador",
      contato_nome: "Ana",
      telefone: null,
      unidade: null,
      reserva_id: null,
      reserva_unidade: null,
      modo: "ia",
      etapa: "contato",
      ...conversa,
    },
  ];
  tabelas.wa_mensagens = [];
}

function cliente(texto: string) {
  tabelas.wa_mensagens.push({
    id: `m${++seq}`,
    conversa_id: "conv1",
    autor: "cliente",
    texto,
    meta: {},
    created_at: new Date(Date.now() + seq).toISOString(),
  });
}

const WIFI = { Botafogo: { rede: "INJOY", senha: "senhaSecretaB" } };

describe("Joy — agente", () => {
  it("cota no Cloudbeds, manda o link e registra tokens e ferramentas", async () => {
    await preparar();
    cliente("Quanto fica 10 a 12 de novembro para 2 pessoas em Botafogo?");
    roteiro = [
      respostaFerramenta("consultar_disponibilidade", {
        checkin: "2099-11-10",
        checkout: "2099-11-12",
        adultos: 2,
        unidade: "Botafogo",
      }),
      respostaTexto(
        "Tenho a Suíte Standard por R$ 600 as 2 noites! Reserve aqui: https://hotels.cloudbeds.com/reservation/vKBCEM?...",
      ),
    ];
    const { responder } = await import("./agente.server");
    const r = await responder("conv1");

    expect(r.respondeu).toBe(true);
    expect(r.texto).toContain("Suíte Standard");
    expect(r.tokensEntrada).toBe(300);
    expect(r.tokensSaida).toBe(30);
    // 1º pedido leva as ferramentas e o prompt com a base de conhecimento
    expect(pedidos[0].model).toBe("modelo/teste");
    expect(Array.isArray(pedidos[0].tools)).toBe(true);
    const sistema = (pedidos[0].messages as Array<{ role: string; content: string }>)[0].content;
    expect(sistema).toContain("Rua Estácio Coimbra, 80");
    // o resultado da ferramenta volta para o modelo com o link do motor do Cloudbeds
    const msgsSegundo = pedidos[1].messages as Array<{ role: string; content: string }>;
    const tool = msgsSegundo.find((m) => m.role === "tool")!;
    expect(tool.content).toContain(
      "hotels.cloudbeds.com/reservation/vKBCEM?checkin=2099-11-10&checkout=2099-11-12&adults=2",
    );
    // gravou a resposta, a execução e a etapa do funil
    const joy = tabelas.wa_mensagens.find((m) => m.autor === "joy")!;
    expect((joy.meta as { ferramentas: unknown[] }).ferramentas).toHaveLength(1);
    expect(tabelas.wa_ia_execucoes).toHaveLength(1);
    expect(tabelas.wa_ia_execucoes[0].tokens_entrada).toBe(300);
    expect(tabelas.wa_conversas[0].etapa).toBe("cotou");
  });

  it("nunca põe a senha do Wi-Fi no prompt", async () => {
    await preparar({}, WIFI);
    cliente("oi");
    roteiro = [respostaTexto("Oi! Aqui é a Joy 😊")];
    const { responder } = await import("./agente.server");
    await responder("conv1");
    expect(JSON.stringify(pedidos[0])).not.toContain("senhaSecretaB");
  });

  it("Wi-Fi negado para chegada distante; se a IA vazar a senha, o filtro troca por resposta segura", async () => {
    const { agoraNoHotel } = await import("./prompt");
    const { somarDias } = await import("./regras");
    const { hoje } = agoraNoHotel();
    reservaTeste.chegada = somarDias(hoje, 10);
    reservaTeste.saida = somarDias(hoje, 12);
    reservaTeste.status = "confirmed";
    await preparar(
      { reserva_id: "123456", reserva_unidade: "Botafogo", unidade: "Botafogo" },
      WIFI,
    );
    cliente("qual a senha do wifi?");
    roteiro = [
      respostaFerramenta("consultar_wifi", {}),
      respostaTexto("A senha é senhaSecretaB"), // IA desobediente
      respostaTexto("Claro! A senha é senhaSecretaB"), // de novo na reescrita
    ];
    const { responder } = await import("./agente.server");
    const { RESPOSTA_SEGURA } = await import("./regras");
    const r = await responder("conv1");
    const saidaWifi = r.ferramentas[0].resultado;
    expect(saidaWifi.ok).toBe(false);
    expect(JSON.stringify(saidaWifi)).not.toContain("senhaSecretaB");
    expect(r.texto).toBe(RESPOSTA_SEGURA);
    expect(r.bloqueios).toContain("wifi_nao_liberado");
    expect(tabelas.wa_ia_execucoes[0].bloqueios).toEqual(["wifi_nao_liberado"]);
  });

  it("Wi-Fi liberado para quem faz check-in hoje", async () => {
    const { agoraNoHotel } = await import("./prompt");
    const { somarDias } = await import("./regras");
    const { hoje } = agoraNoHotel();
    reservaTeste.chegada = hoje;
    reservaTeste.saida = somarDias(hoje, 2);
    reservaTeste.status = "confirmed";
    await preparar({}, WIFI);
    cliente("Sou Ana Silva, reserva 123456. Qual o wifi?");
    roteiro = [
      respostaFerramenta("identificar_reserva", { codigo: "123456", sobrenome: "Silva" }),
      respostaFerramenta("consultar_wifi", {}),
      respostaTexto(
        "Prontinho, Ana! Rede INJOY, senha senhaSecretaB. O código da sua reserva é 123456.",
      ),
    ];
    const { responder } = await import("./agente.server");
    const r = await responder("conv1");
    expect(r.bloqueios).toEqual([]);
    expect(r.texto).toContain("senhaSecretaB");
    expect(tabelas.wa_conversas[0].reserva_id).toBe("123456");
    const joy = tabelas.wa_mensagens.find((m) => m.autor === "joy")!;
    expect((joy.meta as { wifi_liberado: string[] }).wifi_liberado).toEqual(["Botafogo"]);
  });

  it("bloqueia número de acomodação e aceita a reescrita", async () => {
    await preparar();
    cliente("qual o meu quarto?");
    roteiro = [
      respostaTexto("Você vai ficar no quarto 005!"),
      respostaTexto("Por segurança não passo o número por aqui 😊"),
    ];
    const { responder } = await import("./agente.server");
    const r = await responder("conv1");
    expect(r.bloqueios).toEqual(["numero_acomodacao"]);
    expect(r.texto).toBe("Por segurança não passo o número por aqui 😊");
  });

  it("transfere para a equipe e para de responder", async () => {
    await preparar();
    cliente("quero reembolso, péssimo!");
    roteiro = [
      respostaFerramenta("transferir_para_humano", {
        motivo: "Pedido de reembolso",
        urgente: false,
      }),
      respostaTexto("Sinto muito! Vou passar para a nossa equipe, que atende das 09h às 21h."),
    ];
    const { responder } = await import("./agente.server");
    const r = await responder("conv1");
    expect(r.transferida).toBe(true);
    expect(tabelas.wa_conversas[0].modo).toBe("humano");
    expect(tabelas.wa_passagens).toHaveLength(1);
    expect(tabelas.wa_mensagens.some((m) => m.autor === "sistema")).toBe(true);
    // próxima mensagem do hóspede: a Joy não responde
    cliente("alô?");
    const r2 = await responder("conv1");
    expect(r2.respondeu).toBe(false);
  });

  it("mostra o erro real do gateway e registra a execução", async () => {
    await preparar();
    cliente("oi");
    roteiro = [{ status: 402, body: { error: { message: "Not enough credits" } } }];
    const { responder } = await import("./agente.server");
    await expect(responder("conv1")).rejects.toThrow(/402.*Not enough credits/);
    expect(tabelas.wa_ia_execucoes[0].erro).toMatch(/402/);
    expect(tabelas.wa_mensagens.filter((m) => m.autor === "joy")).toHaveLength(0);
  });
});
