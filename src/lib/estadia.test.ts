import { describe, expect, it } from "vitest";
import { dataBR, dataCurta, resumoEstadia, textoEstadia } from "./estadia";

describe("estadia no card das camareiras", () => {
  it("data curta com dia da semana", () => {
    expect(dataCurta("2026-10-23")).toBe("23/10 (sex)");
    expect(dataCurta(null)).toBe("");
    expect(dataBR("2026-10-21")).toBe("21/10/2026");
    expect(dataBR(undefined)).toBe("");
  });
  it("noite atual e total", () => {
    const r = resumoEstadia("2026-10-18", "2026-10-23", "2026-10-20")!;
    expect(r).toEqual({ saida: "23/10 (sex)", quando: "depois", noites: 5, noiteAtual: 3 });
    expect(textoEstadia(r)).toBe("Saída, 23/10 (sex) · 3ª de 5 noites");
  });
  it("sai amanhã e sai hoje", () => {
    expect(textoEstadia(resumoEstadia("2026-10-19", "2026-10-21", "2026-10-20")!)).toBe(
      "Sai amanhã, 21/10 (qua) · 2ª de 2 noites",
    );
    expect(resumoEstadia("2026-10-18", "2026-10-20", "2026-10-20")!.quando).toBe("hoje");
  });
  it("sem entrada mostra só a saída; sem saída não mostra nada", () => {
    expect(textoEstadia(resumoEstadia(null, "2026-10-25", "2026-10-20")!)).toBe("Saída, 25/10 (dom)");
    expect(resumoEstadia("2026-10-18", null, "2026-10-20")).toBeNull();
  });
});
