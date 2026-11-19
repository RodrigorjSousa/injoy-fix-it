import { describe, expect, it } from "vitest";
import { fimDaSenha, lerData, lerLinhas } from "./senhas-existentes";

describe("lerData", () => {
  it("dd/mm usa o ano corrente; se já passou, o próximo", () => {
    expect(lerData("22/11", "2026-11-19")).toBe("2026-11-22");
    expect(lerData("03/01", "2026-11-19")).toBe("2027-01-03");
    expect(lerData("22/11/26", "2026-11-19")).toBe("2026-11-22");
    expect(lerData("31/02", "2026-11-19")).toBeNull();
    expect(lerData("amanhã", "2026-11-19")).toBeNull();
  });
});

describe("lerLinhas", () => {
  it("lê quarto, senha, saída e nome, e aponta os erros", () => {
    const r = lerLinhas(
      ["113 482913 22/11 Maria Silva", "6;123456#;20/11", "", "301 12 21/11", "114 482913 23/11", "115 654321 xx"].join("\n"),
      "2026-11-19",
    );
    expect(r.ok).toEqual([
      { linha: 1, quarto: "113", senha: "482913", saida: "2026-11-22", nome: "Maria Silva" },
      { linha: 2, quarto: "006", senha: "123456", saida: "2026-11-20", nome: "" },
    ]);
    expect(r.erros.map((e) => [e.linha, e.erro])).toEqual([
      [4, "senha deve ter de 4 a 9 números"],
      [5, "senha repetida em outra linha"],
      [6, "data de saída inválida (use dd/mm)"],
    ]);
  });
});

describe("fimDaSenha", () => {
  it("vale até a hora do check-out em SP", () => {
    expect(new Date(fimDaSenha("2026-11-22")).toISOString()).toBe("2026-11-22T15:00:00.000Z");
  });
});
