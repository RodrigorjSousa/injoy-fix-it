import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EstoqueGeralView } from "@/components/almoxarifado/estoque-geral-view";
import { useUnidade } from "@/lib/unidade-context";

export const Route = createFileRoute("/_authenticated/estoque-geral")({
  head: () => ({
    meta: [
      { title: "Almoxarifado - Estoque Geral — INJOY" },
      {
        name: "description",
        content:
          "Visualização somente leitura do estoque geral do almoxarifado INJOY.",
      },
    ],
  }),
  component: EstoqueGeralPage,
});

function EstoqueGeralPage() {
  const { unidade } = useUnidade();
  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center gap-4">
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-purple-100 text-purple-600 grid place-items-center shrink-0">
            <Package className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              Almoxarifado - Estoque Geral
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              INJOY {unidade} - visualização somente leitura
            </p>
          </div>
        </header>

        <EstoqueGeralView unidade={unidade} />
      </div>
    </AppShell>
  );
}
