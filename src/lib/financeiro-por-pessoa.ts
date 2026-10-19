// "Quanto vou pagar a cada pessoa": agrupa os lançamentos do Financeiro por pessoa
// (funcionário vinculado ou nome do freelancer) e separa o que falta pagar do que já foi pago.
import type { Categoria, FiltroUnidade, FinConfig, Lancamento } from "@/lib/financeiro";
import { statusReal, valorRateado } from "@/lib/financeiro";

export type ItemPessoa = { id: string; descricao: string; categoria: string; valor: number; status: string; vencimento: string | null };
export type LinhaPessoa = {
  chave: string;
  nome: string;
  aPagar: number;
  vencido: number;
  pago: number;
  /** Quanto falta pagar (a pagar + vencido + previsto). */
  pendente: number;
  porCategoria: { categoria: string; pendente: number; pago: number }[];
  itens: ItemPessoa[];
};
export type ResumoPessoas = { linhas: LinhaPessoa[]; semPessoa: { qtd: number; pendente: number }; totalPendente: number; totalPago: number };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const arred = (n: number) => Math.round(n * 100) / 100;

export function resumirPorPessoa(args: {
  lancamentos: Lancamento[];
  categorias: Pick<Categoria, "id" | "nome">[];
  funcionarios: { id: string; nome: string }[];
  mes: string; // YYYY-MM
  unidade: FiltroUnidade;
  config: FinConfig | null;
}): ResumoPessoas {
  const { lancamentos, categorias, funcionarios, mes, unidade, config } = args;
  const mapa = new Map<string, LinhaPessoa>();
  const semPessoa = { qtd: 0, pendente: 0 };
  for (const l of lancamentos) {
    if (l.tipo !== "despesa" || l.status === "cancelado" || !l.competencia.startsWith(mes)) continue;
    if (unidade !== "Consolidado" && l.unidade !== unidade && l.unidade !== "Ambas") continue;
    const valor = arred(valorRateado(l, unidade, config));
    const st = statusReal(l);
    const nomeFunc = l.funcionario_id ? funcionarios.find((f) => f.id === l.funcionario_id)?.nome : undefined;
    const nome = (nomeFunc ?? l.freelancer_nome ?? "").trim();
    if (!nome) { if (st !== "pago") { semPessoa.qtd++; semPessoa.pendente = arred(semPessoa.pendente + valor); } continue; }
    const chave = l.funcionario_id ?? `n:${norm(nome)}`;
    const linha = mapa.get(chave) ?? { chave, nome, aPagar: 0, vencido: 0, pago: 0, pendente: 0, porCategoria: [], itens: [] };
    if (st === "pago") linha.pago = arred(linha.pago + valor);
    else if (st === "vencido") linha.vencido = arred(linha.vencido + valor);
    else linha.aPagar = arred(linha.aPagar + valor);
    if (st !== "pago") linha.pendente = arred(linha.pendente + valor);
    const cat = categorias.find((c) => c.id === l.categoria_id)?.nome ?? "Sem categoria";
    let pc = linha.porCategoria.find((c) => c.categoria === cat);
    if (!pc) { pc = { categoria: cat, pendente: 0, pago: 0 }; linha.porCategoria.push(pc); }
    if (st === "pago") pc.pago = arred(pc.pago + valor); else pc.pendente = arred(pc.pendente + valor);
    linha.itens.push({ id: l.id, descricao: l.descricao, categoria: cat, valor, status: st, vencimento: l.data_vencimento });
    mapa.set(chave, linha);
  }
  const linhas = [...mapa.values()].sort((a, b) => b.pendente - a.pendente || a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    linhas, semPessoa,
    totalPendente: arred(linhas.reduce((s, l) => s + l.pendente, 0)),
    totalPago: arred(linhas.reduce((s, l) => s + l.pago, 0)),
  };
}

export function csvPorPessoa(r: ResumoPessoas, moeda: (n: number) => string): string {
  const linhas = [["Pessoa", "A pagar", "Vencido", "Total pendente", "Já pago", "Detalhe"],
    ...r.linhas.map((l) => [l.nome, moeda(l.aPagar), moeda(l.vencido), moeda(l.pendente), moeda(l.pago), l.porCategoria.map((c) => `${c.categoria}: ${moeda(c.pendente)}`).join(" | ")]),
    ["TOTAL", "", "", moeda(r.totalPendente), moeda(r.totalPago), ""]];
  return "﻿" + linhas.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(";")).join("\n");
}
