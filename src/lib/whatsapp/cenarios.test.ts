import { describe, expect, it } from "vitest";
import {
  CENARIOS,
  FIM,
  checagensAutomaticas,
  lerAvaliacao,
  lerFalaHospede,
  mensagensAvaliador,
  mensagensHospede,
  resultadoFinal,
  type MsgTeste,
} from "./cenarios";

const cotacao = CENARIOS.find((c) => c.id === "cotacao-casal")!;
const porta = CENARIOS.find((c) => c.id === "preso-na-porta")!;

describe("cenários", () => {
  it("ids únicos e campos preenchidos", () => {
    const ids = new Set<string>();
    for (const c of CENARIOS) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.persona.length).toBeGreaterThan(20);
      expect(c.criterios.length).toBeGreaterThan(20);
      expect(c.maxTurnos).toBeGreaterThanOrEqual(3);
    }
    expect(CENARIOS.length).toBeGreaterThanOrEqual(20);
  });
});

describe("hóspede simulado", () => {
  it("inverte os papéis: a Joy é o user e o hóspede é o assistant", () => {
    const msgs: MsgTeste[] = [
      { autor: "cliente", texto: "oi, tem quarto?" },
      { autor: "joy", texto: "Oi! Prefere Ipanema ou Botafogo?" },
      { autor: "sistema", texto: "aviso" },
    ];
    const m = mensagensHospede(cotacao, msgs, { hoje: "2026-10-25", diaSemana: "domingo" });
    expect(m[0].role).toBe("system");
    expect(m[0].content).toContain("2026-10-25");
    expect(m[0].content).toContain(FIM);
    expect(m.slice(1).map((x) => x.role)).toEqual(["assistant", "user"]);
  });
  it("primeira mensagem: pede para começar", () => {
    const m = mensagensHospede(cotacao, [], { hoje: "2026-10-25", diaSemana: "domingo" });
    expect(m).toHaveLength(2);
    expect(m[1].role).toBe("user");
  });
  it("lê a fala e reconhece o fim", () => {
    expect(lerFalaHospede("Hóspede: oi tudo bem?")).toBe("oi tudo bem?");
    expect(lerFalaHospede('"oi"')).toBe("oi");
    expect(lerFalaHospede("[FIM]")).toBeNull();
    expect(lerFalaHospede("obrigado! [FIM]")).toBeNull();
    expect(lerFalaHospede("  ")).toBeNull();
  });
});

describe("checagens automáticas", () => {
  it("cobra ferramenta, transferência e filtro de segurança", () => {
    const msgs: MsgTeste[] = [
      { autor: "cliente", texto: "a porta não abre" },
      { autor: "joy", texto: "Tenta de novo!", ferramentas: [], bloqueios: ["codigo_acesso"] },
    ];
    const f = checagensAutomaticas(porta, msgs, false);
    expect(
      f
        .filter((x) => x.gravidade === "grave")
        .map((x) => x.problema)
        .join(" | "),
    ).toMatch(/passado para a equipe.*transferir_para_humano.*filtro/s);
  });
  it("transferir sem necessidade é erro médio; textão é leve", () => {
    const msgs: MsgTeste[] = [
      { autor: "cliente", texto: "tem quarto?" },
      { autor: "joy", texto: "x".repeat(800), ferramentas: ["consultar_disponibilidade"] },
    ];
    const f = checagensAutomaticas(cotacao, msgs, true);
    expect(f.map((x) => x.gravidade).sort()).toEqual(["leve", "media"]);
  });
  it("cenário bem atendido não tem falha automática", () => {
    const msgs: MsgTeste[] = [
      { autor: "cliente", texto: "a porta não abre" },
      {
        autor: "joy",
        texto: "Vou chamar a equipe agora!",
        ferramentas: ["transferir_para_humano"],
      },
    ];
    expect(checagensAutomaticas(porta, msgs, true)).toEqual([]);
  });
});

describe("avaliador", () => {
  it("monta o pedido com base, critérios e ferramentas", () => {
    const m = mensagensAvaliador(
      porta,
      [{ autor: "joy", texto: "Chamando a equipe", ferramentas: ["transferir_para_humano"] }],
      "BASE X",
    );
    expect(m[1].content).toContain("BASE X");
    expect(m[1].content).toContain(porta.criterios);
    expect(m[1].content).toContain("[ferramentas: transferir_para_humano]");
    expect(m[1].content).toContain("DEVE passar para a equipe");
  });
  it("lê JSON com markdown em volta e normaliza", () => {
    const av = lerAvaliacao(
      'Segue:\n```json\n{"nota": 12, "aprovado": true, "resumo": "ok", "erros": [{"gravidade": "x", "problema": "faltou link"}, {"problema": ""}], "sugestoes_licao": [{"situacao": "tem quarto?", "resposta_certa": "Prefere Ipanema ou Botafogo?"}, {"situacao": "a"}]}\n```',
    );
    expect(av.nota).toBe(10);
    expect(av.erros).toEqual([
      { gravidade: "media", problema: "faltou link", origem: "avaliador" },
    ]);
    expect(av.sugestoes).toHaveLength(1);
  });
  it("sem JSON dá erro", () => {
    expect(() => lerAvaliacao("não sei")).toThrow();
  });
  it("erro grave reprova e limita a nota a 5", () => {
    const av = { nota: 9, aprovado: true, resumo: "", erros: [], sugestoes: [] };
    expect(resultadoFinal([], av)).toMatchObject({ nota: 9, aprovado: true });
    const r = resultadoFinal([{ gravidade: "grave", problema: "x", origem: "automatica" }], av);
    expect(r).toMatchObject({ nota: 5, aprovado: false });
    expect(resultadoFinal([], { ...av, nota: 6.5 }).aprovado).toBe(false);
  });
});
