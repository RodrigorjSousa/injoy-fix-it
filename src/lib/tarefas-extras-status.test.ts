import { describe, expect, it } from "vitest";
import { calcularSituacaoTarefa } from "./tarefas-extras-status";

const hoje = "2026-10-08";

describe("calcularSituacaoTarefa", () => {
  it("próxima = última + periodicidade", () => {
    const s = calcularSituacaoTarefa({ ultimaEm: "2026-10-05T15:00:00Z", quem: "Julia", periodo: 7, agenda: null, hoje });
    expect(s.ultimaData).toBe("2026-10-05");
    expect(s.proxima).toBe("2026-10-12");
    expect(s.status).toBe("em_dia");
    expect(s.diasDesde).toBe(3);
  });
  it("atrasada quando a próxima já passou", () => {
    const s = calcularSituacaoTarefa({ ultimaEm: "2026-09-20T15:00:00Z", quem: "Julia", periodo: 7, agenda: null, hoje });
    expect(s.status).toBe("atrasada");
    expect(s.diasParaProxima).toBe(-11);
  });
  it("data do gestor vale enquanto ninguém registrar depois", () => {
    const s = calcularSituacaoTarefa({
      ultimaEm: "2026-10-01T15:00:00Z", quem: "Julia", periodo: 7,
      agenda: { proxima_data: "2026-10-20", definido_em: "2026-10-07T12:00:00Z" }, hoje,
    });
    expect(s.proxima).toBe("2026-10-20");
    expect(s.proximaManual).toBe(true);
    expect(s.status).toBe("em_dia");
  });
  it("registro depois da data definida volta ao cálculo automático", () => {
    const s = calcularSituacaoTarefa({
      ultimaEm: "2026-10-08T15:00:00Z", quem: "Raquel", periodo: 15,
      agenda: { proxima_data: "2026-10-10", definido_em: "2026-10-07T12:00:00Z" }, hoje,
    });
    expect(s.proximaManual).toBe(false);
    expect(s.proxima).toBe("2026-10-23");
  });
  it("nunca feita sem data definida", () => {
    const s = calcularSituacaoTarefa({ ultimaEm: null, quem: null, periodo: undefined, agenda: null, hoje });
    expect(s.status).toBe("nunca");
    expect(s.periodo).toBe(7);
  });
});
