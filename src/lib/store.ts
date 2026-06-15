// Mock data store backed by localStorage with a tiny pub/sub.
import { useSyncExternalStore } from "react";

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
  categorias: Categoria[];
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
  ultimaLimpeza: string; // ISO
  intervaloDias: number;
}

interface State {
  funcionarios: Funcionario[];
  chamados: Chamado[];
  ativos: AtivoAr[];
}

const KEY = "injoy-manutencao-v1";

const uid = () => Math.random().toString(36).slice(2, 10);

const daysAgo = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString();
};

const seed = (): State => {
  const rodrigo: Funcionario = {
    id: uid(),
    nome: "Rodrigo Sousa",
    categorias: ["Elétrica", "Automação", "Ar condicionado"],
  };
  const carlos: Funcionario = {
    id: uid(),
    nome: "Carlos Mendes",
    categorias: ["Hidráulica", "Alvenaria"],
  };
  const ana: Funcionario = {
    id: uid(),
    nome: "Ana Ribeiro",
    categorias: ["Pintura", "Alvenaria"],
  };

  return {
    funcionarios: [rodrigo, carlos, ana],
    chamados: [
      {
        id: uid(),
        unidade: "Botafogo",
        categoria: "Elétrica",
        descricao: "Tomada do quarto 302 sem energia.",
        status: "Aberto",
        responsavelId: rodrigo.id,
        fotoAntes: null,
        fotoDepois: null,
        criadoEm: daysAgo(1),
      },
      {
        id: uid(),
        unidade: "Ipanema",
        categoria: "Hidráulica",
        descricao: "Vazamento no chuveiro do quarto 511.",
        status: "Em Andamento",
        responsavelId: carlos.id,
        fotoAntes: null,
        fotoDepois: null,
        criadoEm: daysAgo(2),
      },
      {
        id: uid(),
        unidade: "Botafogo",
        categoria: "Pintura",
        descricao: "Retoque na parede do corredor 4º andar.",
        status: "Concluído",
        responsavelId: ana.id,
        fotoAntes: null,
        fotoDepois: null,
        criadoEm: daysAgo(5),
      },
    ],
    ativos: [
      { id: "AC-B-101", unidade: "Botafogo", localizacao: "Quarto 101", ultimaLimpeza: daysAgo(20), intervaloDias: 90 },
      { id: "AC-B-201", unidade: "Botafogo", localizacao: "Quarto 201", ultimaLimpeza: daysAgo(120), intervaloDias: 90 },
      { id: "AC-B-LOB", unidade: "Botafogo", localizacao: "Lobby Principal", ultimaLimpeza: daysAgo(45), intervaloDias: 90 },
      { id: "AC-I-301", unidade: "Ipanema", localizacao: "Quarto 301", ultimaLimpeza: daysAgo(15), intervaloDias: 90 },
      { id: "AC-I-401", unidade: "Ipanema", localizacao: "Quarto 401", ultimaLimpeza: daysAgo(100), intervaloDias: 90 },
      { id: "AC-I-RES", unidade: "Ipanema", localizacao: "Restaurante", ultimaLimpeza: daysAgo(60), intervaloDias: 90 },
    ],
  };
};

let state: State = (() => {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* ignore */
  }
  const s = seed();
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  return s;
})();

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => state;
const getServerSnapshot = () => state;

const setState = (updater: (s: State) => State) => {
  state = updater(state);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
};

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(getServerSnapshot()),
  );
}

// ---- Actions ----
export const actions = {
  funcionarioPorCategoria(cat: Categoria): Funcionario | undefined {
    return state.funcionarios.find((f) => f.categorias.includes(cat));
  },
  criarChamado(input: {
    unidade: Unidade;
    categoria: Categoria;
    descricao: string;
    responsavelId: string | null;
  }) {
    const novo: Chamado = {
      id: uid(),
      ...input,
      status: "Aberto",
      fotoAntes: null,
      fotoDepois: null,
      criadoEm: new Date().toISOString(),
    };
    setState((s) => ({ ...s, chamados: [novo, ...s.chamados] }));
    return novo.id;
  },
  atualizarChamado(id: string, patch: Partial<Chamado>) {
    setState((s) => ({
      ...s,
      chamados: s.chamados.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  },
  adicionarFuncionario(nome: string, categorias: Categoria[]) {
    setState((s) => ({
      ...s,
      funcionarios: [...s.funcionarios, { id: uid(), nome, categorias }],
    }));
  },
  removerFuncionario(id: string) {
    setState((s) => ({
      ...s,
      funcionarios: s.funcionarios.filter((f) => f.id !== id),
    }));
  },
  registrarLimpeza(ativoId: string) {
    setState((s) => ({
      ...s,
      ativos: s.ativos.map((a) =>
        a.id === ativoId ? { ...a, ultimaLimpeza: new Date().toISOString() } : a,
      ),
    }));
  },
  resetSeed() {
    setState(() => seed());
  },
};

export function isAtivoLimpo(a: AtivoAr): boolean {
  const diff = (Date.now() - new Date(a.ultimaLimpeza).getTime()) / (1000 * 60 * 60 * 24);
  return diff <= a.intervaloDias;
}

export function diasDesdeLimpeza(a: AtivoAr): number {
  return Math.floor((Date.now() - new Date(a.ultimaLimpeza).getTime()) / (1000 * 60 * 60 * 24));
}
