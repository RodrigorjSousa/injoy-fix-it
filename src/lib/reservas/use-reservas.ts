// Dados da tela Reservas (cobrança). Quem vê é decidido pelo banco: public.minha_permissao_reservas().
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import { atualizarCobrancasAgora } from "./cobranca.functions";
import {
  aguardandoAutenticacaoFn,
  cancelarLinkFn,
  cobrarAgoraFn,
  enviarLinkFn,
  pagamentoNoCheckinFn,
  prepararCobranca,
  relancarNoCloudbedsFn,
  verificarLinkFn,
} from "./cobranca-stripe.functions";
import type { Cobrado, Exclusao, MotivoCobranca, MotivoSaida } from "./cobranca";

export type LinhaCobranca = {
  id: string;
  unidade: Unidade;
  reservation_id: string;
  property_id: string | null;
  hospede: string;
  data_reserva: string | null;
  checkin: string | null;
  checkout: string | null;
  plano: string | null;
  origem: string | null;
  saldo: number;
  status_cloudbeds: string | null;
  motivo: MotivoCobranca | null;
  ativa: boolean;
  entrou_em: string;
  saiu_em: string | null;
  motivo_saida: MotivoSaida | null;
  cobrado: Cobrado | null;
  observacao: string | null;
  marcado_nome: string | null;
  marcado_em: string | null;
  /** Situação do cartão no Stripe (selo): ok | sem_cartao | sem_cliente. */
  stripe_situacao?: "ok" | "sem_cartao" | "sem_cliente" | null;
  stripe_conferido_em?: string | null;
};

export type SyncCobranca = {
  unidade: Unidade;
  ultima_tentativa: string | null;
  ultima_ok: string | null;
  erro: string | null;
  consultadas: number | null;
};

export type HistoricoCobranca = {
  id: string;
  registrado_em: string;
  unidade: Unidade;
  reservation_id: string;
  hospede: string;
  saldo: number;
  motivo: MotivoCobranca | null;
};

export type ConferenciaCobranca = {
  unidade: Unidade;
  reservation_id: string;
  hospede: string | null;
  status_cloudbeds: string | null;
  data_reserva: string | null;
  checkin: string | null;
  origem: string | null;
  planos: string | null;
  nr: boolean;
  saldo: number;
  motivo: MotivoCobranca | null;
  exclusao: Exclusao | null;
  entra_em: string | null;
};

export type AcessoReservas = {
  user_id: string;
  nome: string;
  email: string;
  papeis: string[];
  gestor: boolean;
  ve: boolean;
  origem: "gestor" | "liberado" | "bloqueado" | "equipe" | "sem_acesso";
};

type Rpc = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc: Rpc = (fn, args) => (supabase.rpc as unknown as Rpc)(fn, args);
const tabela = (nome: string) => supabase.from(nome as never);
const erroDe = (e: unknown) => new Error((e as { message?: string })?.message ?? "Falha ao consultar o banco.");

export type PermissaoReservas = { ve: boolean; gestor: boolean };

export async function buscarPermissaoReservas(): Promise<PermissaoReservas> {
  const { data, error } = await rpc("minha_permissao_reservas");
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<PermissaoReservas>;
  return { ve: d.ve === true, gestor: d.gestor === true };
}

export function usePermissaoReservas() {
  return useQuery({
    queryKey: ["permissao_reservas"],
    queryFn: buscarPermissaoReservas,
    staleTime: 60_000,
    retry: 1,
  });
}

/** Lista da unidade (ativas + as que saíram nos últimos 2 dias), ao vivo. */
export function useListaCobranca(unidade: Unidade) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`reservas-cobranca-${unidade}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservas_cobranca", filter: `unidade=eq.${unidade}` },
        () => void qc.invalidateQueries({ queryKey: ["reservas_cobranca", unidade] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc, unidade]);
  return useQuery({
    queryKey: ["reservas_cobranca", unidade],
    queryFn: async (): Promise<LinhaCobranca[]> => {
      const desde = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const { data, error } = await tabela("reservas_cobranca")
        .select("*")
        .eq("unidade", unidade)
        .or(`ativa.eq.true,saiu_em.gte.${desde}`);
      if (error) throw erroDe(error);
      return ((data ?? []) as unknown as LinhaCobranca[]).map((l) => ({ ...l, saldo: Number(l.saldo) }));
    },
    refetchInterval: 5 * 60_000,
  });
}

export function useSyncCobranca(unidade: Unidade) {
  return useQuery({
    queryKey: ["reservas_cobranca_sync", unidade],
    queryFn: async (): Promise<SyncCobranca | null> => {
      const { data, error } = await tabela("reservas_cobranca_sync").select("*").eq("unidade", unidade).maybeSingle();
      if (error) throw erroDe(error);
      return (data as unknown as SyncCobranca) ?? null;
    },
    refetchInterval: 60_000,
  });
}

export function useAtualizarAgora(unidade: Unidade) {
  const qc = useQueryClient();
  const fn = useServerFn(atualizarCobrancasAgora);
  return useMutation({
    mutationFn: () => fn({ data: { unidade } }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["reservas_cobranca", unidade] });
      void qc.invalidateQueries({ queryKey: ["reservas_cobranca_sync", unidade] });
    },
  });
}

export function useMarcarCobranca(unidade: Unidade) {
  const qc = useQueryClient();
  const chave = ["reservas_cobranca", unidade];
  return useMutation({
    mutationFn: async (input: { id: string; cobrado: Cobrado | null; observacao: string | null }) => {
      const { error } = await rpc("reservas_cobranca_marcar", {
        _id: input.id,
        _cobrado: input.cobrado,
        _observacao: input.observacao,
      });
      if (error) throw new Error(error.message);
    },
    // Mostra na hora; volta atrás se o banco recusar.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: chave });
      const antes = qc.getQueryData<LinhaCobranca[]>(chave);
      qc.setQueryData<LinhaCobranca[]>(chave, (lista) =>
        (lista ?? []).map((l) => (l.id === input.id ? { ...l, cobrado: input.cobrado, observacao: input.observacao } : l)),
      );
      return { antes };
    },
    onError: (_e, _i, ctx) => {
      if (ctx?.antes) qc.setQueryData(chave, ctx.antes);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: chave }),
  });
}

export function useHistoricoCobranca(unidade: Unidade, ativo: boolean) {
  return useQuery({
    queryKey: ["reservas_cobranca_historico", unidade],
    enabled: ativo,
    queryFn: async (): Promise<HistoricoCobranca[]> => {
      const { data, error } = await tabela("reservas_cobranca_historico")
        .select("id, registrado_em, unidade, reservation_id, hospede, saldo, motivo")
        .eq("unidade", unidade)
        .order("registrado_em", { ascending: false })
        .limit(300);
      if (error) throw erroDe(error);
      return ((data ?? []) as unknown as HistoricoCobranca[]).map((h) => ({ ...h, saldo: Number(h.saldo) }));
    },
  });
}

export function useConferenciaCobranca(unidade: Unidade, ativo: boolean) {
  return useQuery({
    queryKey: ["reservas_cobranca_conferencia", unidade],
    enabled: ativo,
    queryFn: async (): Promise<ConferenciaCobranca[]> => {
      const { data, error } = await tabela("reservas_cobranca_conferencia")
        .select("*")
        .eq("unidade", unidade)
        .order("checkin", { ascending: true });
      if (error) throw erroDe(error);
      return ((data ?? []) as unknown as ConferenciaCobranca[]).map((c) => ({ ...c, saldo: Number(c.saldo) }));
    },
  });
}

// ------------------------------------------------------------------ cobrança pelo Stripe

export type TentativaCobranca = {
  id: string;
  unidade: Unidade;
  reservation_id: string;
  tipo: "cobranca" | "link" | "checkin";
  status:
    | "processando"
    | "aprovado"
    | "autenticacao"
    | "recusado"
    | "erro"
    | "link_enviado"
    | "link_pago"
    | "link_cancelado"
    | "registrado";
  modo: "teste" | "real";
  valor: number | null;
  cartao: string | null;
  link_url: string | null;
  email_destino: string | null;
  cloudbeds_pagamento: string | null;
  cloudbeds_nota: string | null;
  mensagem: string | null;
  usuario_nome: string | null;
  criado_em: string;
};

/** Tentativas de cobrança da unidade (últimos 60 dias), ao vivo. Chave: nº da reserva → mais recente primeiro. */
export function useTentativasCobranca(unidade: Unidade) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`reservas-tentativas-${unidade}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservas_cobranca_pagamentos", filter: `unidade=eq.${unidade}` },
        () => void qc.invalidateQueries({ queryKey: ["reservas_tentativas", unidade] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc, unidade]);
  return useQuery({
    queryKey: ["reservas_tentativas", unidade],
    queryFn: async (): Promise<Map<string, TentativaCobranca[]>> => {
      const desde = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const { data, error } = await tabela("reservas_cobranca_pagamentos")
        .select("*")
        .eq("unidade", unidade)
        .gte("criado_em", desde)
        .order("criado_em", { ascending: false })
        .limit(1000);
      if (error) throw erroDe(error);
      const mapa = new Map<string, TentativaCobranca[]>();
      for (const t of (data ?? []) as unknown as TentativaCobranca[]) {
        const l = mapa.get(t.reservation_id) ?? [];
        l.push({ ...t, valor: t.valor === null ? null : Number(t.valor) });
        mapa.set(t.reservation_id, l);
      }
      return mapa;
    },
  });
}

function useAcaoCobranca<I, O>(unidade: Unidade, fn: (input: { data: I }) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: I) => fn({ data: input }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["reservas_cobranca", unidade] });
      void qc.invalidateQueries({ queryKey: ["reservas_tentativas", unidade] });
    },
  });
}

export const usePrepararCobranca = () => {
  const fn = useServerFn(prepararCobranca);
  return useMutation({ mutationFn: (linhaId: string) => fn({ data: { linhaId } }) });
};
export const useCobrarAgora = (unidade: Unidade) => useAcaoCobranca(unidade, useServerFn(cobrarAgoraFn));
export const useEnviarLink = (unidade: Unidade) => useAcaoCobranca(unidade, useServerFn(enviarLinkFn));
export const usePagamentoNoCheckin = (unidade: Unidade) => useAcaoCobranca(unidade, useServerFn(pagamentoNoCheckinFn));
export const useAguardandoAutenticacao = (unidade: Unidade) => useAcaoCobranca(unidade, useServerFn(aguardandoAutenticacaoFn));
export const useVerificarLink = (unidade: Unidade) => useAcaoCobranca(unidade, useServerFn(verificarLinkFn));
export const useCancelarLink = (unidade: Unidade) => useAcaoCobranca(unidade, useServerFn(cancelarLinkFn));
export const useRelancarNoCloudbeds = (unidade: Unidade) => useAcaoCobranca(unidade, useServerFn(relancarNoCloudbedsFn));

// ------------------------------------------------------------------ botão "Reservas" piscando

export type NovidadesReservas = Record<MotivoCobranca, number>;
const SEM_NOVIDADES: NovidadesReservas = { nr_checkin_proximo: 0, nr_8o_dia: 0, standard: 0 };

/**
 * Reservas que entraram na lista desde a última vez que a pessoa abriu a tela (as duas unidades),
 * por modalidade. Atualiza sozinho quando a lista muda e a cada minuto.
 */
export function useNovidadesReservas(ativo: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!ativo) return;
    const ch = supabase
      .channel(`reservas-novidades-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas_cobranca" }, () =>
        void qc.invalidateQueries({ queryKey: ["reservas_novidades"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc, ativo]);
  return useQuery({
    queryKey: ["reservas_novidades"],
    enabled: ativo,
    queryFn: async (): Promise<NovidadesReservas> => {
      const { data, error } = await rpc("reservas_novidades");
      if (error) throw new Error(error.message);
      const d = (data ?? {}) as Partial<NovidadesReservas>;
      return {
        nr_checkin_proximo: Number(d.nr_checkin_proximo ?? 0),
        nr_8o_dia: Number(d.nr_8o_dia ?? 0),
        standard: Number(d.standard ?? 0),
      };
    },
    refetchInterval: 60_000,
    retry: 1,
  });
}

/** Abriu a tela Reservas: o botão para de piscar (em todos os aparelhos da pessoa). */
export function useMarcarReservasVistas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await rpc("reservas_marcar_vistas");
      if (error) throw new Error(error.message);
    },
    onMutate: () => {
      qc.setQueryData(["reservas_novidades"], SEM_NOVIDADES);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["reservas_novidades"] }),
  });
}

export function useAcessosReservas(ativo: boolean) {
  return useQuery({
    queryKey: ["reservas_acessos"],
    enabled: ativo,
    queryFn: async (): Promise<AcessoReservas[]> => {
      const { data, error } = await rpc("reservas_acessos_listar");
      if (error) throw new Error(error.message);
      return (data ?? []) as AcessoReservas[];
    },
  });
}

export function useDefinirAcessoReservas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; liberado: boolean | null }) => {
      const { error } = await rpc("reservas_definir_acesso", { _user_id: input.userId, _liberado: input.liberado });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reservas_acessos"] });
      void qc.invalidateQueries({ queryKey: ["permissao_reservas"] });
    },
  });
}
