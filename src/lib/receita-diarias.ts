// Receita das unidades = diárias vendidas no Cloudbeds (dash_reserva_noites), a mesma base do
// "Rendimento por unidade". Usada no Mês em curso e no Painel do Financeiro.
// Mês sem diárias sincronizadas → quem chama usa as receitas lançadas no Financeiro.

export type NoiteReceita = { unidade: string; data: string; valor: number | string | null };
export type ReceitaMes = { receita: number; noites: number };

/** Soma por mês ("YYYY-MM"), só das noites até `hoje` (o resto do mês ainda não aconteceu). */
export function receitaDiariasPorMes(
  noites: NoiteReceita[],
  unidade: "Botafogo" | "Ipanema" | "Consolidado",
  hoje: string,
): Record<string, ReceitaMes> {
  const out: Record<string, ReceitaMes> = {};
  for (const n of noites) {
    if (unidade !== "Consolidado" && n.unidade !== unidade) continue;
    const data = String(n.data ?? "").slice(0, 10);
    if (!data || data > hoje) continue;
    const mes = data.slice(0, 7);
    const atual = out[mes] ?? { receita: 0, noites: 0 };
    atual.receita += Number(n.valor) || 0;
    atual.noites += 1;
    out[mes] = atual;
  }
  for (const m of Object.keys(out)) out[m].receita = Math.round(out[m].receita * 100) / 100;
  return out;
}

/** Receita do mês: diárias quando houver; senão o valor lançado no Financeiro. */
export function receitaDoMes(
  porMes: Record<string, ReceitaMes>,
  mes: string,
  lancada: number,
): { valor: number; fonte: "diarias" | "financeiro"; noites: number } {
  const d = porMes[mes];
  if (d && d.noites > 0) return { valor: d.receita, fonte: "diarias", noites: d.noites };
  return { valor: lancada, fonte: "financeiro", noites: 0 };
}
