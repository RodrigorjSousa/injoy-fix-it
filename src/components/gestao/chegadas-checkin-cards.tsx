import { useEffect, useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Loader2, RefreshCw, LogIn, Users, BedDouble, X } from "lucide-react";
import { getReservasHoje, type ReservaHoje } from "@/lib/cloudbeds-reservas.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";

type LimpezaStatus = "clean" | "dirty" | "inspected" | "out_of_service" | string;

function normalizeQuarto(v: string): string {
  return String(v || "")
    .toLowerCase()
    .replace(/apt\.?/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function limpezaLabel(status: LimpezaStatus | null | undefined): {
  label: string;
  className: string;
} {
  const s = String(status || "").toLowerCase();
  if (s === "clean" || s === "inspected")
    return { label: "Limpo", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (s === "dirty") return { label: "Sujo", className: "bg-rose-100 text-rose-700 border-rose-200" };
  if (s === "out_of_service")
    return { label: "Fora de operação", className: "bg-slate-200 text-slate-700 border-slate-300" };
  return { label: "—", className: "bg-slate-100 text-slate-500 border-slate-200" };
}

export function ChegadasCheckinCards({
  unidade,
  showLimpeza = false,
  title = "Chegadas de Hoje",
}: {
  unidade: Unidade;
  showLimpeza?: boolean;
  title?: string;
}) {
  const [rows, setRows] = useState<ReservaHoje[]>([]);
  const [limpeza, setLimpeza] = useState<Record<string, LimpezaStatus>>({});
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const call = useServerFn(getReservasHoje);
  const mountedRef = useRef(false);

  const carregarLimpeza = useCallback(async () => {
    if (!showLimpeza) return;
    const { data } = await supabase
      .from("room_housekeeping")
      .select("room_number, status")
      .eq("property", unidade);
    if (!mountedRef.current) return;
    const map: Record<string, LimpezaStatus> = {};
    for (const r of (data ?? []) as Array<{ room_number: string; status: LimpezaStatus }>) {
      map[normalizeQuarto(r.room_number)] = r.status;
    }
    setLimpeza(map);
  }, [showLimpeza, unidade]);

  const carregar = useCallback(async () => {
    if (mountedRef.current) {
      setFetching(true);
      setError(null);
    }
    try {
      const res = await call({ data: { property: unidade } });
      if (!mountedRef.current) return;
      const list = [...res.reservas].sort((a, b) => {
        const ta = a.checkInTime || "99:99";
        const tb = b.checkInTime || "99:99";
        if (ta !== tb) return ta.localeCompare(tb);
        return String(a.quarto).localeCompare(String(b.quarto), undefined, { numeric: true });
      });
      setRows(list);
      await carregarLimpeza();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Falha ao consultar Cloudbeds");
    } finally {
      if (mountedRef.current) {
        setFetching(false);
        setLoading(false);
      }
    }
  }, [call, unidade, carregarLimpeza]);

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
    <section className="p-4 bg-white border-b border-slate-200">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="grid place-items-center h-9 w-9 rounded-xl bg-amber-100 text-amber-700 shrink-0">
            <LogIn size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-900 truncate">{title}</h2>
            <p className="text-[11px] text-slate-500">
              Fonte: Cloudbeds · atualiza a cada 15 min
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setOpenModal(true)}
            className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600"
          >
            {loading ? "…" : `${total} chegadas`}
          </button>
          <button
            type="button"
            onClick={carregar}
            disabled={fetching}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50"
            aria-label="Atualizar chegadas"
          >
            <RefreshCw size={14} className={fetching ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <Loader2 size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-xl px-3 py-4 text-center">
          Nenhuma chegada prevista para hoje.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((r, i) => {
            const lim = showLimpeza ? limpezaLabel(limpeza[normalizeQuarto(r.quarto)]) : null;
            const pax = r.adultos + r.criancas;
            return (
              <article
                key={`${r.reservationID}-${r.quarto}-${i}`}
                className="rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-3 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <BedDouble size={11} /> {r.quarto}
                    </p>
                    <h3 className="text-sm font-black text-slate-900 truncate" title={r.hospede}>
                      {r.hospede}
                    </h3>
                    {r.tipoAcomodacao ? (
                      <p className="text-[11px] text-slate-500 truncate" title={r.tipoAcomodacao}>
                        {r.tipoAcomodacao}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="inline-flex items-center gap-1 rounded-xl bg-amber-50 border border-amber-200 px-2 py-1 text-amber-700">
                      <Clock size={12} />
                      <span className="text-sm font-black tabular-nums">
                        {r.checkInTime || "—"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Users size={11} className="text-slate-400" /> {pax} pax · {r.noites}{" "}
                    {r.noites === 1 ? "noite" : "noites"}
                  </span>
                  {lim ? (
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${lim.className}`}
                    >
                      {lim.label}
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setOpenModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Chegadas Hoje"
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl my-8 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-lg font-black text-slate-900">Chegadas Hoje</h3>
                <p className="text-xs text-slate-500">
                  INJOY {unidade} · Fonte: Cloudbeds
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenModal(false)}
                className="p-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 text-center border-b border-slate-100">
              <p className="text-xs uppercase font-bold text-slate-500">Total</p>
              <p className="text-5xl font-black text-amber-600 mt-1 tabular-nums">{total}</p>
              <p className="text-sm text-slate-500 mt-1">
                {total === 1 ? "chegada prevista" : "chegadas previstas"}
              </p>
            </div>
            <div className="p-4 max-h-[50vh] overflow-y-auto">
              {rows.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-6">
                  Nenhuma chegada prevista para hoje.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {rows.map((r, i) => (
                    <li
                      key={`${r.reservationID}-${r.quarto}-modal-${i}`}
                      className="py-2.5 flex items-center gap-3"
                    >
                      <div className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-amber-700 shrink-0 tabular-nums text-sm font-black">
                        <Clock size={12} />
                        {r.checkInTime || "—"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate">{r.hospede}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {r.quarto}
                          {r.tipoAcomodacao ? ` · ${r.tipoAcomodacao}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
