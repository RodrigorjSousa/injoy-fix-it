import { describe, expect, it } from "vitest";
import { chamadosAtrasados, situacaoPrazo, textoAtrasoChamado } from "./chamado-prazo";

const agora = new Date("2026-10-18T12:00:00Z");
const ch = (criadoEm: string, status = "Aberto") => ({ criadoEm, status });

describe("prazo de 3 dias", () => {
  it("dentro do prazo", () => {
    const s = situacaoPrazo(ch("2026-10-15T13:00:00Z"), agora);
    expect(s.atrasado).toBe(false);
    expect(s.diasAberto).toBe(2);
  });
  it("passou de 72 h e não foi concluído", () => {
    const s = situacaoPrazo(ch("2026-10-15T11:00:00Z", "Em Andamento"), agora);
    expect(s).toMatchObject({ atrasado: true, diasAberto: 3, diasAtraso: 0 });
    expect(textoAtrasoChamado(s)).toBe("Aberto há 3 dia(s) · prazo venceu há menos de 1 dia");
  });
  it("conta os dias além do prazo", () => {
    const s = situacaoPrazo(ch("2026-10-13T10:00:00Z"), agora);
    expect(s.diasAtraso).toBe(2);
    expect(textoAtrasoChamado(s)).toBe("Aberto há 5 dia(s) · 2 dia(s) além do prazo");
  });
  it("concluído nunca fica atrasado", () => {
    expect(situacaoPrazo(ch("2026-10-01T10:00:00Z", "Concluído"), agora).atrasado).toBe(false);
  });
  it("lista os atrasados do mais antigo para o mais novo", () => {
    const l = [ch("2026-10-14T10:00:00Z"), ch("2026-10-10T10:00:00Z"), ch("2026-10-17T10:00:00Z")];
    expect(chamadosAtrasados(l, agora).map((c) => c.criadoEm)).toEqual([
      "2026-10-10T10:00:00Z",
      "2026-10-14T10:00:00Z",
    ]);
  });
});
