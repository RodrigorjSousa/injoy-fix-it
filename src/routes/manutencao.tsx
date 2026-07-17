import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Cog, Package } from "lucide-react";
import { EstoqueGeralView } from "@/components/almoxarifado/estoque-geral-view";
import { useUnidade } from "@/lib/unidade-context";

export const Route = createFileRoute("/manutencao")({
  head: () => ({
    meta: [
      { title: "Manutenção — INJOY" },
      { name: "description", content: "Área de manutenção do hotel." },
    ],
  }),
  component: ManutencaoPage,
});

function ManutencaoPage() {
  const { unidade } = useUnidade();
  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
            <Cog className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Manutenção</h1>
            <p className="text-sm text-muted-foreground">
              Consulta rápida ao almoxarifado e recursos de manutenção.
            </p>
          </div>
        </header>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-purple-100 text-purple-700 grid place-items-center">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800">
                📦 Almoxarifado · Estoque Geral
              </h2>
              <p className="text-xs text-slate-500">
                INJOY {unidade} · visualização somente leitura
              </p>
            </div>
          </div>
          <EstoqueGeralView unidade={unidade} />
        </section>
      </div>
    </AppShell>
  );
}
