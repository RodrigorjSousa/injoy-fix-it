import { civilDow } from "@/lib/escala-engine";

export type Unidade = "Botafogo" | "Ipanema";
export type Setor = "recepcao" | "camareiras" | "manutencao";

/**
 * Regras fixas da operação (não mudam por mês):
 * - Ipanema NÃO tem recepção: quem dá suporte é a recepção de Botafogo. Não é pendência de cobertura.
 * - Manutenção trabalha de segunda a sexta; sábado e domingo só em urgência (chamado como extra).
 * - Manutenção divide as unidades pela escala (ex.: 12 dias Botafogo / 10 Ipanema), mas a regra não é rígida:
 *   havendo urgência na outra unidade, ele vai para lá.
 */
export const IPANEMA_SEM_RECEPCAO = "Ipanema não tem recepção: é administrada pela recepção de Botafogo.";

/** Adicional da manutenção: sábado trabalhado 50%, domingo 100%; feriado em dia útil: paga 100% do dia. */
export type AdicionalManutencao = { tipo: "sabado" | "domingo" | "feriado"; percentual: 50 | 100; rotulo: string } | null;
export function adicionalManutencao(data: string, feriados: string[] = []): AdicionalManutencao {
  const dow = civilDow(data);
  if (dow === 0) return { tipo: "domingo", percentual: 100, rotulo: "Domingo trabalhado: hora extra 100%" };
  if (feriados.includes(data)) return { tipo: "feriado", percentual: 100, rotulo: "Feriado trabalhado: paga 100% do dia" };
  if (dow === 6) return { tipo: "sabado", percentual: 50, rotulo: "Sábado trabalhado: hora extra 50%" };
  return null;
}

export type LinhaHoje = { colaborador_id: string; unidade: string; setor: string; data: string; status: string };
export type CoberturaSetor = {
  /** "ok" cobertura normal; "pendente" alerta vermelho; "info" explicado pela regra (sem alerta). */
  nivel: "ok" | "pendente" | "info";
  mensagem: string | null;
};
const trabalha = (d: LinhaHoje) => d.status === "trabalho" || d.status === "extra";

export function coberturaSetor(unidade: Unidade, setor: Setor, hoje: string, amanha: string, dias: LinhaHoje[]): CoberturaSetor {
  const doSetor = dias.filter((d) => d.setor === setor && trabalha(d));
  const naUnidade = (data: string) => doSetor.filter((d) => d.data === data && d.unidade === unidade);
  if (setor === "recepcao" && unidade === "Ipanema") {
    return { nivel: "info", mensagem: "Ipanema é administrada pela recepção de Botafogo (sem pendência)." };
  }
  if (setor === "manutencao") {
    const fimDeSemana = (data: string) => [0, 6].includes(civilDow(data));
    const faltaHoje = naUnidade(hoje).length === 0;
    const faltaAmanha = naUnidade(amanha).length === 0;
    if (!faltaHoje && !faltaAmanha) return { nivel: "ok", mensagem: null };
    const outraHoje = doSetor.some((d) => d.data === hoje && d.unidade !== unidade);
    const outraAmanha = doSetor.some((d) => d.data === amanha && d.unidade !== unidade);
    const outra = unidade === "Botafogo" ? "Ipanema" : "Botafogo";
    // Só há problema se faltar em dia útil e não houver ninguém em nenhuma unidade
    const semNinguemUtil = (falta: boolean, data: string, outraU: boolean) => falta && !outraU && !fimDeSemana(data);
    if (semNinguemUtil(faltaHoje, hoje, outraHoje) || semNinguemUtil(faltaAmanha, amanha, outraAmanha)) {
      return { nivel: "pendente", mensagem: "Confira a cobertura de hoje e amanhã." };
    }
    if ((faltaHoje && outraHoje) || (faltaAmanha && outraAmanha)) {
      return { nivel: "info", mensagem: `Manutenção está em ${outra} pela escala. Se houver urgência aqui, ele vem (regra não rígida).` };
    }
    return { nivel: "info", mensagem: "Fim de semana: manutenção só é chamada em urgência." };
  }
  const faltou = naUnidade(hoje).length === 0 || naUnidade(amanha).length === 0;
  return faltou ? { nivel: "pendente", mensagem: "Confira a cobertura de hoje e amanhã." } : { nivel: "ok", mensagem: null };
}
