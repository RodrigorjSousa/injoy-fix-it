import { describe, expect, it } from "vitest";
import {
  Estabilidade,
  conferenciaFoto,
  distancia,
  situacaoComDocumento,
  situacaoSelfie,
  type LeituraRosto,
} from "./rosto";

const vetor = (base: number, ruido = 0) =>
  Array.from({ length: 128 }, (_, i) => base + (i % 2 ? ruido : -ruido));
const rosto = (x: number, y: number, w: number, descritor = vetor(0.1)): LeituraRosto => ({
  caixa: { x, y, w, h: w * 1.2 },
  ear: 0.3,
  descritor,
  score: 0.9,
});
const selfie = vetor(0.1);

describe("selfie", () => {
  it("pede para olhar a câmera quando não há rosto", () => {
    expect(situacaoSelfie([]).situacao).toBe("sem_rosto");
  });
  it("aceita um rosto centralizado e de bom tamanho", () => {
    expect(situacaoSelfie([rosto(0.35, 0.25, 0.3)]).situacao).toBe("ok");
  });
  it("pede para chegar perto, afastar ou centralizar", () => {
    expect(situacaoSelfie([rosto(0.42, 0.4, 0.12)]).situacao).toBe("longe");
    expect(situacaoSelfie([rosto(0.15, 0.1, 0.7)]).situacao).toBe("perto");
    expect(situacaoSelfie([rosto(0.02, 0.3, 0.25)]).situacao).toBe("fora_do_centro");
  });
  it("recusa duas pessoas na frente da câmera", () => {
    expect(situacaoSelfie([rosto(0.35, 0.25, 0.3), rosto(0.7, 0.3, 0.25)]).situacao).toBe(
      "varios_rostos",
    );
  });
});

describe("foto segurando o documento", () => {
  it("exige a foto do documento (rosto pequeno) ao lado do rosto", () => {
    expect(situacaoComDocumento([rosto(0.2, 0.25, 0.28)], selfie).situacao).toBe("sem_documento");
    const r = situacaoComDocumento(
      [rosto(0.2, 0.25, 0.28), rosto(0.7, 0.45, 0.06, vetor(0.1, 0.03))],
      selfie,
    );
    expect(r.situacao).toBe("ok");
    expect(r.distPessoa).toBe(0);
    expect(r.distDocumento).toBeCloseTo(distancia(vetor(0.1, 0.03), selfie));
  });
  it("percebe quando é outra pessoa", () => {
    const r = situacaoComDocumento(
      [rosto(0.2, 0.25, 0.28, vetor(0.2)), rosto(0.7, 0.45, 0.06)],
      selfie,
    );
    expect(r.situacao).toBe("outra_pessoa");
  });
  it("recusa uma segunda pessoa na imagem", () => {
    expect(
      situacaoComDocumento([rosto(0.2, 0.25, 0.28), rosto(0.6, 0.25, 0.25)], selfie).situacao,
    ).toBe("varios_rostos");
  });
  it("sem selfie (detector falhou antes) não compara, só procura o documento", () => {
    const r = situacaoComDocumento(
      [rosto(0.2, 0.25, 0.28, vetor(0.9)), rosto(0.7, 0.45, 0.06)],
      null,
    );
    expect(r).toEqual({ situacao: "ok", distPessoa: null, distDocumento: null });
  });
});

describe("estabilidade e conferência", () => {
  it("só libera depois de leituras boas seguidas", () => {
    const e = new Estabilidade(3);
    expect([
      e.registrar(true),
      e.registrar(true),
      e.registrar(false),
      e.registrar(true),
      e.registrar(true),
      e.registrar(true),
    ]).toEqual([false, false, false, false, false, true]);
  });
  it("resume os indícios para a gerência", () => {
    expect(
      conferenciaFoto({
        etapa: "rosto",
        vivacidade: true,
        dist_mesma_pessoa: null,
        dist_foto_documento: null,
      })[0].ok,
    ).toBe(true);
    const doc = conferenciaFoto({
      etapa: "rosto_documento",
      vivacidade: null,
      dist_mesma_pessoa: 0.31,
      dist_foto_documento: null,
    });
    expect(doc.map((d) => d.ok)).toEqual([true, null]);
  });
});
