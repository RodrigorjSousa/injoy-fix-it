import { useEffect, useState } from "react";
import { X, Loader2, Send, ShoppingBag, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  unidade: "Botafogo" | "Ipanema";
  /** Origem do solicitante — usado apenas como rótulo padrão. */
  origem?: "camareira" | "recepcao" | "manutencao" | "funcionario";
}

const CATEGORIAS = [
  "Limpeza",
  "Banheiro",
  "Elétrica",
  "Hidráulica",
  "Ar Condicionado",
  "Cozinha",
  "Enxoval",
  "Escritório",
  "Outros",
];

const URGENCIAS: { key: "baixa" | "normal" | "urgente"; label: string; cls: string }[] = [
  { key: "baixa", label: "Baixa", cls: "bg-slate-500" },
  { key: "normal", label: "Normal", cls: "bg-blue-500" },
  { key: "urgente", label: "Urgente", cls: "bg-red-500" },
];

export function SolicitarCompraModal({ open, onClose, unidade, origem = "funcionario" }: Props) {
  const { data: me } = useMe();
  const [item, setItem] = useState("");
  const [qtd, setQtd] = useState<number>(1);
  const [unit, setUnit] = useState("un");
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [urgencia, setUrgencia] = useState<"baixa" | "normal" | "urgente">("normal");
  const [notes, setNotes] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItem("");
    setQtd(1);
    setUnit("un");
    setCategoria(CATEGORIAS[0]);
    setUrgencia("normal");
    setNotes("");
  }, [open]);

  if (!open) return null;

  const nome = me?.funcionario?.nome || me?.email || "—";
  const canSubmit = item.trim().length > 0 && qtd > 0 && !enviando;

  const enviar = async () => {
    if (!canSubmit) return;
    setEnviando(true);
    try {
      const { error } = await supabase.from("purchase_requests" as never).insert({
        property: unidade,
        requested_by: nome,
        requester_user_id: me?.userId ?? null,
        requester_role: origem,
        item_name: item.trim().slice(0, 120),
        quantity: qtd,
        unit: unit.trim().slice(0, 20) || null,
        category: categoria,
        urgency: urgencia,
        notes: notes.trim().slice(0, 500) || null,
        status: "pending",
      } as never);
      if (error) throw error;
      toast.success("Solicitação de compra enviada!");
      onClose();
    } catch (err) {
      console.error("[solicitar-compra] erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao enviar solicitação");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 grid place-items-center text-white">
              <ShoppingBag size={18} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                🛒 Solicitação de Compra
              </p>
              <h3 className="text-base font-black text-white">Pedir Material</h3>
              <p className="text-xs text-slate-400">
                INJOY {unidade} · {nome}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Item / Material *
            </label>
            <input
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="Ex: Sabonete líquido, lâmpada LED 9W…"
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Quantidade *
              </label>
              <input
                type="number"
                min={1}
                value={qtd}
                onChange={(e) => setQtd(Math.max(1, parseInt(e.target.value || "1", 10)))}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Unidade
              </label>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="un, cx, kg, L…"
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500"
                maxLength={20}
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Categoria
            </label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500"
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Urgência
            </label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {URGENCIAS.map((u) => {
                const active = urgencia === u.key;
                return (
                  <button
                    key={u.key}
                    type="button"
                    onClick={() => setUrgencia(u.key)}
                    className={cn(
                      "py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all border",
                      active
                        ? `${u.cls} text-white border-transparent shadow`
                        : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600",
                    )}
                  >
                    {u.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Observações
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Marca preferida, motivo, onde vai ser usado…"
              rows={3}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 resize-none"
              maxLength={500}
            />
          </div>

          <div className="flex items-start gap-2 text-[11px] text-slate-400 bg-slate-800/40 border border-slate-800 rounded-lg p-3">
            <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-400" />
            <p>
              A solicitação será enviada ao gestor. Você pode acompanhar o status
              na aba de almoxarifado.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={enviar}
            disabled={!canSubmit}
            className={cn(
              "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2",
              canSubmit
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : "bg-slate-800 text-slate-500 cursor-not-allowed",
            )}
          >
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Enviar Solicitação
          </button>
        </div>
      </div>
    </div>
  );
}
