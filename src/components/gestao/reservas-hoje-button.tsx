import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, Loader2, RefreshCw, X, Users, Moon, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { getReservasHoje, type ReservaHoje } from "@/lib/cloudbeds-reservas.functions";
import type { Unidade } from "@/lib/store";

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function fmtData(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function ReservasHojeButton({ unidade }: { unidade: Unidade }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reservas, setReservas] = useState<ReservaHoje[] | null>(null);
  const [totalReceita, setTotalReceita] = useState(0);
  const [dataRef, setDataRef] = useState<string>("");
  const call = useServerFn(getReservasHoje);

  async function carregar() {
    setLoading(true);
    try {
      const res = await call({ data: { property: unidade } });
      setReservas(res.reservas);
      setTotalReceita(res.totalReceita);
      setDataRef(res.data);
    } catch (err) {
      console.error("[reservas-hoje]", err);
      toast.error(err instanceof Error ? err.message : "Falha ao consultar Cloudbeds");
    } finally {
      setLoading(false);
    }
  }

  async function abrir() {
    setOpen(true);
    if (!reservas) await carregar();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-teal-600 via-emerald-500 to-teal-500 text-white font-black text-sm uppercase tracking-wider shadow-lg hover:shadow-2xl hover:scale-[1.02] transition-all border-2 border-teal-400"
      >
        <CalendarCheck className="h-5 w-5" />
        Reservas de hoje · {unidade}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-4xl bg-slate-950 border border-white/10 rounded-2xl shadow-2xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h3 className="text-lg font-black text-white">
                  Reservas de hoje · INJOY {unidade}
                </h3>
                <p className="text-xs text-slate-400">
                  {dataRef ? `Referência: ${fmtData(dataRef)}` : "Puxando do Cloudbeds…"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={carregar}
                  disabled={loading}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 disabled:opacity-50"
                  aria-label="Atualizar"
                >
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200"
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-5">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-400 font-bold">Check-ins</p>
                <p className="text-2xl font-black text-white">
                  {reservas?.length ?? "—"}
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-400 font-bold">Receita prevista</p>
                <p className="text-2xl font-black text-emerald-400">
                  {reservas ? fmtBRL(totalReceita) : "—"}
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 col-span-2 md:col-span-1">
                <p className="text-[10px] uppercase text-slate-400 font-bold">Total de noites</p>
                <p className="text-2xl font-black text-white">
                  {reservas ? reservas.reduce((s, r) => s + r.noites, 0) : "—"}
                </p>
              </div>
            </div>

            <div className="p-5 pt-0">
              {loading && !reservas ? (
                <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                  <Loader2 className="animate-spin h-5 w-5" /> Consultando Cloudbeds…
                </div>
              ) : reservas && reservas.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">
                  Sem reservas com check-in hoje.
                </p>
              ) : reservas ? (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 text-slate-300">
                      <tr>
                        <th className="text-left px-3 py-2 font-bold">Hóspede</th>
                        <th className="text-left px-3 py-2 font-bold">Quarto</th>
                        <th className="text-left px-3 py-2 font-bold">Check-in</th>
                        <th className="text-left px-3 py-2 font-bold">Check-out</th>
                        <th className="text-right px-3 py-2 font-bold">Noites</th>
                        <th className="text-right px-3 py-2 font-bold">Pax</th>
                        <th className="text-right px-3 py-2 font-bold">Receita</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservas.map((r, i) => (
                        <tr
                          key={`${r.reservationID}-${r.quarto}-${i}`}
                          className="border-t border-white/5 text-slate-200"
                        >
                          <td className="px-3 py-2 font-semibold">{r.hospede}</td>
                          <td className="px-3 py-2">{r.quarto}</td>
                          <td className="px-3 py-2">{fmtData(r.checkIn)}</td>
                          <td className="px-3 py-2">{fmtData(r.checkOut)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <Moon size={12} className="text-slate-400" /> {r.noites}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <Users size={12} className="text-slate-400" />{" "}
                              {r.adultos + r.criancas}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">
                            <span className="inline-flex items-center gap-1">
                              <DollarSign size={12} /> {fmtBRL(r.receita)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
