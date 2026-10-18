import { describe, expect, it } from "vitest";
import {
  AREA_COMUM,
  chamadoDoQuarto,
  chaveQuarto,
  filtrarChamadosPainel,
  localDoChamado,
} from "./chamados-quarto";

const ch = (unidade: string, descricao: string, status = "Aberto", categoria = "Elétrica") => ({
  unidade,
  descricao,
  status,
  categoria,
});

describe("local do chamado", () => {
  it("lê quarto, área comum e chamado sem local", () => {
    expect(localDoChamado("[URGENTE] [Quarto 104] Ar não gela")).toBe("104");
    expect(localDoChamado("[Área comum] Pintar escada")).toBe(AREA_COMUM);
    expect(localDoChamado("Lâmpada queimada")).toBeNull();
  });
  it("compara número sem zeros à esquerda", () => {
    expect(chaveQuarto("APT 001")).toBe("1");
    expect(chamadoDoQuarto("[Quarto 1] x", "01")).toBe(true);
    expect(chamadoDoQuarto("[Quarto 110] x", "01")).toBe(false);
    expect(chamadoDoQuarto("[Área comum] x", AREA_COMUM)).toBe(true);
    expect(chamadoDoQuarto("[Área comum] x", "01")).toBe(false);
  });
});

describe("filtro do Painel", () => {
  const lista = [
    ch("Botafogo", "[Quarto 01] Ar pingando", "Concluído"),
    ch("Botafogo", "[Quarto 01] Tomada solta", "Em Andamento"),
    ch("Botafogo", "[Quarto 110] Tomada", "Aberto"),
    ch("Ipanema", "[Quarto 01] Chuveiro", "Aberto"),
  ];
  it("quarto escolhido: só chamados abertos daquele quarto e daquela unidade", () => {
    const r = filtrarChamadosPainel(lista, {
      unidade: "Botafogo",
      categoria: "todas",
      quarto: "01",
    });
    expect(r.map((c) => c.descricao)).toEqual(["[Quarto 01] Tomada solta"]);
  });
  it("sem unidade o quarto não filtra", () => {
    expect(
      filtrarChamadosPainel(lista, { unidade: "todas", categoria: "todas", quarto: "01" }),
    ).toHaveLength(4);
  });
  it("unidade e categoria como antes", () => {
    expect(
      filtrarChamadosPainel(lista, { unidade: "Ipanema", categoria: "todas", quarto: null }),
    ).toHaveLength(1);
    expect(
      filtrarChamadosPainel(lista, { unidade: "todas", categoria: "Pintura", quarto: null }),
    ).toHaveLength(0);
  });
});
