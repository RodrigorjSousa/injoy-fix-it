import { useEffect, useMemo, useState } from "react";
import { Loader2, X, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const ITENS_FALLBACK = [
  "Protetor Travesseiro",
  "Capa de Almofada",
  "Protetor Colchão Casal / Solteiro",
  "Edredon",
  "Manta",
  "Lençol Casal",
  "Lençol King",
  "Lençol Solteiro",
  "Lençol Casal s/ Elástico",
  "Lençol Solteiro s/ Elástico",
  "Fronha",
  "Protetor Colchão Casal",
  "Protetor Colchão Solteiro",
  "Piso",
  "Toalha Banho F. Prata",
  "Toalha Rosto",
  "Toalha de Lavabo",
  "Roupão",
  "Travesseiro / Almofada",
  "Capa Sofá",
  "Capa Poltrona",
  "Toalha Mesa Retangular",
  "Toalha Mesa Redonda",
  "Lenços Seda",
  "Guardanapos Linho",
  "Guardanapos",
  "Cortinas M²",
  "Tapete M²",
  "Forro de Capa",
  "Pano de Chão",
];

type Linha = { enviado: string; retornado: string };

interface Props {
  open: boolean;
  onClose: () => void;
  unidade: "Botafogo" | "Ipanema";
  camareiraName: string;
}

export function LaundryModal({ open, onClose, unidade, camareiraName }: Props) {
  const [dados, setDados] = useState<Record<string, Linha>>({});
  const [salvando, setSalvando] = useState(false);
  const [itens, setItens] = useState<string[]>(ITENS_FALLBACK);

  useEffect(() => {
    if (!open) return;
    setDados({});
    (async () => {
      const { data, error } = await supabase
        .from("laundry_items_directory" as never)
        .select("name")
        .order("name");
      if (!error && Array.isArray(data) && data.length > 0) {
        setItens((data as { name: string }[]).map((d) => d.name));
      }
    })();
  }, [open]);

  const linhas = useMemo(() => {
    return itens.map((item) => {
      const d = dados[item] ?? { enviado: "", retornado: "" };
      const env = parseInt(d.enviado || "0", 10) || 0;
      const ret = parseInt(d.retornado || "0", 10) || 0;
      const diff = env - ret;
      const emFalta = diff > 0 ? diff : 0;
      return { item, enviado: d.enviado, retornado: d.retornado, envNum: env, retNum: ret, diff, emFalta };
    });
  }, [dados, itens]);

  if (!open) return null;

  const setCampo = (item: string, campo: keyof Linha, valor: string) => {
    setDados((s) => ({
      ...s,
      [item]: { ...(s[item] ?? { enviado: "", retornado: "" }), [campo]: valor.replace(/[^0-9]/g, "") },
    }));
  };

  const totalPreenchidos = linhas.filter((l) => l.envNum > 0 || l.retNum > 0).length;
  const canSubmit = totalPreenchidos > 0 && !salvando;

  const enviar = async () => {
    if (!canSubmit) return;
    setSalvando(true);
    try {
      const items = linhas
        .filter((l) => l.envNum > 0 || l.retNum > 0)
        .map((l) => ({
          item: l.item,
          enviado: l.envNum,
          retornado: l.retNum,
          diferenca: l.diff,
          em_falta: l.emFalta,
        }));

      const { error } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: tabela nova ainda não está no types.ts gerado
        .from("laundry_logs" as any)
        .insert({
          property: unidade,
          camareira_name: camareiraName || "—",
          items_data: items,
        });
      if (error) throw error;
      toast.success(`Ficha de lavanderia enviada (${items.length} itens)`);
      onClose();
    } catch (err) {
      console.error("[laundry] erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao enviar ficha");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <p className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
              🧺 Lavanderia
            </p>
            <h3 className="text-base font-black text-white">Ficha Digital de Enxoval</h3>
            <p className="text-xs text-slate-400">INJOY {unidade} · {camareiraName || "—"}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
              <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                <th className="text-left p-3 font-bold">Item</th>
                <th className="p-2 font-bold w-20">Enviado</th>
                <th className="p-2 font-bold w-20">Retornado</th>
                <th className="p-2 font-bold w-20">Diferença</th>
                <th className="p-2 font-bold w-20">Em Falta</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr
                  key={l.item}
                  className={cn(
                    "border-b border-slate-800/60",
                    i % 2 === 0 ? "bg-slate-900" : "bg-slate-800/30",
                  )}
                >
                  <td className="p-3 text-slate-200 font-semibold text-xs">{l.item}</td>
                  <td className="p-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={l.enviado}
                      onChange={(e) => setCampo(l.item, "enviado", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-center text-white text-sm outline-none focus:border-sky-500"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={l.retornado}
                      onChange={(e) => setCampo(l.item, "retornado", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-center text-white text-sm outline-none focus:border-sky-500"
                      placeholder="0"
                    />
                  </td>
                  <td className="p-1 text-center">
                    <span
                      className={cn(
                        "inline-block min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-bold",
                        l.diff === 0
                          ? "bg-slate-800 text-slate-400"
                          : l.diff > 0
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-sky-500/20 text-sky-300",
                      )}
                    >
                      {l.diff}
                    </span>
                  </td>
                  <td className="p-1 text-center">
                    {l.emFalta > 0 ? (
                      <span className="inline-block min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-black bg-red-500 text-white shadow-lg shadow-red-500/30">
                        -{l.emFalta}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={enviar}
            disabled={!canSubmit}
            className={cn(
              "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2",
              canSubmit
                ? "bg-sky-500 hover:bg-sky-600 text-white"
                : "bg-slate-800 text-slate-500 cursor-not-allowed",
            )}
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Enviar para Lavanderia ({totalPreenchidos})
          </button>
        </div>
      </div>
    </div>
  );
}
