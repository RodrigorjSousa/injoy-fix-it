import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DollarSign, RefreshCw } from "lucide-react";
import type { Unidade } from "@/lib/store";
import { getReservationPaymentsTotals } from "@/lib/reservation-payment.functions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <Accordion type="single" collapsible>
        <AccordionItem value="recebimentos" className="border-0">
          <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-slate-50/50 [&[data-state=open]>svg]:rotate-180">
            <div className="flex items-center justify-between w-full pr-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 grid place-items-center text-white shrink-0">
                  <DollarSign size={18} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-black text-slate-900">Recebimentos no Balcão · Hoje</p>
                  <p className="text-[11px] text-slate-500">Pagamentos de hospedagem lançados no Cloudbeds</p>
                </div>
              </div>
              <p className="text-xl font-black text-emerald-700 shrink-0">{brl(total)}</p>
            </div>
          </AccordionTrigger>

          <AccordionContent>
            <div className="px-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Detalhamento por forma de pagamento</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    q.refetch();
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                  aria-label="Atualizar"
                >
                  <RefreshCw size={16} className={q.isFetching ? "animate-spin" : ""} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                {["PIX", "Dinheiro", "Cartão de Crédito", "Cartão de Débito"].map((m) => (
                  <div key={m} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">{m}</p>
                    <p className="text-base font-black text-slate-800">{brl(totals[m] ?? 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
