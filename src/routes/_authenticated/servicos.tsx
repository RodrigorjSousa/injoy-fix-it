import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  PlusCircle,
  Package,
  ShoppingBag,
  ConciergeBell,
  BedDouble,
  Cog,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChamados, useFuncionarios, useMe, type Chamado, type Funcionario } from "@/lib/store";
import { useUnidade } from "@/lib/unidade-context";
import { RetiradaAlmoxarifadoModal } from "@/components/almoxarifado/retirada-modal";
import { EstoqueGeralModal } from "@/components/almoxarifado/estoque-geral-modal";
import { SolicitarCompraModal } from "@/components/almoxarifado/solicitar-compra-modal";
import { RecadosGestorAlert } from "@/components/recados-gestor/recados-gestor-alert";

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
  btn: string;
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
    btn: "bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500 active:bg-amber-700 text-white",
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
    btn: "bg-sky-500 hover:bg-sky-600 focus-visible:ring-sky-500 active:bg-sky-700 text-white",
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
    btn: "bg-red-600 hover:bg-red-700 focus-visible:ring-red-600 active:bg-red-800 text-white",
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
    btn: "bg-blue-500 hover:bg-blue-600 focus-visible:ring-blue-500 active:bg-blue-700 text-white",
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
    btn: "bg-emerald-500 hover:bg-emerald-600 focus-visible:ring-emerald-500 active:bg-emerald-700 text-white",
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
    btn: "bg-orange-600 hover:bg-orange-700 focus-visible:ring-orange-600 active:bg-orange-800 text-white",
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
  const { unidade } = useUnidade();

  return (
    <div className="space-y-6">
      <RecadosGestorAlert setor="manutencao" unidade={unidade} />
      <header>
        <Badge variant="secondary" className="mb-3 rounded-full">
          <Wrench className="h-3 w-3 mr-1" /> Serviços
        </Badge>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Catálogo de serviços
            </h1>
            <p className="text-muted-foreground mt-1">
              Escolha uma categoria para ver os chamados correspondentes.
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md w-full sm:w-auto"
          >
            <Link to="/" search={{ abrir: 1 } as never}>
              <PlusCircle className="h-5 w-5 mr-2" />
              Abrir chamado
            </Link>
          </Button>
        </div>
      </header>

      <AlmoxarifadoTecnicoBotao />


      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SERVICOS.map((s) => {
          const Icon = s.icon;
          const abertos = contarAbertos(chamados, s);
          const tecnicos = tecnicosDe(funcionarios, s.categoria);
          const piscando = abertos > 0;
          return (
            <Card
              key={s.key}
              className={cn(
                "group relative overflow-hidden p-5 h-full flex flex-col border bg-gradient-to-br transition-all hover:shadow-lg hover:-translate-y-0.5",
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

              <div className="mt-auto pt-4 flex flex-col gap-2">
                <Link
                  to={s.to}
                  search={s.search}
                  className="flex items-center justify-end text-xs font-medium opacity-80 hover:opacity-100 transition-opacity"
                >
                  Ver chamados
                  <ChevronRight className="h-4 w-4 ml-1 transition-transform hover:translate-x-0.5" />
                </Link>
                <Button
                  asChild
                  size="sm"
                  className={cn(
                    "w-full font-semibold shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 transition-colors",
                    s.btn,
                  )}
                >
                  <Link to="/" search={{ categoria: s.categoria as never }}>
                    <PlusCircle className="h-4 w-4 mr-1.5" />
                    Abrir chamado
                  </Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AlmoxarifadoTecnicoBotao() {
  const [open, setOpen] = useState(false);
  const [openEstoque, setOpenEstoque] = useState(false);
  const [openCompra, setOpenCompra] = useState(false);
  const { unidade } = useUnidade();
  const { data: me } = useMe();
  const nome = me?.funcionario?.nome || "Técnico";
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-md transition-all"
      >
        <div className="h-11 w-11 rounded-xl bg-white/20 grid place-items-center shrink-0">
          <Package className="h-5 w-5" />
        </div>
        <div className="text-left flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-200">📦 Almoxarifado</p>
          <p className="text-base font-black">Retirar Material do Estoque</p>
          <p className="text-[11px] text-purple-100/90">
            Peças, filtros, ferramentas e insumos para o serviço
          </p>
        </div>
        <ChevronRight className="h-5 w-5 opacity-80" />
      </button>
      <button
        onClick={() => setOpenEstoque(true)}
        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-200 hover:border-purple-300 hover:bg-purple-50/40 text-slate-800 shadow-sm transition-all"
      >
        <div className="h-11 w-11 rounded-xl bg-purple-100 text-purple-700 grid place-items-center shrink-0">
          <Package className="h-5 w-5" />
        </div>
        <div className="text-left flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-600">📋 Estoque Geral</p>
          <p className="text-base font-black">Consultar estoque (somente leitura)</p>
          <p className="text-[11px] text-slate-500">
            Veja o que está disponível antes de solicitar retirada
          </p>
        </div>
        <ChevronRight className="h-5 w-5 opacity-60" />
      </button>
      <button
        onClick={() => setOpenCompra(true)}
        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md transition-all"
      >
        <div className="h-11 w-11 rounded-xl bg-white/20 grid place-items-center shrink-0">
          <ShoppingBag className="h-5 w-5" />
        </div>
        <div className="text-left flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-100">🛒 Compras</p>
          <p className="text-base font-black">Solicitar Compra de Material</p>
          <p className="text-[11px] text-amber-50/90">
            Peça ao gestor para comprar o que está faltando
          </p>
        </div>
        <ChevronRight className="h-5 w-5 opacity-80" />
      </button>
      <RetiradaAlmoxarifadoModal
        open={open}
        onClose={() => setOpen(false)}
        unidade={unidade}
        funcionarioName={nome}
      />
      <EstoqueGeralModal
        open={openEstoque}
        onClose={() => setOpenEstoque(false)}
        unidade={unidade}
      />
      <SolicitarCompraModal
        open={openCompra}
        onClose={() => setOpenCompra(false)}
        unidade={unidade}
        origem="manutencao"
      />
    </>
  );
}
