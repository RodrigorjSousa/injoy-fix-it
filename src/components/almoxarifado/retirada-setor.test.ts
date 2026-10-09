import { describe, expect, it } from "vitest";
import { pertenceAoSetor } from "./retirada-modal";

describe("pertenceAoSetor", () => {
  it("ESCRITÓRIO agrupa Material de Escritório", () => {
    expect(pertenceAoSetor("Material de Escritório", "Escritório")).toBe(true);
    expect(pertenceAoSetor("MATERIAL DE ESCRITORIO", "Escritório")).toBe(true);
    expect(pertenceAoSetor("Escritório", "Escritório")).toBe(true);
  });
  it("demais setores continuam exatos", () => {
    expect(pertenceAoSetor("Limpeza", "Limpeza")).toBe(true);
    expect(pertenceAoSetor("Material de Escritório", "Limpeza")).toBe(false);
    expect(pertenceAoSetor("Banheiro", "Escritório")).toBe(false);
  });
});
