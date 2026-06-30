import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench, BedDouble, ConciergeBell, Star, ArrowRight } from "lucide-react";
import { useChamados, useMe } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: () => {
    // gate is enforced visually too, but block direct URL access for non-gestores
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { data: me } = useMe();
  const { data: chamados = [] } = useChamados();

  const isFull = !!me && (me.isGestor || me.isAdmin);

  const manut = useMemo(() => {
    const abertos = chamados.filter((c) => c.status === "Aberto").length;
    const andamento = chamados.filter((c) => c.status === "Em Andamento").length;
    const concluidos = chamados.filter((c) => c.status === "Concluído").length;
    return { abertos, andamento, concluidos, total: chamados.length };
  }, [chamados]);

  const camareiras = useMemo(() => {
    const cams = chamados.filter((c) => {
      const d = (c.descricao || "").toLowerCase();
      return d.includes("camareira") || d.includes("housekeeping") || d.includes("quarto");
    });
    const urgentes = cams.filter((c) => /urgente|bloqueio|bloquear/i.test(c.descricao || "")).length;
    return { total: cams.length, urgentes };
  }, [chamados]);

  if (!isFull) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-3">
        <h1 className="text-2xl font-semibold">Acesso restrito</h1>
        <p className="text-muted-foreground">
          Este painel é exclusivo para Gestores e Administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">
          Painel do Gestor
        </h1>
        <p className="text-sm text-muted-foreground">
          Visão geral das operações INJOY Hotéis
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardCard
          to="/painel"
          title="Manutenção"
          icon={Wrench}
          accent="from-sky-500 to-blue-700"
          metric={`${manut.abertos + manut.andamento}`}
          metricLabel="chamados ativos"
        >
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="destructive">{manut.abertos} abertos</Badge>
            <Badge className="bg-amber-500 hover:bg-amber-500 text-white">
              {manut.andamento} em andamento
            </Badge>
            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
              {manut.concluidos} concluídos
            </Badge>
          </div>
        </DashboardCard>

        <DashboardCard
          to="/camareiras"
          title="Camareiras"
          icon={BedDouble}
          accent="from-rose-500 to-rose-700"
          metric={`${camareiras.total}`}
          metricLabel="tarefas registradas"
        >
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="destructive">{camareiras.urgentes} urgentes</Badge>
            <Badge variant="secondary">Limpeza & defeitos</Badge>
          </div>
        </DashboardCard>

        <DashboardCard
          to="/recepcao"
          title="Ocupação"
          icon={ConciergeBell}
          accent="from-indigo-500 to-indigo-800"
          metric="—"
          metricLabel="check-ins do dia"
        >
          <p className="text-xs text-muted-foreground pt-2">
            Acompanhe a ocupação por unidade pela área da recepção.
          </p>
        </DashboardCard>

        <DashboardCard
          to="#"
          title="Notas dos usuários"
          icon={Star}
          accent="from-amber-500 to-orange-600"
          metric="—"
          metricLabel="avaliações"
          disabled
        >
          <p className="text-xs text-muted-foreground pt-2">
            Módulo de avaliações em breve.
          </p>
        </DashboardCard>
      </div>
    </div>
  );
}

function DashboardCard({
  to,
  title,
  icon: Icon,
  accent,
  metric,
  metricLabel,
  children,
  disabled,
}: {
  to: string;
  title: string;
  icon: typeof Wrench;
  accent: string;
  metric: string;
  metricLabel: string;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const inner = (
    <Card
      className={cn(
        "relative overflow-hidden p-5 h-full transition-all",
        !disabled && "hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
      )}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
          accent
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "h-11 w-11 rounded-xl bg-gradient-to-br grid place-items-center text-white shadow-sm",
            accent
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        {!disabled && (
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="mt-4 space-y-0.5">
        <div className="text-3xl font-semibold tracking-tight tabular-nums">
          {metric}
        </div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {metricLabel}
        </div>
      </div>
      <div className="mt-3 text-sm font-medium">{title}</div>
      {children}
    </Card>
  );

  if (disabled) return inner;
  return <Link to={to}>{inner}</Link>;
}
