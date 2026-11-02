import { describe, expect, it } from "vitest";
import { fimDoMesAte, mesesParaConferir } from "./pontomais-sync.server";

describe("meses que a atualização automática da meta confere", () => {
  it("na virada do mês confere também o mês anterior (ajustes de fechamento no Pontomais)", () => {
    expect(mesesParaConferir("2026-11-02")).toEqual(["2026-10", "2026-11"]);
    expect(mesesParaConferir("2026-01-05")).toEqual(["2025-12", "2026-01"]);
  });
  it("depois do dia 10 só o mês atual", () => {
    expect(mesesParaConferir("2026-11-11")).toEqual(["2026-11"]);
  });
  it("mês pedido pelo gestor", () => {
    expect(mesesParaConferir("2026-11-20", "2026-09")).toEqual(["2026-09"]);
  });
  it("busca até o fim do mês ou até hoje", () => {
    expect(fimDoMesAte("2026-10", "2026-11-02")).toBe("2026-10-31");
    expect(fimDoMesAte("2026-11", "2026-11-02")).toBe("2026-11-02");
  });
});
