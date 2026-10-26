import { describe, expect, it } from "vitest";
import { addCivilDays, calcularRodizio, civilDayDiff, civilDow, civilRange, revezamentoAnchor } from "./escala-engine";

const ate = "2027-06-30";
function checar(off: Set<string>, ancora: string) {
  const primeiro = addCivilDays(ancora, 14 * Math.ceil(civilDayDiff("2026-01-04", ancora) / 14));
  const dias = civilRange(primeiro, ate);
  const folga = (d: string) => off.has(d);
  for (let i = 0; i < dias.length - 1; i++) {
    const d = dias[i], dow = civilDow(d);
    if (folga(d) && folga(dias[i + 1])) { expect([5, 6]).not.toContain(dow); }
  }
  // 2 folgas por semana (domingo a sábado), domingo sim/não, máx. 5 dias seguidos de trabalho
  let seguidos = 0;
  for (let i = 0; i < dias.length - 7; i += 7) {
    const sem = dias.slice(i, i + 7);
    if (civilDayDiff(sem[0], ancora) % 7 !== 0) continue;
    expect(sem.filter(folga)).toHaveLength(2);
    const alt = Math.round(civilDayDiff(sem[0], ancora) / 7) % 2 === 0;
    expect(folga(sem[0])).toBe(alt);
  }
  for (const d of dias) { seguidos = folga(d) ? 0 : seguidos + 1; expect(seguidos).toBeLessThanOrEqual(5); }
}
describe("rodízio de folgas 5x2", () => {
  const ancA = "2026-10-04", ancB = "2026-10-11";
  const r = calcularRodizio([{ id: "a", data_base: ancA }, { id: "b", data_base: ancB }], ate);
  it("respeita as regras em todas as semanas", () => {
    checar(r.get("a")!, revezamentoAnchor(ancA));
    checar(r.get("b")!, revezamentoAnchor(ancB));
  });
  it("as duas pessoas não folgam no mesmo dia (domingos alternados)", () => {
    const a = r.get("a")!, b = r.get("b")!;
    expect([...a].filter((d) => b.has(d))).toEqual([]);
  });
  it("varia os dias da semana", () => {
    const dows = new Set([...r.get("a")!].map((d) => civilDow(d)).filter((x) => x !== 0));
    expect(dows.size).toBeGreaterThanOrEqual(4);
  });
  it("o resultado de uma data não depende do mês pedido", () => {
    const curto = calcularRodizio([{ id: "a", data_base: ancA }, { id: "b", data_base: ancB }], "2026-12-31");
    for (const d of civilRange("2026-10-01", "2026-12-31")) expect(curto.get("a")!.has(d)).toBe(r.get("a")!.has(d));
    expect(addCivilDays("2026-01-04", 0)).toBe("2026-01-04");
  });
  it("mesmo domingo de folga: só a coincidência do domingo é inevitável", () => {
    const c = calcularRodizio([{ id: "a", data_base: ancA }, { id: "b", data_base: ancA }], ate);
    const igual = [...c.get("a")!].filter((d) => c.get("b")!.has(d));
    expect(igual.every((d) => civilDow(d) === 0)).toBe(true);
  });
});

import { generatePatternMonth, validateSchedule, type EnginePattern, type ValidationPerson } from "./escala-engine";
describe("rodízio no gerador e nas validações", () => {
  it("meses gerados com rodízio não geram nenhum erro vermelho", () => {
    const ancA = "2026-10-04", ancB = "2026-10-11";
    const r = calcularRodizio([{ id: "a", data_base: ancA }, { id: "b", data_base: ancB }], "2026-12-31");
    const pat = (db: string): EnginePattern => ({ tipo: "5x2_revezamento", data_base: db, folgas_fixas: [0], folga_semana_a: 0, folga_semana_b: 1, rodizio: true });
    const pessoa = (id: string, db: string, unidade: "Botafogo" | "Ipanema"): ValidationPerson => ({
      id, nome: id, setor: "camareiras", unidade, turno: "dia", pattern: pat(db),
      days: [9, 10, 11].flatMap((m) => generatePatternMonth(pat(db), 2026, m, r.get(id))).map((d) => ({ data: d.data, status: d.status, origem: "gerado" as const })),
    });
    const issues = validateSchedule([pessoa("a", ancA, "Botafogo"), pessoa("b", ancB, "Ipanema")]).filter((i) => i.severity === "error" && !i.code.startsWith("uncovered"));
    expect(issues).toEqual([]);
    const nov = (id: string) => generatePatternMonth(pat(id === "a" ? ancA : ancB), 2026, 10, r.get(id)).filter((d) => d.status === "folga").map((d) => d.data);
    expect(nov("a").filter((d) => nov("b").includes(d))).toEqual([]);
  });
});
