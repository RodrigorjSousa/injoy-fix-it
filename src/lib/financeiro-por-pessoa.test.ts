import { describe, expect, it } from "vitest";
import { resumirPorPessoa } from "./financeiro-por-pessoa";
import type { Lancamento } from "./financeiro";

const l = (o: Partial<Lancamento>): Lancamento => ({ id: Math.random().toString(), tipo: "despesa", unidade: "Botafogo", categoria_id: "c1", descricao: "x", valor: 100, competencia: "2026-10-01", status: "a_pagar", funcionario_id: null, freelancer_nome: null, data_vencimento: "2099-01-01", ...o } as unknown as Lancamento);
const base = { categorias: [{ id: "c1", nome: "Freelancer" }, { id: "c2", nome: "Vale transporte" }], funcionarios: [{ id: "f1", nome: "Ana" }], mes: "2026-10", unidade: "Consolidado" as const, config: null };

describe("a pagar por pessoa", () => {
  it("soma por pessoa, separa pago e pendente e junta freelancer pelo nome", () => {
    const r = resumirPorPessoa({ ...base, lancamentos: [
      l({ funcionario_id: "f1", valor: 385, categoria_id: "c2" }),
      l({ funcionario_id: "f1", valor: 56.4, categoria_id: "c2", status: "pago" }),
      l({ freelancer_nome: "João  Silva", valor: 150 }),
      l({ freelancer_nome: "joão silva", valor: 200 }),
      l({ valor: 999 }),
      l({ funcionario_id: "f1", valor: 50, status: "cancelado" }),
      l({ funcionario_id: "f1", valor: 70, competencia: "2026-09-01" }),
    ] });
    expect(r.linhas.map((x) => [x.nome, x.pendente, x.pago])).toEqual([["João  Silva", 350, 0], ["Ana", 385, 56.4]].sort((a, b) => (b[1] as number) - (a[1] as number)));
    expect(r.semPessoa).toEqual({ qtd: 1, pendente: 999 });
    expect(r.totalPendente).toBe(735);
    expect(r.totalPago).toBe(56.4);
  });
  it("vencido entra no pendente", () => {
    const r = resumirPorPessoa({ ...base, lancamentos: [l({ funcionario_id: "f1", valor: 10, data_vencimento: "2020-01-01" })] });
    expect(r.linhas[0].vencido).toBe(10);
    expect(r.linhas[0].pendente).toBe(10);
  });
  it("adiantamento em aberto aparece e reduz o líquido", () => {
    const r = resumirPorPessoa({ ...base, lancamentos: [l({ freelancer_nome: "Maria", valor: 500 })],
      adiantamentos: [{ id: "a1", funcionario_id: null, pessoa_nome: "maria", unidade: "Botafogo", valor: 200, data_adiantamento: "2026-10-05", forma_pagamento: "pix", status: "aberto", descontado_lancamento_id: null, descontado_em: null, observacoes: null, anexo_path: null, created_at: "2026-10-05" }] });
    expect(r.linhas[0].adiantamento).toBe(200);
    expect(r.linhas[0].liquido).toBe(300);
  });
});
