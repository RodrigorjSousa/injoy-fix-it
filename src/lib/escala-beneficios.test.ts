import { describe, expect, it } from "vitest";
import { calcularBeneficios, totaisBeneficios } from "./escala-beneficios";
import type { EscalaColaborador, EscalaDia } from "./escala";

const pessoa = (id: string, nome: string, vinculo: "fixo" | "freelance" = "fixo", ativo = true) =>
  ({ id, nome, vinculo, ativo, setor: "camareiras", unidade: "Ipanema" }) as unknown as EscalaColaborador;
const dia = (colaborador_id: string, data: string, status: string, turno = "dia") => ({ colaborador_id, data, status, turno }) as unknown as EscalaDia;

describe("escala-beneficios", () => {
  it("VA cheio e VT só nos dias de trabalho/extra; freelancer e inativo ficam de fora", () => {
    const people = [pessoa("a", "ANA"), pessoa("f", "FREE", "freelance"), pessoa("i", "INATIVA", "fixo", false)];
    const days = [
      dia("a", "2026-10-01", "trabalho"), dia("a", "2026-10-02", "trabalho"), dia("a", "2026-10-03", "extra"),
      dia("a", "2026-10-04", "folga"), dia("a", "2026-10-05", "ferias"), dia("a", "2026-10-06", "falta"), dia("a", "2026-10-07", "atestado"),
      dia("a", "2026-09-30", "trabalho"), dia("a", "2026-11-01", "trabalho"),
      dia("f", "2026-10-01", "extra"),
    ];
    const r = calcularBeneficios(people, days, "2026-10-01", "2026-10-31");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nome: "ANA", dias: 3, va: 385, vt: 56.4, total: 441.4 });
    expect(totaisBeneficios(r).total).toBe(441.4);
  });
  it("dois turnos no mesmo dia contam um VT só e avisa quem não tem escala", () => {
    const people = [pessoa("a", "ANA"), pessoa("b", "BIA")];
    const r = calcularBeneficios(people, [dia("a", "2026-10-01", "trabalho", "manha"), dia("a", "2026-10-01", "trabalho", "noite")], "2026-10-01", "2026-10-31");
    expect(r.find((x) => x.nome === "ANA")?.dias).toBe(1);
    expect(r.find((x) => x.nome === "BIA")).toMatchObject({ dias: 0, vt: 0, va: 385, semEscala: true });
  });
});
