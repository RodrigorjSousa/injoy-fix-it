import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Unidade } from "@/lib/store";

const STORAGE_KEY = "injoy:unidade-ativa";
const UNIDADES: Unidade[] = ["Botafogo", "Ipanema"];

type Ctx = {
  unidade: Unidade;
  setUnidade: (u: Unidade) => void;
  unidades: Unidade[];
};

const UnidadeContext = createContext<Ctx | null>(null);

export function UnidadeProvider({ children }: { children: ReactNode }) {
  const [unidade, setUnidadeState] = useState<Unidade>("Botafogo");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "Botafogo" || saved === "Ipanema") setUnidadeState(saved);
    } catch {
      // ignore
    }
  }, []);

  const setUnidade = useCallback((u: Unidade) => {
    setUnidadeState(u);
    try {
      localStorage.setItem(STORAGE_KEY, u);
    } catch {
      // ignore
    }
  }, []);

  return (
    <UnidadeContext.Provider value={{ unidade, setUnidade, unidades: UNIDADES }}>
      {children}
    </UnidadeContext.Provider>
  );
}

export function useUnidade(): Ctx {
  const ctx = useContext(UnidadeContext);
  if (!ctx) {
    throw new Error("useUnidade deve ser usado dentro de <UnidadeProvider>");
  }
  return ctx;
}
