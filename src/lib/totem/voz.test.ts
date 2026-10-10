import { describe, expect, it } from "vitest";
import { Locutor } from "./voz";

function montar() {
  let agora = 0;
  const falado: string[] = [];
  const l = new Locutor(
    (t) => falado.push(t),
    () => agora,
    2500,
    9000,
  );
  return { l, falado, passar: (ms: number) => (agora += ms) };
}

describe("locutor do totem", () => {
  it("frase de tela sai sempre na hora", () => {
    const { l, falado } = montar();
    l.dizer("Foto do rosto", true);
    l.dizer("Foto com o documento", true);
    expect(falado).toEqual(["Foto do rosto", "Foto com o documento"]);
  });

  it("não repete a mesma frase de tela disparada duas vezes seguidas", () => {
    const { l, falado, passar } = montar();
    l.dizer("Foto do rosto", true);
    l.dizer("Foto do rosto", true);
    passar(3000);
    l.dizer("Foto do rosto", true);
    expect(falado).toEqual(["Foto do rosto", "Foto do rosto"]);
  });

  it("dicas da câmera não atropelam umas às outras", () => {
    const { l, falado, passar } = montar();
    l.dizer("Olhe para a câmera");
    passar(500);
    l.dizer("Chegue um pouco mais perto");
    passar(2500);
    l.dizer("Chegue um pouco mais perto");
    expect(falado).toEqual(["Olhe para a câmera", "Chegue um pouco mais perto"]);
  });

  it("repete a mesma dica só depois de um tempo", () => {
    const { l, falado, passar } = montar();
    l.dizer("Agora pisque os olhos devagar");
    passar(5000);
    l.dizer("Agora pisque os olhos devagar");
    passar(5000);
    l.dizer("Agora pisque os olhos devagar");
    expect(falado).toHaveLength(2);
  });

  it("ignora texto vazio e recomeça do zero ao esquecer", () => {
    const { l, falado } = montar();
    expect(l.dizer("  ")).toBe(false);
    l.dizer("Olhe para a câmera");
    l.esquecer();
    l.dizer("Olhe para a câmera");
    expect(falado).toHaveLength(2);
  });
});
