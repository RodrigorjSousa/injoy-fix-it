import { describe, expect, it } from "vitest";
import { COR_MOTIVO, ORDEM_URGENCIA } from "@/lib/reservas/cobranca";
import { TOM_MOTIVO } from "./cobranca-card";

describe("cores das modalidades", () => {
  it("o botão Reservas pisca na mesma cor dos cartões da tela", () => {
    for (const m of Object.keys(COR_MOTIVO) as (keyof typeof COR_MOTIVO)[]) {
      expect(TOM_MOTIVO[m].faixa).toContain(COR_MOTIVO[m]);
      expect(TOM_MOTIVO[m].ponto).toContain(COR_MOTIVO[m]);
    }
  });
  it("Standard é azul e a ordem de urgência cobre as três modalidades", () => {
    expect(COR_MOTIVO.standard).toBe("#3b5bdb");
    expect([...ORDEM_URGENCIA].sort()).toEqual(Object.keys(COR_MOTIVO).sort());
  });
});
