import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Users,
  DollarSign,
  CalendarClock,
  Trophy,
  Building2,
  TrendingUp,
  ChevronRight,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/gestao")({
  head: () => ({
    meta: [
      { title: "Gestão — Manutenção INJOY" },
      { name: "description", content: "Painel de gestão administrativa" },
    ],
  }),
  component: GestaoPage,
});

type GestaoCard = {
  key: string;
  label: string;
  desc: string;
  icon: typeof Users;
  tone: string;
  tecnico?: string | null;
};

const CARDS: GestaoCard[] = [
  {
    key: "time",
    label: "GESTÃO DO TIME INJOY",
    desc: "Gerenciamento de equipes, desempenho e bem-estar dos colaboradores.",
    icon: Users,
    tone: "from-sky-500/15 to-sky-500/0 text-sky-600 border-sky-500/30",
  },
  {
    key: "financeiro",
    label: "FINANCEIRO",
    desc: "Controle de receitas, despesas, fluxo de caixa e orçamentos.",
    icon: DollarSign,
    tone: "from-emerald-500/15 to-emerald-500/0 text-emerald-600 border-emerald-500/30",
  },
  {
    key: "escala",
    label: "ESCALA DOS FUNCIONÁRIOS",
    desc: "Organização de horários, turnos e folgas da equipe.",
    icon: CalendarClock,
    tone: "from-amber-500/15 to-amber-500/0 text-amber-600 border-amber-500/30",
  },
  {
    key: "bonificacao",
    label: "BONIFICAÇÃO DOS FUNCIONÁRIOS",
    desc: "Sistema de recompensas e incentivos por desempenho e metas alcançadas.",
    icon: Trophy,
    tone: "from-purple-500/15 to-purple-500/0 text-purple-600 border-purple-500/30",
  },
  {
    key: "hotel",
    label: "GESTÃO DO HOTEL",
    desc: "Administração geral das operações do hotel, reservas e manutenção.",
    icon: Building2,
    tone: "from-blue-600/15 to-blue-600/0 text-blue-700 border-blue-600/30",
  },
  {
    key: "desempenho",
    label: "DESEMPENHO GERAL",
    desc: "Análise de métricas, resultados e performance global da operação.",
    icon: TrendingUp,
    tone: "from-pink-500/15 to-pink-500/0 text-pink-600 border-pink-500/30",
  },
];

function GestaoPage() {
  return (
    <div className="space-y-6">
      <header>
        <Badge variant="secondary" className="mb-3 rounded-full">
          <BarChart3 className="h-3 w-3 mr-1" /> Gestão
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          GESTÃO
        </h1>
        <p className="text-muted-foreground mt-1">
          Painéis administrativos e ferramentas de gestão.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Card
              key={c.key}
              className={cn(
                "group relative overflow-hidden p-5 h-full flex flex-col border bg-gradient-to-br transition-all hover:shadow-lg hover:-translate-y-0.5",
                c.tone,
              )}
            >
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                  sem chamados
                </span>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="h-12 w-12 rounded-xl grid place-items-center bg-card shadow-sm border">
                  <Icon className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-4">
                <h3 className="text-lg font-semibold text-foreground leading-tight">
                  {c.label}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">{c.desc}</p>
              </div>

              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                  <UserCog className="h-3 w-3" />
                  Técnico
                </div>
                <p className="text-sm text-muted-foreground italic">
                  Nenhum técnico cadastrado
                </p>
              </div>

              <div className="mt-auto pt-4 flex items-center justify-end">
                <button
                  type="button"
                  className="flex items-center text-xs font-medium opacity-80 hover:opacity-100 transition-opacity"
                >
                  Ver chamados
                  <ChevronRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
