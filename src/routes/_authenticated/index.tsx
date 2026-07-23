import { createFileRoute, useNavigate, Navigate, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  CATEGORIAS,
  UNIDADES,
  useCriarChamado,
  useFuncionarios,
  useMe,
  type Categoria,
  type Midia,
  type Unidade,
} from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { AudioDictationButton } from "@/components/audio-dictation-button";
import { MediaCapture } from "@/components/media-capture";

type TecnicoRPC = { id: string; nome: string; categorias: string[] | null };

const normalize = (s: string) => s.trim().toLowerCase();



export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (s: Record<string, unknown>) => ({
    categoria: (typeof s.categoria === "string" ? (s.categoria as Categoria) : undefined) as
      | Categoria
      | undefined,
    abrir: s.abrir === "1" || s.abrir === 1 ? 1 : undefined,
  }),
  beforeLoad: ({ search }) => {
    // Raiz autenticada abre a tela de Boas-Vindas por padrão.
    // Mantém a tela de abertura de chamado quando há `categoria` (deep-link)
    // ou `abrir=1` (botão "Abrir chamado" no catálogo de serviços).
    if (!search.categoria && !search.abrir) {
      throw redirect({ to: "/boas-vindas", replace: true });
    }
  },

  component: NovoChamado,
});


const ICONS: Record<Categoria, typeof Snowflake> = {
  "Ar condicionado": Snowflake,
  "Elétrica": Zap,
  "Automação": Cpu,
  "Hidráulica": Droplets,
  "Alvenaria": Hammer,
  "Pintura": PaintRoller,
  "Marcenaria": Hammer,
};

const AREA_COMUM = "Área comum";
const QUARTOS_POR_UNIDADE: Record<Unidade, string[]> = {
  Botafogo: [
    "01","02","03","05","06","107","108","109","110","111",
    "112","113","114","115","117","118","301","401","501", AREA_COMUM,
  ],
  Ipanema: [
    "01","02","103","104","205","206","307","308","309","410","411","412", AREA_COMUM,
  ],
};

function NovoChamado() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: funcionarios = [] } = useFuncionarios();
  const criar = useCriarChamado();
  const { categoria: categoriaFromUrl } = Route.useSearch();
  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [quarto, setQuarto] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<Categoria | null>(categoriaFromUrl ?? null);
  
  const [descricao, setDescricao] = useState("");
  const [midias, setMidias] = useState<Midia[]>([]);
  const [uploading, setUploading] = useState(false);


  // Sync when navigating to /?categoria=...
  useEffect(() => {
    if (categoriaFromUrl && categoriaFromUrl !== categoria) {
      setCategoria(categoriaFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaFromUrl]);

  // Qualquer usuário autenticado pode abrir chamados
  const podeCriar = !!me;
  if (me && !podeCriar) return <Navigate to="/painel" replace />;




  // Busca todos os técnicos via RPC segura (mostra id/nome/categorias para
  // qualquer usuário autenticado). Usada para resolver o nome escolhido
  // no dropdown para o UUID gravado em `responsavel_id`.
  const { data: todosTecnicos = [] } = useQuery({
    queryKey: ["list-tecnicos"],
    queryFn: async (): Promise<TecnicoRPC[]> => {
      const { data, error } = await supabase.rpc("list_tecnicos" as never);
      if (error) throw error;
      return (data ?? []) as TecnicoRPC[];
    },
  });

  const tecnicosDisponiveis = useMemo(() => {
    if (!categoria) return [];
    const fonte: TecnicoRPC[] = todosTecnicos.length
      ? todosTecnicos
      : funcionarios.map((f) => ({ id: f.id, nome: f.nome, categorias: f.categorias ?? [] }));
    const categoriaAtual = normalize(categoria);
    return fonte
      .filter((t) => (t.categorias ?? []).some((c) => normalize(c) === categoriaAtual))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [categoria, funcionarios, todosTecnicos]);
  const [tecnicoNome, setTecnicoNome] = useState<string | null>(null);

  // Reseta a seleção ao trocar de categoria — escolha é sempre obrigatória.
  useEffect(() => {
    setTecnicoNome(null);
    
  }, [categoria]);

  const responsavel = useMemo(() => {
    if (!tecnicoNome) return null;
    return (
      tecnicosDisponiveis.find((t) => normalize(t.nome) === normalize(tecnicoNome)) ||
      todosTecnicos.find((t) => normalize(t.nome) === normalize(tecnicoNome)) ||
      funcionarios.find((f) => normalize(f.nome) === normalize(tecnicoNome)) ||
      null
    );
  }, [tecnicoNome, tecnicosDisponiveis, todosTecnicos, funcionarios]);

  const quartosDisponiveis = unidade ? QUARTOS_POR_UNIDADE[unidade] : [];
  const precisaQuarto = !!unidade && quartosDisponiveis.length > 0;
  const quartoOk = !precisaQuarto || !!quarto;
  const podeEnviar =
    !!unidade &&
    quartoOk &&
    !!categoria &&
    !!responsavel?.id &&
    descricao.trim().length > 3 &&
    !criar.isPending &&
    !uploading;



  const submit = () => {
    if (!podeEnviar || !unidade || !categoria) return;
    const descricaoFinal = precisaQuarto && quarto
      ? `[${quarto === AREA_COMUM ? "Área comum" : `Quarto ${quarto}`}] ${descricao.trim()}`
      : descricao.trim();
    criar.mutate(
      {
        unidade,
        categoria,
        descricao: descricaoFinal,
        responsavelId: responsavel?.id ?? null,
        midias,
      },

      {
        onSuccess: () => {
          toast.success("Chamado aberto com sucesso", {
            description: `Designado para ${tecnicoNome}`,
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
          <StepLabel n={2} title="Em qual local?" />
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {quartosDisponiveis.map((q) => {
              const active = quarto === q;
              const isArea = q === AREA_COMUM;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuarto(q)}
                  className={cn(
                    "rounded-xl border bg-card px-3 py-3 text-sm font-semibold transition-all",
                    !isArea && "tabular-nums",
                    isArea && "col-span-4 sm:col-span-6 bg-accent/30",
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
        <AudioDictationButton
          onTranscript={(text) =>
            setDescricao((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
          }
        />
        <Textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Digite ou grave um áudio (ex.: Tomada do quarto 302 sem energia desde a manhã)."
          className="min-h-[110px] resize-none bg-card"
        />
      </section>

      <section className="space-y-3">
        <StepLabel
          n={precisaQuarto ? 5 : 4}
          title="Anexar fotos ou vídeo (opcional)"
        />
        <MediaCapture
          midias={midias}
          onAdd={(m) => setMidias((prev) => [...prev, m])}
          onRemove={(url) => setMidias((prev) => prev.filter((m) => m.url !== url))}
          uploading={uploading}
          setUploading={setUploading}
        />
      </section>


      {categoria && (
        <section className="space-y-3">
          <StepLabel
            n={precisaQuarto ? 6 : 5}
            title="Técnico Responsável *"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tecnicosDisponiveis.map((tecnico) => {
              const active = tecnicoNome === tecnico.nome;
              return (
                <button
                  key={tecnico.id}
                  type="button"
                  onClick={() => setTecnicoNome(tecnico.nome)}
                  className={cn(
                    "rounded-xl border bg-card p-3 text-left transition-all",
                    "hover:border-primary/50 hover:shadow-sm",
                    active && "border-primary ring-2 ring-primary/30 bg-primary/5",
                  )}
                >
                  <div className="font-semibold truncate">🛠️ {tecnico.nome}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    Técnico de {categoria}
                  </div>
                </button>
              );
            })}
          </div>
          {tecnicosDisponiveis.length === 0 && (
            <p className="text-xs text-destructive font-medium">
              Nenhum técnico cadastrado para esta categoria. Atualize o cadastro da equipe antes de abrir o chamado.
            </p>
          )}
          {!tecnicoNome && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              Selecione obrigatoriamente o técnico que deve atender este chamado.
            </p>
          )}
        </section>
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

