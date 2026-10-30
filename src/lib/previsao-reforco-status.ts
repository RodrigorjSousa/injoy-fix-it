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
