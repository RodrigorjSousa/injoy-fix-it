// Acesso à Previsão de Carga fora da Área do Gestor e reforços de limpeza.
// Desde a 0056 a Recepção LANÇA o reforço (freelancer + valor) direto na Escala e o gestor só é avisado;
// pedidos antigos (pendente/autorizado/negado) continuam aparecendo e o gestor pode excluir.
// Quem pode ver é decidido pelo banco: public.minha_permissao_previsao_carga().
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PedidoReforco = {
  id: string;
  unidade: "Botafogo" | "Ipanema";
  data: string;
  nivel: "verde" | "amarelo" | "vermelho" | null;
  ocupacao_pct: number | null;
  gerais: number | null;
  mensagem: string | null;
  status: "pendente" | "autorizado" | "negado" | "lancado";
  escala_dia_id?: string | null;
  freelancer_nome?: string | null;
  valor?: number | null;
  solicitado_por: string;
  solicitado_nome: string | null;
  solicitado_em: string;
  decidido_nome: string | null;
  decidido_em: string | null;
  resposta: string | null;
};

type Rpc = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc: Rpc = (fn, args) => (supabase.rpc as unknown as Rpc)(fn, args);
const tabela = () => supabase.from("previsao_reforco_pedidos" as never);

export async function buscarPermissaoPrevisao(): Promise<boolean> {
  const { data, error } = await rpc("minha_permissao_previsao_carga");
  if (error) throw new Error(error.message);
  return data === true;
}

export function usePermissaoPrevisao() {
  return useQuery({
    queryKey: ["permissao_previsao_carga"],
    queryFn: buscarPermissaoPrevisao,
    staleTime: 60_000,
    retry: 1,
  });
}

export function usePedidosReforco() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`previsao-reforco-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "previsao_reforco_pedidos" },
        () => void qc.invalidateQueries({ queryKey: ["previsao_reforco_pedidos"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);
  return useQuery({
    queryKey: ["previsao_reforco_pedidos"],
    queryFn: async (): Promise<PedidoReforco[]> => {
      const desde = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await tabela()
        .select("*")
        .gte("data", desde)
        .order("solicitado_em", { ascending: false });
      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as unknown as PedidoReforco[];
    },
  });
}

const invalidar = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ["previsao_reforco_pedidos"] });

export function usePedirReforco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      unidade: "Botafogo" | "Ipanema";
      data: string;
      mensagem?: string;
    }) => {
      const { error } = await rpc("previsao_pedir_reforco", {
        _unidade: input.unidade,
        _data: input.data,
        _mensagem: input.mensagem ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidar(qc),
  });
}

export type OpcoesReforco = {
  freelancers: { id: string; nome: string; hora_entrada: string | null }[];
  modalidade: string | null;
  valor_padrao: number;
  horas_padrao: number;
};

export function useOpcoesReforco(unidade: "Botafogo" | "Ipanema" | null) {
  return useQuery({
    queryKey: ["previsao_reforco_opcoes", unidade],
    enabled: !!unidade,
    queryFn: async (): Promise<OpcoesReforco> => {
      const { data, error } = await rpc("previsao_reforco_opcoes", { _unidade: unidade });
      if (error) throw new Error(error.message);
      const d = data as OpcoesReforco;
      return {
        ...d,
        freelancers: d?.freelancers ?? [],
        valor_padrao: Number(d?.valor_padrao ?? 150),
        horas_padrao: Number(d?.horas_padrao ?? 8),
      };
    },
  });
}

export function useLancarReforco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      unidade: "Botafogo" | "Ipanema";
      data: string;
      colaboradorId: string | null;
      novoNome: string | null;
      valor: number;
      horaEntrada: string | null;
      mensagem?: string;
    }) => {
      const { data, error } = await rpc("previsao_lancar_reforco", {
        _unidade: input.unidade,
        _data: input.data,
        _colaborador_id: input.colaboradorId,
        _novo_nome: input.novoNome,
        _valor: input.valor,
        _hora_entrada: input.horaEntrada,
        _mensagem: input.mensagem ?? null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      void invalidar(qc);
      for (const k of [
        "previsao_reforco_opcoes",
        "previsao-reforcos-chamados",
        "previsao-carga",
        "escala-dias",
        "financeiro",
      ])
        void qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

/** Gestor: exclui qualquer pedido ou lançamento e o plantão ligado a ele (se houver). */
export function useExcluirReforco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rpc("previsao_excluir_reforco", { _id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void invalidar(qc);
      for (const k of [
        "previsao-reforcos-chamados",
        "previsao-carga",
        "escala-dias",
        "financeiro",
        "plantoes-freelancer",
      ])
        void qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

export function useDecidirReforco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; autorizar: boolean; resposta?: string }) => {
      const { error } = await rpc("previsao_decidir_reforco", {
        _id: input.id,
        _autorizar: input.autorizar,
        _resposta: input.resposta ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidar(qc),
  });
}

export function useCancelarReforco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rpc("previsao_cancelar_reforco", { _id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidar(qc),
  });
}

/** Pedido antigo (fluxo de autorização) que vale para o dia (o mais recente). */
export function pedidoDoDia(pedidos: PedidoReforco[] | undefined, unidade: string, data: string) {
  return (
    (pedidos ?? []).find(
      (p) => p.unidade === unidade && p.data === data && p.status !== "lancado",
    ) ?? null
  );
}

/** Reforços lançados pela Recepção para o dia. */
export function lancadosDoDia(pedidos: PedidoReforco[] | undefined, unidade: string, data: string) {
  return (pedidos ?? []).filter(
    (p) => p.unidade === unidade && p.data === data && p.status === "lancado",
  );
}

export const STATUS_PEDIDO = {
  pendente: { txt: "Aguardando o gestor", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  autorizado: {
    txt: "Autorizado: chamar freelancer",
    cls: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  negado: { txt: "Não autorizado", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  lancado: { txt: "Reforço lançado", cls: "bg-teal-100 text-teal-900 border-teal-300" },
} as const;

// ------------------------------------------------------------ quem vê (gestor)
export type AcessoPrevisao = {
  user_id: string;
  nome: string;
  email: string | null;
  papeis: string[];
  gestor: boolean;
  ve: boolean;
  origem: "gestor" | "liberado" | "bloqueado" | "recepcao" | "equipe" | "sem_acesso";
};

export function useAcessosPrevisao(enabled = true) {
  return useQuery({
    queryKey: ["previsao_acessos"],
    enabled,
    queryFn: async (): Promise<AcessoPrevisao[]> => {
      const { data, error } = await rpc("previsao_acessos_listar");
      if (error) throw new Error(error.message);
      return (data ?? []) as AcessoPrevisao[];
    },
  });
}

export function useDefinirAcessoPrevisao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; liberado: boolean | null }) => {
      const { error } = await rpc("previsao_definir_acesso", {
        _user_id: input.userId,
        _liberado: input.liberado,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["previsao_acessos"] });
      void qc.invalidateQueries({ queryKey: ["permissao_previsao_carga"] });
    },
  });
}
