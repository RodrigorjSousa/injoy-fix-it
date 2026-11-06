// Financeiro › Folha de pagamento: leitura e gravação no banco (migração 0101).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CONFIG_PADRAO, type MetaConfig, type MetaPessoa } from "@/lib/bonus-meta";
import { resumirPagamento } from "@/lib/bonificacao-pagamento";
import type { RegistroBonificacao } from "@/lib/bonificacao";
import { useBancoHoras } from "@/lib/ponto-gestao";
import {
  CONFIG_FOLHA_PADRAO,
  limitesMesFolha,
  montarLancamentoFolha,
  type BonusPessoa,
  type ColaboradorFolha,
  type DiaEscalaFolha,
  type FaixaFreela,
  type FolhaAjuste,
  type FolhaConfig,
  type FolhaPessoaCfg,
  type PontoPessoaFolha,
  type ResumoFolha,
} from "@/lib/folha";

// As tabelas novas ainda não estão nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const faltaTabela = (e: { message?: string; code?: string } | null | undefined) =>
  !!e &&
  (e.code === "42P01" ||
    e.code === "PGRST205" ||
    /does not exist|schema cache|Could not find the table/i.test(e.message ?? ""));

export type FolhaLancada = { competencia: string; total: number; lancado_em: string };

export type DadosFolha = {
  semMigracao: boolean;
  config: FolhaConfig;
  pessoas: FolhaPessoaCfg[];
  ajustes: FolhaAjuste[];
  lancada: FolhaLancada | null;
  colaboradores: ColaboradorFolha[];
  dias: DiaEscalaFolha[];
  feriados: string[];
  bonus: BonusPessoa[];
  bonusErro: string | null;
};

const lerTabela = (v: unknown): FaixaFreela[] =>
  Array.isArray(v)
    ? v
        .map((f) => ({
          rotulo: String(f?.rotulo ?? ""),
          horas: Number(f?.horas),
          valor: Number(f?.valor),
        }))
        .filter((f) => f.horas > 0 && f.valor >= 0)
    : CONFIG_FOLHA_PADRAO.tabela_freela;

/** Bonificação › Pagamento do mês, por funcionário (grupo = meta do setor; individual = elogios). */
async function carregarBonus(mes: string): Promise<BonusPessoa[]> {
  const { inicio, fim } = limitesMesFolha(mes);
  const [sit, regs, elog, cfg] = await Promise.all([
    db.rpc("bonus_meta_situacao", { _mes: inicio }),
    supabase.from("registros_bonificacao").select("*").gte("data", inicio).lte("data", fim),
    db.from("bonus_elogios").select("funcionario_id").gte("data", inicio).lte("data", fim),
    supabase
      .from("config_bonificacao")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (sit.error) throw new Error(sit.error.message);
  if (regs.error) throw new Error(regs.error.message);
  if (elog.error && !/bonus_elogios/.test(String(elog.error.message)))
    throw new Error(elog.error.message);
  const r = sit.data as { config: Partial<MetaConfig>; pessoas: MetaPessoa[] };
  const meta: MetaConfig = {
    ativo: r.config?.ativo ?? CONFIG_PADRAO.ativo,
    valor_por_pessoa: Number(r.config?.valor_por_pessoa ?? CONFIG_PADRAO.valor_por_pessoa),
    nota_minima: Number(r.config?.nota_minima ?? CONFIG_PADRAO.nota_minima),
    tolerancia_minutos: Number(r.config?.tolerancia_minutos ?? CONFIG_PADRAO.tolerancia_minutos),
    max_atrasos: Number(r.config?.max_atrasos ?? CONFIG_PADRAO.max_atrasos),
  };
  const resumo = resumirPagamento({
    pessoas: (r.pessoas ?? []).map((p) => ({
      ...p,
      atrasos: Number(p.atrasos),
      faltas: Number(p.faltas),
    })),
    registros: (regs.data ?? []) as RegistroBonificacao[],
    cfg: meta,
    valorElogio: Number((cfg.data as { valor_elogio?: number } | null)?.valor_elogio ?? 20),
    elogios: elog.error ? [] : ((elog.data ?? []) as { funcionario_id: string }[]),
  });
  return resumo.linhas.map((l) => ({
    funcionario_id: l.funcionarioId,
    grupo: l.valorMeta,
    individual: l.valorElogios,
    perdeu: l.perdeu,
    motivo: l.motivo,
  }));
}

export function useDadosFolha(mes: string) {
  return useQuery({
    queryKey: ["folha", mes],
    queryFn: async (): Promise<DadosFolha> => {
      const { inicio, fim } = limitesMesFolha(mes);
      const [cfg, pes, aj, mesL, col, dias, fer] = await Promise.all([
        db.from("fin_folha_config").select("*").eq("id", 1).maybeSingle(),
        db.from("fin_folha_pessoas").select("*"),
        db.from("fin_folha_ajustes").select("*").eq("competencia", inicio),
        db
          .from("fin_folha_meses")
          .select("competencia, total, lancado_em")
          .eq("competencia", inicio)
          .maybeSingle(),
        supabase
          .from("escala_colaboradores")
          .select(
            "id, funcionario_id, nome, setor, unidade, vinculo, ativo, vale_alimentacao, vale_transporte_dia",
          )
          .order("nome"),
        supabase
          .from("escala_dias")
          .select(
            "id, colaborador_id, unidade, data, status, horas_contratadas, valor_combinado, hora_entrada, hora_saida",
          )
          .gte("data", inicio)
          .lte("data", fim),
        supabase.from("feriados").select("data").gte("data", inicio).lte("data", fim),
      ]);
      for (const r of [col, dias, fer]) if (r.error) throw new Error(r.error.message);
      const semMigracao = [cfg, pes, aj, mesL].some((r) => faltaTabela(r.error));
      for (const r of [cfg, pes, aj, mesL])
        if (r.error && !faltaTabela(r.error)) throw new Error(r.error.message);

      let bonus: BonusPessoa[] = [];
      let bonusErro: string | null = null;
      try {
        bonus = await carregarBonus(mes);
      } catch (e) {
        bonusErro = e instanceof Error ? e.message : String(e);
      }

      const c = cfg.data as Partial<FolhaConfig> | null;
      return {
        semMigracao,
        config: {
          tabela_freela: c?.tabela_freela
            ? lerTabela(c.tabela_freela)
            : CONFIG_FOLHA_PADRAO.tabela_freela,
          divisor_padrao: Number(c?.divisor_padrao ?? CONFIG_FOLHA_PADRAO.divisor_padrao),
          dsr_extras: c?.dsr_extras ?? CONFIG_FOLHA_PADRAO.dsr_extras,
          descontar_debitos: c?.descontar_debitos ?? CONFIG_FOLHA_PADRAO.descontar_debitos,
          dia_pagamento: Number(c?.dia_pagamento ?? CONFIG_FOLHA_PADRAO.dia_pagamento),
        },
        pessoas: ((pes.data ?? []) as FolhaPessoaCfg[]).map((p) => ({
          ...p,
          salario_base: p.salario_base == null ? null : Number(p.salario_base),
          divisor: p.divisor == null ? null : Number(p.divisor),
          freela_valor_mensal: p.freela_valor_mensal == null ? null : Number(p.freela_valor_mensal),
        })),
        ajustes: ((aj.data ?? []) as FolhaAjuste[]).map((a) => ({
          ...a,
          valores: a.valores ?? {},
          outros_proventos: Number(a.outros_proventos ?? 0),
          outros_descontos: Number(a.outros_descontos ?? 0),
        })),
        lancada: (mesL.data as FolhaLancada | null) ?? null,
        colaboradores: (col.data ?? []) as ColaboradorFolha[],
        dias: ((dias.data ?? []) as DiaEscalaFolha[]).map((d) => ({
          ...d,
          horas_contratadas: d.horas_contratadas == null ? null : Number(d.horas_contratadas),
          valor_combinado: d.valor_combinado == null ? null : Number(d.valor_combinado),
        })),
        feriados: ((fer.data ?? []) as { data: string }[]).map((f) => f.data),
        bonus,
        bonusErro,
      };
    },
  });
}

/** Horas do ponto do mês por pessoa fixa, já calculadas (mesma conta do Ponto › Banco de horas). */
export function usePontoFolha(mes: string) {
  const { inicio, fim } = limitesMesFolha(mes);
  const q = useBancoHoras(inicio, fim);
  const ponto: PontoPessoaFolha[] = (q.data?.pessoas ?? []).map((p) => ({
    colaborador_id: p.colaborador_id,
    modo: p.modo,
    inicio: p.inicio,
    dias: p.dias.map((d) => ({
      data: d.data,
      classe: d.resultado.classe,
      extra50: d.resultado.extra50,
      extra100: d.resultado.extra100,
      debito: d.resultado.debito,
      noturnoReduzido: d.resultado.noturnoReduzido,
      noturno: d.resultado.noturno,
      trabalhou: !!d.entrada_real,
    })),
  }));
  return { ponto, carregando: q.isLoading, erro: q.error ? (q.error as Error).message : null };
}

function useInvalidar(mes?: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: mes ? ["folha", mes] : ["folha"] });
  };
}

export function useSalvarConfigFolha() {
  const inv = useInvalidar();
  return useMutation({
    mutationFn: async (cfg: FolhaConfig) => {
      const { error } = await db
        .from("fin_folha_config")
        .upsert({ id: 1, ...cfg, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: inv,
  });
}

/** Cadastro da pessoa: folha (salário, freelancer) + VT/VR do cadastro da escala. */
export function useSalvarPessoaFolha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cfg: FolhaPessoaCfg;
      vale_alimentacao: number | null;
      vale_transporte_dia: number | null;
    }) => {
      const { error } = await db
        .from("fin_folha_pessoas")
        .upsert(
          { ...input.cfg, updated_at: new Date().toISOString() },
          { onConflict: "colaborador_id" },
        );
      if (error) throw new Error(error.message);
      const { data, error: e2 } = await supabase
        .from("escala_colaboradores")
        .update({
          vale_alimentacao: input.vale_alimentacao,
          vale_transporte_dia: input.vale_transporte_dia,
        } as never)
        .eq("id", input.cfg.colaborador_id)
        .select("id");
      if (e2) throw new Error(e2.message);
      if (!data?.length) throw new Error("Não foi possível salvar os vales (sem permissão).");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["folha"] });
      void qc.invalidateQueries({ queryKey: ["escala-colaboradores"] });
    },
  });
}

export function useSalvarAjusteFolha(mes: string) {
  const inv = useInvalidar(mes);
  return useMutation({
    mutationFn: async (a: FolhaAjuste) => {
      const { error } = await db.from("fin_folha_ajustes").upsert(
        {
          ...a,
          competencia: `${mes}-01`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "competencia,colaborador_id" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: inv,
  });
}

export type RetornoLancamento = {
  criados: number;
  atualizados: number;
  ja_pagos: number;
  cancelados: number;
  plantoes_atualizados: number;
  plantoes_ja_pagos: number;
  beneficios: { criados: number; atualizados: number; ja_pagos: number; cancelados: number };
};

export function useLancarFolha(mes: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (resumo: ResumoFolha): Promise<RetornoLancamento> => {
      const label = `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
      const { itens, beneficios, plantoes } = montarLancamentoFolha(resumo, label);
      const { data, error } = await db.rpc("fin_folha_lancar", {
        _competencia: `${mes}-01`,
        _itens: itens,
        _beneficios: beneficios,
        _plantoes: plantoes,
        _resumo: resumo.linhas.map((l) => ({
          colaborador_id: l.colaborador.id,
          nome: l.colaborador.nome,
          vinculo: l.colaborador.vinculo,
          valores: l.valores,
          outros_proventos: l.outrosProventos,
          outros_descontos: l.outrosDescontos,
          total: l.total,
        })),
        _total: resumo.totais.geral,
      });
      if (error) {
        if (error.code === "PGRST202" || /Could not find the function/i.test(error.message))
          throw new Error(
            "A função de lançar a folha ainda não está no banco: aplique a migração 0101 no Lovable.",
          );
        throw new Error(error.message);
      }
      return data as RetornoLancamento;
    },
    onSuccess: () => {
      for (const k of [["folha"], ["financeiro"], ["escala-dias"], ["fin_adiantamentos"]])
        void qc.invalidateQueries({ queryKey: k });
    },
  });
}
