import { describe, expect, it } from "vitest";
import { montarInclusao, selecionarParaLimpar } from "./escala-limpar";
import type { EnginePattern } from "./escala-engine";

const d = (id: string, colaborador_id: string, o: Partial<{ status: string; origem: string; modalidade_id: string | null }> = {}) => ({ id, colaborador_id, status: "trabalho", origem: "gerado", modalidade_id: null, ...o });
describe("limpar", () => {
  const dias = [d("1", "a"), d("2", "a", { origem: "manual" }), d("3", "b"), d("4", "c", { status: "extra", origem: "manual", modalidade_id: "m" })];
  it("tudo poupa extras por padrão", () => {
    const r = selecionarParaLimpar(dias, { tipo: "tudo", incluirExtras: false });
    expect(r.ids).toEqual(["1", "2", "3"]); expect(r.poupados).toBe(1); expect(r.manuais).toBe(1);
  });
  it("tudo com extras e por pessoa", () => {
    expect(selecionarParaLimpar(dias, { tipo: "tudo", incluirExtras: true }).ids).toHaveLength(4);
    const p = selecionarParaLimpar(dias, { tipo: "pessoa", colaboradorId: "c" });
    expect(p.ids).toEqual(["4"]); expect(p.extras).toBe(1);
  });
});
const pat: EnginePattern = { tipo: "5x2_fixo", data_base: null, folgas_fixas: [0, 6], folga_semana_a: null, folga_semana_b: null } as EnginePattern;
describe("incluir pessoa", () => {
  it("completa gera o mês e preserva ajustes manuais", () => {
    const r = montarInclusao({ modo: "completa", pattern: pat, ano: 2026, mes: 10, inicio: "", fim: "", somentePadrao: true, existentes: [{ data: "2026-11-02", status: "folga", origem: "manual" }] });
    expect(r).toHaveLength(29);
    expect(r.find((x) => x.data === "2026-11-02")).toBeUndefined();
    expect(r.find((x) => x.data === "2026-11-01")?.status).toBe("folga");
  });
  it("mesclada só nos dias pedidos e sem pisar em quem já trabalha", () => {
    const r = montarInclusao({ modo: "mesclada", pattern: pat, ano: 2026, mes: 10, inicio: "2026-11-05", fim: "2026-11-09", somentePadrao: true, existentes: [{ data: "2026-11-06", status: "trabalho", origem: "gerado" }] });
    expect(r.map((x) => x.data)).toEqual(["2026-11-05", "2026-11-09"]);
    const livre = montarInclusao({ modo: "mesclada", pattern: null, ano: 2026, mes: 10, inicio: "2026-11-07", fim: "2026-11-07", somentePadrao: false, existentes: [{ data: "2026-11-07", status: "folga", origem: "gerado" }] });
    expect(livre).toEqual([{ data: "2026-11-07", status: "trabalho", origem: "manual" }]);
  });
});
