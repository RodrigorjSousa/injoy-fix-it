// Escala vista pela Recepção: só leitura + incluir/remover freelancer. O banco decide quem pode
// (public.minha_permissao_escala_recepcao) e a Recepção nunca vê valores, nem publica ou gera o mês.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc: Rpc = (fn, args) => (supabase.rpc as unknown as Rpc)(fn, args);

export type Unidade = "Botafogo" | "Ipanema";
export type RecColab = { id: string; nome: string; setor: "recepcao" | "camareiras" | "manutencao"; unidade: string; vinculo: "fixo" | "freelance"; turno_padrao: string | null; ativo: boolean; hora_entrada: string | null };
export type RecDia = { id: string; colaborador_id: string; unidade: Unidade; setor: RecColab["setor"]; data: string; turno: string; hora_entrada: string | null; hora_saida: string | null; status: string; extra: boolean; removivel: boolean };
export type RecPainel = { colaboradores: RecColab[]; dias: RecDia[] };
export type RecOpcoes = { freelancers: { id: string; nome: string; setor: RecColab["setor"]; hora_entrada: string | null }[]; modalidades: { id: string; nome: string; horas: number; motivo: string }[] };

export async function buscarPermissaoEscalaRecepcao(): Promise<boolean> {
  const { data, error } = await rpc("minha_permissao_escala_recepcao");
  if (error) throw new Error(error.message);
  return data === true;
}
export function usePermissaoEscalaRecepcao() {
  return useQuery({ queryKey: ["permissao_escala_recepcao"], queryFn: buscarPermissaoEscalaRecepcao, staleTime: 60_000, retry: 1 });
}
export function usePainelEscalaRecepcao(inicio: string, fim: string) {
  return useQuery({
    queryKey: ["escala-recepcao-painel", inicio, fim],
    queryFn: async (): Promise<RecPainel> => {
      const { data, error } = await rpc("escala_recepcao_painel", { _inicio: inicio, _fim: fim });
      if (error) throw new Error(error.message);
      return data as RecPainel;
    },
    refetchInterval: 60_000,
  });
}
export function useOpcoesEscalaRecepcao(unidade: Unidade) {
  return useQuery({
    queryKey: ["escala-recepcao-opcoes", unidade],
    queryFn: async (): Promise<RecOpcoes> => {
      const { data, error } = await rpc("escala_recepcao_opcoes", { _unidade: unidade });
      if (error) throw new Error(error.message);
      return data as RecOpcoes;
    },
  });
}
export function useLancarFreelancerRecepcao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { unidade: Unidade; data: string; colaboradorId: string; modalidadeId: string; horaEntrada?: string | null; mensagem?: string | null }) => {
      const { error } = await rpc("escala_recepcao_lancar", { _unidade: a.unidade, _data: a.data, _colaborador_id: a.colaboradorId, _modalidade_id: a.modalidadeId, _hora_entrada: a.horaEntrada || null, _substitui: null, _mensagem: a.mensagem || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["escala-recepcao-painel"] }); void qc.invalidateQueries({ queryKey: ["escala-dias"] }); },
  });
}
export function useRemoverFreelancerRecepcao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (diaId: string) => {
      const { error } = await rpc("escala_recepcao_remover", { _dia_id: diaId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["escala-recepcao-painel"] }); void qc.invalidateQueries({ queryKey: ["escala-dias"] }); },
  });
}
