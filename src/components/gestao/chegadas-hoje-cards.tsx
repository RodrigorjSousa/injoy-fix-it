import { useEffect, useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LogIn, CalendarPlus, X, Loader2, RefreshCw, Users, Moon } from "lucide-react";
import {
  getReservasHoje,
  getReservasFeitasHoje,
  type ReservaHoje,
  type ReservaFeita,
} from "@/lib/cloudbeds-reservas.functions";
import type { Unidade } from "@/lib/store";

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function fmtDataBR(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function ChegadasHojeCards({ unidade }: { unidade: Unidade }) {
  const [openChegadas, setOpenChegadas] = useState(false);
  const [openNovas, setOpenNovas] = useState(false);
  const [rows, setRows] = useState<ReservaHoje[]>([]);
  const [totalReceita, setTotalReceita] = useState(0);
  const [feitas, setFeitas] = useState<ReservaFeita[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFeitas, setErrorFeitas] = useState<string | null>(null);
  const call = useServerFn(getReservasHoje);
  const callFeitas = useServerFn(getReservasFeitasHoje);
  const mountedRef = useRef(false);

  const carregar = useCallback(async () => {
    if (mountedRef.current) {
      setFetching(true);
      setError(null);
      setErrorFeitas(null);
    }
    try {
      const [res, resFeitas] = await Promise.allSettled([
        call({ data: { property: unidade } }),
        callFeitas({ data: { property: unidade } }),
      ]);
      if (!mountedRef.current) return;
      if (res.status === "fulfilled") {
        const list = [...res.value.reservas].sort((a, b) =>
          String(a.quarto).localeCompare(String(b.quarto), undefined, { numeric: true }),
        );
        setRows(list);
        setTotalReceita(res.value.totalReceita);
      } else {
        setError(res.reason instanceof Error ? res.reason.message : "Falha ao consultar Cloudbeds");
      }
      if (resFeitas.status === "fulfilled") {
        setFeitas(resFeitas.value.reservas);
      } else {
        setErrorFeitas(
          resFeitas.reason instanceof Error ? resFeitas.reason.message : "Falha ao consultar Cloudbeds",
        );
      }
    } finally {
      if (mountedRef.current) {
        setFetching(false);
        setLoading(false);
      }
    }
  }, [call, callFeitas, unidade]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    carregar();
    const iv = setInterval(carregar, 15 * 60 * 1000);
    return () => {
      mountedRef.current = false;
      clearInterval(iv);
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
          <p className="text-sm text-slate-500 mt-2">Fonte: Cloudbeds · atualiza a cada 15 min</p>
        </button>

        <button
          type="button"
          onClick={() => setOpenNovas(true)}
          className="text-left bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:bg-slate-800 transition-colors shadow-lg"
        >
          <div className="flex items-start justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Reservas Feitas</p>
            <CalendarPlus className="w-5 h-5 text-yellow-500" />
          </div>
          <p className="text-4xl font-bold text-yellow-500 mt-4">
            {loading ? <Loader2 className="inline h-8 w-8 animate-spin" /> : feitas.length}
          </p>
          <p className="text-sm text-slate-500 mt-2">Novas reservas criadas hoje · Cloudbeds</p>

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
                  Fonte: Cloudbeds (Painel de Controle) · {rows.length} reserva(s)
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
                  Nenhuma chegada prevista para hoje no Cloudbeds.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900 text-slate-300">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold">Quarto</th>
                        <th className="text-left px-3 py-2 font-bold">Hóspede</th>
                        <th className="text-left px-3 py-2 font-bold">Check-in</th>
                        <th className="text-left px-3 py-2 font-bold">Pax</th>
                        <th className="text-left px-3 py-2 font-bold">Noites</th>
                        <th className="text-left px-3 py-2 font-bold">Status</th>
                        <th className="text-right px-3 py-2 font-bold">Receita</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr
                          key={`${r.reservationID}-${r.quarto}-${i}`}
                          className="border-t border-slate-800 text-slate-200"
                        >
                          <td className="px-3 py-2 font-semibold">
                            {r.quarto}
                            {r.tipoAcomodacao ? (
                              <div className="text-[11px] font-normal text-slate-400">{r.tipoAcomodacao}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{r.hospede}</td>
                          <td className="px-3 py-2 tabular-nums font-bold text-amber-300">
                            {r.checkInTime || "—"}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <Users size={12} className="text-slate-400" /> {r.adultos + r.criancas}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <Moon size={12} className="text-slate-400" /> {r.noites}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border bg-sky-500/20 text-sky-300 border-sky-500/30 uppercase">
                              {r.status || "confirmed"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">
                            {fmtBRL(r.receita)}
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
            className="w-full max-w-3xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-black text-white">Reservas Feitas · INJOY {unidade}</h3>
                <p className="text-xs text-slate-400">
                  Novas reservas criadas hoje no Cloudbeds · {feitas.length} exibida(s)
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
                  onClick={() => setOpenNovas(false)}
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
              ) : errorFeitas ? (
                <div className="text-center py-8 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">
                  {errorFeitas}
                </div>
              ) : feitas.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">
                  Nenhuma reserva criada hoje no Cloudbeds.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900 text-slate-300">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold">#</th>
                        <th className="text-left px-3 py-2 font-bold">Hóspede</th>
                        <th className="text-left px-3 py-2 font-bold">Check-in</th>
                        <th className="text-left px-3 py-2 font-bold">Check-out</th>
                        <th className="text-left px-3 py-2 font-bold">Status</th>
                        <th className="text-right px-3 py-2 font-bold">Receita</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feitas.map((r, i) => (
                        <tr
                          key={`${r.reservationID}-${i}`}
                          className="border-t border-slate-800 text-slate-200"
                        >
                          <td className="px-3 py-2 tabular-nums text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2 font-semibold">{r.hospede}</td>
                          <td className="px-3 py-2 tabular-nums font-bold text-amber-300">
                            {fmtDataBR(r.checkIn)}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-slate-300">
                            {fmtDataBR(r.checkOut)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border bg-yellow-500/20 text-yellow-300 border-yellow-500/30 uppercase">
                              {r.status || "confirmed"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">
                            {r.receita > 0 ? fmtBRL(r.receita) : "—"}
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
    </>
  );
}
