import { X } from "lucide-react";
import { EstoqueGeralView } from "./estoque-geral-view";

interface Props {
  open: boolean;
  onClose: () => void;
  unidade: "Botafogo" | "Ipanema";
}

export function EstoqueGeralModal({ open, onClose, unidade }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-slate-50 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white sm:rounded-t-2xl">
          <div>
            <p className="text-[11px] font-bold text-purple-600 uppercase tracking-wider">
              📦 Almoxarifado
            </p>
            <h3 className="text-base font-black text-slate-800">Estoque Geral</h3>
            <p className="text-xs text-slate-500">
              INJOY {unidade} · visualização somente leitura
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          <EstoqueGeralView unidade={unidade} />
        </div>
      </div>
    </div>
  );
}
