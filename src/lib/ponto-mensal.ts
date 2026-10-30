// Pedidos do funcionário, espelho com ciência e fechamento do mês (migração 0088).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PontoDiaRow, TipoBatida } from "@/lib/ponto";
import {
  resumirBanco,
  type Abono,
  type AjusteBanco,
  type ConfigBanco,
  type ResumoPessoa,
} from "@/lib/ponto-banco";

// Tabelas e funções novas ainda não estão nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const fimDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes}-${String(ultimo).padStart(2, "0")}`;
};
export const mesAnterior = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};
export const mesBR = (mes: string) => mes.slice(0, 7).split("-").reverse().join("/");

// ---------------------------------------------------------------- pedidos
export type TipoSolicitacao = "esqueci_batida" | "justificativa";
export type StatusSolicitacao = "pendente" | "aprovada" | "recusada";

export type Solicitacao = {
  id: string;
  colaborador_id: string;
  tipo: TipoSolicitacao;
  data: string;
  tipo_batida: TipoBatida | null;
  horario: string | null;
  unidade: "Botafogo" | "Ipanema" | null;
  pede_abono: boolean;
  motivo: string;
  status: StatusSolicitacao;
  abonado: boolean;
  enviado_em: string;
  revisado_em: string | null;
  resposta: string | null;
  escala_colaboradores?: { nome: string; setor: string } | null;
};

export const TIPO_SOLICITACAO_LABEL: Record<TipoSolicitacao, string> = {
  esqueci_batida: "Esqueci de bater",
  justificativa: "Justificativa",
};
export const STATUS_SOLICITACAO_LABEL: Record<StatusSolicitacao, string> = {
  pendente: "Aguardando o gestor",
  aprovada: "Aprovado",
  recusada: "Recusado",
};
export const COR_STATUS_SOLICITACAO: Record<StatusSolicitacao, string> = {
  pendente: "border-amber-400 text-amber-700",
  aprovada: "border-emerald-400 text-emerald-700",
  recusada: "border-rose-400 text-rose-700",
};

export function useMinhasSolicitacoes() {
  return useQuery({
    queryKey: ["ponto", "solicitacoes", "minhas"],
    queryFn: async (): Promise<Solicitacao[]> => {
      const { data, error } = await db
        .from("ponto_solicitacoes")
        .select("*")
        .order("enviado_em", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Solicitacao[];
    },
  });
}

export function useSolicitar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tipo: TipoSolicitacao;
      data: string;
      tipoBatida: TipoBatida | null;
      hora: string | null;
      motivo: string;
      pedeAbono: boolean;
    }) => {
      const { error } = await db.rpc("ponto_solicitar", {
        _tipo: input.tipo,
        _data: input.data,
        _tipo_batida: input.tipoBatida,
        _hora: input.hora,
        _motivo: input.motivo,
        _pede_abono: input.pedeAbono,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto", "solicitacoes"] }),
  });
}

export function useSolicitacoesGestor() {
  return useQuery({
    queryKey: ["ponto", "solicitacoes", "gestor"],
    queryFn: async (): Promise<Solicitacao[]> => {
      const { data, error } = await db
        .from("ponto_solicitacoes")
        .select("*, escala_colaboradores(nome, setor)")
        .order("enviado_em", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Solicitacao[];
    },
  });
}

export function useRevisarSolicitacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      aprovar: boolean;
      resposta: string;
      abonar?: boolean | null;
      unidade?: string | null;
      horario?: string | null;
    }) => {
      const { data, error } = await db.rpc("ponto_revisar_solicitacao", {
        _id: input.id,
        _aprovar: input.aprovar,
        _resposta: input.resposta,
        _abonar: input.abonar ?? null,
        _unidade: input.unidade ?? null,
        _horario: input.horario ?? null,
      });
      if (error) throw error;
      return data as { status: string; batida_id: string | null; abonado: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto"] }),
  });
}

// ---------------------------------------------------------------- espelho
export type MeuEspelho = {
  vinculado: boolean;
  colaborador?: { id: string; nome: string; setor: string; vinculo: string };
  resumo?: ResumoPessoa | null;
  ciencia?: { ciente_em: string; comentario: string | null } | null;
  fechado?: boolean;
  bancoSeAplica?: boolean;
};

export function useMeuEspelho(mes: string) {
  return useQuery({
    queryKey: ["ponto", "espelho", mes],
    queryFn: async (): Promise<MeuEspelho> => {
      const inicio = `${mes}-01`;
      const fim = fimDoMes(mes);
      const { data, error } = await db.rpc("ponto_meu_espelho", { _inicio: inicio, _fim: fim });
      if (error) throw error;
      if (!data?.vinculado) return { vinculado: false };
      const colab = data.colaborador as NonNullable<MeuEspelho["colaborador"]>;
      const bancoSeAplica = colab.vinculo === "fixo";
      // Freelancer: mostra os dias, mas sem banco de horas (pago por plantão).
      const linhas = ((data.linhas ?? []) as PontoDiaRow[]).map((l) => ({ ...l, vinculo: "fixo" }));
      const [resumo] = resumirBanco(
        linhas,
        bancoSeAplica ? ((data.ajustes ?? []) as AjusteBanco[]) : [],
        data.config ? [data.config as ConfigBanco] : [],
        { inicio, fim },
        (data.abonos ?? []) as Abono[],
      );
      return {
        vinculado: true,
        colaborador: colab,
        resumo: resumo ?? null,
        ciencia: data.ciencia ?? null,
        fechado: !!data.fechado,
        bancoSeAplica,
      };
    },
  });
}

export function useDarCiencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      mes: string;
      totais: Record<string, unknown>;
      comentario: string;
    }) => {
      const { error } = await db.rpc("ponto_dar_ciencia", {
        _competencia: `${input.mes}-01`,
        _totais: input.totais,
        _comentario: input.comentario,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto", "espelho"] }),
  });
}

// ---------------------------------------------------------------- fechamento
export type LogFechamento = {
  id: string;
  competencia: string;
  acao: "fechou" | "reabriu";
  motivo: string | null;
  feito_em: string;
};

export function usePendenciasDoMes(mes: string) {
  return useQuery({
    queryKey: ["ponto", "fechamento", "pendencias", mes],
    queryFn: async () => {
      const inicio = `${mes}-01`;
      const fim = fimDoMes(mes);
      const conta = async (q: Promise<{ count: number | null; error: unknown }>) => {
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
      };
      const [batidas, pedidos, atestados, log] = await Promise.all([
        conta(
          db
            .from("ponto_batidas")
            .select("id", { count: "exact", head: true })
            .eq("status", "pendente")
            .gte("data_ref", inicio)
            .lte("data_ref", fim),
        ),
        conta(
          db
            .from("ponto_solicitacoes")
            .select("id", { count: "exact", head: true })
            .eq("status", "pendente")
            .gte("data", inicio)
            .lte("data", fim),
        ),
        conta(
          db
            .from("ponto_atestados")
            .select("id", { count: "exact", head: true })
            .eq("status", "pendente")
            .lte("data_inicio", fim)
            .gte("data_fim", inicio),
        ),
        db
          .from("ponto_fechamentos_log")
          .select("id, competencia, acao, motivo, feito_em")
          .eq("competencia", inicio)
          .order("feito_em", { ascending: false }),
      ]);
      if (log.error) throw log.error;
      return { batidas, pedidos, atestados, log: (log.data ?? []) as LogFechamento[] };
    },
  });
}

export function useFecharMes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { mes: string; resumo: unknown }) => {
      const { error } = await db.rpc("ponto_fechar_mes", {
        _competencia: `${input.mes}-01`,
        _resumo: input.resumo,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto"] }),
  });
}

export function useReabrirMes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { mes: string; motivo: string }) => {
      const { error } = await db.rpc("ponto_reabrir_mes", {
        _competencia: `${input.mes}-01`,
        _motivo: input.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto"] }),
  });
}
