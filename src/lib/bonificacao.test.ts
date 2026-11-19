import { describe, expect, it } from "vitest";
import { calcularMediasBonificacao, calcularValor, nivelNota, type ConfigBonificacao, type RegistroBonificacao } from "./bonificacao";

const r = (p: Partial<RegistroBonificacao>): RegistroBonificacao => ({
  id: Math.random().toString(36),
  data: "2026-10-02",
  nome_hospede: "x",
  nota_funcionarios: 10,
  nota_limpeza: null,
  nota_geral: 10,
  observacao: null,
  teve_elogio: false,
  valor_calculado: 0,
  unidade: "Ipanema",
  setor: "recepcao",
  avaliacao_id: null,
  created_at: "",
  ...p,
});

describe("médias da bonificação", () => {
  it("conta a nota geral uma vez por avaliação e separa funcionário e limpeza", () => {
    const m = calcularMediasBonificacao([
      r({ avaliacao_id: "a", setor: "recepcao", nota_geral: 8, nota_funcionarios: 10 }),
      r({
        avaliacao_id: "a",
        setor: "camareiras",
        nota_geral: 8,
        nota_funcionarios: 10,
        nota_limpeza: 9,
      }),
      r({ avaliacao_id: "b", setor: "recepcao", nota_geral: 7, nota_funcionarios: 9 }),
      r({ setor: "recepcao", nota_geral: 9, nota_funcionarios: 8 }),
    ]);
    expect(m.avaliacoes).toBe(3);
    expect(m.geral).toBe(8);
    expect(m.funcionarios).toBe(9);
    expect(m.limpeza).toBe(9);
  });
  it("sem avaliações devolve vazio", () => {
    expect(calcularMediasBonificacao([])).toEqual({
      geral: null,
      funcionarios: null,
      limpeza: null,
      avaliacoes: 0,
    });
  });
  it("faixas de cor", () => {
    expect(nivelNota(9.2)).toBe("verde");
    expect(nivelNota(8.4)).toBe("amarelo");
    expect(nivelNota(7.8)).toBe("vermelho");
    expect(nivelNota(null)).toBe("sem");
  });
});

describe("valor da avaliação do setor", () => {
  const cfg: ConfigBonificacao = {
    id: "c",
    valor_nota_10: 15,
    valor_nota_9: 10,
    penalidade_1_ruim: -5,
    penalidade_2_ruins: -10,
    valor_elogio: 20,
  };
  it("segue as notas do setor e a geral", () => {
    expect(calcularValor(10, 9, cfg)).toBe(15);
    expect(calcularValor(9, 10, cfg)).toBe(10);
    expect(calcularValor(8, 10, cfg)).toBe(-5);
    expect(calcularValor(7, 6, cfg)).toBe(-10);
  });
  it("o elogio nominal não entra no valor do setor (vai só para a pessoa elogiada)", () => {
    // antes: 15 + 20 = 35 para o setor inteiro
    expect(calcularValor(10, 10, cfg)).toBe(15);
  });
});
