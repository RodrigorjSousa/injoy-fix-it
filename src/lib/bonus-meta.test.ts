import { describe, expect, it } from "vitest";
import { avaliarMetaSetores } from "./bonus-meta";

describe("avaliarMetaSetores", () => {
  it("Recepção = Geral + Funcionário; Camareiras = Geral + Limpeza", () => {
    const r = avaliarMetaSetores({ geral: 9.4, funcionarios: 7.5, limpeza: 9.2 }, 9);
    expect(r.recepcao).toEqual({ nota: 7.5, geral: 9.4, atingida: false });
    expect(r.camareiras).toEqual({ nota: 9.2, geral: 9.4, atingida: true });
  });
  it("Geral abaixo da mínima derruba os dois setores", () => {
    const r = avaliarMetaSetores({ geral: 8.8, funcionarios: 10, limpeza: 10 }, 9);
    expect(r.recepcao.atingida || r.camareiras.atingida).toBe(false);
  });
  it("nota igual à mínima bate a meta", () => {
    expect(avaliarMetaSetores({ geral: 9, funcionarios: 9, limpeza: 9 }, 9).recepcao.atingida).toBe(
      true,
    );
  });
  it("sem avaliações não bate a meta", () => {
    const r = avaliarMetaSetores({ geral: null, funcionarios: null, limpeza: null }, 9);
    expect(r.recepcao.atingida || r.camareiras.atingida).toBe(false);
  });
});
