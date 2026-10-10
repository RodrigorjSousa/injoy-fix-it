// Regras da verificação de identidade no totem (parecida com a do gov.br):
//   1) foto do rosto, com prova de vida (piscar os olhos);
//   2) foto segurando o documento ao lado do rosto.
// Aqui ficam só as decisões, sem câmera nem biblioteca, para dar para testar.
// As leituras vêm do face-api (o mesmo do ponto), em coordenadas do vídeo
// SEM espelhamento, normalizadas de 0 a 1.

export type Caixa = { x: number; y: number; w: number; h: number };
export type LeituraRosto = { caixa: Caixa; ear: number; descritor: number[]; score: number };

/** Abaixo disso, dois "vetores de rosto" do face-api são da mesma pessoa. */
export const LIMITE_MESMA_PESSOA = 0.55;
/** Foto do documento é pequena e impressa: a comparação é só um indício. */
export const LIMITE_FOTO_DOCUMENTO = 0.62;
/** Quantas leituras boas seguidas antes de tirar a foto sozinho. */
export const LEITURAS_ESTAVEIS = 4;
/** Depois desse tempo sem conseguir, aparece o botão para tirar a foto manualmente. */
export const ESPERA_MANUAL_MS = 15_000;
/** Na foto com documento o botão aparece antes: a foto 3x4 nem sempre é reconhecida. */
export const ESPERA_MANUAL_DOC_MS = 8_000;

export function distancia(a: number[], b: number[]): number {
  let soma = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) soma += (a[i] - b[i]) ** 2;
  return Math.sqrt(soma);
}

const area = (c: Caixa) => c.w * c.h;
const porTamanho = (l: LeituraRosto[]) => [...l].sort((a, b) => area(b.caixa) - area(a.caixa));
/** Um rosto "de verdade" na frente da câmera; menores que isso podem ser a foto do documento. */
const ROSTO_PEQUENO = 0.35;

export type SituacaoSelfie =
  | "sem_rosto"
  | "varios_rostos"
  | "longe"
  | "perto"
  | "fora_do_centro"
  | "ok";

export function situacaoSelfie(leituras: LeituraRosto[]): {
  situacao: SituacaoSelfie;
  principal: LeituraRosto | null;
} {
  const [principal, ...outros] = porTamanho(leituras);
  if (!principal) return { situacao: "sem_rosto", principal: null };
  if (outros.some((o) => area(o.caixa) > area(principal.caixa) * ROSTO_PEQUENO))
    return { situacao: "varios_rostos", principal };
  const { x, y, w, h } = principal.caixa;
  if (w < 0.18) return { situacao: "longe", principal };
  if (w > 0.6) return { situacao: "perto", principal };
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (cx < 0.3 || cx > 0.7 || cy < 0.22 || cy > 0.78)
    return { situacao: "fora_do_centro", principal };
  return { situacao: "ok", principal };
}

export type SituacaoDocumento =
  | "sem_rosto"
  | "varios_rostos"
  | "longe"
  | "outra_pessoa"
  | "sem_documento"
  | "ok";

export type AvaliacaoDocumento = {
  situacao: SituacaoDocumento;
  /** Distância entre o rosto desta foto e o da selfie (null se não deu para medir). */
  distPessoa: number | null;
  /** Distância entre a foto impressa no documento e a selfie (null se não achou). */
  distDocumento: number | null;
};

/**
 * Foto segurando o documento: o maior rosto tem de ser a mesma pessoa da selfie,
 * e precisa aparecer um rosto bem menor (a foto do documento) na imagem.
 */
export function situacaoComDocumento(
  leituras: LeituraRosto[],
  selfie: number[] | null,
): AvaliacaoDocumento {
  const [principal, ...outros] = porTamanho(leituras);
  if (!principal) return { situacao: "sem_rosto", distPessoa: null, distDocumento: null };
  const distPessoa = selfie ? distancia(principal.descritor, selfie) : null;
  if (principal.caixa.w < 0.12) return { situacao: "longe", distPessoa, distDocumento: null };
  if (distPessoa !== null && distPessoa > LIMITE_MESMA_PESSOA)
    return { situacao: "outra_pessoa", distPessoa, distDocumento: null };
  const grandes = outros.filter((o) => area(o.caixa) > area(principal.caixa) * ROSTO_PEQUENO);
  if (grandes.length) return { situacao: "varios_rostos", distPessoa, distDocumento: null };
  const doc = outros[0];
  if (!doc) return { situacao: "sem_documento", distPessoa, distDocumento: null };
  const distDocumento = selfie ? distancia(doc.descritor, selfie) : null;
  return { situacao: "ok", distPessoa, distDocumento };
}

/** Conta leituras boas seguidas; qualquer leitura ruim zera. */
export class Estabilidade {
  private seguidas = 0;
  constructor(private readonly precisa = LEITURAS_ESTAVEIS) {}
  registrar(ok: boolean): boolean {
    this.seguidas = ok ? this.seguidas + 1 : 0;
    return this.seguidas >= this.precisa;
  }
  get progresso(): number {
    return Math.min(1, this.seguidas / this.precisa);
  }
}

/** Para a tela da gerência: resume os indícios guardados com cada foto. */
export function conferenciaFoto(d: {
  etapa: string;
  vivacidade: boolean | null;
  dist_mesma_pessoa: number | null;
  dist_foto_documento: number | null;
}): Array<{ texto: string; ok: boolean | null }> {
  if (d.etapa === "rosto") {
    return [
      {
        texto: d.vivacidade ? "Prova de vida OK (piscou)" : "Sem prova de vida (foto manual)",
        ok: !!d.vivacidade,
      },
    ];
  }
  const itens: Array<{ texto: string; ok: boolean | null }> = [];
  if (d.dist_mesma_pessoa === null) itens.push({ texto: "Mesma pessoa: não conferido", ok: null });
  else
    itens.push({
      texto:
        d.dist_mesma_pessoa <= LIMITE_MESMA_PESSOA
          ? "Mesma pessoa da selfie"
          : "Pessoa diferente da selfie",
      ok: d.dist_mesma_pessoa <= LIMITE_MESMA_PESSOA,
    });
  if (d.dist_foto_documento === null)
    itens.push({ texto: "Foto do documento: não detectada", ok: null });
  else
    itens.push({
      texto:
        d.dist_foto_documento <= LIMITE_FOTO_DOCUMENTO
          ? "Foto do documento parece a mesma pessoa"
          : "Foto do documento não parece a mesma pessoa",
      ok: d.dist_foto_documento <= LIMITE_FOTO_DOCUMENTO,
    });
  return itens;
}
