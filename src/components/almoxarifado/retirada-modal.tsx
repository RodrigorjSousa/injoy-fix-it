import { useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  Send,
  ToyBrick,
  Brush,
  Zap,
  Droplet,
  Wind,
  Coffee,
  Package,
  Search,
  Minus,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Setor = "Banheiro" | "Limpeza" | "Elétrica" | "Hidráulica" | "Ar Condicionado" | "Cozinha";

const SETORES: { key: Setor; icon: typeof Package; color: string }[] = [
  { key: "Banheiro", icon: ToyBrick, color: "from-cyan-500 to-cyan-600" },
  { key: "Limpeza", icon: Brush, color: "from-emerald-500 to-emerald-600" },
  { key: "Elétrica", icon: Zap, color: "from-amber-500 to-amber-600" },
  { key: "Hidráulica", icon: Droplet, color: "from-blue-500 to-blue-600" },
  { key: "Ar Condicionado", icon: Wind, color: "from-sky-500 to-sky-600" },
  { key: "Cozinha", icon: Coffee, color: "from-orange-500 to-orange-600" },
];

type InventoryItem = {
  id: string;
  property: string;
  sector: string;
  name: string;
  current_stock: number;
  min_stock: number;
  unit_type: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  unidade: "Botafogo" | "Ipanema";
  funcionarioName: string;
}

export function RetiradaAlmoxarifadoModal({ open, onClose, unidade, funcionarioName }: Props) {
  const [setor, setSetor] = useState<Setor>("Banheiro");
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecionado, setSelecionado] = useState<InventoryItem | null>(null);
  const [qtd, setQtd] = useState(1);
  const [purpose, setPurpose] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusca("");
    setSelecionado(null);
    setQtd(1);
    setPurpose("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("inventory_items" as never)
        .select("*")
        .eq("property", unidade)
        .order("name");
      setLoading(false);
      if (!alive) return;
      if (error) {
        toast.error(error.message);
        return;
      }
      setItens((data as unknown as InventoryItem[]) ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [open, unidade]);

  const itensDoSetor = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens
      .filter((i) => i.sector === setor)
      .filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [itens, setor, busca]);

  if (!open) return null;

  const canSubmit = !!selecionado && qtd > 0 && qtd <= (selecionado?.current_stock ?? 0) && !enviando;

  const enviar = async () => {
    if (!selecionado || !canSubmit) return;
    setEnviando(true);
    try {
      const { error } = await supabase
        .from("inventory_requests" as never)
        .insert({
          property: unidade,
          requested_by: funcionarioName || "—",
          item_id: selecionado.id,
          quantity: qtd,
          purpose: purpose.trim() || null,
          status: "pending",
        } as never);
      if (error) throw error;
      toast.success(`Solicitação enviada: ${qtd} × ${selecionado.name}`);
      onClose();
    } catch (err) {
      console.error("[almoxarifado] erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao enviar solicitação");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <p className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">
              📦 Almoxarifado
            </p>
            <h3 className="text-base font-black text-white">Retirar Material</h3>
            <p className="text-xs text-slate-400">INJOY {unidade} · {funcionarioName || "—"}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Setores */}
        <div className="p-3 border-b border-slate-800 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {SETORES.map(({ key, icon: Icon, color }) => {
              const active = setor === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setSetor(key);
                    setSelecionado(null);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-xl min-w-[92px] transition-all",
                    active
                      ? `bg-gradient-to-br ${color} text-white shadow-md`
                      : "bg-slate-800/60 text-slate-400 hover:bg-slate-800",
                  )}
                >
                  <Icon size={20} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{key}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Busca */}
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={`Buscar em ${setor}...`}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Lista de itens */}
        <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
          {loading ? (
            <div className="text-center text-slate-400 py-6">
              <Loader2 className="inline animate-spin mr-2" size={16} />
              Carregando…
            </div>
          ) : itensDoSetor.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-6">
              Nenhum item disponível neste setor.
            </div>
          ) : (
            itensDoSetor.map((it) => {
              const active = selecionado?.id === it.id;
              const critico = it.current_stock <= it.min_stock;
              const zerado = it.current_stock <= 0;
              return (
                <button
                  key={it.id}
                  disabled={zerado}
                  onClick={() => {
                    setSelecionado(it);
                    setQtd(1);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                    zerado
                      ? "bg-slate-800/30 border-slate-800 text-slate-600 cursor-not-allowed"
                      : active
                        ? "bg-purple-500/10 border-purple-500 text-white"
                        : "bg-slate-800/50 border-slate-700 text-slate-200 hover:border-slate-600",
                  )}
                >
                  <div
                    className={cn(
                      "h-10 w-10 rounded-lg shrink-0 grid place-items-center",
                      active ? "bg-purple-500 text-white" : "bg-slate-700 text-slate-300",
                    )}
                  >
                    <Package size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{it.name}</p>
                    <p className="text-[11px] text-slate-400">{it.unit_type}</p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "text-sm font-black",
                        zerado
                          ? "text-slate-600"
                          : critico
                            ? "text-red-400"
                            : "text-emerald-400",
                      )}
                    >
                      {it.current_stock}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase">
                      {zerado ? "Zerado" : critico ? "Crítico" : "em estoque"}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Quantidade + Finalidade */}
        {selecionado && (
          <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-900/80">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                  Selecionado
                </p>
                <p className="text-sm font-bold text-white">{selecionado.name}</p>
              </div>
              <div className="flex items-center gap-2 bg-slate-800 rounded-xl p-1">
                <button
                  onClick={() => setQtd((n) => Math.max(1, n - 1))}
                  className="p-2 rounded-lg text-white hover:bg-slate-700"
                  aria-label="Diminuir"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min={1}
                  max={selecionado.current_stock}
                  value={qtd}
                  onChange={(e) => {
                    const v = parseInt(e.target.value || "1", 10);
                    if (Number.isFinite(v))
                      setQtd(Math.max(1, Math.min(selecionado.current_stock, v)));
                  }}
                  className="w-14 bg-transparent text-center text-white text-lg font-black outline-none"
                />
                <button
                  onClick={() =>
                    setQtd((n) => Math.min(selecionado.current_stock, n + 1))
                  }
                  className="p-2 rounded-lg text-white hover:bg-slate-700"
                  aria-label="Aumentar"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value.slice(0, 80))}
              placeholder="Destino (ex: APT 102, Recepção…)"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500"
            />
          </div>
        )}

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={enviar}
            disabled={!canSubmit}
            className={cn(
              "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2",
              canSubmit
                ? "bg-purple-500 hover:bg-purple-600 text-white"
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
