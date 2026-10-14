// Aviso de "dados do Cloudbeds atrasados" na tela das Camareiras.
// A sincronização roda a cada 5 min; se a última gravada passou do limite, bloqueios,
// desbloqueios e chegadas podem estar desatualizados — a tela avisa em vez de ficar calada.

export const LIMITE_ATRASO_MIN = 15;

/** Minutos inteiros desde `iso` (null se a data for inválida). */
export function minutosDesde(
  iso: string | null | undefined,
  agora: Date = new Date(),
): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((agora.getTime() - t) / 60_000));
}

/** true quando a última sincronização tem mais que o limite (sem data → não avisa). */
export function syncAtrasada(
  iso: string | null | undefined,
  agora: Date = new Date(),
  limiteMin = LIMITE_ATRASO_MIN,
): boolean {
  const m = minutosDesde(iso, agora);
  return m != null && m > limiteMin;
}

/** "há 42 min" / "há 3 h" para o aviso. */
export function textoAtraso(minutos: number): string {
  if (minutos < 60) return `há ${minutos} min`;
  const h = Math.floor(minutos / 60);
  return `há ${h} h`;
}
