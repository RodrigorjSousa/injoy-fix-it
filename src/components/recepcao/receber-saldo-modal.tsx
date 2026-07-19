import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { DollarSign, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Unidade } from "@/lib/store";
import { postReservationPayment } from "@/lib/reservation-payment.functions";

const METODOS = ["PIX", "Dinheiro", "Cartão de Crédito", "Cartão de Débito"] as const;
type Metodo = (typeof METODOS)[number];

export function ReceberSaldoModal({
  open,
  onClose,
  onSuccess,
  unidade,
  reservationId,
  guestName,
  saldoDevedor,
  quarto,
  receivedBy,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  unidade: Unidade;
  reservationId: string;
  guestName: string;
  saldoDevedor: number;
  quarto: string;
  receivedBy: string;
}) {
  const post = useServerFn(postReservationPayment);
  const [amount, setAmount] = useState<string>(saldoDevedor.toFixed(2));
  const [metodo, setMetodo] = useState<Metodo>("PIX");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(saldoDevedor.toFixed(2));
      setMetodo("PIX");
    }
  }, [open, saldoDevedor]);

  if (!open) return null;

  const valor = Number(amount.replace(",", "."));
  const valido = Number.isFinite(valor) && valor > 0 && valor <= saldoDevedor + 0.009;

  async function confirmar() {
    if (!valido) {
      toast.error("Valor inválido. Deve ser positivo e não maior que o saldo.");
      return;
    }
    setEnviando(true);
    try {
      await post({
        data: {
          property: unidade,
          reservationId,
          guestName,
          amount: Number(valor.toFixed(2)),
          paymentMethod: metodo,
          receivedBy,
        },
      });
      toast.success(
        `Pagamento de ${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} registrado.`,
      );
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao registrar pagamento";
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-emerald-50">
          <div className="flex items-center gap-2 text-emerald-800">
            <DollarSign size={22} />
            <h2 className="text-lg font-black">Receber saldo no balcão</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/70 text-slate-600"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Hóspede · Quarto {quarto}
            </p>
            <p className="text-base font-bold text-slate-800">{guestName}</p>
            <p className="text-xs text-slate-500 mt-1">
              Reserva Cloudbeds: <span className="font-mono">{reservationId}</span>
            </p>
            <p className="mt-2 text-sm">
              Saldo pendente:{" "}
              <span className="font-black text-red-600">
                {saldoDevedor.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </span>
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
              Valor recebido (R$)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={saldoDevedor}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full px-3 py-3 text-lg font-black rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Ajuste caso o hóspede pague apenas parte do saldo.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
              Método de pagamento
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {METODOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetodo(m)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                    metodo === m
                      ? "bg-emerald-600 border-emerald-700 text-white shadow-md"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={enviando}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!valido || enviando}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white bg-gradient-to-br from-emerald-500 to-green-600 shadow-md shadow-emerald-500/30 hover:brightness-110 disabled:opacity-50"
          >
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
            {enviando ? "Enviando ao Cloudbeds..." : "Confirmar pagamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
