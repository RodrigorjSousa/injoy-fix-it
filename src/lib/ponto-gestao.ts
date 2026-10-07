// Banco de horas e atestados: acesso ao banco (Supabase) e hooks.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compression";
import type { PontoDiaRow } from "@/lib/ponto";
import {
  BANCO_INICIO_PADRAO,
  resumirBanco,
  type AjusteBanco,
  type ConfigBanco,
  type ModoBanco,
} from "@/lib/ponto-banco";

// Tabelas novas ainda não estão nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const PAGINA = 1000;

/** Lê todas as linhas da view ponto_dia no intervalo (o Supabase devolve no máximo 1000 por vez). */
async function lerPontoDia(inicio: string, fim: string): Promise<PontoDiaRow[]> {
  const todas: PontoDiaRow[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await db
      .from("ponto_dia")
      .select("*")
      .gte("data", inicio)
      .lte("data", fim)
      .order("data")
      .order("colaborador_id")
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    todas.push(...((data ?? []) as PontoDiaRow[]));
    if (!data || data.length < PAGINA) break;
  }
  return todas;
}

// ---------------------------------------------------------------- banco de horas
export function useBancoHoras(inicio: string, fim: string) {
  return useQuery({
    queryKey: ["ponto", "banco", inicio, fim],
    queryFn: async () => {
      const [{ data: cfgs, error: e1 }, { data: ajustes, error: e2 }] = await Promise.all([
        db.from("ponto_banco_config").select("colaborador_id, modo, inicio"),
        db
          .from("ponto_banco_ajustes")
          .select("id, colaborador_id, data, minutos, tipo, motivo, created_at")
          .lte("data", fim)
          .order("data"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const configs = (cfgs ?? []) as ConfigBanco[];
      const desde = [BANCO_INICIO_PADRAO, inicio, ...configs.map((c) => c.inicio)].sort()[0];
      const linhas = await lerPontoDia(desde, fim);
      return resumirBanco(linhas, (ajustes ?? []) as AjusteBanco[], configs, { inicio, fim });
    },
  });
}

export function useSalvarBancoConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { colaboradorId: string; modo: ModoBanco; inicio: string }) => {
      const { error } = await db.rpc("ponto_banco_salvar_config", {
        _colaborador_id: input.colaboradorId,
        _modo: input.modo,
        _inicio: input.inicio,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto", "banco"] }),
  });
}

export function useLancarAjusteBanco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      colaboradorId: string;
      data: string;
      minutos: number;
      tipo: AjusteBanco["tipo"];
      motivo: string;
    }) => {
      const { error } = await db.rpc("ponto_banco_lancar_ajuste", {
        _colaborador_id: input.colaboradorId,
        _data: input.data,
        _minutos: input.minutos,
        _tipo: input.tipo,
        _motivo: input.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto", "banco"] }),
  });
}

export function useExcluirAjusteBanco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("ponto_banco_excluir_ajuste", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto", "banco"] }),
  });
}

// ---------------------------------------------------------------- atestados
export type StatusAtestado = "pendente" | "aprovado" | "recusado" | "cancelado";

export type Atestado = {
  id: string;
  colaborador_id: string;
  data_inicio: string;
  data_fim: string;
  arquivo_path: string;
  arquivo_nome: string | null;
  observacao: string | null;
  status: StatusAtestado;
  enviado_em: string;
  revisado_em: string | null;
  resposta: string | null;
  dias_alterados: unknown[];
  escala_colaboradores?: { nome: string; setor: string } | null;
};

export const STATUS_ATESTADO_LABEL: Record<StatusAtestado, string> = {
  pendente: "Aguardando o gestor",
  aprovado: "Aprovado",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

export const COR_STATUS_ATESTADO: Record<StatusAtestado, string> = {
  pendente: "border-amber-400 text-amber-700",
  aprovado: "border-emerald-400 text-emerald-700",
  recusado: "border-rose-400 text-rose-700",
  cancelado: "border-slate-300 text-slate-500",
};

export const ARQUIVO_ATESTADO_MAX_MB = 10;
export const TIPOS_ATESTADO = "image/*,application/pdf";

export function useMeusAtestados() {
  return useQuery({
    queryKey: ["ponto", "atestados", "meus"],
    queryFn: async (): Promise<Atestado[]> => {
      const { data, error } = await db
        .from("ponto_atestados")
        .select("*")
        .order("data_inicio", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Atestado[];
    },
  });
}

export function useEnviarAtestado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      arquivo: File;
      dataInicio: string;
      dataFim: string;
      observacao: string;
    }) => {
      const original = input.arquivo;
      if (!original.type.startsWith("image/") && original.type !== "application/pdf")
        throw new Error("Envie uma foto ou um PDF do atestado.");
      const arquivo = await compressImage(original);
      if (arquivo.size > ARQUIVO_ATESTADO_MAX_MB * 1024 * 1024)
        throw new Error(`Arquivo maior que ${ARQUIVO_ATESTADO_MAX_MB} MB.`);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Faça login novamente.");
      const ext =
        arquivo.type === "application/pdf"
          ? "pdf"
          : (arquivo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") ||
            "jpg";
      const path = `${auth.user.id}/atestados/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const up = await supabase.storage
        .from("ponto")
        .upload(path, arquivo, { contentType: arquivo.type || undefined, upsert: false });
      if (up.error) throw new Error(`Não foi possível enviar o arquivo: ${up.error.message}`);
      const { error } = await db.rpc("ponto_enviar_atestado", {
        _data_inicio: input.dataInicio,
        _data_fim: input.dataFim,
        _arquivo_path: path,
        _arquivo_nome: original.name,
        _observacao: input.observacao,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto", "atestados"] }),
  });
}

export function useAtestadosGestor() {
  return useQuery({
    queryKey: ["ponto", "atestados", "gestor"],
    queryFn: async (): Promise<Atestado[]> => {
      const { data, error } = await db
        .from("ponto_atestados")
        .select("*, escala_colaboradores(nome, setor)")
        .order("enviado_em", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data ?? []) as Atestado[];
    },
  });
}

const invalidarAtestados = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["ponto"] });
  qc.invalidateQueries({ queryKey: ["escala-dias"] });
};

export function useRevisarAtestado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; aprovar: boolean; resposta: string }) => {
      const { data, error } = await db.rpc("ponto_revisar_atestado", {
        _id: input.id,
        _aprovar: input.aprovar,
        _resposta: input.resposta,
      });
      if (error) throw error;
      return data as { status: string; dias_alterados: number };
    },
    onSuccess: () => invalidarAtestados(qc),
  });
}

export function useCancelarAtestado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; motivo: string }) => {
      const { data, error } = await db.rpc("ponto_cancelar_atestado", {
        _id: input.id,
        _motivo: input.motivo,
      });
      if (error) throw error;
      return data as { dias_restaurados: number };
    },
    onSuccess: () => invalidarAtestados(qc),
  });
}

/** Link temporário (10 min) para abrir um arquivo do bucket privado do ponto. */
export async function urlArquivoPonto(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("ponto").createSignedUrl(path, 600);
  if (error || !data?.signedUrl)
    throw new Error(error?.message ?? "Não foi possível abrir o arquivo");
  return data.signedUrl;
}
