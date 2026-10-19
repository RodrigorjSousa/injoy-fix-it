import { describe, expect, it } from "vitest";
import { PALETA_CORES, corComAlfa, corDoTexto, normalizarNome } from "./cores-equipe";

describe("cores da equipe", () => {
  it("paleta tem 24 cores únicas e válidas", () => {
    expect(PALETA_CORES).toHaveLength(24);
    expect(new Set(PALETA_CORES).size).toBe(24);
    for (const c of PALETA_CORES) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("texto claro em cor escura e escuro em cor clara", () => {
    expect(corDoTexto("#1d4ed8")).toBe("#ffffff");
    expect(corDoTexto("#fde047")).toBe("#111827");
  });
  it("alfa e nomes", () => {
    expect(corComAlfa("#ff0000", 0.2)).toBe("rgba(255, 0, 0, 0.2)");
    expect(normalizarNome("  MARÍA  Silva ")).toBe("maria silva");
  });
});
