import { describe, expect, it } from "vitest";
import { avaliarMeta } from "./bonus-meta";

describe("avaliarMeta", () => {
  it("bate a meta quando as 3 notas estão na mínima ou acima", () => {
    expect(avaliarMeta({ geral: 9, funcionarios: 9.5, limpeza: 10 }, 9).atingida).toBe(true);
  });
  it("lista o que falta subir", () => {
    const r = avaliarMeta({ geral: 8.3, funcionarios: 7.5, limpeza: 9.2 }, 9);
    expect(r.atingida).toBe(false);
    expect(r.abaixo.map((a) => a.nome)).toEqual(["Geral", "Funcionário"]);
  });
  it("sem avaliações não bate a meta", () => {
    expect(avaliarMeta({ geral: null, funcionarios: null, limpeza: null }, 9).atingida).toBe(false);
  });
});
