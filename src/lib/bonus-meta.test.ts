import { describe, expect, it } from "vitest";
import { avaliarMetaSetores } from "./bonus-meta";

describe("avaliarMetaSetores", () => {
  it("Recepção usa a nota Funcionário e Camareiras usa Limpeza", () => {
    const r = avaliarMetaSetores({ funcionarios: 7.5, limpeza: 9.2 }, 9);
    expect(r.recepcao).toEqual({ nota: 7.5, atingida: false });
    expect(r.camareiras).toEqual({ nota: 9.2, atingida: true });
  });
  it("nota igual à mínima bate a meta", () => {
    expect(avaliarMetaSetores({ funcionarios: 9, limpeza: 9 }, 9).recepcao.atingida).toBe(true);
  });
  it("sem avaliações não bate a meta", () => {
    const r = avaliarMetaSetores({ funcionarios: null, limpeza: null }, 9);
    expect(r.recepcao.atingida || r.camareiras.atingida).toBe(false);
  });
});
