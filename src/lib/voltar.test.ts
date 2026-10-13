import { describe, expect, it } from "vitest";
import { destinoSemHistorico, mostraVoltar } from "./voltar";

describe("botão voltar", () => {
  it("não aparece nas telas iniciais", () => {
    expect(mostraVoltar("/")).toBe(false);
    expect(mostraVoltar("/gestor")).toBe(false);
    expect(mostraVoltar("/gestor/")).toBe(false);
    expect(mostraVoltar("/boas-vindas")).toBe(false);
  });
  it("aparece nas demais", () => {
    expect(mostraVoltar("/recepcao")).toBe(true);
    expect(mostraVoltar("/gestor/financeiro")).toBe(true);
    expect(mostraVoltar("/manutencao")).toBe(true);
  });
  it("sem histórico volta para o início certo", () => {
    expect(destinoSemHistorico(true)).toBe("/gestor");
    expect(destinoSemHistorico(false)).toBe("/");
  });
});
