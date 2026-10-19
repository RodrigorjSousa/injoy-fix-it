import { describe, expect, it } from "vitest";
import { receitaDiariasPorMes, receitaDoMes } from "./receita-diarias";

const noites = [
  { unidade: "Botafogo", data: "2026-10-01", valor: 300 },
  { unidade: "Botafogo", data: "2026-10-18", valor: "250.50" },
  { unidade: "Botafogo", data: "2026-10-25", valor: 999 }, // futuro: não conta
  { unidade: "Ipanema", data: "2026-10-02", valor: 200 },
  { unidade: "Ipanema", data: "2026-09-30", valor: 180 },
];

describe("receita das diárias", () => {
  it("por unidade e até hoje", () => {
    expect(receitaDiariasPorMes(noites, "Botafogo", "2026-10-19")).toEqual({ "2026-10": { receita: 550.5, noites: 2 } });
  });
  it("consolidado soma as duas e separa os meses", () => {
    expect(receitaDiariasPorMes(noites, "Consolidado", "2026-10-19")).toEqual({
      "2026-10": { receita: 750.5, noites: 3 },
      "2026-09": { receita: 180, noites: 1 },
    });
  });
  it("sem diárias no mês usa o lançado no Financeiro", () => {
    const p = receitaDiariasPorMes(noites, "Ipanema", "2026-10-19");
    expect(receitaDoMes(p, "2026-10", 50)).toEqual({ valor: 200, fonte: "diarias", noites: 1 });
    expect(receitaDoMes(p, "2026-08", 50)).toEqual({ valor: 50, fonte: "financeiro", noites: 0 });
  });
});
