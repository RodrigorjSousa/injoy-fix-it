import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todaySP } from "@/lib/tz";

export type PontoUnidade = "Botafogo" | "Ipanema";
export type PontoStatusBatida = "valida" | "pendente" | "aprovada" | "recusada";

export const CONSENTIMENTO_VERSAO = "2026-10-v1";
export const CONSENTIMENTO_TEXTO =
  "Autorizo a IN.JOY Hostel Design Pousada a cadastrar e usar um modelo numérico do meu rosto (dado biométrico) " +
  "exclusivamente para registrar minhas entradas e saídas no aplicativo interno de ponto, junto com a localização " +
  "e uma foto no momento de cada batida. Esses dados ficam restritos à gestão, não substituem o ponto oficial e " +
  "podem ser apagados a meu pedido a qualquer momento (LGPD, art. 11).";

export const MOTIVO_LABEL: Record<string, string> = {
  sem_cadastro_facial: "Sem cadastro facial",
  rosto_nao_detectado: "Rosto não detectado",
  rosto_nao_confere: "Rosto não confere",
  prova_de_vida_falhou: "Prova de vida falhou",
  sem_localizacao: "Sem localização",
  fora_da_unidade: "Fora da unidade",
  aparelho_diferente: "Aparelho diferente",
  lancamento_manual: "Lançamento manual",
};

export type RegistroResultado = {
  id: string;
  tipo: "entrada" | "saida";
  status: PontoStatusBatida;
  motivos: string[];
  registrado_em: string;
  unidade: PontoUnidade;
  nome: string;
};

export type MeuStatus = {
  vinculado: boolean;
  colaborador_id?: string;
  nome?: string;
  habilitado?: boolean;
  cadastro_facial?: boolean;
  aparelho_vinculado?: string | null;
  escala_hoje?:
    | {
        unidade: string;
        turno: string;
        status: string;
        hora_entrada: string | null;
        hora_saida: string | null;
      }[]
    | null;
  batidas_recentes?:
    | {
        id: string;
        tipo: "entrada" | "saida";
        registrado_em: string;
        status: PontoStatusBatida;
        motivos: string[];
        unidade: string;
      }[]
    | null;
};

export type BatidaGestor = {
  id: string;
  colaborador_id: string;
  unidade: PontoUnidade;
  tipo: "entrada" | "saida";
  registrado_em: string;
  data_ref: string;
  origem: "app" | "quiosque" | "manual";
  distancia_m: number | null;
  precisao_m: number | null;
  dentro_raio: boolean | null;
  face_distancia: number | null;
  face_ok: boolean | null;
  vivacidade_ok: boolean | null;
  device_ok: boolean | null;
  selfie_path: string | null;
  status: PontoStatusBatida;
  motivos: string[];
  observacao: string | null;
  escala_colaboradores?: { nome: string; vinculo: string } | null;
};

export type PontoDiaRow = {
  colaborador_id: string;
  nome: string;
  vinculo: string;
  setor: string;
  data: string;
  unidade: string | null;
  status_escala: string | null;
  turno: string | null;
  entrada_prevista: string | null;
  saida_prevista: string | null;
  entrada_real: string | null;
  saida_real: string | null;
  minutos_trabalhados: number | null;
  minutos_previstos: number | null;
  atraso_min: number;
  saida_antecipada_min: number;
  apos_horario_min: number;
  falta_sem_registro: boolean;
  trabalhou_fora_da_escala: boolean;
  sem_saida: boolean;
  feriado: boolean;
  batidas_pendentes: number;
  tem_lancamento_manual: boolean;
};

export type PontoConfig = {
  unidade: PontoUnidade;
  latitude: number | null;
  longitude: number | null;
  raio_m: number;
  tolerancia_min: number;
  limiar_face: number;
};

// O cliente tipado ainda não conhece as novas tabelas/funções até a regeneração
// dos tipos; este atalho mantém o restante do código com tipos próprios.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useMeuStatusPonto() {
  return useQuery({
    queryKey: ["ponto", "meu-status"],
    queryFn: async (): Promise<MeuStatus> => {
      const { data, error } = await db.rpc("ponto_meu_status");
      if (error) throw error;
      return (data ?? { vinculado: false }) as MeuStatus;
    },
  });
}

export async function enviarSelfie(blob: Blob | null): Promise<string | null> {
  if (!blob) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const path = `${auth.user.id}/${todaySP()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage
    .from("ponto")
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) {
    console.warn("[ponto] selfie não enviada", error.message);
    return null;
  }
  return path;
}

export type RegistrarInput = {
  descritor: number[] | null;
  latitude: number | null;
  longitude: number | null;
  precisao: number | null;
  vivacidade: boolean;
  deviceId: string;
  selfiePath: string | null;
  modo?: "app" | "quiosque";
  colaboradorId?: string | null;
};

export function useRegistrarPonto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistrarInput): Promise<RegistroResultado> => {
      const { data, error } = await db.rpc("ponto_registrar", {
        _descritor: input.descritor,
        _latitude: input.latitude,
        _longitude: input.longitude,
        _precisao_m: input.precisao,
        _vivacidade_ok: input.vivacidade,
        _device_id: input.deviceId,
        _selfie_path: input.selfiePath,
        _modo: input.modo ?? "app",
        _colaborador_id: input.colaboradorId ?? null,
      });
      if (error) throw error;
      return data as RegistroResultado;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto"] }),
  });
}

export type PessoaQuiosque = {
  colaborador_id: string;
  nome: string;
  vinculo: "fixo" | "freelance";
  setor: string;
  cadastro_facial: boolean;
  entrada_aberta: boolean;
};

/** Todas as pessoas habilitadas (fixos e freelancers) para o ponto na recepção. */
export function useListaQuiosque(unidade: PontoUnidade, enabled: boolean) {
  return useQuery({
    queryKey: ["ponto", "quiosque", unidade],
    enabled,
    queryFn: async (): Promise<PessoaQuiosque[]> => {
      const { data, error } = await db.rpc("ponto_quiosque_lista", { _unidade: unidade });
      if (error) throw error;
      return (data ?? []) as PessoaQuiosque[];
    },
  });
}

// ---------------------------------------------------------------- gestor
export function useBatidas(params: { inicio: string; fim: string; somentePendentes?: boolean }) {
  return useQuery({
    queryKey: ["ponto", "batidas", params],
    queryFn: async (): Promise<BatidaGestor[]> => {
      let q = db
        .from("ponto_batidas")
        .select("*, escala_colaboradores(nome, vinculo)")
        .gte("data_ref", params.inicio)
        .lte("data_ref", params.fim)
        .order("registrado_em", { ascending: false });
      if (params.somentePendentes) q = q.eq("status", "pendente");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BatidaGestor[];
    },
  });
}

export function usePendenciasPonto() {
  return useQuery({
    queryKey: ["ponto", "pendencias"],
    queryFn: async (): Promise<BatidaGestor[]> => {
      const { data, error } = await db
        .from("ponto_batidas")
        .select("*, escala_colaboradores(nome, vinculo)")
        .eq("status", "pendente")
        .order("registrado_em", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as BatidaGestor[];
    },
  });
}

export function usePontoDia(inicio: string, fim: string) {
  return useQuery({
    queryKey: ["ponto", "dia", inicio, fim],
    queryFn: async (): Promise<PontoDiaRow[]> => {
      const { data, error } = await db
        .from("ponto_dia")
        .select("*")
        .gte("data", inicio)
        .lte("data", fim)
        .order("data", { ascending: false })
        .order("nome");
      if (error) throw error;
      return (data ?? []) as PontoDiaRow[];
    },
  });
}

export async function urlSelfie(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("ponto").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export function useRevisarBatida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; aprovar: boolean; observacao?: string }) => {
      const { error } = await db.rpc("ponto_revisar", {
        _batida_id: input.id,
        _aprovar: input.aprovar,
        _observacao: input.observacao ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto"] }),
  });
}

export function useLancarManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      colaboradorId: string;
      tipo: "entrada" | "saida";
      registradoEm: string;
      unidade: PontoUnidade;
      motivo: string;
    }) => {
      const { error } = await db.rpc("ponto_lancar_manual", {
        _colaborador_id: input.colaboradorId,
        _tipo: input.tipo,
        _registrado_em: input.registradoEm,
        _unidade: input.unidade,
        _motivo: input.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto"] }),
  });
}

export function useColaboradoresPonto() {
  return useQuery({
    queryKey: ["ponto", "colaboradores"],
    queryFn: async () => {
      const [{ data: colabs, error: e1 }, { data: bios, error: e2 }] = await Promise.all([
        db
          .from("escala_colaboradores")
          .select("id, nome, setor, unidade, vinculo, funcionario_id, ativo, ponto_habilitado")
          .eq("ativo", true)
          .eq("ponto_habilitado", true)
          .order("nome"),
        db
          .from("ponto_biometria")
          .select("colaborador_id, device_id, consentimento_em, updated_at"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const bioMap = new Map<
        string,
        { device_id: string | null; consentimento_em: string; updated_at: string }
      >(
        (bios ?? []).map(
          (b: {
            colaborador_id: string;
            device_id: string | null;
            consentimento_em: string;
            updated_at: string;
          }) => [b.colaborador_id, b],
        ),
      );
      return (
        (colabs ?? []) as {
          id: string;
          nome: string;
          setor: string;
          unidade: string;
          vinculo: string;
          funcionario_id: string | null;
        }[]
      ).map((c) => ({
        ...c,
        biometria: bioMap.get(c.id) ?? null,
      }));
    },
  });
}

export function useCadastrarBiometria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      colaboradorId: string;
      descritores: number[][];
      deviceId: string | null;
      consentimento: boolean;
    }) => {
      const { error } = await db.rpc("ponto_cadastrar_biometria", {
        _colaborador_id: input.colaboradorId,
        _descritores: input.descritores,
        _device_id: input.deviceId,
        _consentimento: input.consentimento,
        _consentimento_versao: CONSENTIMENTO_VERSAO,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto"] }),
  });
}

export function useRemoverBiometria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (colaboradorId: string) => {
      const { error } = await db
        .from("ponto_biometria")
        .delete()
        .eq("colaborador_id", colaboradorId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto"] }),
  });
}

export function useVincularAparelho() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { colaboradorId: string; deviceId: string | null }) => {
      const { error } = await db.rpc("ponto_vincular_aparelho", {
        _colaborador_id: input.colaboradorId,
        _device_id: input.deviceId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto"] }),
  });
}

export function usePontoConfig() {
  return useQuery({
    queryKey: ["ponto", "config"],
    queryFn: async (): Promise<PontoConfig[]> => {
      const { data, error } = await db.from("ponto_config").select("*").order("unidade");
      if (error) throw error;
      return (data ?? []) as PontoConfig[];
    },
  });
}

export function useSalvarPontoConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: PontoConfig) => {
      const { error } = await db
        .from("ponto_config")
        .update({
          latitude: row.latitude,
          longitude: row.longitude,
          raio_m: row.raio_m,
          tolerancia_min: row.tolerancia_min,
          limiar_face: row.limiar_face,
        })
        .eq("unidade", row.unidade);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto", "config"] }),
  });
}

export const horaSP = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";
export const dataBR = (d: string | null | undefined) =>
  d ? d.slice(0, 10).split("-").reverse().join("/") : "—";
export const minutosParaHoras = (m: number | null | undefined) => {
  if (m == null) return "—";
  const sinal = m < 0 ? "-" : "";
  const abs = Math.abs(Math.round(m));
  return `${sinal}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
};

// ---------------------------------------------------------------- pessoas do ponto (gestor)
export type PessoaPonto = {
  id: string;
  nome: string;
  setor: "manutencao" | "recepcao" | "camareiras";
  unidade: "Botafogo" | "Ipanema" | "Ambas";
  vinculo: "fixo" | "freelance";
  telefone: string | null;
  funcionario_id: string | null;
  ativo: boolean;
  ponto_habilitado: boolean;
};

export function usePessoasPonto() {
  return useQuery({
    queryKey: ["ponto", "pessoas"],
    queryFn: async () => {
      const [{ data: pessoas, error: e1 }, { data: funcs, error: e2 }, { data: bios, error: e3 }] =
        await Promise.all([
          db
            .from("escala_colaboradores")
            .select(
              "id, nome, setor, unidade, vinculo, telefone, funcionario_id, ativo, ponto_habilitado",
            )
            .order("nome"),
          db.from("funcionarios").select("id, nome, user_id").order("nome"),
          db.from("ponto_biometria").select("colaborador_id"),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      const comRosto = new Set(
        (bios ?? []).map((b: { colaborador_id: string }) => b.colaborador_id),
      );
      return {
        pessoas: ((pessoas ?? []) as PessoaPonto[]).map((p) => ({
          ...p,
          cadastro_facial: comRosto.has(p.id),
        })),
        funcionarios: (funcs ?? []) as { id: string; nome: string; user_id: string | null }[],
      };
    },
  });
}

export function useSalvarPessoaPonto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Omit<PessoaPonto, "id"> & { id?: string }) => {
      const row = {
        nome: p.nome.trim(),
        setor: p.setor,
        unidade: p.unidade,
        vinculo: p.vinculo,
        telefone: p.telefone?.trim() || null,
        funcionario_id: p.funcionario_id || null,
        ativo: p.ativo,
        ponto_habilitado: p.ponto_habilitado,
      };
      if (!row.nome) throw new Error("Informe o nome");
      const { error } = p.id
        ? await db.from("escala_colaboradores").update(row).eq("id", p.id)
        : await db.from("escala_colaboradores").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ponto"] });
      qc.invalidateQueries({ queryKey: ["escala-colaboradores"] });
    },
  });
}
