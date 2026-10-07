// Meta da equipe: +R$ por pessoa quando as 3 médias do mês ficam na nota mínima ou acima,
// respeitando as regras de assiduidade (atrasos e faltas sem justificativa).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { atualizarMetaEquipeAgora } from "@/lib/pontomais.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type SituacaoMeta = "ok" | "risco" | "perdeu";

export interface MetaConfig {
  ativo: boolean;
  valor_por_pessoa: number;
  nota_minima: number;
  tolerancia_minutos: number;
  max_atrasos: number;
}

export interface MetaPessoa {
  funcionario_id: string;
  nome: string;
  unidade: "Botafogo" | "Ipanema" | "Ambas";
  ativo: boolean;
  sou_eu: boolean | null;
  pontomais: boolean;
  atrasos: number;
  faltas: number;
  situacao: SituacaoMeta;
}

export interface MetaSituacao {
  gestor: boolean;
  config: MetaConfig;
  participantes_ativos: number;
  pessoas: MetaPessoa[];
}

export interface MetaOcorrencia {
  id: string;
  funcionario_id: string;
  data: string;
  tipo: "atraso" | "falta";
  minutos: number | null;
  hora_prevista: string | null;
  hora_entrada: string | null;
  fonte: string | null;
  origem: "auto" | "manual";
  justificada: boolean;
  motivo: string | null;
}

export const CONFIG_PADRAO: MetaConfig = {
  ativo: true,
  valor_por_pessoa: 100,
  nota_minima: 9,
  tolerancia_minutos: 10,
  max_atrasos: 3,
};

export function useMetaSituacao() {
  return useQuery({
    queryKey: ["bonus_meta_situacao"],
    staleTime: 60_000,
    queryFn: async (): Promise<MetaSituacao | null> => {
      const { data, error } = await db.rpc("bonus_meta_situacao");
      if (error) {
        // Banco ainda sem a migração: não quebra a tela inicial.
        if (/bonus_meta_situacao|function|schema cache/i.test(String(error.message))) return null;
        throw new Error(error.message);
      }
      const r = data as MetaSituacao;
      return {
        ...r,
        config: {
          ativo: r.config?.ativo ?? true,
          valor_por_pessoa: Number(r.config?.valor_por_pessoa ?? 100),
          nota_minima: Number(r.config?.nota_minima ?? 9),
          tolerancia_minutos: Number(r.config?.tolerancia_minutos ?? 10),
          max_atrasos: Number(r.config?.max_atrasos ?? 3),
        },
        pessoas: (r.pessoas ?? []).map((p) => ({ ...p, atrasos: Number(p.atrasos), faltas: Number(p.faltas) })),
      };
    },
  });
}

/** Avalia a meta das 3 notas para uma unidade. */
export function avaliarMeta(
  medias: { geral: number | null; funcionarios: number | null; limpeza: number | null },
  notaMinima: number,
) {
  const itens = [
    { nome: "Geral", nota: medias.geral },
    { nome: "Funcionário", nota: medias.funcionarios },
    { nome: "Limpeza", nota: medias.limpeza },
  ];
  const abaixo = itens.filter((i) => i.nota == null || i.nota < notaMinima);
  return { atingida: abaixo.length === 0, abaixo };
}

export function useOcorrenciasMeta(enabled = true) {
  return useQuery({
    queryKey: ["bonus_meta_ocorrencias"],
    enabled,
    queryFn: async (): Promise<MetaOcorrencia[]> => {
      const hoje = new Date();
      const inicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
      const { data, error } = await db
        .from("bonus_meta_ocorrencias")
        .select("*")
        .gte("data", inicio)
        .order("data", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as MetaOcorrencia[];
    },
  });
}

export function useFuncionariosLista(enabled = true) {
  return useQuery({
    queryKey: ["funcionarios_lista_meta"],
    enabled,
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      const { data, error } = await supabase.from("funcionarios").select("id, nome").order("nome");
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
}

function useInvalidarMeta() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["bonus_meta_situacao"] });
    void qc.invalidateQueries({ queryKey: ["bonus_meta_ocorrencias"] });
  };
}

function rpcMutation<T>(fn: string, map: (input: T) => Record<string, unknown>) {
  return function useRpc() {
    const invalidar = useInvalidarMeta();
    return useMutation({
      mutationFn: async (input: T) => {
        const { error } = await db.rpc(fn, map(input));
        if (error) throw new Error(error.message);
      },
      onSuccess: invalidar,
    });
  };
}

export const useSalvarConfigMeta = rpcMutation<MetaConfig>("bonus_meta_salvar_config", (c) => ({
  _ativo: c.ativo,
  _valor: c.valor_por_pessoa,
  _nota: c.nota_minima,
  _tolerancia: c.tolerancia_minutos,
  _max_atrasos: c.max_atrasos,
}));

export const useSalvarParticipanteMeta = rpcMutation<{ funcionarioId: string; unidade: string; ativo: boolean }>(
  "bonus_meta_salvar_participante",
  (i) => ({ _funcionario_id: i.funcionarioId, _unidade: i.unidade, _ativo: i.ativo }),
);

export const useRemoverParticipanteMeta = rpcMutation<string>("bonus_meta_remover_participante", (id) => ({
  _funcionario_id: id,
}));

export const useJustificarOcorrencia = rpcMutation<{ id: string; justificada: boolean; motivo: string }>(
  "bonus_meta_justificar",
  (i) => ({ _ocorrencia_id: i.id, _justificada: i.justificada, _motivo: i.motivo }),
);

export const useLancarOcorrencia = rpcMutation<{
  funcionarioId: string;
  data: string;
  tipo: "atraso" | "falta";
  minutos: number | null;
  motivo: string;
}>("bonus_meta_lancar", (i) => ({
  _funcionario_id: i.funcionarioId,
  _data: i.data,
  _tipo: i.tipo,
  _minutos: i.minutos,
  _motivo: i.motivo,
}));

export const useExcluirOcorrencia = rpcMutation<string>("bonus_meta_excluir_ocorrencia", (id) => ({
  _ocorrencia_id: id,
}));

/** Gestor: cria as regras padrão e os participantes iniciais (só na primeira vez). */
export function usePrepararMeta() {
  const invalidar = useInvalidarMeta();
  return useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("bonus_meta_preparar");
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });
}

/** Gestor: busca o Pontomais do mês e recalcula. */
export function useAtualizarMetaAgora() {
  const call = useServerFn(atualizarMetaEquipeAgora);
  const invalidar = useInvalidarMeta();
  return useMutation({ mutationFn: () => call(), onSuccess: invalidar });
}

export const SITUACAO_INFO: Record<SituacaoMeta, { rotulo: string; classe: string }> = {
  ok: { rotulo: "Dentro das regras", classe: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  risco: { rotulo: "Risco de perder as bonificações", classe: "bg-amber-100 text-amber-900 border-amber-300" },
  perdeu: { rotulo: "Perdeu as bonificações do mês", classe: "bg-rose-100 text-rose-800 border-rose-300" },
};
