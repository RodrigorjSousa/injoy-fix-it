// Cards (áreas) das Tarefas Extras configuráveis pelo gestor.
// Guardado em app_settings na chave CONFIG_KEY (começa com "tarefas_extras_items:" para que
// as camareiras também possam ler, conforme a regra de leitura já existente no banco).
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bath,
  BedDouble,
  Briefcase,
  Building2,
  ChefHat,
  Coffee,
  DoorOpen,
  Dumbbell,
  Flower2,
  Package,
  Sofa,
  Sparkles,
  Sun,
  Trash2,
  Trees,
  Utensils,
  WashingMachine,
  Waves,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, CATEGORIES_BY_UNIDADE } from "@/components/camareiras/tarefas-extras-modal";

export type UnidadeTE = "Botafogo" | "Ipanema";
export const CONFIG_KEY = "tarefas_extras_items:__categorias";

export const ICONES = {
  ChefHat, Trees, DoorOpen, Building2, WashingMachine, Bath, Sofa, Utensils, BedDouble,
  Sparkles, Sun, Waves, Flower2, Dumbbell, Coffee, Briefcase, Package, Trash2,
} as const;
export type NomeIcone = keyof typeof ICONES;

export const CORES = {
  vermelho: { nome: "Vermelho", gradient: "from-rose-500 to-red-600", ring: "ring-rose-300", accent: "bg-rose-500" },
  verde: { nome: "Verde", gradient: "from-emerald-500 to-green-600", ring: "ring-emerald-300", accent: "bg-emerald-500" },
  azul: { nome: "Azul", gradient: "from-sky-500 to-blue-600", ring: "ring-sky-300", accent: "bg-sky-500" },
  roxo: { nome: "Roxo", gradient: "from-violet-500 to-purple-600", ring: "ring-violet-300", accent: "bg-violet-500" },
  laranja: { nome: "Laranja", gradient: "from-amber-500 to-orange-600", ring: "ring-amber-300", accent: "bg-amber-500" },
  turquesa: { nome: "Turquesa", gradient: "from-cyan-500 to-teal-600", ring: "ring-cyan-300", accent: "bg-cyan-500" },
  rosa: { nome: "Rosa", gradient: "from-pink-500 to-fuchsia-600", ring: "ring-pink-300", accent: "bg-pink-500" },
  anil: { nome: "Anil", gradient: "from-indigo-500 to-blue-700", ring: "ring-indigo-300", accent: "bg-indigo-500" },
  lima: { nome: "Lima", gradient: "from-lime-500 to-green-600", ring: "ring-lime-300", accent: "bg-lime-500" },
  grafite: { nome: "Grafite", gradient: "from-slate-500 to-slate-700", ring: "ring-slate-300", accent: "bg-slate-500" },
} as const;
export type NomeCor = keyof typeof CORES;

export interface CategoriaConfig {
  key: string;
  label: string;
  icone: NomeIcone;
  cor: NomeCor;
  unidades: UnidadeTE[];
  ativo: boolean;
  /** Nomes antigos, para o histórico continuar ligado ao card depois de renomear. */
  nomesAnteriores: string[];
  custom: boolean;
}

export interface CategoriaTE {
  key: string;
  label: string;
  icon: (typeof ICONES)[NomeIcone];
  gradient: string;
  ring: string;
  accent: string;
  defaults: string[];
  unidades: UnidadeTE[];
  ativo: boolean;
  nomes: string[];
  custom: boolean;
  icone: NomeIcone;
  cor: NomeCor;
}

const ICONE_PADRAO: Record<string, NomeIcone> = {
  cozinha: "ChefHat", patio: "Trees", salas_terreo: "DoorOpen", sala_401: "Building2",
  area_servico: "WashingMachine", patio_ipanema: "Trees", banheiro_ipanema: "Bath",
  escadas_corredores_ipanema: "Building2",
};

function corPorGradiente(g: string): NomeCor {
  const achou = (Object.keys(CORES) as NomeCor[]).find((k) => CORES[k].gradient === g);
  return achou ?? "grafite";
}

/** Configuração padrão = os cards que já existiam. */
export function configPadrao(): CategoriaConfig[] {
  return CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    icone: ICONE_PADRAO[c.key] ?? "Sparkles",
    cor: corPorGradiente(c.gradient),
    unidades: (Object.keys(CATEGORIES_BY_UNIDADE) as UnidadeTE[]).filter((u) =>
      (CATEGORIES_BY_UNIDADE[u] as string[]).includes(c.key),
    ),
    ativo: true,
    nomesAnteriores: [],
    custom: false,
  }));
}

/** Junta a configuração salva com os cards padrão (novos cards padrão aparecem sozinhos). */
export function mesclarConfig(salva: CategoriaConfig[] | null): CategoriaConfig[] {
  const padrao = configPadrao();
  if (!salva?.length) return padrao;
  const porKey = new Map(salva.map((c) => [c.key, c]));
  const base = padrao.map((p) => ({ ...p, ...(porKey.get(p.key) ?? {}), custom: false }));
  const extras = salva.filter((c) => !padrao.some((p) => p.key === c.key)).map((c) => ({ ...c, custom: true }));
  return [...base, ...extras];
}

export function montarCategoria(c: CategoriaConfig): CategoriaTE {
  const cor = CORES[c.cor] ?? CORES.grafite;
  const original = CATEGORIES.find((x) => x.key === c.key);
  return {
    key: c.key,
    label: c.label,
    icon: ICONES[c.icone] ?? Sparkles,
    gradient: cor.gradient,
    ring: cor.ring,
    accent: cor.accent,
    defaults: original?.defaults ?? [],
    unidades: c.unidades,
    ativo: c.ativo,
    nomes: [c.label, ...(c.nomesAnteriores ?? []), ...(original && original.label !== c.label ? [original.label] : [])],
    custom: c.custom,
    icone: c.icone,
    cor: c.cor,
  };
}

/** O registro pertence a este card? (aceita nomes antigos) */
export function registroDaCategoria(tarefa: string, c: Pick<CategoriaTE, "nomes">): boolean {
  return c.nomes.some((n) => tarefa.startsWith(`[${n}]`));
}

export function useConfigCategorias() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("tarefas-extras-categorias")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, (p) => {
        const row = (p.new || p.old) as { key?: string } | null;
        if (row?.key === CONFIG_KEY) void qc.invalidateQueries({ queryKey: ["tarefas_extras_categorias"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
  return useQuery({
    queryKey: ["tarefas_extras_categorias"],
    staleTime: 60_000,
    queryFn: async (): Promise<CategoriaConfig[]> => {
      const { data } = await supabase
        .from("app_settings" as never)
        .select("value")
        .eq("key", CONFIG_KEY)
        .maybeSingle();
      let salva: CategoriaConfig[] | null = null;
      try {
        const v = JSON.parse((data as { value?: string } | null)?.value ?? "null");
        if (Array.isArray(v)) salva = v as CategoriaConfig[];
      } catch {
        /* ignora */
      }
      return mesclarConfig(salva);
    },
  });
}

/** Cards ativos de uma unidade (usado pelas camareiras e pelo painel). */
export function useCategoriasDaUnidade(unidade: UnidadeTE): CategoriaTE[] {
  const { data } = useConfigCategorias();
  return useMemo(
    () =>
      (data ?? configPadrao())
        .filter((c) => c.ativo && c.unidades.includes(unidade))
        .map(montarCategoria),
    [data, unidade],
  );
}

export async function salvarConfigCategorias(lista: CategoriaConfig[]) {
  const { error } = await supabase
    .from("app_settings" as never)
    .upsert({ key: CONFIG_KEY, value: JSON.stringify(lista) } as never);
  if (error) throw new Error(error.message);
}

export function novaChave(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30);
  return `c_${base || "area"}_${Date.now().toString(36)}`;
}
