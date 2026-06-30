import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Play,
  Check,
  AlertTriangle,
  Camera,
  ArrowLeft,
  Send,
  MessageSquare,
  Building2,
} from "lucide-react";
import { useCriarChamado, useFuncionarios, useMe, type Categoria, type Unidade } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/camareiras")({
  component: CamareirasPage,
});

type LimpezaStatus = "Pendente" | "Em Andamento" | "Concluído";
type Tarefa = {
  id: string;
  unidade: Unidade;
  quarto: string;
  status: LimpezaStatus;
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

const STORAGE_KEY = "injoy.camareiras.tarefas.v1";
const PRIORIDADE_KEY = "injoy.camareiras.prioridade.v1";

type PrioridadeEntry = {
  key: string;
  unidade: Unidade;
  quarto: string;
  motivo: string;
  criadoEm: string;
};

function loadPrioridade(): PrioridadeEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(PRIORIDADE_KEY) || "[]"); } catch { return []; }
}
function savePrioridade(list: PrioridadeEntry[]) {
  window.localStorage.setItem(PRIORIDADE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("injoy:prioridade-changed"));
}

function buildInitial(): Tarefa[] {
  const arr: Tarefa[] = [];
  (["Botafogo", "Ipanema"] as Unidade[]).forEach((u) => {
    QUARTOS_POR_UNIDADE[u].forEach((q) => {
      arr.push({ id: `${u}-${q}`, unidade: u, quarto: q, status: "Pendente" });
    });
  });
  return arr;
}

function loadTarefas(): Tarefa[] {
  if (typeof window === "undefined") return buildInitial();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildInitial();
    const parsed = JSON.parse(raw) as Tarefa[];
    if (!Array.isArray(parsed) || parsed.length === 0) return buildInitial();
    return parsed;
  } catch {
    return buildInitial();
  }
}

const CATEGORIAS_RAPIDAS: { label: string; backend: Categoria }[] = [
  { label: "Elétrica", backend: "Elétrica" },
  { label: "Hidráulica", backend: "Hidráulica" },
  { label: "Ar Condicionado", backend: "Ar condicionado" },
  { label: "Mobiliário", backend: "Alvenaria" },
  { label: "TV / Internet", backend: "Automação" },
  { label: "Outros", backend: "Alvenaria" },
];

type Urgencia = "Leve" | "Normal" | "Urgente";

function CamareirasPage() {
  const { data: me } = useMe();
  const podeCriar = !!me && (me.isGestor || me.isAdmin || me.isRecepcao || me.isCamareira);

  const [tarefas, setTarefas] = useState<Tarefa[]>(() => loadTarefas());
  const [filtro, setFiltro] = useState<"Todos" | LimpezaStatus>("Todos");
  const [unidadeAtiva, setUnidadeAtiva] = useState<Unidade>("Botafogo");
  const [reportar, setReportar] = useState<Tarefa | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tarefas));
    } catch {
      /* ignore quota */
    }
  }, [tarefas]);

  const visiveis = useMemo(
    () =>
      tarefas
        .filter((t) => t.unidade === unidadeAtiva)
        .filter((t) => filtro === "Todos" || t.status === filtro),
    [tarefas, unidadeAtiva, filtro],
  );

  const alterar = (id: string, novo: LimpezaStatus) =>
    setTarefas((prev) => prev.map((t) => (t.id === id ? { ...t, status: novo } : t)));

  if (reportar) {
    return (
      <ReportarDefeitoForm
        tarefa={reportar}
        onClose={() => setReportar(null)}
        onSucesso={() => {
          // Marca quarto como Urgente visualmente: muda status para "Em Andamento" se Pendente
          setReportar(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Camareiras</h1>
          <p className="text-sm text-muted-foreground">
            Controle de faxina e abertura rápida de manutenção.
          </p>
        </div>
        <Link
          to="/chat"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:border-primary/40"
        >
          <MessageSquare className="h-4 w-4" /> Chat
        </Link>
      </header>

      {/* Unidades */}
      <div className="flex gap-2">
        {(["Botafogo", "Ipanema"] as Unidade[]).map((u) => {
          const active = unidadeAtiva === u;
          return (
            <button
              key={u}
              onClick={() => setUnidadeAtiva(u)}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40",
              )}
            >
              <Building2 className="h-4 w-4" /> {u}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 py-1">
        {(["Todos", "Pendente", "Em Andamento", "Concluído"] as const).map((f) => {
          const active = filtro === f;
          return (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/40",
              )}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {visiveis.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            Nenhum quarto neste filtro.
          </div>
        )}
        {visiveis.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
          >
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-2xl font-black tracking-tight">Q. {t.quarto}</div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                    INJOY {t.unidade}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-md shadow-sm",
                    t.status === "Pendente" && "bg-red-600 text-white",
                    t.status === "Em Andamento" && "bg-[#0b2545] text-white",
                    t.status === "Concluído" && "bg-emerald-600 text-white",
                  )}
                >
                  {t.status}
                </span>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-2 border-t border-border pt-3">
                {!podeCriar ? null : t.status === "Pendente" ? (
                  <button
                    onClick={() => alterar(t.id, "Em Andamento")}
                    className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b2545] hover:bg-[#0b2545]/90 text-white text-sm py-3.5 font-bold active:scale-[0.99] transition shadow-sm"
                  >
                    <Play className="h-4 w-4" /> Iniciar Limpeza
                  </button>
                ) : t.status === "Em Andamento" ? (
                  <button
                    onClick={() => alterar(t.id, "Concluído")}
                    className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm py-3.5 font-bold active:scale-[0.99] transition shadow-sm"
                  >
                    <Check className="h-4 w-4" /> Concluir Faxina
                  </button>
                ) : (
                  <button
                    onClick={() => alterar(t.id, "Pendente")}
                    className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-muted text-foreground text-sm py-3.5 font-semibold"
                  >
                    Reabrir
                  </button>
                )}

                <button
                  onClick={() => setReportar(t)}
                  aria-label={`Reportar defeito no quarto ${t.quarto}`}
                  className="w-full sm:w-auto sm:shrink-0 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-3.5 sm:px-5 active:scale-[0.99] transition shadow-sm"
                >
                  <AlertTriangle className="h-5 w-5" />
                  <span className="sm:hidden">Reportar Defeito</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------- Reportar Defeito -------------------------- */

function ReportarDefeitoForm({
  tarefa,
  onClose,
  onSucesso,
}: {
  tarefa: Tarefa;
  onClose: () => void;
  onSucesso: () => void;
}) {
  const criar = useCriarChamado();
  const { data: me } = useMe();
  const { data: funcionarios = [] } = useFuncionarios();
  const [catLabel, setCatLabel] = useState<string>("");
  const [tecnicoId, setTecnicoId] = useState<string | null>(null);
  const [urgencia, setUrgencia] = useState<Urgencia>("Normal");
  const [descricao, setDescricao] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [tecnicoAcionado, setTecnicoAcionado] = useState<string | null>(null);
  const [categoriaAcionada, setCategoriaAcionada] = useState<string>("");

  const catSelecionada = CATEGORIAS_RAPIDAS.find((c) => c.label === catLabel);
  const tecnicosDaCategoria = catSelecionada
    ? funcionarios.filter((f) => f.categorias.includes(catSelecionada.backend))
    : [];

  // Auto-seleciona se houver apenas 1 técnico; reseta quando muda a categoria.
  useEffect(() => {
    if (tecnicosDaCategoria.length === 1) {
      setTecnicoId(tecnicosDaCategoria[0].id);
    } else {
      setTecnicoId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catLabel, funcionarios.length]);

  const precisaEscolherTecnico = tecnicosDaCategoria.length >= 2 && !tecnicoId;
  const podeEnviar = !!catLabel && !precisaEscolherTecnico && !criar.isPending;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeEnviar || !catSelecionada) return;

    const tecnicoEscolhido = tecnicosDaCategoria.find((f) => f.id === tecnicoId);
    const responsavelId = tecnicoEscolhido?.id ?? null;
    const tecnicoNome = tecnicoEscolhido?.nome ?? "Pendente de Atribuição";

    const prefixoUrg =
      urgencia === "Urgente"
        ? "🚨 URGENTE — bloqueia quarto. "
        : urgencia === "Leve"
          ? "Prioridade leve. "
          : "";
    const obs = descricao.trim() ? ` Obs.: ${descricao.trim()}` : "";
    const fotoNota = foto ? " [Foto anexada pela camareira]" : "";
    const tecnicoNota = ` [Técnico responsável: ${tecnicoNome}]`;
    const descricaoFinal = `[Quarto ${tarefa.quarto}] ${prefixoUrg}${catLabel}.${obs}${fotoNota}${tecnicoNota}`;

    criar.mutate(
      {
        unidade: tarefa.unidade,
        categoria: catSelecionada.backend,
        descricao: descricaoFinal,
        responsavelId,
      },
      {
        onSuccess: async (novo) => {
          console.log("[camareiras] chamado criado", {
            chamado: novo,
            tecnicoResponsavel: tecnicoNome,
            categoria: catLabel,
            quarto: tarefa.quarto,
          });

          // 🚨 Notifica a RECEPÇÃO quando o chamado URGENTE bloqueia o quarto
          if (urgencia === "Urgente" && me?.userId) {
            try {
              const { data: recep, error: recepErr } = await supabase
                .rpc("get_recepcao_user_ids");
              if (recepErr) throw recepErr;
              const destinatarios = (recep ?? []).filter(
                (r: { user_id: string }) => r.user_id !== me.userId,
              );
              if (destinatarios.length > 0) {
                const aviso =
                  `🚨 QUARTO BLOQUEADO — Q. ${tarefa.quarto} (INJOY ${tarefa.unidade})\n` +
                  `Defeito URGENTE reportado: ${catLabel}.\n` +
                  `Técnico acionado: ${tecnicoNome}.\n` +
                  (descricao.trim() ? `Obs.: ${descricao.trim()}\n` : "") +
                  `⚠️ Não vender este quarto até liberação.`;
                const rows = destinatarios.map((r: { user_id: string }) => ({
                  remetente_id: me.userId!,
                  destinatario_id: r.user_id,
                  conteudo: aviso,
                }));
                const { error: msgErr } = await supabase.from("mensagens").insert(rows);
                if (msgErr) throw msgErr;
                toast.success(`Recepção notificada (${destinatarios.length}) — quarto bloqueado.`);
              } else {
                toast.message("Nenhum recepcionista cadastrado para notificar.");
              }
            } catch (e) {
              console.error("[camareiras] falha ao notificar recepção", e);
              toast.error("Chamado criado, mas não foi possível notificar a recepção.");
            }
          }

          setTecnicoAcionado(tecnicoNome);
          setCategoriaAcionada(catLabel);
          setSucesso(true);
          toast.success(`Chamado enviado para ${tecnicoNome}`);
          setTimeout(() => {
            onSucesso();
          }, 2200);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };


  const onFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFoto(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  if (sucesso) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
        <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 grid place-items-center mb-4 shadow-sm">
          <Check className="h-10 w-10 stroke-[3]" />
        </div>
        <h2 className="text-2xl font-black">Defeito reportado!</h2>
        {tecnicoAcionado && tecnicoAcionado !== "Pendente de Atribuição" ? (
          <p className="text-foreground mt-3 max-w-md">
            O técnico <span className="font-bold">{tecnicoAcionado}</span>{" "}
            <span className="text-muted-foreground">
              (Especialista em {categoriaAcionada})
            </span>{" "}
            já recebeu o chamado para o{" "}
            <span className="font-bold">Q. {tarefa.quarto}</span>!
          </p>
        ) : (
          <p className="text-foreground mt-3 max-w-md">
            Chamado do <span className="font-bold">Q. {tarefa.quarto}</span>{" "}
            registrado como{" "}
            <span className="font-bold">Pendente de Atribuição</span>. O gestor
            irá direcionar ao técnico responsável.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-10 -my-6 lg:-my-10">
      <div className="bg-red-600 text-white px-4 py-4 shadow-md flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Voltar"
          className="p-1 rounded-lg active:bg-red-700"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">Reportar Defeito</h1>
          <p className="text-xs text-red-100">
            Quarto {tarefa.quarto} · INJOY {tarefa.unidade}
          </p>
        </div>
      </div>

      <form onSubmit={enviar} className="p-4 space-y-5 max-w-2xl mx-auto">
        {/* Categorias */}
        <div>
          <label className="block text-sm font-bold mb-2">Qual é o problema?</label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIAS_RAPIDAS.map((c) => {
              const active = catLabel === c.label;
              return (
                <button
                  type="button"
                  key={c.label}
                  onClick={() => setCatLabel(c.label)}
                  className={cn(
                    "py-3 px-3 rounded-xl border font-semibold text-sm transition-all",
                    active
                      ? "bg-red-50 dark:bg-red-950/30 border-red-500 text-red-700 dark:text-red-400 ring-1 ring-red-500"
                      : "bg-card border-border text-foreground/80 hover:border-primary/40",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Seleção de técnico (apenas se houver 2+ cadastrados na categoria) */}
        {catLabel && tecnicosDaCategoria.length >= 2 && (
          <div>
            <label className="block text-sm font-bold mb-2">
              Qual técnico vai atender?
            </label>
            <div className="grid grid-cols-1 gap-2">
              {tecnicosDaCategoria.map((t) => {
                const active = tecnicoId === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTecnicoId(t.id)}
                    className={cn(
                      "py-3 px-3 rounded-xl border text-left transition-all",
                      active
                        ? "bg-red-50 dark:bg-red-950/30 border-red-500 text-red-700 dark:text-red-400 ring-1 ring-red-500 font-bold"
                        : "bg-card border-border text-foreground/80 hover:border-primary/40 font-semibold",
                    )}
                  >
                    <div className="text-sm">{t.nome}</div>
                    <div className="text-[11px] text-muted-foreground font-normal">
                      {t.categorias.join(" · ")}
                    </div>
                  </button>
                );
              })}
            </div>
            {precisaEscolherTecnico && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                Escolha o técnico que deve atender este chamado.
              </p>
            )}
          </div>
        )}



        {/* Urgência */}
        <div>
          <label className="block text-sm font-bold mb-2">Bloqueia a venda do quarto?</label>
          <div className="flex gap-2">
            {([
              { nivel: "Leve", desc: "Não impede venda" },
              { nivel: "Normal", desc: "Consertar logo" },
              { nivel: "Urgente", desc: "Bloqueia quarto!" },
            ] as { nivel: Urgencia; desc: string }[]).map((u) => {
              const active = urgencia === u.nivel;
              const palette =
                u.nivel === "Leve"
                  ? "border-amber-300 text-amber-700 bg-amber-50 ring-amber-500 dark:bg-amber-950/30 dark:text-amber-400"
                  : u.nivel === "Normal"
                    ? "border-orange-300 text-orange-700 bg-orange-50 ring-orange-500 dark:bg-orange-950/30 dark:text-orange-400"
                    : "border-red-500 text-red-700 bg-red-50 ring-red-500 dark:bg-red-950/30 dark:text-red-400";
              return (
                <button
                  type="button"
                  key={u.nivel}
                  onClick={() => setUrgencia(u.nivel)}
                  className={cn(
                    "flex-1 py-3 px-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center",
                    active
                      ? `${palette} ring-2 ring-offset-1 font-bold`
                      : "bg-card border-border text-muted-foreground opacity-70",
                  )}
                >
                  <span className="text-sm">{u.nivel}</span>
                  <span className="text-[10px] leading-tight mt-0.5 font-normal">{u.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Foto */}
        <div>
          <label className="block text-sm font-bold mb-2">Foto do Problema (Opcional)</label>
          {foto ? (
            <div className="relative">
              <img
                src={foto}
                alt="Prévia do defeito"
                className="w-full max-h-64 object-cover rounded-xl border border-border"
              />
              <button
                type="button"
                onClick={() => setFoto(null)}
                className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md"
              >
                Remover
              </button>
            </div>
          ) : (
            <label className="w-full cursor-pointer bg-card border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground active:bg-muted/50 transition-colors">
              <div className="p-3 bg-muted rounded-full">
                <Camera className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium">Tirar foto com o celular</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onFotoChange}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Observações */}
        <div>
          <label className="block text-sm font-bold mb-2">Observações Adicionais</label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descreva brevemente o problema encontrado..."
            className="w-full bg-card border border-border rounded-xl p-3 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none h-24 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={!podeEnviar}
          className={cn(
            "w-full py-3.5 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all shadow-sm",
            podeEnviar ? "bg-red-600 active:bg-red-700" : "bg-muted-foreground/40 cursor-not-allowed",
          )}
        >
          <Send className="h-4 w-4" />
          {criar.isPending ? "Enviando..." : "Abrir Ordem de Serviço"}
        </button>
      </form>
    </div>
  );
}
