import { useCallback, useEffect, useState } from "react";
import { ListChecks, RefreshCw, Building2, User, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { EmptyState, LoadingState, friendlyError } from "@/components/ui/data-state";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type LogRow = {
  id: string;
  property: string;
  camareira_name: string;
  completed_tasks: unknown;
  created_at: string;
};

type Unidade = "Todas" | "Botafogo" | "Ipanema";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function tasksOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((t) => String(t));
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map((t) => String(t)) : [v];
    } catch {
      return [v];
    }
  }
  return [];
}
function rangeForDay(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0).toISOString(),
    end: new Date(y, m - 1, d, 23, 59, 59, 999).toISOString(),
  };
}

export function TarefasExtrasHistoricoCard() {
  const [data, setData] = useState<string>(todayStr());
  const [unidade, setUnidade] = useState<Unidade>("Todas");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      // biome-ignore lint/suspicious/noExplicitAny: tabela não tipada
      let q: any = (supabase as any)
        .from("extra_tasks_logs")
        .select("id, property, camareira_name, completed_tasks, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (unidade !== "Todas") q = q.eq("property", unidade);
      if (data) {
        const r = rangeForDay(data);
        q = q.gte("created_at", r.start).lte("created_at", r.end);
      }
      const { data: d, error } = await q;
      if (error) throw error;
      setRows((d ?? []) as LogRow[]);
    } catch (err) {
      toast.error(friendlyError(err, "Falha ao carregar histórico de tarefas extras"));
    } finally {
      setLoading(false);
    }
  }, [data, unidade]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const ch = supabase
      .channel("extra_tasks_logs_hist")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "extra_tasks_logs" },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [carregar]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <Accordion type="single" collapsible>
        <AccordionItem value="hist" className="border-0">
          <AccordionTrigger className="px-4 py-4 hover:no-underline">
            <div className="flex items-center gap-3 text-left">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-indigo-700 grid place-items-center text-white">
                <ListChecks className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">
                  Histórico · Check List das Tarefas Extras
                </p>
                <p className="text-xs text-slate-500">
                  Quem executou e quando · registros por unidade
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-0">
            <div className="flex flex-wrap items-end gap-2 mb-3">
              <label className="text-xs font-semibold text-slate-600">
                Dia
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="block mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Unidade
                <select
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value as Unidade)}
                  className="block mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  <option value="Todas">Todas</option>
                  <option value="Botafogo">Botafogo</option>
                  <option value="Ipanema">Ipanema</option>
                </select>
              </label>
              <button
                type="button"
                onClick={carregar}
                disabled={loading}
                className="p-2 bg-blue-600 text-white rounded-lg disabled:opacity-60"
                aria-label="Recarregar"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              </button>
              {data && (
                <button
                  type="button"
                  onClick={() => setData("")}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg"
                >
                  Ver todos
                </button>
              )}
            </div>

            {loading && rows.length === 0 ? (
              <LoadingState label="Carregando..." />
            ) : rows.length === 0 ? (
              <EmptyState
                title="Sem registros"
                description="Nenhuma tarefa extra registrada para o filtro selecionado."
              />
            ) : (
              <div className="space-y-2">
                {rows.map((r) => {
                  const tasks = tasksOf(r.completed_tasks);
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        "rounded-xl border border-slate-200 p-3 bg-slate-50/60",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-black text-slate-900 inline-flex items-center gap-1.5">
                          <User size={13} className="text-slate-400" />
                          {r.camareira_name || "—"}
                        </p>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 uppercase tracking-wider whitespace-nowrap inline-flex items-center gap-1">
                          <Building2 size={10} /> {r.property}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600 inline-flex items-center gap-1">
                        <CalendarClock size={11} /> {fmtDateTime(r.created_at)}
                      </p>
                      {tasks.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {tasks.map((t, i) => (
                            <li
                              key={`${r.id}-${i}`}
                              className="text-xs text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1"
                            >
                              {t}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
