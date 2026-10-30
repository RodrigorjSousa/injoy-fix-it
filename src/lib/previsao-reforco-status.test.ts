import { describe, expect, it } from "vitest";
import { contarReforcosReais, situacaoReforco } from "./previsao-reforco-status";

const base = { unidade: "Ipanema", data: "2026-10-30", nivel: "vermelho" as const, ocupacao_carga_pct: 109, camareiras_escaladas: 0, freelancers_escalados: 1 };
describe("reforço com sobrecarga", () => {
  it("uma pessoa sozinha com sobrecarga NUNCA é reforço chamado (caso Cristina cobrindo férias)", () => {
    const r = situacaoReforco(base, new Set(["Ipanema|2026-10-30"]), true);
    expect(r.sozinha).toBe(true); expect(r.chamado).toBe(false); expect(r.pessoas).toBe(1);
  });
  it("com duas pessoas e sobrecarga o reforço vale", () => {
    expect(situacaoReforco({ ...base, camareiras_escaladas: 1 }).chamado).toBe(true);
  });
  it("sem sobrecarga uma camareira só é normal", () => {
    const r = situacaoReforco({ ...base, nivel: "verde", ocupacao_carga_pct: 60 }, null);
    expect(r.sozinha).toBe(false);
  });
  it("pedido autorizado não resolve enquanto ela estiver sozinha", () => {
    expect(situacaoReforco({ ...base, freelancers_escalados: 0, camareiras_escaladas: 1 }, new Set(["Ipanema|2026-10-30"])).chamado).toBe(false);
  });
  it("extra que cobre férias não conta como reforço", () => {
    expect(contarReforcosReais(1, 1)).toBe(0);
    expect(contarReforcosReais(2, 1)).toBe(1);
    expect(contarReforcosReais(1, 0)).toBe(1);
  });
});
