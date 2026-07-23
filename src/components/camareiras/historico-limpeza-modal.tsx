import { useCallback, useEffect, useState } from "react";
import { X, RefreshCw, Clock, Building2, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { EmptyState, LoadingState, friendlyError } from "@/components/ui/data-state";

type HistRow = {
  id: string;
  property: string;
  room_number: string;
  camareira_name: string;
  action_type: string;
  task_name: string;
  started_at: string | null;
  ended_at: string | null;
  comment: string | null;
  created_at: string;
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function duracao(started: string | null, ended: string | null) {
  if (!started || !ended) return "—";
  const ms = new Date(ended).getTime() - new Date(started).getTime();
  if (ms < 0 || Number.isNaN(ms)) return "—";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${pad(min % 60)}min`;
}
function rangeForDay(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function HistoricoLimpezaModal({
  open,
  onClose,
  unidade,
}: {
  open: boolean;
  onClose: () => void;
  unidade: "Botafogo" | "Ipanema";
}) {
  const [data, setData] = useState<string>(todayStr());
  const [rows, setRows] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = rangeForDay(data);
      // biome-ignore lint/suspicious/noExplicitAny: tabela nova
      const { data: d, error } = await (supabase as any)
        .from("room_housekeeping_history")
        .select("id, property, room_number, camareira_name, action_type, task_name, started_at, ended_at, comment, created_at")
        .eq("property", unidade)
        .gte("created_at", r.start)
        .lte("created_at", r.end)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((d ?? []) as HistRow[]);
    } catch (err) {
      toast.error(friendlyError(err, "Falha ao carregar histórico"));
    } finally {
      setLoading(false);
    }
  }, [data, unidade]);

  useEffect(() => {
    if (open) carregar();
  }, [open, carregar]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between bg-blue-950 text-white sm:rounded-t-2xl">
          <div className="flex items-center gap-2">
            <History size={18} />
            <div>
              <h2 className="font-bold text-sm">Histórico de Limpeza</h2>
              <p className="text-[11px] text-blue-200">INJOY {unidade} · consulta do turno</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="p-3 border-b bg-slate-50 flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 flex-1">
            Data
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
            />
          </label>
          <button
            onClick={carregar}
            disabled={loading}
            className="mt-5 p-2 bg-blue-600 text-white rounded-lg disabled:opacity-60"
            aria-label="Recarregar"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && rows.length === 0 ? (
            <LoadingState label="Carregando..." />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Sem registros"
              description="Nenhuma limpeza registrada para este dia."
            />
          ) : (
            rows.map((r) => {
              const isDnd = r.action_type === "NÃO PERTURBE";
              return (
                <div
                  key={r.id}
                  className={cn(
                    "bg-white rounded-xl border p-3",
                    isDnd ? "border-red-200" : "border-slate-200",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900">
                        APT {r.room_number}{" "}
                        <span className="text-xs font-semibold text-slate-500">
                          <Building2 size={11} className="inline -mt-0.5" /> {r.property}
                        </span>
                      </p>
                      <p className="text-xs text-slate-600 truncate">
                        <span className="font-bold">{r.camareira_name}</span> · {r.task_name}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider whitespace-nowrap",
                        isDnd ? "bg-red-600 text-white" : "bg-emerald-600 text-white",
                      )}
                    >
                      {isDnd ? "DND" : "OK"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} /> {fmtTime(r.started_at)} → {fmtTime(r.ended_at)}
                    </span>
                    <span className="font-semibold text-slate-700">
                      {duracao(r.started_at, r.ended_at)}
                    </span>
                  </div>
                  {r.comment && (
                    <p className="mt-2 text-xs italic text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-2">
                      "{r.comment}"
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 border-t bg-slate-50 text-center text-[11px] text-slate-500">
          Somente consulta · verifique pendências para o próximo turno
        </div>
      </div>
    </div>
  );
}
