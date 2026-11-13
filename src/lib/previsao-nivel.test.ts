import { describe, expect, it } from "vitest";
import { nivelPrevisao } from "./previsao-reforco-status";

const cfg = {
  limite_amarelo_pct: 70,
  limite_vermelho_pct: 90,
  limite_amarelo_gerais: 6,
  limite_vermelho_gerais: 8,
};

describe("nível da Previsão de Carga", () => {
  it("duas fixas somam a capacidade: 9 gerais, 513 de 969 min → não pede reforço", () => {
    expect(nivelPrevisao({ ...cfg, carga: 513, capacidade: 969, gerais: 9, pessoas: 2 })).toEqual({
      nivel: "verde",
      pct: 53,
    });
  });
  it("as mesmas 9 gerais com uma pessoa só → vermelho", () => {
    expect(
      nivelPrevisao({ ...cfg, carga: 513, capacidade: 561, gerais: 9, pessoas: 1 }).nivel,
    ).toBe("vermelho");
  });
  it("gerais por pessoa no limite amarelo → amarelo", () => {
    expect(
      nivelPrevisao({ ...cfg, carga: 300, capacidade: 900, gerais: 12, pessoas: 2 }).nivel,
    ).toBe("amarelo");
  });
  it("carga acima do limite em % continua vermelho mesmo com duas pessoas", () => {
    expect(
      nivelPrevisao({ ...cfg, carga: 950, capacidade: 969, gerais: 4, pessoas: 2 }).nivel,
    ).toBe("vermelho");
  });
  it("ninguém escalado e com serviço → vermelho", () => {
    expect(nivelPrevisao({ ...cfg, carga: 100, capacidade: 0, gerais: 1, pessoas: 0 })).toEqual({
      nivel: "vermelho",
      pct: 999,
    });
  });
});
