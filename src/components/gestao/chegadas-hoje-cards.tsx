import { useEffect, useState, useCallback } from "react";
import { LogIn, CalendarPlus, X, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatTaskLabel, isCheckInTask } from "@/lib/task-labels";
import type { Unidade } from "@/lib/store";

type ChegadaRow = {
  room_number: string;
  room_type: string | null;
  guest_name: string | null;
  pax: number | null;
  arrival_time: string | null;
  assigned_task: string | null;
};

export function ChegadasHojeCards({ unidade }: { unidade: Unidade }) {
  const [openChegadas, setOpenChegadas] = useState(false);
  const [openNovas, setOpenNovas] = useState(false);
  const [rows, setRows] = useState<ChegadaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setFetching(true);
    setError(null);
    const { data, error } = await supabase
      .from("room_housekeeping")
      .select("room_number, room_type, guest_name, pax, arrival_time, assigned_task")
      .eq("property", unidade);
    setFetching(false);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    const list = ((data ?? []) as ChegadaRow[]).filter((r) => isCheckInTask(r.assigned_task));
    list.sort((a, b) => {
      const ta = a.arrival_time ?? "";
      const tb = b.arrival_time ?? "";
      if (ta && tb) return ta.localeCompare(tb);
      return String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true });
    });
    setRows(list);
  }, [unidade]);

  useEffect(() => {
    setLoading(true);
    carregar();
    const ch = supabase
      .channel(`chegadas-${unidade}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_housekeeping" }, carregar)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [unidade, carregar]);

  const total = rows.length;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setOpenChegadas(true)}
          className="text-left bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:bg-slate-800 transition-colors shadow-lg"
        >
          <div className="flex items-start justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Chegadas Hoje</p>
            <LogIn className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-4xl font-bold text-green-500 mt-4">
            {loading ? <Loader2 className="inline h-8 w-8 animate-spin" /> : total}
          </p>
          <p className="text-sm text-slate-500 mt-2">Check-ins e revisões previstos para hoje</p>
        </button>

        <button
          type="button"
          onClick={() => setOpenNovas(true)}
          className="text-left bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:bg-slate-800 transition-colors shadow-lg"
        >
          <div className="flex items-start justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Novas Reservas</p>
            <CalendarPlus className="w-5 h-5 text-yellow-500" />
          </div>
          <p className="text-4xl font-bold text-yellow-500 mt-4">0</p>
          <p className="text-sm text-slate-500 mt-2">Aguardando sincronização</p>
        </button>
      </div>

      {openChegadas && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setOpenChegadas(false)}
        >
          <div
            className="w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-black text-white">Chegadas Hoje · INJOY {unidade}</h3>
                <p className="text-xs text-slate-400">
                  Fonte: painel das camareiras (Check-in e Revisão Check-in)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => carregar()}
                  disabled={fetching}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 disabled:opacity-50"
                  aria-label="Atualizar"
                >
                  <RefreshCw size={16} className={fetching ? "animate-spin" : ""} />
                </button>
                <button
                  type="button"
                  onClick={() => setOpenChegadas(false)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200"
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-5">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-10 bg-slate-800/60 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : error ? (
                <div className="text-center py-8 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">
                  {error}
                </div>
              ) : rows.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">
                  Nenhuma chegada prevista para hoje
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900 text-slate-300">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold">Quarto</th>
                        <th className="text-left px-3 py-2 font-bold">Hóspede</th>
                        <th className="text-left px-3 py-2 font-bold">Pax</th>
                        <th className="text-left px-3 py-2 font-bold">Chegada</th>
                        <th className="text-left px-3 py-2 font-bold">Tarefa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr
                          key={`${r.room_number}-${i}`}
                          className="border-t border-slate-800 text-slate-200"
                        >
                          <td className="px-3 py-2 font-semibold">
                            {r.room_number}
                            {r.room_type ? (
                              <span className="text-xs text-slate-500 font-normal ml-1">
                                · {r.room_type}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{r.guest_name || "—"}</td>
                          <td className="px-3 py-2 tabular-nums">{r.pax ?? "—"}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-400">
                            {r.arrival_time ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border bg-sky-500/20 text-sky-300 border-sky-500/30">
                              {formatTaskLabel(r.assigned_task)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {openNovas && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setOpenNovas(false)}
        >
          <div
            className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-lg font-black text-white">Novas Reservas</h3>
              <button
                type="button"
                onClick={() => setOpenNovas(false)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-8 text-center text-sm text-slate-400">
              Aguardando sincronização.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
