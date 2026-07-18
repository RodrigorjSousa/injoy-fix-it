import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Cog, ClipboardCheck, Snowflake, ArrowRight } from "lucide-react";
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

const SUBMODULOS = [
  {
    to: "/rotinas-preventivas",
    titulo: "Rotinas Preventivas",
    descricao:
      "Pinturas, limpezas profundas, rejuntes, ralos, fachada e jardim de inverno.",
    icon: ClipboardCheck,
    tone: "bg-primary/10 text-primary",
  },
  {
    to: "/preventiva",
    titulo: "Ar Condicionado (PMOC)",
    descricao:
      "Controle de limpeza técnica de aparelhos em conformidade com o PMOC.",
    icon: Snowflake,
    tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
] as const;

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SUBMODULOS.map((s) => (
            <Link key={s.to} to={s.to} className="block group">
              <Card className="p-5 h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start gap-4">
                  <div className={`h-12 w-12 rounded-xl grid place-items-center shrink-0 ${s.tone}`}>
                    <s.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-lg">{s.titulo}</h2>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{s.descricao}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
