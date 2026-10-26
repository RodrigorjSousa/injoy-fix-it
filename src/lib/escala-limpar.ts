// Limpar a escala (toda ou de uma pessoa) e incluir uma pessoa fixa (mês completo ou mesclado).
import { civilRange, generatePatternMonth, monthBounds, RODIZIO_EPOCA, worksOnDate, type EnginePattern } from "@/lib/escala-engine";

export type LimparDia = { id: string; colaborador_id: string; status: string; origem: string; modalidade_id: string | null };
export type EscopoLimpar = { tipo: "tudo"; incluirExtras: boolean } | { tipo: "pessoa"; colaboradorId: string };

const ehExtra = (d: LimparDia) => d.status === "extra" || !!d.modalidade_id;

/** Quais dias apagar. Na limpeza total, freelancers/extras só entram se pedido (eles movem o Financeiro). */
export function selecionarParaLimpar(dias: LimparDia[], escopo: EscopoLimpar) {
  const alvo = dias.filter((d) => escopo.tipo === "pessoa" ? d.colaborador_id === escopo.colaboradorId : escopo.incluirExtras || !ehExtra(d));
  return {
    ids: alvo.map((d) => d.id),
    extras: alvo.filter(ehExtra).length,
    manuais: alvo.filter((d) => d.origem === "manual" && !ehExtra(d)).length,
    automaticos: alvo.filter((d) => d.origem === "gerado").length,
    poupados: dias.length - alvo.length,
  };
}

export type InclusaoDia = { data: string; status: "trabalho" | "folga"; origem: "gerado" | "manual" };
export type ExistenteDia = { data: string; status: string; origem: string };

/**
 * Dias a gravar ao incluir uma pessoa fixa.
 * - completa: o mês inteiro pelo padrão dela (trabalho e folga), como "Gerar escala do mês" só para ela;
 *   respeita o que já foi ajustado à mão.
 * - mesclada: só os dias do intervalo, sem mexer no resto do mês; dias em que ela já trabalha ficam como estão.
 */
export function montarInclusao(args: {
  modo: "completa" | "mesclada"; pattern: EnginePattern | null; ano: number; mes: number;
  inicio: string; fim: string; somentePadrao: boolean; existentes: ExistenteDia[]; folgasRodizio?: Set<string>;
}): InclusaoDia[] {
  const { modo, pattern, ano, mes, inicio, fim, somentePadrao, existentes, folgasRodizio } = args;
  const por = new Map(existentes.map((e) => [e.data, e]));
  if (modo === "completa") {
    if (!pattern) return [];
    return generatePatternMonth(pattern, ano, mes, folgasRodizio)
      .filter((d) => por.get(d.data)?.origem !== "manual")
      .map((d) => ({ data: d.data, status: d.status, origem: "gerado" as const }));
  }
  const b = monthBounds(ano, mes);
  const de = inicio < b.start ? b.start : inicio, ate = fim > b.end ? b.end : fim;
  if (ate < de) return [];
  return civilRange(de, ate)
    .filter((data) => !somentePadrao || (pattern ? (folgasRodizio && data >= RODIZIO_EPOCA ? !folgasRodizio.has(data) : worksOnDate(pattern, data)) : false))
    .filter((data) => { const e = por.get(data); return !e || !["trabalho", "extra"].includes(e.status); })
    .map((data) => ({ data, status: "trabalho" as const, origem: "manual" as const }));
}
