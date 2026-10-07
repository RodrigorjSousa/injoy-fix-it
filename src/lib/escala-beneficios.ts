import type { EscalaColaborador, EscalaDia } from "@/lib/escala";

/** Valores padrão (editáveis na tela): vale alimentação por mês e vale transporte por dia trabalhado. */
export const VALE_ALIMENTACAO_PADRAO = 385;
export const VALE_TRANSPORTE_DIA_PADRAO = 18.8;

export type BeneficioLinha = {
  id: string;
  nome: string;
  setor: EscalaColaborador["setor"];
  unidade: EscalaColaborador["unidade"];
  dias: number;
  va: number;
  /** VT por dia desta pessoa. */
  vtDia: number;
  vt: number;
  total: number;
  /** Valores próprios da pessoa (não são o padrão do quadro). */
  vaProprio: boolean;
  vtProprio: boolean;
  semEscala: boolean;
  /** Dias de trabalho por unidade (para lançar o VT na unidade certa). */
  porUnidade: Record<string, number>;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Vale alimentação e vale transporte do mês, por funcionário fixo ativo.
 * - VA: valor cheio por mês para todo fixo ativo (não muda com férias ou faltas).
 * - VT: valor por dia em que há trabalho ou extra na escala (folga, férias, atestado e falta não contam;
 *   vários turnos no mesmo dia contam uma vez só).
 * Freelancers ficam de fora.
 */
export function calcularBeneficios(
  people: EscalaColaborador[],
  days: EscalaDia[],
  start: string,
  end: string,
  va: number = VALE_ALIMENTACAO_PADRAO,
  vtDia: number = VALE_TRANSPORTE_DIA_PADRAO,
): BeneficioLinha[] {
  const worked = new Map<string, Set<string>>();
  const byUnit = new Map<string, Map<string, Set<string>>>();
  const seen = new Set<string>();
  for (const d of days) {
    if (d.data < start || d.data > end) continue;
    seen.add(d.colaborador_id);
    if (d.status !== "trabalho" && d.status !== "extra") continue;
    const set = worked.get(d.colaborador_id) ?? new Set<string>();
    set.add(d.data);
    worked.set(d.colaborador_id, set);
    const um = byUnit.get(d.colaborador_id) ?? new Map<string, Set<string>>();
    const us = um.get(d.unidade) ?? new Set<string>();
    us.add(d.data);
    um.set(d.unidade, us);
    byUnit.set(d.colaborador_id, um);
  }
  return people
    .filter((p) => p.ativo && p.vinculo === "fixo")
    .map((p) => {
      const dias = worked.get(p.id)?.size ?? 0;
      const vaP = p.vale_alimentacao != null ? Number(p.vale_alimentacao) : va;
      const vtP = p.vale_transporte_dia != null ? Number(p.vale_transporte_dia) : vtDia;
      const vt = cents(dias * vtP);
      return { id: p.id, nome: p.nome, setor: p.setor, unidade: p.unidade, dias, va: cents(vaP), vtDia: cents(vtP), vt, total: cents(vaP + vt), vaProprio: p.vale_alimentacao != null, vtProprio: p.vale_transporte_dia != null, semEscala: !seen.has(p.id), porUnidade: Object.fromEntries([...(byUnit.get(p.id) ?? new Map()).entries()].map(([u, set]) => [u, set.size])) };
    })
    .sort((a, b) => a.setor.localeCompare(b.setor) || a.nome.localeCompare(b.nome));
}

export function totaisBeneficios(linhas: BeneficioLinha[]) {
  return linhas.reduce(
    (acc, l) => ({ dias: acc.dias + l.dias, va: cents(acc.va + l.va), vt: cents(acc.vt + l.vt), total: cents(acc.total + l.total) }),
    { dias: 0, va: 0, vt: 0, total: 0 },
  );
}

export type ItemLancamento = { colaborador_id: string; nome: string; tipo: "va" | "vt"; unidade: string; valor: number; qtd: number; descricao: string };

/** Itens para o Financeiro: VA na unidade da pessoa e VT por unidade, pelos dias trabalhados em cada uma. */
export function montarLancamentos(linhas: BeneficioLinha[], label: string): ItemLancamento[] {
  const itens: ItemLancamento[] = [];
  for (const l of linhas) {
    if (l.va > 0) itens.push({ colaborador_id: l.id, nome: l.nome, tipo: "va", unidade: l.unidade, valor: l.va, qtd: 1, descricao: `Vale alimentação ${label} — ${l.nome}` });
    for (const [unidade, dias] of Object.entries(l.porUnidade)) {
      if (dias > 0 && l.vtDia > 0) itens.push({ colaborador_id: l.id, nome: l.nome, tipo: "vt", unidade, valor: cents(dias * l.vtDia), qtd: dias, descricao: `Vale transporte ${label} — ${l.nome}: ${dias} dia${dias > 1 ? "s" : ""} × ${l.vtDia.toFixed(2).replace(".", ",")}` });
    }
  }
  return itens;
}

/** CSV para abrir no Excel (separador ";", vírgula decimal e BOM para acentos). */
export function gerarCsvBeneficios(linhas: BeneficioLinha[], setorNome: (s: string) => string): string {
  const n = (v: number) => v.toFixed(2).replace(".", ",");
  const head = ["Setor", "Funcionário", "Unidade", "Dias de trabalho", "Vale alimentação", "VT por dia", "Vale transporte", "Total"];
  const rows = linhas.map((l) => [setorNome(l.setor), l.nome, l.unidade, String(l.dias), n(l.va), n(l.vtDia), n(l.vt), n(l.total)]);
  const t = totaisBeneficios(linhas);
  rows.push(["TOTAL", "", "", String(t.dias), n(t.va), "", n(t.vt), n(t.total)]);
  const esc = (c: string) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return "\ufeff" + [head, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}
