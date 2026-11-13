import { describe, expect, it } from "vitest";
import { minutosDaPessoa, nivelPrevisao, padraoNaData } from "./previsao-reforco-status";

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

describe("capacidade de cada camareira", () => {
  const padrao = {
    hora_entrada: "07:00",
    hora_saida: "16:00",
    intervalo_minutos: 60,
    vigente_desde: "2026-01-01",
  };
  it("fixa com horário no dia", () => {
    expect(
      minutosDaPessoa({ status: "trabalho", hora_entrada: "08:00", hora_saida: "17:00" }, padrao),
    ).toEqual({ brutos: 540, intervalo: 60 });
  });
  it("fixa sem horário no dia usa o padrão (antes contava 0)", () => {
    expect(
      minutosDaPessoa({ status: "trabalho", hora_entrada: null, hora_saida: null }, padrao),
    ).toEqual({ brutos: 540, intervalo: 60 });
  });
  it("extra sem horas contratadas usa o horário do dia", () => {
    expect(
      minutosDaPessoa(
        { status: "extra", horas_contratadas: null, hora_entrada: "09:00", hora_saida: "15:00" },
        null,
      ),
    ).toEqual({ brutos: 360, intervalo: 0 });
    expect(minutosDaPessoa({ status: "extra", horas_contratadas: 8 }, null)).toEqual({
      brutos: 480,
      intervalo: 0,
    });
  });
  it("padrão vigente na data", () => {
    const p = padraoNaData(
      [
        { vigente_desde: "2026-01-01", hora_entrada: "07:00" },
        { vigente_desde: "2026-11-01", hora_entrada: "08:00" },
      ],
      "2026-11-17",
    );
    expect(p?.hora_entrada).toBe("08:00");
  });
});
