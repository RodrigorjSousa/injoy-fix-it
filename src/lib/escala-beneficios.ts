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
  vt: number;
  total: number;
  semEscala: boolean;
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
  const seen = new Set<string>();
  for (const d of days) {
    if (d.data < start || d.data > end) continue;
    seen.add(d.colaborador_id);
    if (d.status !== "trabalho" && d.status !== "extra") continue;
    const set = worked.get(d.colaborador_id) ?? new Set<string>();
    set.add(d.data);
    worked.set(d.colaborador_id, set);
  }
  return people
    .filter((p) => p.ativo && p.vinculo === "fixo")
    .map((p) => {
      const dias = worked.get(p.id)?.size ?? 0;
      const vt = cents(dias * vtDia);
      return { id: p.id, nome: p.nome, setor: p.setor, unidade: p.unidade, dias, va: cents(va), vt, total: cents(va + vt), semEscala: !seen.has(p.id) };
    })
    .sort((a, b) => a.setor.localeCompare(b.setor) || a.nome.localeCompare(b.nome));
}

export function totaisBeneficios(linhas: BeneficioLinha[]) {
  return linhas.reduce(
    (acc, l) => ({ dias: acc.dias + l.dias, va: cents(acc.va + l.va), vt: cents(acc.vt + l.vt), total: cents(acc.total + l.total) }),
    { dias: 0, va: 0, vt: 0, total: 0 },
  );
}
