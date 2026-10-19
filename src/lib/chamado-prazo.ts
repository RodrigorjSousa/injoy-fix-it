// Prazo dos chamados: 3 dias (72 h) desde a abertura para concluir. Mesma regra do banco (0071).

export const PRAZO_DIAS = 3;
const PRAZO_MS = PRAZO_DIAS * 24 * 60 * 60 * 1000;

type ChamadoPrazo = { criadoEm: string; status: string };

export type SituacaoPrazo = {
  /** Data/hora limite para concluir. */
  venceEm: Date | null;
  atrasado: boolean;
  /** Dias inteiros desde a abertura. */
  diasAberto: number;
  /** Dias além do prazo (só quando atrasado; 0 = estourou hoje). */
  diasAtraso: number;
};

export function situacaoPrazo(c: ChamadoPrazo, agora: Date = new Date()): SituacaoPrazo {
  const inicio = Date.parse(c.criadoEm);
  if (!Number.isFinite(inicio))
    return { venceEm: null, atrasado: false, diasAberto: 0, diasAtraso: 0 };
  const vence = inicio + PRAZO_MS;
  const decorrido = agora.getTime() - inicio;
  const atrasado = c.status !== "Concluído" && agora.getTime() > vence;
  return {
    venceEm: new Date(vence),
    atrasado,
    diasAberto: Math.max(0, Math.floor(decorrido / 86_400_000)),
    diasAtraso: atrasado ? Math.floor((agora.getTime() - vence) / 86_400_000) : 0,
  };
}

/** Chamados abertos fora do prazo, do mais antigo para o mais novo. */
export function chamadosAtrasados<T extends ChamadoPrazo>(
  lista: T[],
  agora: Date = new Date(),
): T[] {
  return lista
    .filter((c) => situacaoPrazo(c, agora).atrasado)
    .sort((a, b) => Date.parse(a.criadoEm) - Date.parse(b.criadoEm));
}

/** "Aberto há 5 dias · 2 dias além do prazo" / "venceu hoje". */
export function textoAtrasoChamado(s: SituacaoPrazo): string {
  if (!s.atrasado) return "";
  const alem =
    s.diasAtraso === 0 ? "prazo venceu há menos de 1 dia" : `${s.diasAtraso} dia(s) além do prazo`;
  return `Aberto há ${s.diasAberto} dia(s) · ${alem}`;
}
