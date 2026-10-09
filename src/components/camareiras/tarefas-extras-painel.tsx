import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, ClipboardCheck, Pencil, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { todaySP } from "@/lib/tz";
import { Link } from "@tanstack/react-router";
import { useTarefasExtrasItems, type CategoryKey } from "@/components/camareiras/tarefas-extras-modal";
import { registroDaCategoria, useCategoriasDaUnidade, type CategoriaTE } from "@/lib/tarefas-extras-categorias";
import {
  calcularSituacaoTarefa,
  dataBR,
  type AgendaManual,
  type SituacaoTarefa,
} from "@/lib/tarefas-extras-status";

const PERIODICITY_KEY = "tarefas_extras_periodicity";
type Unidade = "Botafogo" | "Ipanema";
type Categoria = CategoriaTE;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Dados {
  periodicidade: Partial<Record<CategoryKey, number>>;
  logs: Array<{ tarefas: string[]; em: string; quem: string | null }>;
  agenda: Partial<Record<CategoryKey, AgendaManual>>;
}

function useDadosTarefasExtras(unidade: Unidade) {
  const qc = useQueryClient();
  const chave = ["tarefas_extras_status", unidade];

  useEffect(() => {
    const channel = supabase
      .channel(`tarefas_extras_painel_${unidade}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "extra_tasks_logs" }, () =>
        qc.invalidateQueries({ queryKey: chave }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "tarefas_extras_agenda" }, () =>
        qc.invalidateQueries({ queryKey: chave }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () =>
        qc.invalidateQueries({ queryKey: chave }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade]);

  return useQuery({
    queryKey: chave,
    queryFn: async (): Promise<Dados> => {
      const [cfgRes, logsRes, agendaRes] = await Promise.all([
        db.from("app_settings").select("value").eq("key", PERIODICITY_KEY).maybeSingle(),
        supabase
          .from("extra_tasks_logs")
          .select("completed_tasks, created_at, camareira_name")
          .eq("property", unidade)
          .order("created_at", { ascending: false })
          .limit(500),
        db.from("tarefas_extras_agenda").select("categoria, proxima_data, definido_em").eq("unidade", unidade),
      ]);
      if (logsRes.error) throw new Error(logsRes.error.message);

      let periodicidade: Dados["periodicidade"] = {};
      try {
        const parsed = JSON.parse((cfgRes.data as { value?: string } | null)?.value ?? "{}");
        if (parsed && typeof parsed === "object") periodicidade = parsed;
      } catch {
        /* ignora */
      }

      const logs: Dados["logs"] = ((logsRes.data ?? []) as Array<{ completed_tasks: unknown; created_at: string; camareira_name: string | null }>).map((row) => ({
        tarefas: (Array.isArray(row.completed_tasks) ? row.completed_tasks : []).filter((t): t is string => typeof t === "string"),
        em: row.created_at,
        quem: row.camareira_name?.trim() || null,
      }));

      // Antes da migração 0040 a tabela não existe: segue só com o cálculo automático.
      const agenda: Dados["agenda"] = {};
      if (!agendaRes.error) {
        for (const a of (agendaRes.data ?? []) as Array<{ categoria: CategoryKey; proxima_data: string; definido_em: string }>) {
          agenda[a.categoria] = { proxima_data: a.proxima_data, definido_em: a.definido_em };
        }
      }
      return { periodicidade, logs, agenda };
    },
  });
}

const STATUS_UI = {
  atrasada: { dot: "bg-red-500", badge: "border-red-200 bg-red-50 text-red-700", icone: "bg-red-50" },
  hoje: { dot: "bg-amber-500", badge: "border-amber-200 bg-amber-50 text-amber-800", icone: "bg-amber-50" },
  nunca: { dot: "bg-slate-400", badge: "border-slate-200 bg-slate-50 text-slate-700", icone: "bg-slate-50" },
  em_dia: { dot: "bg-emerald-500", badge: "border-emerald-200 bg-emerald-50 text-emerald-700", icone: "bg-emerald-50" },
} as const;

function rotuloStatus(s: SituacaoTarefa) {
  if (s.status === "atrasada") return `Atrasada há ${-s.diasParaProxima} dia${s.diasParaProxima === -1 ? "" : "s"}`;
  if (s.status === "hoje") return "Fazer hoje";
  if (s.status === "nunca") return "Nunca registrada";
  return `Em dia · faltam ${s.diasParaProxima} dia${s.diasParaProxima === 1 ? "" : "s"}`;
}

function CartaoTarefa({
  cat,
  unidade,
  s,
  podeEditar,
  onAbrir,
  onEditar,
}: {
  cat: Categoria;
  unidade: Unidade;
  s: SituacaoTarefa;
  podeEditar: boolean;
  onAbrir: () => void;
  onEditar: () => void;
}) {
  const Icon = cat.icon;
  const itens = useTarefasExtrasItems(unidade, cat.key, cat.defaults);
  const ui = STATUS_UI[s.status];
  const pendente = s.status !== "em_dia";
  return (
    <div className="relative flex flex-col gap-3 rounded-2xl border bg-white p-4 text-slate-800 shadow-sm">
      <span className={cn("absolute right-4 top-4 h-3.5 w-3.5 rounded-full ring-4 ring-white", ui.dot, s.status === "atrasada" && "animate-pulse")} />
      <div className="flex items-center gap-3 pr-6">
        <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow", cat.gradient)}>
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
            {itens.length} {itens.length === 1 ? "item" : "itens"}
          </p>
          <p className="truncate text-base font-black leading-tight">{cat.label}</p>
          <p className="text-xs text-slate-500">{unidade}</p>
        </div>
      </div>

      <div className="space-y-1.5 text-sm">
        <p className="flex items-center gap-1.5 text-slate-600">
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
          Realizado:{" "}
          {s.ultimaData ? (
            <>
              <strong className="text-slate-800">{dataBR(s.ultimaData)}</strong>
              <span className="text-xs text-slate-400">({s.diasDesde === 0 ? "hoje" : `${s.diasDesde}d atrás`})</span>
            </>
          ) : (
            <strong className="text-slate-500">nunca</strong>
          )}
        </p>
        <p className="flex items-center gap-1.5 text-slate-600">
          <User className="h-4 w-4 shrink-0 text-slate-400" />
          Por: <strong className="truncate text-slate-800">{s.quem ?? "—"}</strong>
        </p>
        <div className="flex items-center gap-1.5 text-slate-600">
          {s.status === "atrasada" ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          ) : (
            <CalendarClock className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          Próxima:{" "}
          <strong className={cn(s.status === "atrasada" ? "text-red-600" : s.status === "hoje" ? "text-amber-700" : "text-slate-800")}>
            {dataBR(s.proxima)}
          </strong>
          <span className="text-xs text-slate-400">
            {s.proximaManual ? "(definida pelo gestor)" : `(a cada ${s.periodo} dias)`}
          </span>
          {podeEditar && (
            <button
              type="button"
              onClick={onEditar}
              className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label={`Editar próxima execução de ${cat.label}`}
              title="Editar próxima execução"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <span className={cn("inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", ui.badge)}>
        {s.status === "em_dia" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        {rotuloStatus(s)}
      </span>

      <Button
        type="button"
        onClick={onAbrir}
        variant={pendente ? "default" : "outline"}
        className={cn("mt-auto w-full gap-2 font-bold", pendente && "bg-teal-700 hover:bg-teal-800 text-white")}
      >
        <ClipboardCheck className="h-4 w-4" /> Abrir checklist & registrar
      </Button>
    </div>
  );
}

function EditarProxima({
  alvo,
  unidade,
  periodicidade,
  onClose,
}: {
  alvo: { cat: Categoria; s: SituacaoTarefa } | null;
  unidade: Unidade;
  periodicidade: Partial<Record<CategoryKey, number>>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [data, setData] = useState("");
  const [periodo, setPeriodo] = useState("7");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!alvo) return;
    setData(alvo.s.proxima);
    setPeriodo(String(alvo.s.periodo));
  }, [alvo]);

  if (!alvo) return null;
  const atualizar = () => qc.invalidateQueries({ queryKey: ["tarefas_extras_status", unidade] });

  const salvarPeriodo = async () => {
    const n = Number(periodo);
    if (!Number.isFinite(n) || n < 1) throw new Error("Informe a frequência em dias (1 ou mais).");
    if (n === alvo.s.periodo) return;
    const novo = { ...periodicidade, [alvo.cat.key]: Math.round(n) };
    const { error } = await db.from("app_settings").upsert({ key: PERIODICITY_KEY, value: JSON.stringify(novo) });
    if (error) throw new Error(error.message);
  };

  const salvar = async () => {
    if (!data) return toast.error("Escolha a data da próxima execução.");
    setSalvando(true);
    try {
      await salvarPeriodo();
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("tarefas_extras_agenda").upsert({
        unidade,
        categoria: alvo.cat.key,
        proxima_data: data,
        definido_em: new Date().toISOString(),
        definido_por: auth.user?.id ?? null,
      });
      if (error) throw new Error(error.message);
      toast.success(`Próxima execução de ${alvo.cat.label}: ${dataBR(data)}`);
      atualizar();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  const automatico = async () => {
    setSalvando(true);
    try {
      await salvarPeriodo();
      const { error } = await db.from("tarefas_extras_agenda").delete().eq("unidade", unidade).eq("categoria", alvo.cat.key);
      if (error) throw new Error(error.message);
      toast.success("Voltou ao cálculo automático (última execução + frequência).");
      atualizar();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{alvo.cat.label}</DialogTitle>
          <DialogDescription>
            Última execução: {alvo.s.ultimaData ? `${dataBR(alvo.s.ultimaData)}${alvo.s.quem ? ` por ${alvo.s.quem}` : ""}` : "nunca"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Próxima execução</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              Vale até alguém registrar a tarefa. Depois disso, a próxima é calculada pela frequência.
            </p>
          </div>
          <div>
            <Label>Repetir a cada (dias)</Label>
            <Input type="number" min={1} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={salvar} disabled={salvando}>Salvar</Button>
            <Button variant="outline" onClick={automatico} disabled={salvando}>
              Usar cálculo automático
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Tarefas Extras no estilo da Preventiva AC: última execução, quem fez e próxima data. */
export function TarefasExtrasPainel({
  unidade,
  podeEditar,
  onAbrir,
}: {
  unidade: Unidade;
  podeEditar: boolean;
  onAbrir: (key: CategoryKey) => void;
}) {
  const { data, error } = useDadosTarefasExtras(unidade);
  const cats = useCategoriasDaUnidade(unidade);
  const [editando, setEditando] = useState<{ cat: Categoria; s: SituacaoTarefa } | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "em_dia" | "a_fazer">("todos");
  const hoje = todaySP();

  const lista = useMemo(() => {
    const ordem = { atrasada: 0, hoje: 1, nunca: 2, em_dia: 3 } as const;
    return cats
      .map((cat) => {
        // logs vêm do mais recente para o mais antigo
        const ultimo = data?.logs.find((l) => l.tarefas.some((t) => registroDaCategoria(t, cat)));
        return { cat, ultimo };
      })
      .map(({ cat, ultimo }) => ({
        cat,
        s: calcularSituacaoTarefa({
          ultimaEm: ultimo?.em ?? null,
          quem: ultimo?.quem ?? null,
          periodo: data?.periodicidade[cat.key],
          agenda: data?.agenda[cat.key] ?? null,
          hoje,
        }),
      }))
      .sort((a, b) => ordem[a.s.status] - ordem[b.s.status] || a.s.proxima.localeCompare(b.s.proxima));
  }, [data, cats, hoje]);

  const emDia = lista.filter((x) => x.s.status === "em_dia").length;
  const pendentes = lista.length - emDia;
  const visiveis = lista.filter((x) =>
    filtro === "todos" ? true : filtro === "em_dia" ? x.s.status === "em_dia" : x.s.status !== "em_dia",
  );
  const alternar = (f: typeof filtro) => setFiltro((atual) => (atual === f && f !== "todos" ? "todos" : f));

  return (
    <section className="space-y-3 rounded-2xl border bg-slate-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-gradient-to-br from-fuchsia-600 to-indigo-700 p-2 text-white">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Áreas comuns · INJOY {unidade}</p>
            <h3 className="text-lg font-black leading-tight text-slate-900">Tarefas Extras</h3>
          </div>
        </div>
        {podeEditar && (
          <Link
            to="/gestor/tarefas-extras"
            className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Pencil className="h-3.5 w-3.5" /> Gerenciar cards
          </Link>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {(
          [
            { f: "todos", rotulo: "Total", n: lista.length, borda: "border-teal-600", ativo: "bg-teal-50 ring-2 ring-teal-600", chip: "bg-teal-50 text-teal-800" },
            { f: "em_dia", rotulo: "Em dia", n: emDia, borda: "border-emerald-300", ativo: "bg-emerald-50 ring-2 ring-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
            { f: "a_fazer", rotulo: "A fazer", n: pendentes, borda: "border-red-300", ativo: "bg-red-50 ring-2 ring-red-500", chip: "bg-red-50 text-red-700" },
          ] as const
        ).map((t) => (
          <button
            key={t.f}
            type="button"
            onClick={() => alternar(t.f)}
            aria-pressed={filtro === t.f}
            className={cn(
              "rounded-xl border-2 bg-white p-3 text-left transition hover:shadow-md",
              t.borda,
              filtro === t.f && t.ativo,
            )}
          >
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", t.chip)}>{t.rotulo}</span>
            <p className="mt-1 text-2xl font-black">{t.n}</p>
          </button>
        ))}
      </div>
      {filtro !== "todos" && (
        <p className="text-xs text-slate-500">
          Mostrando só <strong>{filtro === "em_dia" ? "em dia" : "a fazer"}</strong>.{" "}
          <button type="button" className="font-semibold text-teal-700 underline" onClick={() => setFiltro("todos")}>
            Ver todas
          </button>
        </p>
      )}

      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visiveis.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed bg-white p-6 text-center text-sm text-slate-500">
            {filtro === "em_dia" ? "Nenhuma área em dia." : filtro === "a_fazer" ? "Nada a fazer. Tudo em dia! 🎉" : "Nenhuma área cadastrada."}
          </p>
        )}
        {visiveis.map(({ cat, s }) => (
          <CartaoTarefa
            key={cat.key}
            cat={cat}
            unidade={unidade}
            s={s}
            podeEditar={podeEditar}
            onAbrir={() => onAbrir(cat.key)}
            onEditar={() => setEditando({ cat, s })}
          />
        ))}
      </div>

      <EditarProxima alvo={editando} unidade={unidade} periodicidade={data?.periodicidade ?? {}} onClose={() => setEditando(null)} />
    </section>
  );
}
