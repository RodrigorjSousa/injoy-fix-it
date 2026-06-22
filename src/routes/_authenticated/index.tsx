import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Snowflake,
  Zap,
  Cpu,
  Droplets,
  Hammer,
  PaintRoller,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CATEGORIAS,
  UNIDADES,
  useCriarChamado,
  useFuncionarios,
  useMe,
  type Categoria,
  type Unidade,
} from "@/lib/store";

export const Route = createFileRoute("/_authenticated/")({
  component: NovoChamado,
});

const ICONS: Record<Categoria, typeof Snowflake> = {
  "Ar condicionado": Snowflake,
  "Elétrica": Zap,
  "Automação": Cpu,
  "Hidráulica": Droplets,
  "Alvenaria": Hammer,
  "Pintura": PaintRoller,
};

const QUARTOS_POR_UNIDADE: Record<Unidade, string[]> = {
  Botafogo: [
    "001","002","003","005","006","107","108","109","110","111",
    "112","113","114","115","117","118","301","401","501",
  ],
  Ipanema: [
    "001","002","103","104","205","206","307","308","309","410","411","412",
  ],
};

function NovoChamado() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: funcionarios = [] } = useFuncionarios();
  const criar = useCriarChamado();
  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [quarto, setQuarto] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [descricao, setDescricao] = useState("");

  // Funcionários não criam chamados — vão direto ao painel ver os seus
  if (me && !me.isGestor) return <Navigate to="/painel" replace />;

  const responsavel = useMemo(
    () => (categoria ? funcionarios.find((f) => f.categorias.includes(categoria)) : undefined),
    [categoria, funcionarios],
  );

  const quartosDisponiveis = unidade ? QUARTOS_POR_UNIDADE[unidade] : [];
  const precisaQuarto = !!unidade && quartosDisponiveis.length > 0;
  const quartoOk = !precisaQuarto || !!quarto;
  const podeEnviar =
    !!unidade && quartoOk && !!categoria && descricao.trim().length > 3 && !criar.isPending;

  const submit = () => {
    if (!podeEnviar || !unidade || !categoria) return;
    const descricaoFinal = precisaQuarto && quarto
      ? `[Quarto ${quarto}] ${descricao.trim()}`
      : descricao.trim();
    criar.mutate(
      {
        unidade,
        categoria,
        descricao: descricaoFinal,
        responsavelId: responsavel?.id ?? null,
      },
      {
        onSuccess: () => {
          toast.success("Chamado aberto com sucesso", {
            description: responsavel
              ? `Designado para ${responsavel.nome}`
              : "Sem responsável designado",
          });
          navigate({ to: "/painel" });
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-8">
      <header>
        <Badge variant="secondary" className="mb-3 rounded-full font-medium">
          Abertura rápida
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Novo Chamado</h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Registre uma ocorrência em poucos cliques. O responsável é sugerido automaticamente com base na categoria.
        </p>
      </header>

      <section className="space-y-3">
        <StepLabel n={1} title="Selecione a unidade" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {UNIDADES.map((u) => {
            const active = unidade === u;
            return (
              <button
                key={u}
                type="button"
                onClick={() => {
                  setUnidade(u);
                  setQuarto(null);
                }}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border bg-card p-6 text-left transition-all",
                  "hover:border-primary/50 hover:shadow-md",
                  active && "border-primary ring-2 ring-primary/30 bg-primary/5",
                )}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "h-12 w-12 rounded-xl grid place-items-center transition-colors",
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                    )}
                  >
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">INJOY</div>
                    <div className="text-xl font-semibold">{u}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {precisaQuarto && (
        <section className="space-y-3">
          <StepLabel n={2} title="Em qual quarto?" />
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {quartosDisponiveis.map((q) => {
              const active = quarto === q;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuarto(q)}
                  className={cn(
                    "rounded-xl border bg-card px-3 py-3 text-sm font-semibold tabular-nums transition-all",
                    "hover:border-primary/50 hover:shadow-sm",
                    active && "border-primary ring-2 ring-primary/30 bg-primary/5 text-primary",
                  )}
                >
                  {q}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <StepLabel n={precisaQuarto ? 3 : 2} title="Categoria do problema" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CATEGORIAS.map((c) => {
            const Icon = ICONS[c];
            const active = categoria === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategoria(c)}
                className={cn(
                  "rounded-2xl border bg-card p-4 flex flex-col items-center gap-2 transition-all",
                  "hover:border-primary/50 hover:shadow-md",
                  active && "border-primary ring-2 ring-primary/30 bg-primary/5",
                )}
              >
                <div
                  className={cn(
                    "h-12 w-12 rounded-xl grid place-items-center transition-colors",
                    active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                  )}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <span className="text-sm font-medium text-center leading-tight">{c}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <StepLabel n={precisaQuarto ? 4 : 3} title="Descreva brevemente" />
        <Textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex.: Tomada do quarto 302 sem energia desde a manhã."
          className="min-h-[110px] resize-none bg-card"
        />
      </section>

      {categoria && (
        <Card className="p-4 flex items-center justify-between gap-3 bg-accent/20 border-accent/40">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Responsável sugerido</div>
            <div className="font-semibold truncate">
              {responsavel ? responsavel.nome : "Nenhum técnico cadastrado para esta categoria"}
            </div>
          </div>
          {responsavel && (
            <Badge variant="outline" className="shrink-0">
              {responsavel.categorias.length} categorias
            </Badge>
          )}
        </Card>
      )}

      <div className="sticky bottom-20 lg:bottom-6 lg:static z-10">
        <Button
          size="lg"
          className="w-full h-14 text-base font-semibold rounded-xl shadow-lg"
          disabled={!podeEnviar}
          onClick={submit}
        >
          {criar.isPending ? "Enviando..." : "Abrir Chamado"}
          <ArrowRight className="ml-1 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

function StepLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm font-bold grid place-items-center">
        {n}
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
}
