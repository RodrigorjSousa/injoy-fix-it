import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Cog } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useUnidade } from "@/lib/unidade-context";
import { RecadosGestorAlert } from "@/components/recados-gestor/recados-gestor-alert";

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
        <RecadosGestorAlert setor="manutencao" unidade={unidade} />
        <header className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
            <Cog className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Manutenção</h1>
            <p className="text-sm text-muted-foreground">
              Recursos e informações da área de manutenção.
            </p>
          </div>
        </header>

        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum submódulo disponível no momento.
        </Card>
      </div>
    </AppShell>
  );
}
