import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ------------------------------------------------------------ banco falso (em memória)
type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {};
let seq = 0;

class Q implements PromiseLike<{ data: unknown; error: unknown }> {
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
  in(c: string, v: unknown[]) {
    this.filtros.push((l) => v.includes(l[c]));
    return this;
  }
  is(c: string, v: unknown) {
    this.filtros.push((l) => (l[c] ?? null) === v);
    return this;
  }
  lte(c: string, v: string) {
    this.filtros.push((l) => String(l[c]) <= v);
    return this;
  }
  not(c: string, op: string, v: unknown) {
    if (op === "is") this.filtros.push((l) => (l[c] ?? null) !== v);
    else {
      const lista = String(v).replace(/[()]/g, "").split(",");
      this.filtros.push((l) => l[c] != null && !lista.includes(String(l[c])));
    }
    return this;
  }
  or(expr: string) {
    // só o formato usado na trava: processando_ate.is.null,processando_ate.lt.<iso>
    const lt = /processando_ate\.lt\.(.+)$/.exec(expr)?.[1] ?? "";
    this.filtros.push((l) => l.processando_ate == null || String(l.processando_ate) < lt);
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
  private executar(): { data: unknown; error: unknown } {
    const t = tabelas[this.tabela];
    if (this.op === "insert") {
      const novas: Linha[] = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map(
        (p) => ({
          id: `id${++seq}`,
          created_at: new Date(Date.now() + seq).toISOString(),
          meta: {},
          ...p,
        }),
      );
      for (const n of novas)
        if (n.wamid && t.some((l) => l.wamid === n.wamid))
          return { data: null, error: { code: "23505", message: "duplicate key" } };
      t.push(...novas);
      return { data: this.unico ? novas[0] : novas, error: null };
    }
    let linhas = t.filter((l) => this.filtros.every((f) => f(l)));
    if (this.op === "update") {
      linhas.forEach((l) => Object.assign(l, this.payload));
      return { data: linhas, error: null };
    }
    if (this.op === "delete") {
      tabelas[this.tabela] = t.filter((l) => !linhas.includes(l));
      return { data: linhas, error: null };
    }
    if (this.ordem) {
      const { col, asc } = this.ordem;
      linhas = [...linhas].sort(
        (a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1),
      );
    }
    if (this.lim !== null) linhas = linhas.slice(0, this.lim);
    return { data: this.unico ? (linhas[0] ?? null) : linhas, error: null };
  }
  then<T1, T2>(
    ok?: ((v: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>) | null,
    ko?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return Promise.resolve(this.executar()).then(ok, ko);
  }
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => new Q(t) },
}));

const config = {
  modelo: "m",
  espera_segundos: 0,
  whatsapp_modo: "rascunho_teste",
  numeros_teste: ["5521999990000"],
  envio_liberado: false,
  pausa_eco_minutos: 120,
};
const responder = vi.fn(async (conversaId: string) => {
  tabelas.wa_mensagens.push({
    id: `id${++seq}`,
    conversa_id: conversaId,
    autor: "joy",
    texto: "Oi! Aqui é a Joy ☺️ Prefere Ipanema ou Botafogo?",
    envio: "rascunho",
    meta: {},
    created_at: new Date(Date.now() + seq).toISOString(),
  });
  return { respondeu: true };
});
vi.mock("./agente.server", () => ({
  carregarConfig: vi.fn(async () => config),
  responder: (id: string) => responder(id),
}));

const enviados: Array<Record<string, unknown>> = [];
beforeEach(() => {
  for (const k of Object.keys(tabelas)) delete tabelas[k];
  enviados.length = 0;
  responder.mockClear();
  Object.assign(config, { whatsapp_modo: "rascunho_teste", envio_liberado: false });
  process.env.WHATSAPP_TOKEN = "tok";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "PN1";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).endsWith("/PN1/messages")) {
        enviados.push(JSON.parse(init?.body ?? "{}"));
        return new Response(JSON.stringify({ messages: [{ id: `wamid.out${enviados.length}` }] }));
      }
      return new Response("{}", { status: 404 });
    }),
  );
});

const agoraTs = () => String(Math.floor(Date.now() / 1000) - 60);
const msg = (id: string, from: string, body: string) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "PN1" },
            contacts: [{ wa_id: from, profile: { name: "Ana" } }],
            messages: [{ id, from, timestamp: agoraTs(), type: "text", text: { body } }],
          },
        },
      ],
    },
  ],
});

describe("assinatura da Meta", () => {
  it("aceita só HMAC-SHA256 do corpo com o App Secret", async () => {
    const { assinaturaMetaValida } = await import("./whatsapp.server");
    const corpo = '{"a":1}';
    const sig = `sha256=${createHmac("sha256", "seg").update(corpo).digest("hex")}`;
    expect(await assinaturaMetaValida(corpo, sig, "seg")).toBe(true);
    expect(await assinaturaMetaValida(corpo + " ", sig, "seg")).toBe(false);
    expect(await assinaturaMetaValida(corpo, sig, "outro")).toBe(false);
    expect(await assinaturaMetaValida(corpo, null, "seg")).toBe(false);
    expect(await assinaturaMetaValida(corpo, "sha256=zz", "seg")).toBe(false);
  });
});

describe("E3: webhook → rascunho → aprovação", () => {
  it("grava uma vez só (a Meta reenvia) e cria a conversa com o nome", async () => {
    const { registrarWebhook } = await import("./whatsapp.server");
    expect((await registrarWebhook(msg("w1", "5521999990000", "oi"))).mensagens).toBe(1);
    expect((await registrarWebhook(msg("w1", "5521999990000", "oi"))).mensagens).toBe(0);
    expect(tabelas.wa_conversas).toHaveLength(1);
    expect(tabelas.wa_conversas[0]).toMatchObject({
      canal: "whatsapp",
      wa_id: "5521999990000",
      contato_nome: "Ana",
      telefone: "+5521999990000",
    });
    expect(tabelas.wa_mensagens).toHaveLength(1);
  });

  it("ignora mensagem de outro número da conta", async () => {
    const { registrarWebhook } = await import("./whatsapp.server");
    const p = msg("w9", "5521999990000", "oi");
    (p.entry[0].changes[0].value.metadata as { phone_number_id: string }).phone_number_id = "OUTRO";
    expect(await registrarWebhook(p)).toMatchObject({ mensagens: 0, ignorados: 1 });
  });

  it("número de teste: rascunho; aprovação envia e marca enviada; nada sai sem aprovar", async () => {
    const w = await import("./whatsapp.server");
    await w.registrarWebhook(msg("w1", "5521999990000", "tem quarto?"));
    const r = await w.processarPendentes();
    expect(r.resultados[0].acao).toBe("rascunho criado");
    expect(enviados).toHaveLength(0);
    const rasc = tabelas.wa_mensagens.find((m) => m.envio === "rascunho")!;
    // segunda passada não faz outro rascunho
    expect((await w.processarPendentes()).resultados).toHaveLength(0);
    await w.aprovarRascunho({
      mensagemId: String(rasc.id),
      texto: "Oi! Prefere Ipanema ou Botafogo? ☺️",
      userId: "u1",
    });
    expect(enviados).toEqual([
      expect.objectContaining({
        to: "5521999990000",
        type: "text",
        text: expect.objectContaining({ body: "Oi! Prefere Ipanema ou Botafogo? ☺️" }),
      }),
    ]);
    expect(rasc).toMatchObject({ envio: "enviada", wamid: "wamid.out1", aprovado_por: "u1" });
    expect((rasc.meta as { texto_original?: string }).texto_original).toContain("Joy");
    await expect(w.aprovarRascunho({ mensagemId: String(rasc.id), userId: "u1" })).rejects.toThrow(
      /não está mais pendente/,
    );
    // status da Meta
    await w.registrarWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  { id: "wamid.out1", status: "read" },
                  { id: "wamid.out1", status: "delivered" },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(rasc.envio).toBe("lida");
  });

  it("hóspede que não é de teste: sem rascunho no modo teste e envio bloqueado mesmo com rascunho", async () => {
    const w = await import("./whatsapp.server");
    await w.registrarWebhook(msg("w2", "5511988887777", "oi"));
    const r = await w.processarPendentes();
    expect(r.resultados[0].acao).toMatch(/fora do modo/);
    expect(responder).not.toHaveBeenCalled();
    // pedido manual no painel faz o rascunho, mas o envio continua bloqueado
    const conv = tabelas.wa_conversas[0];
    await w.processarConversa(String(conv.id), { forcar: true });
    const rasc = tabelas.wa_mensagens.find((m) => m.envio === "rascunho")!;
    await expect(w.aprovarRascunho({ mensagemId: String(rasc.id), userId: "u1" })).rejects.toThrow(
      /Envio bloqueado/,
    );
    expect(rasc.envio).toBe("rascunho");
    expect(enviados).toHaveLength(0);
  });

  it("eco da recepção: entra no histórico, substitui o rascunho e pausa a Joy", async () => {
    const w = await import("./whatsapp.server");
    await w.registrarWebhook(msg("w1", "5521999990000", "oi"));
    await w.processarPendentes();
    await w.registrarWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "smb_message_echoes",
              value: {
                metadata: { phone_number_id: "PN1" },
                message_echoes: [
                  {
                    id: "e1",
                    from: "552197484343",
                    to: "5521999990000",
                    timestamp: agoraTs(),
                    type: "text",
                    text: { body: "Oi, aqui é a Júlia!" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(tabelas.wa_mensagens.find((m) => m.wamid === "e1")).toMatchObject({
      autor: "equipe",
      envio: "enviada",
    });
    expect(tabelas.wa_mensagens.some((m) => m.envio === "rascunho")).toBe(false);
    expect(Date.parse(String(tabelas.wa_conversas[0].pausada_ate))).toBeGreaterThan(Date.now());
    // nova mensagem do hóspede durante a pausa: sem rascunho
    await w.registrarWebhook(msg("w3", "5521999990000", "obrigada"));
    expect((await w.processarPendentes()).resultados).toHaveLength(0);
  });

  it("modo desligado: grava, mas não processa", async () => {
    config.whatsapp_modo = "desligado";
    const w = await import("./whatsapp.server");
    await w.registrarWebhook(msg("w1", "5521999990000", "oi"));
    expect((await w.processarPendentes()).resultados).toHaveLength(0);
    expect(responder).not.toHaveBeenCalled();
  });

  it("resposta manual da equipe também respeita a lista de teste e pausa a Joy", async () => {
    const w = await import("./whatsapp.server");
    await w.registrarWebhook(msg("w1", "5521999990000", "oi"));
    const conv = tabelas.wa_conversas[0];
    await w.enviarManual({
      conversaId: String(conv.id),
      texto: "Oi, aqui é o Rodrigo",
      userId: "u1",
    });
    expect(enviados).toHaveLength(1);
    expect(tabelas.wa_mensagens.find((m) => m.autor === "equipe")).toMatchObject({
      envio: "enviada",
      wamid: "wamid.out1",
    });
    expect(conv.pausada_ate).toBeTruthy();
  });
});
