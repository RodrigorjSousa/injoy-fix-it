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
  nota_geral: number;
  observacao: string | null;
  teve_elogio: boolean;
  valor_calculado: number;
  unidade: string;
  created_at: string;
}

export function calcularValor(
  notaFuncionarios: number,
  notaGeral: number,
  teveElogio: boolean,
  cfg: ConfigBonificacao,
): number {
  const funcPos = notaFuncionarios >= 9;
  const geralPos = notaGeral >= 9;

  let base = 0;
  if (funcPos && geralPos) {
    base = notaFuncionarios >= 10 ? Number(cfg.valor_nota_10) : Number(cfg.valor_nota_9);
  } else if (funcPos !== geralPos) {
    base = Number(cfg.penalidade_1_ruim);
  } else {
    base = Number(cfg.penalidade_2_ruins);
  }

  if (teveElogio) base += Number(cfg.valor_elogio);
  return base;
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

export function useRegistrosBonificacaoMes(unidade: Unidade) {
  return useQuery({
    queryKey: ["registros_bonificacao", "mes", unidade],
    queryFn: async (): Promise<RegistroBonificacao[]> => {
      const { inicio, fim } = inicioFimMes();
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
      nota_geral: number;
      observacao: string | null;
      teve_elogio: boolean;
      valor_calculado: number;
      unidade: Unidade;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("registros_bonificacao").insert({
        ...input,
        criado_por: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["registros_bonificacao"] }),
  });
}

export function useExcluirRegistroBonificacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("registros_bonificacao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["registros_bonificacao"] }),
  });
}

export function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
