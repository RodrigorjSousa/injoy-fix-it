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
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChamados, useFuncionarios, type Chamado, type Funcionario } from "@/lib/store";

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
  dot: string;
  categoria: string;
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
    dot: "bg-amber-500",
    categoria: "Elétrica",
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
    dot: "bg-sky-500",
    categoria: "Ar condicionado",
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
    dot: "bg-red-600",
    categoria: "Ar condicionado",
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
    dot: "bg-blue-500",
    categoria: "Hidráulica",
  },
  {
    key: "pintura",
    label: "Pintura",
    desc: "Retoques, paredes danificadas e acabamento.",
    icon: PaintRoller,
    to: "/painel",
    search: { categoria: "Pintura" },
    tone: "from-emerald-500/15 to-emerald-500/0 text-emerald-600 border-emerald-500/30",
    dot: "bg-emerald-500",
    categoria: "Pintura",
  },
  {
    key: "marcenaria",
    label: "Marcenaria",
    desc: "Portas, móveis, fechaduras e ajustes em madeira.",
    icon: Hammer,
    to: "/painel",
    search: { categoria: "Marcenaria" },
    tone: "from-orange-600/15 to-orange-600/0 text-orange-700 border-orange-600/30",
    dot: "bg-orange-600",
    categoria: "Marcenaria",
  },
];

function isUrgente(c: Chamado) {
  const t = (c.descricao ?? "").toLowerCase();
  return /urgente|emerg[êe]ncia|bloqueia|sem refriger/.test(t);
}

function contarAbertos(chamados: Chamado[], s: Servico) {
  return chamados.filter((c) => {
    if (c.status === "Concluído") return false;
    if (c.categoria !== s.categoria) return true && false;
    if (s.categoria !== "Ar condicionado") return c.categoria === s.categoria;
    // Ar condicionado split
    const urgente = isUrgente(c);
    return s.emergencia ? urgente : !urgente;
  }).length;
}

function tecnicosDe(funcs: Funcionario[], categoria: string) {
  return funcs.filter((f) =>
    (f.categorias ?? []).some((c) => c === categoria),
  );
}

function Servicos() {
  const { data: chamados = [] } = useChamados();
  const { data: funcionarios = [] } = useFuncionarios();

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
          const abertos = contarAbertos(chamados, s);
          const tecnicos = tecnicosDe(funcionarios, s.categoria);
          const piscando = abertos > 0;
          return (
            <Link key={s.key} to={s.to} search={s.search} className="group">
              <Card
                className={cn(
                  "relative overflow-hidden p-5 h-full border bg-gradient-to-br transition-all hover:shadow-lg hover:-translate-y-0.5",
                  s.tone,
                )}
              >
                {/* Indicador de chamados */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  {piscando && (
                    <span className="relative flex h-3 w-3" aria-label={`${abertos} chamados abertos`}>
                      <span
                        className={cn(
                          "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
                          s.dot,
                        )}
                      />
                      <span className={cn("relative inline-flex h-3 w-3 rounded-full", s.dot)} />
                    </span>
                  )}
                  {piscando ? (
                    <Badge className="bg-foreground text-background rounded-full text-[10px] px-2 h-5">
                      {abertos}
                    </Badge>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                      sem chamados
                    </span>
                  )}
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div className="h-12 w-12 rounded-xl grid place-items-center bg-card shadow-sm border">
                    <Icon className="h-6 w-6" />
                  </div>
                  {s.emergencia && (
                    <Badge className="bg-red-600 hover:bg-red-600 text-white rounded-full text-[10px] uppercase tracking-wide mt-6">
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

                {/* Técnicos responsáveis */}
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    <Users className="h-3 w-3" />
                    {tecnicos.length > 1 ? "Técnicos" : "Técnico"}
                  </div>
                  {tecnicos.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      Nenhum técnico cadastrado
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {tecnicos.map((t) => (
                        <Badge
                          key={t.id}
                          variant="secondary"
                          className="rounded-full text-xs font-medium"
                        >
                          {t.nome}
                        </Badge>
                      ))}
                    </div>
                  )}
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
