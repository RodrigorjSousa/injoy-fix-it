import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DollarSign, RefreshCw } from "lucide-react";
import type { Unidade } from "@/lib/store";
import { getReservationPaymentsTotals } from "@/lib/reservation-payment.functions";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function hojeISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function RecebimentosBalcaoCard({ unidade }: { unidade: Unidade }) {
  const call = useServerFn(getReservationPaymentsTotals);
  const dia = hojeISO();
  const q = useQuery({
    queryKey: ["reservation-payments-totals", unidade, dia],
    queryFn: () => call({ data: { property: unidade, from: dia, to: dia } }),
    refetchOnWindowFocus: false,
  });

  const totals = q.data?.totals ?? {};
  const total = q.data?.total ?? 0;

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 grid place-items-center text-white">
            <DollarSign size={18} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">Recebimentos no Balcão · Hoje</p>
            <p className="text-[11px] text-slate-500">Pagamentos de hospedagem lançados no Cloudbeds</p>
          </div>
        </div>
        <button
          onClick={() => q.refetch()}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
          aria-label="Atualizar"
        >
          <RefreshCw size={16} className={q.isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      <p className="text-2xl font-black text-emerald-700">{brl(total)}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {["PIX", "Dinheiro", "Cartão de Crédito", "Cartão de Débito"].map((m) => (
          <div key={m} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">{m}</p>
            <p className="text-base font-black text-slate-800">{brl(totals[m] ?? 0)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
