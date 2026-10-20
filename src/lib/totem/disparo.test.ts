import { describe, expect, it } from "vitest";
import { Disparo, DISPARO } from "./disparo";

const rodar = (leituras: Array<[number, number | null]>) => {
  const d = new Disparo();
  return leituras.map(([t, w]) => d.passo(t, w));
};

describe("disparo da foto com documento", () => {
  it("sem rosto, só pede para olhar a câmera", () => {
    expect(
      rodar([
        [0, null],
        [200, null],
      ]).map((e) => e.fase),
    ).toEqual(["sem_rosto", "sem_rosto"]);
  });

  it("rosto visto meio segundo começa a contagem 3-2-1 e tira a foto", () => {
    const r = rodar([
      [0, 0.2],
      [300, 0.2],
      [500, 0.2],
      [1500, 0.2],
      [2600, 0.2],
      [3500, 0.2],
    ]);
    expect(r).toEqual([
      { fase: "pronto" },
      { fase: "pronto" },
      { fase: "contando", resta: 3 },
      { fase: "contando", resta: 2 },
      { fase: "contando", resta: 1 },
      { fase: "disparar" },
    ]);
  });

  it("não exige rosto no centro nem tamanho grande, só não pode estar longe demais", () => {
    expect(rodar([[0, DISPARO.larguraMinima - 0.01]])[0].fase).toBe("longe");
    expect(rodar([[0, DISPARO.larguraMinima]])[0].fase).toBe("pronto");
  });

  it("uma leitura falha no meio da contagem não cancela", () => {
    const r = rodar([
      [0, 0.2],
      [500, 0.2],
      [900, null],
      [1300, null],
      [1600, 0.2],
      [3600, 0.2],
    ]);
    expect(r.map((e) => e.fase)).toEqual([
      "pronto",
      "contando",
      "contando",
      "contando",
      "contando",
      "disparar",
    ]);
  });

  it("se a pessoa sai da frente, a contagem recomeça do zero", () => {
    const r = rodar([
      [0, 0.2],
      [500, 0.2],
      [2000, null],
      [2200, 0.2],
    ]);
    expect(r.map((e) => e.fase)).toEqual(["pronto", "contando", "sem_rosto", "pronto"]);
  });
});
