import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/gestao")({
  head: () => ({
    meta: [
      { title: "Gestão — Manutenção INJOY" },
      { name: "description", content: "Painel de gestão administrativa" },
    ],
  }),
  component: GestaoPage,
});

function GestaoPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gestão</h1>
          <p className="text-sm text-muted-foreground">
            Área administrativa de gestão.
          </p>
        </div>
      </div>

      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Conteúdo da gestão em breve.
        </p>
      </Card>
    </div>
  );
}
