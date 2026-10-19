// Cor de identidade de cada pessoa da equipe: a mesma cor em todo o app.
// A cor vem do banco (public.cores_equipe): a que o gestor escolheu, ou uma da paleta pela ordem de cadastro.
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PALETA_CORES = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d",
  "#ea580c", "#4f46e5", "#0d9488", "#be123c", "#a16207", "#9333ea", "#0284c7", "#15803d",
  "#c2410c", "#6d28d9", "#0f766e", "#e11d48", "#4d7c0f", "#1d4ed8", "#b45309", "#a21caf",
];

export type CorEquipe = { colaborador_id: string; funcionario_id: string | null; user_id: string | null; nome: string; cor: string; cor_propria: boolean };
export type RefPessoa = { colaboradorId?: string | null; funcionarioId?: string | null; userId?: string | null; nome?: string | null };

export const normalizarNome = (nome?: string | null) =>
  (nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Texto preto ou branco, o que ler melhor sobre a cor. */
export function corDoTexto(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111827" : "#ffffff";
}
/** Cor com transparência (fundo suave de cartões). */
export function corComAlfa(hex: string, alfa: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc: Rpc = (fn, args) => (supabase.rpc as unknown as Rpc)(fn, args);

export function useCoresEquipe() {
  return useQuery({
    queryKey: ["cores-equipe"],
    queryFn: async (): Promise<CorEquipe[]> => {
      const { data, error } = await rpc("cores_equipe");
      if (error) throw new Error(error.message);
      return (data ?? []) as CorEquipe[];
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** Devolve uma função que acha a cor da pessoa (por colaborador, funcionário, usuário ou nome). */
export function useCorDe() {
  const { data } = useCoresEquipe();
  const mapas = useMemo(() => {
    const porColab = new Map<string, string>(), porFunc = new Map<string, string>(), porUser = new Map<string, string>(), porNome = new Map<string, string>();
    for (const c of data ?? []) {
      porColab.set(c.colaborador_id, c.cor);
      if (c.funcionario_id) porFunc.set(c.funcionario_id, c.cor);
      if (c.user_id) porUser.set(c.user_id, c.cor);
      const k = normalizarNome(c.nome);
      if (k && !porNome.has(k)) porNome.set(k, c.cor);
    }
    return { porColab, porFunc, porUser, porNome };
  }, [data]);
  return useCallback((ref: RefPessoa): string | null =>
    (ref.colaboradorId && mapas.porColab.get(ref.colaboradorId)) ||
    (ref.funcionarioId && mapas.porFunc.get(ref.funcionarioId)) ||
    (ref.userId && mapas.porUser.get(ref.userId)) ||
    mapas.porNome.get(normalizarNome(ref.nome)) || null, [mapas]);
}

/** Gestor define (ou limpa, voltando à automática) a cor de uma pessoa. */
export function useSalvarCorColaborador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, cor }: { id: string; cor: string | null }) => {
      const { error } = await supabase.from("escala_colaboradores" as never).update({ cor } as never).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cores-equipe"] });
      void qc.invalidateQueries({ queryKey: ["escala-colaboradores"] });
    },
  });
}
