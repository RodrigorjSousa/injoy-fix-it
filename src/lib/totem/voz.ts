// Voz do totem: lê o passo a passo e as dicas da câmera no idioma escolhido.
//
// No tablet, o totem roda dentro do Fully Kiosk, cujo navegador (Android WebView)
// NÃO tem a voz do navegador (speechSynthesis). Por isso a fala sai pela
// JavaScript Interface do Fully (`fully.textToSpeech`, recurso PLUS, precisa ser
// ligado nas configurações). No computador (testes da equipe), usa o
// speechSynthesis do Chrome.

import type { Idioma } from "./i18n";

export const LOCALE_VOZ: Record<Idioma, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };

type Fully = {
  textToSpeech?: (texto: string, locale?: string, engine?: string, fila?: boolean) => void;
  stopTextToSpeech?: () => void;
};

function fully(): Fully | null {
  if (typeof window === "undefined") return null;
  const f = (window as unknown as { fully?: Fully }).fully;
  return f && typeof f.textToSpeech === "function" ? f : null;
}

export type MotorVoz = "fully" | "navegador" | null;

export function motorDeVoz(): MotorVoz {
  if (fully()) return "fully";
  if (typeof window !== "undefined" && "speechSynthesis" in window) return "navegador";
  return null;
}

export function calar() {
  try {
    fully()?.stopTextToSpeech?.();
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
  } catch {
    // sem voz não é erro
  }
}

/** Fala agora, interrompendo o que estiver sendo dito. */
export function falar(texto: string, idioma: Idioma) {
  const locale = LOCALE_VOZ[idioma];
  try {
    const f = fully();
    if (f?.textToSpeech) {
      f.stopTextToSpeech?.();
      f.textToSpeech(texto, locale, "", false);
      return;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const s = window.speechSynthesis;
    s.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = locale;
    const vozes = s.getVoices();
    const norm = (l: string) => l.replace("_", "-").toLowerCase();
    u.voice =
      vozes.find((v) => norm(v.lang) === locale.toLowerCase()) ??
      vozes.find((v) => norm(v.lang).startsWith(idioma)) ??
      null;
    s.speak(u);
  } catch {
    // sem voz não é erro
  }
}

/**
 * Decide o que falar. As dicas da câmera mudam várias vezes por segundo; sem
 * esse filtro o totem ficaria "gaguejando". Frases de tela (prioridade) sempre
 * saem na hora.
 */
export class Locutor {
  private ultimo = { texto: "", em: -Infinity };

  constructor(
    private readonly dizerAgora: (texto: string) => void,
    private readonly agora: () => number = () => Date.now(),
    /** Intervalo mínimo entre duas dicas diferentes. */
    private readonly intervalo = 2500,
    /** Depois disso, a mesma dica pode ser repetida. */
    private readonly repeticao = 9000,
  ) {}

  dizer(texto: string, prioridade = false): boolean {
    const t = texto.trim();
    if (!t) return false;
    const agora = this.agora();
    const passou = agora - this.ultimo.em;
    // A mesma frase de tela disparada duas vezes seguidas (re-render) não recomeça a fala.
    if (prioridade && t === this.ultimo.texto && passou < 1500) return false;
    if (!prioridade) {
      if (t === this.ultimo.texto && passou < this.repeticao) return false;
      if (t !== this.ultimo.texto && passou < this.intervalo) return false;
    }
    this.ultimo = { texto: t, em: agora };
    this.dizerAgora(t);
    return true;
  }

  esquecer() {
    this.ultimo = { texto: "", em: -Infinity };
  }
}
