import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  RefreshCw,
  Loader2,
  ArrowUpDown,
  Pencil,
  CalendarCheck,
  Ban,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { getReservasHoje, type ReservaHoje } from "@/lib/cloudbeds-reservas.functions";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";

type Tab = "vendas" | "cancelamentos" | "overbookings";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}
function fmtData(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

export function AtividadesHojePanel({ unidade }: { unidade: Unidade }) {
  const [tab, setTab] = useState<Tab>("vendas");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservas, setReservas] = useState<ReservaHoje[] | null>(null);
  const [totalReceita, setTotalReceita] = useState(0);
  const [dataRef, setDataRef] = useState<string>(todayISO());
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const call = useServerFn(getReservasHoje);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await call({ data: { property: unidade, date: dataRef } });
      setReservas(res.reservas);
      setTotalReceita(res.totalReceita);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao consultar Cloudbeds";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [call, unidade, dataRef]);

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade]);

  const noitesTotais = useMemo(
    () => (reservas ?? []).reduce((s, r) => s + r.noites, 0),
    [reservas],
  );
  const uniqueGuests = useMemo(() => {
    const s = new Set((reservas ?? []).map((r) => r.reservationID));
    return s.size;
  }, [reservas]);

  const sorted = useMemo(() => {
    if (!reservas) return [];
    const arr = [...reservas];
    arr.sort((a, b) => (sortDir === "desc" ? b.receita - a.receita : a.receita - b.receita));
    return arr;
  }, [reservas, sortDir]);

  const tabs: { id: Tab; label: string; icon: typeof CalendarCheck }[] = [
    { id: "vendas", label: "Vendas", icon: CalendarCheck },
    { id: "cancelamentos", label: "Cancelamentos", icon: Ban },
    { id: "overbookings", label: "Overbookings", icon: AlertTriangle },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-5 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-900 truncate">Atividades de Hoje</h2>
          <p className="text-xs text-slate-500 truncate">
            INJOY {unidade} · {fmtData(dataRef)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="date"
            value={dataRef}
            onChange={(e) => setDataRef(e.target.value)}
            className="hidden sm:block bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700"
          />
          <button
            type="button"
            onClick={carregar}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50"
            aria-label="Atualizar"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {/* Abas */}
      <div className="flex gap-1 px-3 pt-3 border-b border-slate-100 overflow-x-auto">
        {tabs.map((t) => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap",
                active
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-5">
        <KpiCard label="Reservas Hoje" value={reservas ? String(uniqueGuests) : "—"} />
        <KpiCard label="Noites de Quarto" value={reservas ? String(noitesTotais) : "—"} />
        <KpiCard
          label="Receita"
          value={reservas ? fmtBRL(totalReceita) : "—"}
          valueClassName="text-blue-600"
        />
      </div>

      {/* Conteúdo por aba */}
      <div className="px-5 pb-5">
        {tab !== "vendas" ? (
          <EmptyState
            message={
              tab === "cancelamentos"
                ? "Nenhum cancelamento registrado hoje."
                : "Nenhum overbooking detectado hoje."
            }
          />
        ) : loading && !reservas ? (
          <div className="flex items-center justify-center py-12 text-slate-500 gap-2 text-sm">
            <Loader2 className="animate-spin h-5 w-5" /> Consultando Cloudbeds…
          </div>
        ) : error ? (
          <div className="text-center py-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl">
            {error}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState message="Nenhuma atividade de check-in hoje." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider">
                    Hóspede
                  </th>
                  <th className="text-right px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Receita <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider">
                    Check-in
                  </th>
                  <th className="text-right px-3 py-2.5 font-bold text-[11px] uppercase tracking-wider">
                    Noites
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr
                    key={`${r.reservationID}-${r.quarto}-${i}`}
                    className="border-t border-slate-100 hover:bg-slate-50/60"
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 text-blue-700 hover:underline font-semibold text-left"
                      >
                        <Pencil size={12} className="text-slate-400 shrink-0" />
                        <span className="truncate">{r.hospede}</span>
                      </button>
                      <div className="text-[11px] text-slate-400">Quarto {r.quarto}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-blue-700">
                      {fmtBRL(r.receita)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 tabular-nums">
                      {fmtData(r.checkIn)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {r.noites}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
      <p className={cn("text-2xl sm:text-3xl font-black text-slate-900", valueClassName)}>{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-10 text-sm text-slate-500 bg-slate-50/60 border border-dashed border-slate-200 rounded-xl">
      {message}
    </div>
  );
}
