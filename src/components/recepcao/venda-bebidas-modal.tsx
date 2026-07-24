import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Plus, Minus, ShoppingCart, GlassWater, Search, CreditCard, Banknote, Smartphone, BedDouble } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Unidade } from "@/lib/store";
import { useServerFn } from "@tanstack/react-start";
import { postCloudbedsCharge } from "@/lib/cloudbeds-pdv.functions";

type Beverage = {
  id: string;
  property: string;
  name: string;
  price: number;
  current_stock: number;
  min_stock: number;
  cloudbeds_item_id: string | null;
};

type PaymentMethod = "PIX" | "Dinheiro" | "Cartão de Crédito" | "Cartão de Débito" | "Lançar no Quarto";

const PAYMENT_OPTIONS: { key: PaymentMethod; icon: typeof CreditCard; color: string }[] = [
  { key: "PIX", icon: Smartphone, color: "from-emerald-500 to-emerald-600" },
  { key: "Dinheiro", icon: Banknote, color: "from-green-500 to-green-600" },
  { key: "Cartão de Crédito", icon: CreditCard, color: "from-blue-500 to-blue-600" },
  { key: "Cartão de Débito", icon: CreditCard, color: "from-sky-500 to-sky-600" },
  { key: "Lançar no Quarto", icon: BedDouble, color: "from-purple-500 to-purple-600" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  unidade: Unidade;
  recepcionistaName: string;
  roomsAtivos?: string[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function VendaBebidasModal({ open, onClose, unidade, recepcionistaName, roomsAtivos = [] }: Props) {
  const [bebidas, setBebidas] = useState<Beverage[]>([]);
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [busca, setBusca] = useState("");
  const [quarto, setQuarto] = useState("");
  const [pagamento, setPagamento] = useState<PaymentMethod>("PIX");
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCarrinho({});
    setBusca("");
    setQuarto("");
    setPagamento("PIX");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("beverage_catalog")
        .select("*")
        .eq("property", unidade)
        .order("name");
      setLoading(false);
      if (!alive) return;
      if (error) {
        toast.error(error.message);
        return;
      }
      setBebidas((data as Beverage[]) ?? []);
    })();
    return () => { alive = false; };
  }, [open, unidade]);

  const bebidasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return bebidas;
    return bebidas.filter((b) => b.name.toLowerCase().includes(q));
  }, [bebidas, busca]);

  const total = useMemo(() =>
    bebidas.reduce((acc, b) => acc + (carrinho[b.id] ?? 0) * Number(b.price), 0),
    [bebidas, carrinho],
  );

  const totalItens = Object.values(carrinho).reduce((a, b) => a + b, 0);

  const alterar = (id: string, delta: number) => {
    const bebida = bebidas.find((b) => b.id === id);
    if (!bebida) return;
    setCarrinho((prev) => {
      const atual = prev[id] ?? 0;
      const proximo = Math.max(0, Math.min(bebida.current_stock, atual + delta));
      const next = { ...prev };
      if (proximo === 0) delete next[id];
      else next[id] = proximo;
      return next;
    });
  };

  const pagamentoLabel = pagamento === "Lançar no Quarto" ? "Lançado na conta do quarto" : `Recebido em ${pagamento}`;

  const isFiado = pagamento === "Lançar no Quarto";
  const podeConfirmar = totalItens > 0 && !enviando && (!isFiado || quarto.trim().length > 0);

  const postCharge = useServerFn(postCloudbedsCharge);

  const confirmar = async () => {
    if (!podeConfirmar) return;
    setEnviando(true);
    try {
      const items = bebidas.filter((b) => (carrinho[b.id] ?? 0) > 0);

      // Cloudbeds é a fonte da verdade do estoque: TODA venda (quarto ou
      // balcão) precisa ser lançada lá antes de baixar o estoque local.
      // - Fiado (quarto): posta na folio do quarto.
      // - Balcão: posta na "House Account" configurada pela gestão.
      const semVinculo = items.filter((b) => !b.cloudbeds_item_id);
      if (semVinculo.length > 0) {
        throw new Error(
          `Estes itens ainda não estão vinculados ao Cloudbeds: ${semVinculo.map((i) => i.name).join(", ")}. Peça ao gestor para sincronizar o catálogo antes de vender.`,
        );
      }

      await postCharge({
        data: {
          property: unidade,
          ...(isFiado ? { roomNumber: quarto.trim() } : {}),
          items: items.map((b) => ({
            beverage_id: b.id,
            cloudbeds_item_id: b.cloudbeds_item_id as string,
            name: b.name,
            quantity: carrinho[b.id],
            unit_price: Number(b.price),
          })),
        },
      });

      const salesRows = items.map((b) => ({
        property: unidade,
        product_id: b.id,
        product_name: b.name,
        quantity: carrinho[b.id],
        unit_price: Number(b.price),
        total_price: Number(b.price) * carrinho[b.id],
        room_number: quarto.trim() || null,
        payment_method: pagamento,
        registered_by: recepcionistaName || "Recepção",
      }));

      const { error: salesErr } = await supabase.from("beverage_sales").insert(salesRows);
      if (salesErr) throw salesErr;

      // Atualiza estoque local
      await Promise.all(items.map((b) =>
        supabase
          .from("beverage_catalog")
          .update({ current_stock: b.current_stock - carrinho[b.id] })
          .eq("id", b.id),
      ));

      toast.success(`Venda confirmada • ${brl(total)}`, { description: pagamentoLabel });
      onClose();
    } catch (err) {
      console.error("[venda-bebidas] erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao registrar a venda");
    } finally {
      setEnviando(false);
    }
  };


  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 grid place-items-center shadow-lg">
              <GlassWater size={22} className="text-white" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">🍹 Frigobar / Balcão</p>
              <h3 className="text-base font-black text-white">Venda de Bebidas</h3>
              <p className="text-xs text-slate-400">INJOY {unidade} · {recepcionistaName || "Recepção"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        {/* Busca */}
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar bebida…"
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Grid de bebidas */}
        <div className="overflow-y-auto flex-1 p-3">
          {loading ? (
            <div className="text-center text-slate-400 py-10">
              <Loader2 className="inline animate-spin mr-2" size={16} />
              Carregando bebidas…
            </div>
          ) : bebidasFiltradas.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-10">
              Nenhuma bebida no catálogo desta unidade.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {bebidasFiltradas.map((b) => {
                const qtd = carrinho[b.id] ?? 0;
                const zerado = b.current_stock <= 0;
                const critico = b.current_stock <= b.min_stock;
                return (
                  <div
                    key={b.id}
                    className={cn(
                      "rounded-2xl border p-3 flex flex-col gap-2 transition-all",
                      qtd > 0
                        ? "bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/20"
                        : "bg-slate-800/40 border-slate-700",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-white leading-tight line-clamp-2">{b.name}</p>
                        <p className="text-xs font-bold text-amber-400 mt-0.5">{brl(Number(b.price))}</p>
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded-full",
                          zerado ? "bg-slate-700 text-slate-400" : critico ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300",
                        )}
                      >
                        {b.current_stock}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-auto">
                      <button
                        onClick={() => alterar(b.id, -1)}
                        disabled={qtd === 0}
                        className={cn(
                          "h-9 w-9 rounded-xl grid place-items-center font-black transition-colors",
                          qtd === 0 ? "bg-slate-800 text-slate-600" : "bg-slate-700 text-white hover:bg-slate-600 active:scale-95",
                        )}
                        aria-label="Diminuir"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="text-lg font-black text-white tabular-nums">{qtd}</span>
                      <button
                        onClick={() => alterar(b.id, 1)}
                        disabled={zerado || qtd >= b.current_stock}
                        className={cn(
                          "h-9 w-9 rounded-xl grid place-items-center font-black transition-colors",
                          zerado || qtd >= b.current_stock
                            ? "bg-slate-800 text-slate-600"
                            : "bg-gradient-to-br from-amber-500 to-orange-600 text-white hover:brightness-110 active:scale-95 shadow-md",
                        )}
                        aria-label="Aumentar"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Configuração da venda */}
        <div className="border-t border-slate-800 p-4 space-y-3 bg-slate-900/80">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vincular ao Quarto (opcional)</label>
              {roomsAtivos.length > 0 ? (
                <select
                  value={quarto}
                  onChange={(e) => setQuarto(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
                >
                  <option value="">— Sem vínculo (avulso) —</option>
                  {roomsAtivos.map((r) => (
                    <option key={r} value={r}>Quarto {r}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={quarto}
                  onChange={(e) => setQuarto(e.target.value)}
                  placeholder="Ex: 302"
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
                />
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Método de Pagamento</label>
              <div className="mt-1 grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {PAYMENT_OPTIONS.map((p) => {
                  const active = pagamento === p.key;
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.key}
                      onClick={() => setPagamento(p.key)}
                      className={cn(
                        "flex flex-col items-center gap-1 px-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-tight transition-all",
                        active
                          ? `bg-gradient-to-br ${p.color} text-white shadow-md`
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700",
                      )}
                    >
                      <Icon size={14} />
                      <span className="text-center leading-tight">{p.key}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {pagamento === "Lançar no Quarto" && !quarto.trim() && (
            <p className="text-[11px] text-amber-400 font-semibold">⚠️ Informe o quarto para lançar na conta.</p>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</p>
              <p className="text-2xl font-black text-amber-400 tabular-nums">{brl(total)}</p>
              <p className="text-[11px] text-slate-500">{totalItens} {totalItens === 1 ? "item" : "itens"}</p>
            </div>
            <button
              onClick={confirmar}
              disabled={!podeConfirmar}
              className={cn(
                "px-6 py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all flex items-center gap-2",
                podeConfirmar
                  ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/30 hover:brightness-110 active:scale-95"
                  : "bg-slate-800 text-slate-600 cursor-not-allowed",
              )}
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
              Confirmar Venda
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
