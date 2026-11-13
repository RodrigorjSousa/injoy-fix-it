// Quando o reforço conta como "chamado" na Previsão de Carga.
// Regra da casa: com sobrecarga (carga acima de 100% ou nível vermelho) JAMAIS pode ficar uma camareira sozinha,
// seja fixa, freelancer ou quem cobre férias. Reforço só vale se houver pelo menos 2 pessoas escaladas.
export type LinhaPrevisao = {
  unidade: string; data: string; nivel: "verde" | "amarelo" | "vermelho";
  ocupacao_carga_pct: number | string; camareiras_escaladas: number; freelancers_escalados: number;
};
export const MINIMO_COM_SOBRECARGA = 2;

export const pessoasEscaladas = (r: Pick<LinhaPrevisao, "camareiras_escaladas" | "freelancers_escalados">) =>
  Number(r.camareiras_escaladas ?? 0) + Number(r.freelancers_escalados ?? 0);
export const emSobrecarga = (r: Pick<LinhaPrevisao, "nivel" | "ocupacao_carga_pct">) =>
  r.nivel === "vermelho" || Number(r.ocupacao_carga_pct) > 100;

export function situacaoReforco(r: LinhaPrevisao, reforcos?: Set<string> | null, lancado = false) {
  const pessoas = pessoasEscaladas(r);
  const sobrecarga = emSobrecarga(r);
  const sozinha = sobrecarga && pessoas < MINIMO_COM_SOBRECARGA;
  const chamado = !sozinha && (Number(r.freelancers_escalados) > 0 || lancado || !!reforcos?.has(`${r.unidade}|${r.data}`));
  return { pessoas, sobrecarga, sozinha, chamado };
}

/**
 * Separa quem COBRE ausência (férias, falta, atestado) de quem é REFORÇO de verdade.
 * Extras sem vínculo explícito com a pessoa ausente contam como cobertura até o número de ausências do dia.
 */
export function contarReforcosReais(extrasSemSubstituicao: number, ausenciasDeFixas: number) {
  return Math.max(0, extrasSemSubstituicao - Math.max(0, ausenciasDeFixas));
}

export type NivelPrevisao = "verde" | "amarelo" | "vermelho";

/**
 * Nível do dia na Previsão de Carga.
 * - Carga x capacidade (minutos de todas as pessoas escaladas somados) pelos limites em %.
 * - Limites de GERAIS valem POR CAMAREIRA: com 2 pessoas escaladas o dia aguenta o dobro de gerais.
 *   Antes o total de gerais do dia era comparado com o limite sozinho e o card ficava vermelho
 *   ("chamar reforço") mesmo com duas fixas e carga de 53% (Botafogo, 17/11/2026).
 */
export function nivelPrevisao(args: {
  carga: number;
  capacidade: number;
  gerais: number;
  pessoas: number;
  limite_amarelo_pct: number;
  limite_vermelho_pct: number;
  limite_amarelo_gerais: number;
  limite_vermelho_gerais: number;
}): { nivel: NivelPrevisao; pct: number } {
  const { carga, capacidade, gerais } = args;
  const pct = capacidade > 0 ? Math.round((carga / capacidade) * 100) : carga > 0 ? 999 : 0;
  const pessoas = Math.max(1, Math.floor(args.pessoas || 0));
  const geraisPorPessoa = gerais / pessoas;
  const nivel: NivelPrevisao =
    (capacidade === 0 && carga > 0) ||
    pct > Number(args.limite_vermelho_pct) ||
    geraisPorPessoa >= Number(args.limite_vermelho_gerais)
      ? "vermelho"
      : pct >= Number(args.limite_amarelo_pct) || geraisPorPessoa >= Number(args.limite_amarelo_gerais)
        ? "amarelo"
        : "verde";
  return { nivel, pct };
}

const minutosDoDia = (hhmm: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** Minutos entre entrada e saída (vira a meia-noite se a saída for menor). 0 se faltar horário. */
export function duracaoTurno(entrada: string | null | undefined, saida: string | null | undefined): number {
  const a = minutosDoDia(entrada);
  const b = minutosDoDia(saida);
  if (a === null || b === null) return 0;
  return b >= a ? b - a : 1440 - a + b;
}

export type PadraoEscala = {
  intervalo_minutos?: number | null;
  hora_entrada?: string | null;
  hora_saida?: string | null;
  vigente_desde?: string | null;
  vigente_ate?: string | null;
};

/** Padrão de escala que vale na data (o mais recente vigente; senão qualquer um). */
export function padraoNaData(padroes: PadraoEscala[] | null | undefined, data: string): PadraoEscala | null {
  const lista = (padroes ?? []).filter(Boolean);
  const vigentes = lista
    .filter((p) => (!p.vigente_desde || p.vigente_desde <= data) && (!p.vigente_ate || p.vigente_ate >= data))
    .sort((a, b) => String(b.vigente_desde ?? "").localeCompare(String(a.vigente_desde ?? "")));
  return vigentes[0] ?? lista[0] ?? null;
}

/**
 * Tempo de trabalho de uma pessoa escalada no dia (antes da margem operacional).
 * - Fixa: horário do dia; sem horário no dia, usa o horário do padrão (antes contava 0 e "sumia" da soma).
 *   Desconta o intervalo do padrão.
 * - Extra (reforço/substituição): horas contratadas; sem elas, o horário do dia.
 */
export function minutosDaPessoa(
  dia: { status: string; hora_entrada?: string | null; hora_saida?: string | null; horas_contratadas?: number | string | null },
  padrao: PadraoEscala | null,
): { brutos: number; intervalo: number } {
  if (dia.status === "extra") {
    const contratadas = Number(dia.horas_contratadas ?? 0) * 60;
    return { brutos: contratadas > 0 ? contratadas : duracaoTurno(dia.hora_entrada, dia.hora_saida), intervalo: 0 };
  }
  const doDia = duracaoTurno(dia.hora_entrada, dia.hora_saida);
  const brutos = doDia > 0 ? doDia : duracaoTurno(padrao?.hora_entrada, padrao?.hora_saida);
  const intervalo = brutos > 0 ? Math.min(brutos, Number(padrao?.intervalo_minutos ?? 0)) : 0;
  return { brutos, intervalo };
}
