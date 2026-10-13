import { describe, expect, it } from "vitest";
import { adicionalManutencao, coberturaSetor } from "./escala-cobertura";

const row = (unidade: string, setor: string, data: string, status = "trabalho") => ({ colaborador_id: "x", unidade, setor, data, status });
describe("adicional da manutenção", () => {
  it("sábado 50%, domingo 100%, feriado útil 100%, dia útil comum nada", () => {
    expect(adicionalManutencao("2026-10-10")?.percentual).toBe(50);
    expect(adicionalManutencao("2026-10-11")?.percentual).toBe(100);
    expect(adicionalManutencao("2026-10-12", ["2026-10-12"])?.tipo).toBe("feriado");
    expect(adicionalManutencao("2026-10-13", ["2026-10-12"])).toBeNull();
    expect(adicionalManutencao("2026-10-10", ["2026-10-10"])?.percentual).toBe(100);
  });
});
describe("cobertura", () => {
  it("Ipanema não tem recepção: informativo, sem pendência", () => {
    const r = coberturaSetor("Ipanema", "recepcao", "2026-10-13", "2026-10-14", []);
    expect(r.nivel).toBe("info");
  });
  it("manutenção na outra unidade: informativo", () => {
    const r = coberturaSetor("Ipanema", "manutencao", "2026-10-13", "2026-10-14", [row("Botafogo", "manutencao", "2026-10-13"), row("Botafogo", "manutencao", "2026-10-14")]);
    expect(r.nivel).toBe("info");
    expect(r.mensagem).toContain("Botafogo");
  });
  it("dia útil sem manutenção em nenhuma unidade: pendente", () => {
    expect(coberturaSetor("Botafogo", "manutencao", "2026-10-13", "2026-10-14", []).nivel).toBe("pendente");
  });
  it("fim de semana sem manutenção: não é pendência", () => {
    expect(coberturaSetor("Botafogo", "manutencao", "2026-10-10", "2026-10-11", []).nivel).toBe("info");
  });
  it("camareiras sem escala: pendente", () => {
    expect(coberturaSetor("Botafogo", "camareiras", "2026-10-13", "2026-10-14", []).nivel).toBe("pendente");
  });
});
