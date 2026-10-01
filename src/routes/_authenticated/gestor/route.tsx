import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Building2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { requireGestor } from "@/lib/require-gestor";
import { useUnidade } from "@/lib/unidade-context";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/gestor")({
  beforeLoad: () => requireGestor(),
  component: GestorLayout,
});

type UnidadeGestor = Unidade | "Consolidado";

function GestorLayout() {
  const { unidade, setUnidade } = useUnidade();
  const [unidadeGestor, setUnidadeGestor] = useState<UnidadeGestor>(unidade);

  const selecionarUnidade = (valor: UnidadeGestor) => {
    setUnidadeGestor(valor);
    if (valor !== "Consolidado") setUnidade(valor);
  };

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-50 pb-12 sm:-m-6 lg:-m-8">
      <header className="sticky top-0 z-10 bg-blue-950 p-5 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Área do Gestor</h1>
              <p className="text-xs text-blue-200">INJOY Hotéis · {unidadeGestor}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2" aria-label="Selecionar unidade">
            {(["Botafogo", "Ipanema", "Consolidado"] as UnidadeGestor[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => selecionarUnidade(item)}
                className={cn(
                  "inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border px-3 text-xs font-semibold transition-colors",
                  unidadeGestor === item
                    ? "border-emerald-400 bg-emerald-500 text-white"
                    : "border-blue-800 bg-blue-900 text-blue-100 hover:bg-blue-800",
                )}
              >
                <Building2 className="h-3.5 w-3.5" />
                {item}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <Outlet />
      </div>
    </div>
  );
}
