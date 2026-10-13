import { describe, expect, it } from "vitest";
import { horaSaida, lerOrigemEscala, limitesMes, validarPlantao } from "./plantao";

describe("horaSaida", () => {
  it("soma as horas", () => {
    expect(horaSaida("07:00", 8)).toBe("15:00");
    expect(horaSaida("09:30", 12)).toBe("21:30");
  });
  it("passa da meia-noite", () => expect(horaSaida("19:00", 12)).toBe("07:00"));
  it("vazio sem dados", () => {
    expect(horaSaida("", 8)).toBe("");
    expect(horaSaida("08:00", 0)).toBe("");
  });
});

describe("lerOrigemEscala", () => {
  it("lê colaborador, mês e unidade", () => {
    expect(lerOrigemEscala("11111111-1111-1111-1111-111111111111:2026-10-01:Botafogo")).toEqual({
      colaboradorId: "11111111-1111-1111-1111-111111111111",
      mes: "2026-10",
      unidade: "Botafogo",
    });
  });
  it("ignora lançamento que não veio da escala", () => {
    expect(lerOrigemEscala(null)).toBeNull();
    expect(lerOrigemEscala("x:2026-10-01:Leblon")).toBeNull();
  });
});

describe("limitesMes e validarPlantao", () => {
  it("fim do mês", () => {
    expect(limitesMes("2026-02")).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
    expect(limitesMes("2026-10").fim).toBe("2026-10-31");
  });
  it("aponta o primeiro problema", () => {
    const ok = { data: "2026-10-15", valor: 150, horas: 8, entrada: "08:00" };
    expect(validarPlantao(ok)).toBeNull();
    expect(validarPlantao({ ...ok, data: "" })).toBe("Escolha a data.");
    expect(validarPlantao({ ...ok, valor: null })).toBe("Informe o valor.");
    expect(validarPlantao({ ...ok, horas: 30 })).toMatch(/horas/);
    expect(validarPlantao({ ...ok, entrada: "8h" })).toMatch(/entrada/);
  });
});
