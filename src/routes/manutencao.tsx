import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Wrench } from "lucide-react";

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
  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Manutenção</h1>
            <p className="text-sm text-muted-foreground">
              Espaço dedicado à manutenção. Em breve, novas funcionalidades.
            </p>
          </div>
        </header>

        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Esta página está pronta para receber os recursos de manutenção.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
