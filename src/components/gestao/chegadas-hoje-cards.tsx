import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LogIn, CalendarPlus, X, Loader2, RefreshCw } from "lucide-react";
import { getReservasHoje, type ReservaHoje } from "@/lib/cloudbeds-reservas.functions";
import type { Unidade } from "@/lib/store";

function statusLabel(s: string): string {
  const k = (s || "").toLowerCase();
  if (k === "confirmed") return "Confirmada";
  if (k === "checked_in" || k === "checkedin" || k === "in_house") return "Check-in feito";
  if (k === "not_confirmed") return "Não confirmada";
  if (k === "canceled" || k === "cancelled") return "Cancelada";
  if (k === "no_show") return "No-show";
  return s || "—";
}

function statusColor(s: string): string {
  const k = (s || "").toLowerCase();
  if (k === "checked_in" || k === "checkedin" || k === "in_house") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (k === "confirmed") return "bg-sky-500/20 text-sky-400 border-sky-500/30";
  if (k === "canceled" || k === "cancelled" || k === "no_show") return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-slate-700/40 text-slate-300 border-slate-600/40";
}

export function ChegadasHojeCards({ unidade }: { unidade: Unidade }) {
  const [openChegadas, setOpenChegadas] = useState(false);
  const [openNovas, setOpenNovas] = useState(false);
  const call = useServerFn(getReservasHoje);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["chegadas-hoje", unidade],
    queryFn: async () => call({ data: { property: unidade } }),
    staleTime: 5 * 60_000,
  });

  const reservas: ReservaHoje[] = data?.reservas ?? [];
  const total = reservas.length;

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
            {isLoading ? <Loader2 className="inline h-8 w-8 animate-spin" /> : total}
          </p>
          <p className="text-sm text-slate-500 mt-2">Check-ins previstos para hoje</p>
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
                <p className="text-xs text-slate-400">Fonte: Cloudbeds</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 disabled:opacity-50"
                  aria-label="Atualizar"
                >
                  <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} />
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
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-10 bg-slate-800/60 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : error ? (
                <div className="text-center py-8 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">
                  {error instanceof Error ? error.message : "Falha ao consultar Cloudbeds"}
                </div>
              ) : reservas.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">
                  Nenhuma chegada prevista para hoje
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900 text-slate-300">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold">Hóspede</th>
                        <th className="text-left px-3 py-2 font-bold">Nº Confirmação</th>
                        <th className="text-left px-3 py-2 font-bold">Quarto</th>
                        <th className="text-left px-3 py-2 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservas.map((r, i) => (
                        <tr
                          key={`${r.reservationID}-${r.quarto}-${i}`}
                          className="border-t border-slate-800 text-slate-200"
                        >
                          <td className="px-3 py-2 font-semibold">{r.hospede}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-400">{r.reservationID}</td>
                          <td className="px-3 py-2">{r.quarto}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${statusColor(r.status)}`}>
                              {statusLabel(r.status)}
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
