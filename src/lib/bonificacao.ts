// Bonification calculation logic + data hooks
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";

export interface ConfigBonificacao {
  id: string;
  valor_nota_10: number;
  valor_nota_9: number;
  penalidade_1_ruim: number;
  penalidade_2_ruins: number;
  valor_elogio: number;
}

export interface RegistroBonificacao {
  id: string;
  data: string;
  nome_hospede: string;
  nota_funcionarios: number;
  nota_limpeza: number | null;
  nota_geral: number;
  observacao: string | null;
  teve_elogio: boolean;
  valor_calculado: number;
  unidade: string;
  setor: SetorBonificacao;
  avaliacao_id: string | null;
  created_at: string;
}

export type SetorBonificacao = "recepcao" | "camareiras";

/**
 * Valor da avaliação para o SETOR (Recepção ou Camareiras/Manutenção), pelas notas.
 * O elogio nominal (comentário individual) NÃO entra aqui desde 19/11/2026: ele vale só para a pessoa
 * elogiada (tabela bonus_elogios, somado em Bonificação › Pagamento). Mesma regra do banco
 * (public.calcular_registro_bonificacao, migração 0107).
 */
export function calcularValor(notaSetor: number, notaGeral: number, cfg: ConfigBonificacao): number {
  const setorPos = notaSetor >= 9;
  const geralPos = notaGeral >= 9;
  if (setorPos && geralPos) return notaSetor >= 10 ? Number(cfg.valor_nota_10) : Number(cfg.valor_nota_9);
  if (setorPos !== geralPos) return Number(cfg.penalidade_1_ruim);
  return Number(cfg.penalidade_2_ruins);
}

export function useConfigBonificacao() {
  return useQuery({
    queryKey: ["config_bonificacao"],
    queryFn: async (): Promise<ConfigBonificacao | null> => {
      const { data, error } = await supabase
        .from("config_bonificacao")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ConfigBonificacao | null;
    },
  });
}

export function useSalvarConfigBonificacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ConfigBonificacao, "id"> & { id: string }) => {
      const { error } = await supabase
        .from("config_bonificacao")
        .update({
          valor_nota_10: input.valor_nota_10,
          valor_nota_9: input.valor_nota_9,
          penalidade_1_ruim: input.penalidade_1_ruim,
          penalidade_2_ruins: input.penalidade_2_ruins,
          valor_elogio: input.valor_elogio,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["config_bonificacao"] }),
  });
}

function inicioFimMes(ref = new Date()) {
  const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { inicio: iso(inicio), fim: iso(fim) };
}

export function useRegistrosBonificacaoMes(unidade: Unidade, setor?: SetorBonificacao) {
  return useQuery({
    queryKey: ["registros_bonificacao", "mes", unidade, setor ?? "todos"],
    queryFn: async (): Promise<RegistroBonificacao[]> => {
      const { inicio, fim } = inicioFimMes();
      let query = supabase
        .from("registros_bonificacao")
        .select("*")
        .eq("unidade", unidade)
        .gte("data", inicio)
        .lte("data", fim)
        .order("data", { ascending: false });
      if (setor) query = query.eq("setor", setor);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as RegistroBonificacao[];
    },
  });
}

export function useRegistrosBonificacaoPorMes(unidade: Unidade, ano: number, mes: number) {
  return useQuery({
    queryKey: ["registros_bonificacao", "por-mes", unidade, ano, mes],
    queryFn: async (): Promise<RegistroBonificacao[]> => {
      const { inicio, fim } = inicioFimMes(new Date(ano, mes, 1));
      const { data, error } = await supabase
        .from("registros_bonificacao")
        .select("*")
        .eq("unidade", unidade)
        .gte("data", inicio)
        .lte("data", fim)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RegistroBonificacao[];
    },
  });
}

export function useCriarRegistroBonificacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      data: string;
      nome_hospede: string;
      nota_funcionarios: number;
      nota_limpeza: number;
      nota_geral: number;
      observacao: string | null;
      teve_elogio: boolean;
      unidade: Unidade;
      /** Quem foi elogiado pelo nome (comentário individual): só essas pessoas recebem o valor do elogio. */
      elogiados: string[];
    }) => {
      const { data: u, error: userError } = await supabase.auth.getUser();
      if (userError || !u.user)
        throw new Error("Sua sessão expirou. Entre novamente para salvar a avaliação.");
      if (input.teve_elogio && !input.elogiados.length)
        throw new Error("Escolha quem foi elogiado pelo nome.");
      const { error } = await db.rpc("registrar_bonificacao_com_elogios", {
        _data: input.data,
        _nome_hospede: input.nome_hospede,
        _nota_funcionarios: input.nota_funcionarios,
        _nota_limpeza: input.nota_limpeza,
        _nota_geral: input.nota_geral,
        _observacao: input.observacao ?? "",
        _teve_elogio: input.teve_elogio,
        _unidade: input.unidade,
        _elogiados: input.teve_elogio ? input.elogiados : [],
      });
      if (error) throw new Error(mensagemElogio(error.message));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["registros_bonificacao"] });
      void qc.invalidateQueries({ queryKey: ["bonus_elogios"] });
      void qc.invalidateQueries({ queryKey: ["bonificacao_pagamento"] });
    },
  });
}

/** Erro de banco sem a migração 0107 vira uma instrução clara. */
function mensagemElogio(msg: string): string {
  if (/registrar_bonificacao_com_elogios|bonificacao_definir_elogiados|bonificacao_pessoas_elogio|bonificacao_elogiados|schema cache/i.test(msg))
    return "O banco ainda não recebeu a atualização do elogio individual (migração 0107). Aplique a migração e publique o app.";
  return msg;
}

/** Nomes que podem ser escolhidos como elogiados (funcionários). */
export function usePessoasElogio(enabled = true) {
  return useQuery({
    queryKey: ["bonificacao_pessoas_elogio"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      const { data, error } = await db.rpc("bonificacao_pessoas_elogio");
      if (error) throw new Error(mensagemElogio(error.message));
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
}

/** Quem já está marcado como elogiado numa avaliação (para a tela de editar). */
export function useElogiadosDaAvaliacao(avaliacaoRef: string | null) {
  return useQuery({
    queryKey: ["bonus_elogios", "avaliacao", avaliacaoRef],
    enabled: !!avaliacaoRef,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await db.rpc("bonificacao_elogiados", { _avaliacao_ref: avaliacaoRef });
      if (error) throw new Error(mensagemElogio(error.message));
      return ((data ?? []) as unknown[]).map((x) =>
        typeof x === "string" ? x : String((x as Record<string, unknown>).bonificacao_elogiados ?? ""),
      );
    },
  });
}

export function useExcluirRegistroBonificacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, avaliacaoId }: { id: string; avaliacaoId: string | null }) => {
      let query = supabase.from("registros_bonificacao").delete();
      query = avaliacaoId ? query.eq("avaliacao_id", avaliacaoId) : query.eq("id", id);
      const { data, error } = await query.select("id");
      if (error) throw error;
      // Sem permissão o banco não apaga nada e não avisa: mostramos o motivo.
      if (!data?.length)
        throw new Error(
          "A avaliação não foi excluída: seu login não tem permissão para excluir. Peça ao gestor em Bonificação › Acessos.",
        );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["registros_bonificacao"] }),
  });
}

export function useEditarRegistroBonificacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      registro_id: string;
      data: string;
      nome_hospede: string;
      nota_funcionarios: number;
      nota_limpeza: number;
      nota_geral: number;
      observacao_recepcao: string;
      observacao_limpeza: string;
      teve_elogio: boolean;
      unidade: Unidade;
      /** id da avaliação (avaliacao_id ?? id) e quem foi elogiado; lista vazia tira os elogios. */
      avaliacao_ref: string;
      elogiados: string[];
    }) => {
      if (input.teve_elogio && !input.elogiados.length)
        throw new Error("Escolha quem foi elogiado pelo nome.");
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user)
        throw new Error("Sua sessão expirou. Entre novamente para editar a avaliação.");
      const { error } = await supabase.rpc("editar_bonificacao_conjunta", {
        _registro_id: input.registro_id,
        _data: input.data,
        _nome_hospede: input.nome_hospede,
        _nota_funcionarios: input.nota_funcionarios,
        _nota_limpeza: input.nota_limpeza,
        _nota_geral: input.nota_geral,
        _observacao_recepcao: input.observacao_recepcao,
        _observacao_limpeza: input.observacao_limpeza,
        _teve_elogio: input.teve_elogio,
        _unidade: input.unidade,
      });
      if (error) throw error;
      const { error: errElogio } = await db.rpc("bonificacao_definir_elogiados", {
        _avaliacao_ref: input.avaliacao_ref,
        _elogiados: input.teve_elogio ? input.elogiados : [],
      });
      if (errElogio)
        throw new Error(`Avaliação salva, mas os elogiados não: ${mensagemElogio(errElogio.message)}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["registros_bonificacao"] });
      void qc.invalidateQueries({ queryKey: ["bonus_elogios"] });
      void qc.invalidateQueries({ queryKey: ["bonificacao_pagamento"] });
    },
  });
}

export function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

// ---------------------------------------------------------------- notas do mês (tela inicial)
export type NivelNota = "verde" | "amarelo" | "vermelho" | "sem";

/** Faixas das notas na tela inicial. O bônus só é positivo com nota ≥ 9. */
export const FAIXAS_NOTA = { verde: 9, amarelo: 8 } as const;

export function nivelNota(nota: number | null): NivelNota {
  if (nota == null || Number.isNaN(nota)) return "sem";
  if (nota >= FAIXAS_NOTA.verde) return "verde";
  if (nota >= FAIXAS_NOTA.amarelo) return "amarelo";
  return "vermelho";
}

export type MediasBonificacao = {
  geral: number | null;
  funcionarios: number | null;
  limpeza: number | null;
  avaliacoes: number;
};

const media = (valores: number[]) =>
  valores.length
    ? Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10
    : null;

/**
 * Médias do mês a partir da lista da Bonificação.
 * Uma avaliação de hóspede pode gerar 2 linhas (Recepção e Camareiras) com a mesma
 * nota geral; por isso a nota geral conta cada avaliação uma vez só.
 */
export function calcularMediasBonificacao(registros: RegistroBonificacao[]): MediasBonificacao {
  const porAvaliacao = new Map<string, RegistroBonificacao[]>();
  for (const r of registros) {
    const chave = r.avaliacao_id ?? r.id;
    porAvaliacao.set(chave, [...(porAvaliacao.get(chave) ?? []), r]);
  }
  const avaliacoes = [...porAvaliacao.values()];
  const geral = avaliacoes.map((linhas) => Number(linhas[0].nota_geral));
  const funcionarios = avaliacoes
    .map((linhas) => linhas.find((l) => l.setor !== "camareiras"))
    .filter((l): l is RegistroBonificacao => !!l)
    .map((l) => Number(l.nota_funcionarios));
  const limpeza = avaliacoes
    .map((linhas) => linhas.find((l) => l.nota_limpeza != null))
    .filter((l): l is RegistroBonificacao => !!l)
    .map((l) => Number(l.nota_limpeza));
  return {
    geral: media(geral),
    funcionarios: media(funcionarios),
    limpeza: media(limpeza),
    avaliacoes: avaliacoes.length,
  };
}

// ---------------------------------------------------------------- permissões
// Fonte única: o banco (public.minha_permissao_bonificacao). O gestor define
// quem acessa em Bonificação › Acessos (tabela public.bonificacao_acessos).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface PermissaoBonificacao {
  gestor: boolean;
  podeRegistrar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

export const SEM_PERMISSAO_BONIFICACAO: PermissaoBonificacao = {
  gestor: false,
  podeRegistrar: false,
  podeEditar: false,
  podeExcluir: false,
};

/** Pergunta ao banco o que o login atual pode fazer na Bonificação. */
export async function buscarPermissaoBonificacao(): Promise<PermissaoBonificacao> {
  const { data, error } = await db.rpc("minha_permissao_bonificacao");
  if (error) {
    const msg = String(error.message ?? "");
    if (/minha_permissao_bonificacao|function|schema cache/i.test(msg))
      throw new Error(
        "O banco de dados ainda não recebeu a atualização de acessos da Bonificação (migração 0031). Aplique a migração e publique o app.",
      );
    throw new Error(msg || "Não foi possível verificar sua permissão na Bonificação.");
  }
  const p = (data ?? {}) as Record<string, unknown>;
  return {
    gestor: p.gestor === true,
    podeRegistrar: p.pode_registrar === true,
    podeEditar: p.pode_editar === true,
    podeExcluir: p.pode_excluir === true,
  };
}

export function usePermissaoBonificacao() {
  return useQuery({
    queryKey: ["permissao_bonificacao"],
    queryFn: buscarPermissaoBonificacao,
    staleTime: 30_000,
  });
}

export interface AcessoBonificacao {
  user_id: string;
  nome: string;
  email: string | null;
  papeis: string[];
  gestor: boolean;
  liberado: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
}

export function useAcessosBonificacao(enabled = true) {
  return useQuery({
    queryKey: ["acessos_bonificacao"],
    enabled,
    queryFn: async (): Promise<AcessoBonificacao[]> => {
      const { data, error } = await db.rpc("bonificacao_acessos_listar");
      if (error) throw new Error(error.message);
      return (data ?? []) as AcessoBonificacao[];
    },
  });
}

export function useDefinirAcessoBonificacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      liberado: boolean;
      podeEditar: boolean;
      podeExcluir: boolean;
    }) => {
      const { error } = await db.rpc("bonificacao_definir_acesso", {
        _user_id: input.userId,
        _liberado: input.liberado,
        _pode_editar: input.podeEditar,
        _pode_excluir: input.podeExcluir,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["acessos_bonificacao"] });
      void qc.invalidateQueries({ queryKey: ["permissao_bonificacao"] });
    },
  });
}
