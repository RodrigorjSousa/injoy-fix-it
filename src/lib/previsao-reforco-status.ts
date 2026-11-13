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
