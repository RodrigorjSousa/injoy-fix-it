import { describe, expect, it } from "vitest";
import { escolherLicoes, palavras, pontuar, textoLicoes, type Licao } from "./licoes";

function licao(id: string, situacao: string, extra: Partial<Licao> = {}): Licao {
  return {
    id,
    situacao,
    resposta_errada: null,
    resposta_certa: "resposta certa",
    motivo: null,
    tema: null,
    ativa: true,
    updated_at: `2026-10-${String(10 + Number(id.replace(/\D/g, "") || 0)).padStart(2, "0")}T12:00:00Z`,
    ...extra,
  };
}

describe("palavras", () => {
  it("ignora acento, maiúscula, palavras vazias e plural simples", () => {
    const p = palavras("Vocês aceitam PETS? Tenho dois cachorros");
    expect(p.has("pet")).toBe(true);
    expect(p.has("cachorr")).toBe(true);
    expect(p.has("voces")).toBe(false);
  });
});

describe("pontuar", () => {
  it("dá mais peso à situação e ao tema do que à resposta", () => {
    const ctx = palavras("posso levar meu cachorro?");
    const naSituacao = licao("1", "Hóspede quer levar o cachorro");
    const naResposta = licao("2", "Pergunta sobre animais", {
      resposta_certa: "Aceitamos cachorro de todos os portes",
    });
    expect(pontuar(naSituacao, ctx)).toBeGreaterThan(pontuar(naResposta, ctx));
    expect(pontuar(licao("3", "Horário do check-out"), ctx)).toBe(0);
  });
});

describe("escolherLicoes", () => {
  it("leva todas quando cabem e ignora as desativadas", () => {
    const l = [licao("1", "a b c"), licao("2", "d e f", { ativa: false }), licao("3", "g h i")];
    expect(escolherLicoes(l, "qualquer coisa", 12).map((x) => x.id)).toEqual(["1", "3"]);
  });

  it("quando passa do limite, escolhe as mais parecidas com a conversa", () => {
    const l = [
      licao("1", "Hóspede pergunta do estacionamento"),
      licao("2", "Hóspede quer levar o cachorro", { tema: "pets" }),
      licao("3", "Pergunta do café da manhã"),
      licao("4", "Gato na hospedagem", { tema: "pets" }),
      licao("5", "Senha do wifi"),
    ];
    const escolhidas = escolherLicoes(
      l,
      "Oi! posso levar meu cachorro e meu gato? são pets pequenos",
      2,
    );
    expect(escolhidas.map((x) => x.id).sort()).toEqual(["2", "4"]);
  });

  it("sem nada parecido, fica com as mais recentes", () => {
    const l = [licao("1", "aaa bbb"), licao("2", "ccc ddd"), licao("3", "eee fff")];
    expect(escolherLicoes(l, "zzz", 2).map((x) => x.id)).toEqual(["3", "2"]);
  });
});

describe("textoLicoes", () => {
  it("monta o bloco com errado, certo e motivo", () => {
    const t = textoLicoes([
      licao("1", "Quanto custa a diária?", {
        tema: "preço",
        resposta_errada: "A diária é R$ 200.",
        resposta_certa: "Me conta as datas e quantas pessoas que eu vejo o valor certinho!",
        motivo: "Nunca dar preço sem consultar o Cloudbeds.",
      }),
    ]);
    expect(t).toContain("=== LIÇÕES DA EQUIPE ===");
    expect(t).toContain("Lição 1 — preço");
    expect(t).toContain("ERRADO: A diária é R$ 200.");
    expect(t).toContain("CERTO: Me conta as datas");
    expect(t).toContain("Por quê: Nunca dar preço");
    expect(t).toContain("valem as regras absolutas");
  });
  it("vazio sem lições", () => {
    expect(textoLicoes([])).toBe("");
  });
  it("corta campo muito longo", () => {
    const t = textoLicoes([licao("1", "x".repeat(2000))]);
    expect(t.length).toBeLessThan(1200);
  });
});
