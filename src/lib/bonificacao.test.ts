import { describe, expect, it } from "vitest";
import { calcularMediasBonificacao, nivelNota, type RegistroBonificacao } from "./bonificacao";

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
