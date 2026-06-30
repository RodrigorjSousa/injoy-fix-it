import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  Snowflake,
  Droplets,
  PaintRoller,
  Hammer,
  AlertTriangle,
  Wrench,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/servicos")({
  component: Servicos,
});

type Servico = {
  key: string;
  label: string;
  sub?: string;
  desc: string;
  icon: typeof Zap;
  to: string;
  search: Record<string, string>;
  tone: string;
  emergencia?: boolean;
};

const SERVICOS: Servico[] = [
  {
    key: "eletrica",
    label: "Elétrica",
    desc: "Tomadas, disjuntores, iluminação e quadros.",
    icon: Zap,
    to: "/painel",
    search: { categoria: "Elétrica" },
    tone: "from-amber-500/15 to-amber-500/0 text-amber-600 border-amber-500/30",
  },
  {
    key: "ac-corretiva",
    label: "Ar condicionado",
    sub: "Corretiva",
    desc: "Reparos em aparelhos que ainda operam.",
    icon: Snowflake,
    to: "/painel",
    search: { categoria: "Ar condicionado", tipo: "corretiva" },
    tone: "from-sky-500/15 to-sky-500/0 text-sky-600 border-sky-500/30",
  },
  {
    key: "ac-emergencia",
    label: "Ar condicionado",
    sub: "Emergência",
    desc: "Quarto sem refrigeração — atendimento imediato.",
    icon: AlertTriangle,
    to: "/painel",
    search: { categoria: "Ar condicionado", tipo: "emergencia" },
    tone: "from-red-600/15 to-red-600/0 text-red-600 border-red-600/40",
    emergencia: true,
  },
  {
    key: "hidraulica",
    label: "Hidráulica",
    desc: "Vazamentos, descargas, torneiras e ralos.",
    icon: Droplets,
    to: "/painel",
    search: { categoria: "Hidráulica" },
    tone: "from-blue-500/15 to-blue-500/0 text-blue-600 border-blue-500/30",
  },
  {
    key: "pintura",
    label: "Pintura",
    desc: "Retoques, paredes danificadas e acabamento.",
    icon: PaintRoller,
    to: "/painel",
    search: { categoria: "Pintura" },
    tone: "from-emerald-500/15 to-emerald-500/0 text-emerald-600 border-emerald-500/30",
  },
  {
    key: "marcenaria",
    label: "Marcenaria",
    desc: "Portas, móveis, fechaduras e ajustes em madeira.",
    icon: Hammer,
    to: "/painel",
    search: { categoria: "Marcenaria" },
    tone: "from-orange-600/15 to-orange-600/0 text-orange-700 border-orange-600/30",
  },
];

function Servicos() {
  return (
    <div className="space-y-6">
      <header>
        <Badge variant="secondary" className="mb-3 rounded-full">
          <Wrench className="h-3 w-3 mr-1" /> Serviços
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Catálogo de serviços
        </h1>
        <p className="text-muted-foreground mt-1">
          Escolha uma categoria para ver os chamados correspondentes.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SERVICOS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.key}
              to={s.to}
              search={s.search}
              className="group"
            >
              <Card
                className={cn(
                  "relative overflow-hidden p-5 h-full border bg-gradient-to-br transition-all hover:shadow-lg hover:-translate-y-0.5",
                  s.tone,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={cn(
                      "h-12 w-12 rounded-xl grid place-items-center bg-card shadow-sm border",
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  {s.emergencia && (
                    <Badge className="bg-red-600 hover:bg-red-600 text-white rounded-full text-[10px] uppercase tracking-wide">
                      Urgente
                    </Badge>
                  )}
                </div>
                <div className="mt-4">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-lg font-semibold text-foreground">
                      {s.label}
                    </h3>
                    {s.sub && (
                      <span className="text-xs font-medium opacity-80">
                        • {s.sub}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
                </div>
                <div className="mt-4 flex items-center justify-end text-xs font-medium opacity-80 group-hover:opacity-100">
                  Ver chamados
                  <ChevronRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
