// Disparo automático da foto de identificação no totem (uma foto só: o hóspede
// segurando o documento ao lado do rosto).
//
// A versão anterior pedia piscada, rosto centralizado e 4 leituras perfeitas
// seguidas, calculando a "assinatura" do rosto em cada quadro: no tablet a
// leitura era lenta, a piscada caía entre dois quadros e a foto não saía.
// Agora a câmera só procura um rosto (leitura leve). Achou por um instante,
// começa a contagem 3-2-1 e tira a foto. Nenhuma posição é exigida; a
// comparação com o documento é feita depois, na foto, só como indício.

export const DISPARO = {
  /** Rosto visto sem parar por esse tempo antes de começar a contagem. */
  estavelMs: 500,
  /** Duração da contagem 3-2-1. */
  contagemMs: 3000,
  /** Durante a contagem, perder o rosto por menos que isso não cancela (leitura falha às vezes). */
  toleranciaMs: 1200,
  /** Rosto menor que isso (fração da largura do quadro) está longe demais para o documento sair legível. */
  larguraMinima: 0.07,
  /** Depois desse tempo, o botão "Tirar foto" aparece de qualquer jeito. */
  botaoMs: 3000,
} as const;

export type EstadoDisparo =
  | { fase: "sem_rosto" }
  | { fase: "longe" }
  | { fase: "pronto" }
  | { fase: "contando"; resta: number }
  | { fase: "disparar" };

export class Disparo {
  private vistoDesde: number | null = null;
  private ultimoVisto = -Infinity;
  private contagemDesde: number | null = null;

  constructor(private readonly cfg: typeof DISPARO = DISPARO) {}

  /** Uma leitura da câmera: a largura do maior rosto (0 a 1) ou null se não achou. */
  passo(agora: number, larguraRosto: number | null): EstadoDisparo {
    const ok = larguraRosto !== null && larguraRosto >= this.cfg.larguraMinima;
    if (ok) {
      this.ultimoVisto = agora;
      this.vistoDesde ??= agora;
    } else if (this.contagemDesde === null || agora - this.ultimoVisto > this.cfg.toleranciaMs) {
      this.vistoDesde = null;
      this.contagemDesde = null;
      return larguraRosto === null ? { fase: "sem_rosto" } : { fase: "longe" };
    }

    if (this.contagemDesde === null) {
      if (this.vistoDesde !== null && agora - this.vistoDesde >= this.cfg.estavelMs)
        this.contagemDesde = agora;
      else return { fase: "pronto" };
    }
    const falta = this.cfg.contagemMs - (agora - this.contagemDesde);
    if (falta <= 0) return { fase: "disparar" };
    return { fase: "contando", resta: Math.ceil(falta / 1000) };
  }

  reiniciar() {
    this.vistoDesde = null;
    this.ultimoVisto = -Infinity;
    this.contagemDesde = null;
  }
}
