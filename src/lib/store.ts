// Data layer backed by Lovable Cloud (Supabase) + React Query.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Unidade = "Botafogo" | "Ipanema";
export type Categoria =
  | "Ar condicionado"
  | "Elétrica"
  | "Automação"
  | "Hidráulica"
  | "Alvenaria"
  | "Pintura";
export type Status = "Aberto" | "Em Andamento" | "Concluído";

export const UNIDADES: Unidade[] = ["Botafogo", "Ipanema"];
export const CATEGORIAS: Categoria[] = [
  "Ar condicionado",
  "Elétrica",
  "Automação",
  "Hidráulica",
  "Alvenaria",
  "Pintura",
];

export interface Funcionario {
  id: string;
  nome: string;
  email: string;
  categorias: Categoria[];
  userId: string | null;
}

export interface Chamado {
  id: string;
  unidade: Unidade;
  categoria: Categoria;
  descricao: string;
  status: Status;
  responsavelId: string | null;
  fotoAntes: string | null;
  fotoDepois: string | null;
  criadoEm: string;
}

export interface AtivoAr {
  id: string;
  unidade: Unidade;
  localizacao: string;
  ultimaLimpeza: string | null;
  intervaloDias: number;
  tecnico: string | null;
  status: "Limpo" | "Sujo";
}

/* ----------------------------- mappers ----------------------------- */

type FuncionarioRow = {
  id: string;
  nome: string;
  email: string;
  categorias: string[] | null;
  user_id: string | null;
};
type ChamadoRow = {
  id: string;
  unidade: Unidade;
  categoria: string;
  descricao: string;
  status: Status;
  responsavel_id: string | null;
  foto_antes: string | null;
  foto_depois: string | null;
  created_at: string;
};
type AtivoRow = {
  id: string;
  unidade: Unidade;
  localizacao: string;
  ultima_limpeza: string | null;
  intervalo_dias: number;
  tecnico: string | null;
  status: string;
};

const mapFuncionario = (r: FuncionarioRow): Funcionario => ({
  id: r.id,
  nome: r.nome,
  email: r.email,
  categorias: (r.categorias ?? []) as Categoria[],
  userId: r.user_id,
});
const mapChamado = (r: ChamadoRow): Chamado => ({
  id: r.id,
  unidade: r.unidade,
  categoria: r.categoria as Categoria,
  descricao: r.descricao,
  status: r.status,
  responsavelId: r.responsavel_id,
  fotoAntes: r.foto_antes,
  fotoDepois: r.foto_depois,
  criadoEm: r.created_at,
});
const mapAtivo = (r: AtivoRow): AtivoAr => ({
  id: r.id,
  unidade: r.unidade,
  localizacao: r.localizacao,
  ultimaLimpeza: r.ultima_limpeza,
  intervaloDias: r.intervalo_dias,
});

/* ------------------------------ queries ----------------------------- */

export function useFuncionarios() {
  return useQuery({
    queryKey: ["funcionarios"],
    queryFn: async (): Promise<Funcionario[]> => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("id, nome, email, categorias, user_id")
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((r) => mapFuncionario(r as FuncionarioRow));
    },
  });
}

export function useChamados() {
  return useQuery({
    queryKey: ["chamados"],
    queryFn: async (): Promise<Chamado[]> => {
      const { data, error } = await supabase
        .from("chamados")
        .select(
          "id, unidade, categoria, descricao, status, responsavel_id, foto_antes, foto_depois, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => mapChamado(r as ChamadoRow));
    },
  });
}

export function useChamado(id: string) {
  return useQuery({
    queryKey: ["chamados", id],
    queryFn: async (): Promise<Chamado | null> => {
      const { data, error } = await supabase
        .from("chamados")
        .select(
          "id, unidade, categoria, descricao, status, responsavel_id, foto_antes, foto_depois, created_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapChamado(data as ChamadoRow) : null;
    },
  });
}

export function useAtivos() {
  return useQuery({
    queryKey: ["ativos_ar"],
    queryFn: async (): Promise<AtivoAr[]> => {
      const { data, error } = await supabase
        .from("ativos_ar")
        .select("id, unidade, localizacao, ultima_limpeza, intervalo_dias")
        .order("id");
      if (error) throw error;
      return (data ?? []).map((r) => mapAtivo(r as AtivoRow));
    },
  });
}

export interface MeInfo {
  userId: string;
  email: string | null;
  isGestor: boolean;
  isFuncionario: boolean;
  funcionario: Funcionario | null;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<MeInfo | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: roles }, { data: func }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        supabase
          .from("funcionarios")
          .select("id, nome, email, categorias, user_id")
          .eq("user_id", u.user.id)
          .maybeSingle(),
      ]);
      const roleList = (roles ?? []).map((r) => r.role);
      return {
        userId: u.user.id,
        email: u.user.email ?? null,
        isGestor: roleList.includes("gestor"),
        isFuncionario: roleList.includes("funcionario"),
        funcionario: func ? mapFuncionario(func as FuncionarioRow) : null,
      };
    },
  });
}

/* ----------------------------- mutations ---------------------------- */

function useInvalidate(keys: string[][]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

export function useCriarChamado(
  opts?: UseMutationOptions<
    string,
    Error,
    { unidade: Unidade; categoria: Categoria; descricao: string; responsavelId: string | null }
  >,
) {
  const invalidate = useInvalidate([["chamados"]]);
  return useMutation({
    mutationFn: async (input) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("chamados")
        .insert({
          unidade: input.unidade,
          categoria: input.categoria,
          descricao: input.descricao,
          responsavel_id: input.responsavelId,
          criado_por: u.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (...a) => {
      invalidate();
      opts?.onSuccess?.(...a);
    },
    ...opts,
  });
}

export function useAtualizarChamado() {
  const invalidate = useInvalidate([["chamados"]]);
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Chamado> }) => {
      const patch: {
        status?: Status;
        foto_antes?: string | null;
        foto_depois?: string | null;
        responsavel_id?: string | null;
      } = {};
      if (input.patch.status !== undefined) patch.status = input.patch.status;
      if (input.patch.fotoAntes !== undefined) patch.foto_antes = input.patch.fotoAntes;
      if (input.patch.fotoDepois !== undefined) patch.foto_depois = input.patch.fotoDepois;
      if (input.patch.responsavelId !== undefined) patch.responsavel_id = input.patch.responsavelId;
      const { error } = await supabase.from("chamados").update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useAdicionarFuncionario() {
  const invalidate = useInvalidate([["funcionarios"]]);
  return useMutation({
    mutationFn: async (input: { nome: string; email: string; categorias: Categoria[] }) => {
      const { error } = await supabase.from("funcionarios").insert({
        nome: input.nome,
        email: input.email.toLowerCase().trim(),
        categorias: input.categorias,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRemoverFuncionario() {
  const invalidate = useInvalidate([["funcionarios"]]);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("funcionarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRegistrarLimpeza() {
  const invalidate = useInvalidate([["ativos_ar"]]);
  return useMutation({
    mutationFn: async (ativoId: string) => {
      const { error } = await supabase
        .from("ativos_ar")
        .update({ ultima_limpeza: new Date().toISOString() })
        .eq("id", ativoId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/* ------------------------------ helpers ----------------------------- */

export function isAtivoLimpo(a: AtivoAr): boolean {
  const diff = (Date.now() - new Date(a.ultimaLimpeza).getTime()) / (1000 * 60 * 60 * 24);
  return diff <= a.intervaloDias;
}
export function diasDesdeLimpeza(a: AtivoAr): number {
  return Math.floor((Date.now() - new Date(a.ultimaLimpeza).getTime()) / (1000 * 60 * 60 * 24));
}
