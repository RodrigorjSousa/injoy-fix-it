import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  GlassWater,
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Package,
  History,
  BarChart3,
  Filter,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUnidade } from "@/lib/unidade-context";
import { cn } from "@/lib/utils";
import { ErrorState, friendlyError } from "@/components/ui/data-state";
import { useServerFn } from "@tanstack/react-start";
import { syncCloudbedsItems } from "@/lib/cloudbeds-pdv.functions";

export const Route = createFileRoute("/_authenticated/frigobar")({
  component: FrigobarPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6">
      <ErrorState title="Falha ao carregar o Frigobar" description={friendlyError(error)} onRetry={reset} />
    </div>
  ),
});

type Beverage = {
  id: string;
  property: string;
  name: string;
  price: number;
  current_stock: number;
  min_stock: number;
};

type Sale = {
  id: string;
  property: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  room_number: string | null;
  payment_method: string;
  registered_by: string;
  created_at: string;
};

type Tab = "dashboard" | "catalogo" | "historico";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function FrigobarPage() {
  const { unidade } = useUnidade();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [bebidas, setBebidas] = useState<Beverage[]>([]);
  const [vendas, setVendas] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroPeriodo, setFiltroPeriodo] = useState<"hoje" | "semana" | "mes" | "todos">("mes");

  const carregar = async () => {
    setLoading(true);
    try {
      const [{ data: cat, error: e1 }, { data: sales, error: e2 }] = await Promise.all([
        supabase.from("beverage_catalog").select("*").eq("property", unidade).order("name"),
        supabase.from("beverage_sales").select("*").eq("property", unidade).order("created_at", { ascending: false }).limit(1000),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setBebidas((cat as Beverage[]) ?? []);
      setVendas((sales as Sale[]) ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade]);

  // --- Métricas ---
  const now = Date.now();
  const dia = 86400000;
  const totais = useMemo(() => {
    const hoje = vendas.filter((v) => now - new Date(v.created_at).getTime() < dia);
    const semana = vendas.filter((v) => now - new Date(v.created_at).getTime() < 7 * dia);
    const mes = vendas.filter((v) => now - new Date(v.created_at).getTime() < 30 * dia);
    const sum = (arr: Sale[]) => arr.reduce((a, b) => a + Number(b.total_price), 0);
    return {
      hoje: sum(hoje),
      semana: sum(semana),
      mes: sum(mes),
      hojeCount: hoje.length,
      mesCount: mes.length,
    };
  }, [vendas, now]);

  const topBebidas = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const v of vendas) {
      const key = v.product_name;
      const cur = map.get(key) ?? { name: key, qty: 0, revenue: 0 };
      cur.qty += v.quantity;
      cur.revenue += Number(v.total_price);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 3);
  }, [vendas]);

  const alertas = useMemo(
    () => bebidas.filter((b) => b.current_stock <= b.min_stock),
    [bebidas],
  );

  // --- Histórico filtrado ---
  const vendasFiltradas = useMemo(() => {
    if (filtroPeriodo === "todos") return vendas;
    const janela = filtroPeriodo === "hoje" ? dia : filtroPeriodo === "semana" ? 7 * dia : 30 * dia;
    return vendas.filter((v) => now - new Date(v.created_at).getTime() < janela);
  }, [vendas, filtroPeriodo, now]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 grid place-items-center shadow-lg">
            <GlassWater className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black">Frigobar · Controle & Vendas</h1>
            <p className="text-sm text-muted-foreground">INJOY {unidade}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { key: "dashboard", label: "Dashboard", icon: BarChart3 },
          { key: "catalogo", label: "Gerenciar Bebidas", icon: Package },
          { key: "historico", label: "Histórico", icon: History },
        ] as const).map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors",
                active
                  ? "border-amber-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "dashboard" && (
        <DashboardTab totais={totais} topBebidas={topBebidas} alertas={alertas} loading={loading} />
      )}
      {tab === "catalogo" && (
        <CatalogoTab bebidas={bebidas} unidade={unidade} onChange={carregar} />
      )}
      {tab === "historico" && (
        <HistoricoTab
          vendas={vendasFiltradas}
          filtroPeriodo={filtroPeriodo}
          setFiltroPeriodo={setFiltroPeriodo}
        />
      )}
    </div>
  );
}

// ============= DASHBOARD =============
function DashboardTab({
  totais,
  topBebidas,
  alertas,
  loading,
}: {
  totais: { hoje: number; semana: number; mes: number; hojeCount: number; mesCount: number };
  topBebidas: { name: string; qty: number; revenue: number }[];
  alertas: Beverage[];
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Faturamento Hoje" value={brl(totais.hoje)} sub={`${totais.hojeCount} vendas`} icon={DollarSign} tone="emerald" />
        <KpiCard label="Últimos 7 dias" value={brl(totais.semana)} sub="Semana corrente" icon={TrendingUp} tone="amber" />
        <KpiCard label="Últimos 30 dias" value={brl(totais.mes)} sub={`${totais.mesCount} vendas`} icon={BarChart3} tone="blue" />
      </div>

      {/* Top 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground mb-4">🏆 Top 3 mais vendidas</h3>
          {loading && topBebidas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : topBebidas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem vendas registradas.</p>
          ) : (
            <ol className="space-y-3">
              {topBebidas.map((b, i) => {
                const max = topBebidas[0].qty || 1;
                const pct = (b.qty / max) * 100;
                return (
                  <li key={b.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold flex items-center gap-2">
                        <span className={cn(
                          "h-6 w-6 grid place-items-center rounded-full text-xs font-black text-white",
                          i === 0 ? "bg-amber-500" : i === 1 ? "bg-slate-400" : "bg-orange-700",
                        )}>{i + 1}</span>
                        {b.name}
                      </span>
                      <span className="text-muted-foreground">{b.qty} un · {brl(b.revenue)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-600 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" /> Reposição urgente
          </h3>
          {alertas.length === 0 ? (
            <p className="text-sm text-emerald-600 font-semibold">✓ Todos os itens acima do estoque mínimo.</p>
          ) : (
            <ul className="space-y-2">
              {alertas.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2">
                  <div>
                    <p className="text-sm font-bold">{a.name}</p>
                    <p className="text-[11px] text-muted-foreground">Mínimo: {a.min_stock}</p>
                  </div>
                  <span className="text-lg font-black text-red-500 tabular-nums">{a.current_stock}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, sub, icon: Icon, tone,
}: { label: string; value: string; sub: string; icon: typeof DollarSign; tone: "emerald" | "amber" | "blue" }) {
  const toneMap = {
    emerald: "from-emerald-500 to-emerald-600",
    amber: "from-amber-500 to-orange-600",
    blue: "from-blue-500 to-blue-600",
  } as const;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className={cn("h-9 w-9 grid place-items-center rounded-xl bg-gradient-to-br text-white shadow-md", toneMap[tone])}>
          <Icon size={16} />
        </div>
      </div>
      <p className="text-2xl font-black mt-2 tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

// ============= CATÁLOGO =============
function CatalogoTab({
  bebidas, unidade, onChange,
}: { bebidas: Beverage[]; unidade: string; onChange: () => void }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Beverage>>({});
  const [novo, setNovo] = useState(false);
  const [novoForm, setNovoForm] = useState({ name: "", price: 0, current_stock: 0, min_stock: 5 });
  const [sincronizando, setSincronizando] = useState(false);
  const sync = useServerFn(syncCloudbedsItems);

  const sincronizarCloudbeds = async () => {
    setSincronizando(true);
    try {
      const res = await sync({ data: { property: unidade as "Ipanema" | "Botafogo" } });
      toast.success("Catálogo e preços sincronizados com o Cloudbeds!", {
        description: `${res.updated} atualizados · ${res.created} criados · ${res.removed ?? 0} removidos · ${res.totalCloudbeds} itens no Cloudbeds`,
      });
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao sincronizar com o Cloudbeds");
    } finally {
      setSincronizando(false);
    }
  };

  const iniciarEdicao = (b: Beverage) => {
    setEditando(b.id);
    setForm({ name: b.name, price: b.price, current_stock: b.current_stock, min_stock: b.min_stock });
  };

  const salvar = async (id: string) => {
    const { error } = await supabase.from("beverage_catalog").update({
      name: form.name,
      price: Number(form.price),
      current_stock: Number(form.current_stock),
      min_stock: Number(form.min_stock),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Bebida atualizada");
    setEditando(null);
    onChange();
  };

  const excluir = async (id: string, nome: string) => {
    if (!confirm(`Remover "${nome}" do catálogo?`)) return;
    const { error } = await supabase.from("beverage_catalog").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removida");
    onChange();
  };

  const criar = async () => {
    if (!novoForm.name.trim()) return toast.error("Informe o nome");
    const { error } = await supabase.from("beverage_catalog").insert({
      property: unidade,
      name: novoForm.name.trim(),
      price: Number(novoForm.price),
      current_stock: Number(novoForm.current_stock),
      min_stock: Number(novoForm.min_stock),
    });
    if (error) return toast.error(error.message);
    toast.success("Bebida adicionada");
    setNovo(false);
    setNovoForm({ name: "", price: 0, current_stock: 0, min_stock: 5 });
    onChange();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          {bebidas.length} bebidas cadastradas em <span className="font-bold">INJOY {unidade}</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={sincronizarCloudbeds}
            disabled={sincronizando}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-sm shadow-md transition-all",
              sincronizando
                ? "bg-slate-500 cursor-not-allowed"
                : "bg-gradient-to-br from-sky-500 to-indigo-600 hover:brightness-110",
            )}
          >
            <RefreshCw size={16} className={cn(sincronizando && "animate-spin")} />
            {sincronizando ? "Sincronizando…" : "Sincronizar Preços com Cloudbeds"}
          </button>
          <button
            onClick={() => setNovo((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white font-bold text-sm shadow-md hover:brightness-110"
          >
            <Plus size={16} /> Nova bebida
          </button>
        </div>
      </div>

      {novo && (
        <div className="rounded-2xl border border-amber-500/50 bg-amber-500/5 p-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
          <input
            placeholder="Nome (ex: Red Bull)"
            value={novoForm.name}
            onChange={(e) => setNovoForm((f) => ({ ...f, name: e.target.value }))}
            className="sm:col-span-2 bg-background border border-input rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number" step="0.01" placeholder="Preço"
            value={novoForm.price}
            onChange={(e) => setNovoForm((f) => ({ ...f, price: Number(e.target.value) }))}
            className="bg-background border border-input rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number" placeholder="Estoque"
            value={novoForm.current_stock}
            onChange={(e) => setNovoForm((f) => ({ ...f, current_stock: Number(e.target.value) }))}
            className="bg-background border border-input rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="number" placeholder="Mínimo"
            value={novoForm.min_stock}
            onChange={(e) => setNovoForm((f) => ({ ...f, min_stock: Number(e.target.value) }))}
            className="bg-background border border-input rounded-lg px-3 py-2 text-sm"
          />
          <div className="sm:col-span-5 flex gap-2 justify-end">
            <button onClick={() => setNovo(false)} className="px-3 py-2 rounded-lg text-sm font-semibold text-muted-foreground">Cancelar</button>
            <button onClick={criar} className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 text-white">Adicionar</button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Bebida</th>
                <th className="text-right px-4 py-3">Preço</th>
                <th className="text-right px-4 py-3">Estoque</th>
                <th className="text-right px-4 py-3">Mínimo</th>
                <th className="text-right px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bebidas.map((b) => {
                const isEdit = editando === b.id;
                const critico = b.current_stock <= b.min_stock;
                return (
                  <tr key={b.id} className={cn(critico && !isEdit && "bg-red-500/5")}>
                    <td className="px-4 py-3 font-bold">
                      {isEdit ? (
                        <input
                          value={form.name ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          className="bg-background border border-input rounded px-2 py-1 text-sm w-full"
                        />
                      ) : b.name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEdit ? (
                        <input type="number" step="0.01" value={form.price ?? 0}
                          onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
                          className="bg-background border border-input rounded px-2 py-1 text-sm w-24 text-right" />
                      ) : brl(Number(b.price))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEdit ? (
                        <input type="number" value={form.current_stock ?? 0}
                          onChange={(e) => setForm((f) => ({ ...f, current_stock: Number(e.target.value) }))}
                          className="bg-background border border-input rounded px-2 py-1 text-sm w-20 text-right" />
                      ) : b.current_stock}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEdit ? (
                        <input type="number" value={form.min_stock ?? 0}
                          onChange={(e) => setForm((f) => ({ ...f, min_stock: Number(e.target.value) }))}
                          className="bg-background border border-input rounded px-2 py-1 text-sm w-20 text-right" />
                      ) : b.min_stock}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full",
                        critico ? "bg-red-500/20 text-red-500" : "bg-emerald-500/20 text-emerald-600",
                      )}>
                        {critico ? "Repor" : "OK"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {isEdit ? (
                          <>
                            <button onClick={() => salvar(b.id)} className="p-2 rounded-lg bg-emerald-500 text-white" aria-label="Salvar"><Save size={14} /></button>
                            <button onClick={() => setEditando(null)} className="p-2 rounded-lg bg-muted" aria-label="Cancelar"><X size={14} /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => iniciarEdicao(b)} className="p-2 rounded-lg hover:bg-muted" aria-label="Editar"><Edit3 size={14} /></button>
                            <button onClick={() => excluir(b.id, b.name)} className="p-2 rounded-lg hover:bg-red-500/10 text-red-500" aria-label="Excluir"><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {bebidas.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">Nenhuma bebida cadastrada nesta unidade.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============= HISTÓRICO =============
function HistoricoTab({
  vendas, filtroPeriodo, setFiltroPeriodo,
}: {
  vendas: Sale[];
  filtroPeriodo: "hoje" | "semana" | "mes" | "todos";
  setFiltroPeriodo: (v: "hoje" | "semana" | "mes" | "todos") => void;
}) {
  const total = vendas.reduce((a, b) => a + Number(b.total_price), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter size={14} className="text-muted-foreground mr-1" />
          {([
            { k: "hoje", l: "Hoje" },
            { k: "semana", l: "7 dias" },
            { k: "mes", l: "30 dias" },
            { k: "todos", l: "Tudo" },
          ] as const).map((p) => (
            <button
              key={p.k}
              onClick={() => setFiltroPeriodo(p.k)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                filtroPeriodo === p.k
                  ? "bg-amber-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {p.l}
            </button>
          ))}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Total do período</p>
          <p className="text-xl font-black text-amber-500 tabular-nums">{brl(total)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Data / Hora</th>
                <th className="text-left px-4 py-3">Quarto</th>
                <th className="text-left px-4 py-3">Produto</th>
                <th className="text-right px-4 py-3">Qtd</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Pagamento</th>
                <th className="text-left px-4 py-3">Recepcionista</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vendas.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2.5 tabular-nums text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-2.5 font-bold">{v.room_number ?? "—"}</td>
                  <td className="px-4 py-2.5">{v.product_name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{v.quantity}</td>
                  <td className="px-4 py-2.5 text-right font-black tabular-nums">{brl(Number(v.total_price))}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted">
                      {v.payment_method}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{v.registered_by}</td>
                </tr>
              ))}
              {vendas.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">Nenhuma venda no período selecionado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
