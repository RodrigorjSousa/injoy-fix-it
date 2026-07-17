import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Package,
  Plus,
  History,
  Save,
  ShoppingCart,
  Building2,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/almoxarifado")({
  component: AlmoxarifadoAdmin,
});

type Item = {
  id: string;
  property: string;
  sector: string;
  name: string;
  current_stock: number;
  min_stock: number;
  unit_type: string;
};

type ReqHist = {
  id: string;
  property: string;
  requested_by: string;
  quantity: number;
  purpose: string | null;
  status: string;
  audited_by: string | null;
  created_at: string;
  updated_at: string;
  item?: { name: string; unit_type: string };
};

type Sector = { id: string; property: string; name: string };

function AlmoxarifadoAdmin() {
  const { data: me } = useMe();
  const isAdmin = !!me && (me.isAdmin || me.isGestor);
  const qc = useQueryClient();
  const [unidade, setUnidade] = useState<Unidade>("Botafogo");
  const [busca, setBusca] = useState("");
  const [setorFiltro, setSetorFiltro] = useState<string>("__all");
  const [dirty, setDirty] = useState<Record<string, { current_stock?: number; min_stock?: number; name?: string; unit_type?: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showNewItem, setShowNewItem] = useState(false);
  const [showSetores, setShowSetores] = useState(false);
  const [novoSetor, setNovoSetor] = useState("");
  const [savingSetor, setSavingSetor] = useState(false);
  const [deletingSetorId, setDeletingSetorId] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ name: string; sector: string; unit_type: string; current_stock: number; min_stock: number }>({
    name: "",
    sector: "",
    unit_type: "un",
    current_stock: 0,
    min_stock: 0,
  });
  const [creating, setCreating] = useState(false);

  const { data: setores = [] } = useQuery({
    queryKey: ["inv_sectors", unidade],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_sectors" as never)
        .select("*")
        .eq("property", unidade)
        .order("name");
      if (error) throw error;
      return (data as unknown as Sector[]) ?? [];
    },
  });
  const SETORES = useMemo(() => setores.map((s) => s.name), [setores]);

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ["inv_items", unidade],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items" as never)
        .select("*")
        .eq("property", unidade)
        .order("sector")
        .order("name");
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["inv_requests_history", unidade],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_requests" as never)
        .select("*, item:inventory_items(name,unit_type)")
        .eq("property", unidade)
        .eq("status", "approved")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as unknown as ReqHist[]) ?? [];
    },
  });

  const alertas = useMemo(
    () => itens.filter((i) => i.current_stock <= i.min_stock),
    [itens],
  );

  const itensFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens
      .filter((i) => setorFiltro === "__all" || i.sector === setorFiltro)
      .filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [itens, busca, setorFiltro]);

  const porSetor = useMemo(() => {
    const map = new Map<string, Item[]>();
    itensFiltrados.forEach((i) => {
      if (!map.has(i.sector)) map.set(i.sector, []);
      map.get(i.sector)!.push(i);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [itensFiltrados]);

  const updateDirty = (id: string, patch: { current_stock?: number; min_stock?: number; name?: string; unit_type?: string }) => {
    setDirty((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  };

  const salvar = async (item: Item) => {
    const changes = dirty[item.id];
    if (!changes) return;
    const newName = (changes.name ?? item.name).trim();
    const newUnit = (changes.unit_type ?? item.unit_type).trim();
    if (!newName) {
      toast.error("Nome do item não pode ficar vazio");
      return;
    }
    if (!newUnit) {
      toast.error("Unidade não pode ficar vazia");
      return;
    }
    setSavingId(item.id);
    try {
      const { error } = await supabase
        .from("inventory_items" as never)
        .update({
          current_stock: changes.current_stock ?? item.current_stock,
          min_stock: changes.min_stock ?? item.min_stock,
          name: newName,
          unit_type: newUnit,
        } as never)
        .eq("id", item.id);
      if (error) throw error;
      toast.success("Item atualizado");
      setDirty((s) => {
        const c = { ...s };
        delete c[item.id];
        return c;
      });
      qc.invalidateQueries({ queryKey: ["inv_items"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSavingId(null);
    }
  };

  const excluir = async (item: Item) => {
    if (!confirm(`Excluir "${item.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(item.id);
    try {
      const { error } = await supabase
        .from("inventory_items" as never)
        .delete()
        .eq("id", item.id);
      if (error) throw error;
      toast.success("Item excluído");
      qc.invalidateQueries({ queryKey: ["inv_items"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir");
    } finally {
      setDeletingId(null);
    }
  };

  const criar = async () => {
    const nome = novo.name.trim();
    const unit = novo.unit_type.trim();
    if (!nome) { toast.error("Informe o nome do item"); return; }
    if (!unit) { toast.error("Informe a unidade"); return; }
    setCreating(true);
    try {
      const { error } = await supabase
        .from("inventory_items" as never)
        .insert({
          property: unidade,
          sector: novo.sector,
          name: nome,
          unit_type: unit,
          current_stock: novo.current_stock,
          min_stock: novo.min_stock,
        } as never);
      if (error) throw error;
      toast.success("Item criado");
      setShowNewItem(false);
      setNovo({ name: "", sector: novo.sector, unit_type: "un", current_stock: 0, min_stock: 0 });
      qc.invalidateQueries({ queryKey: ["inv_items"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar item");
    } finally {
      setCreating(false);
    }
  };


  if (!isAdmin) {
    return <div className="p-8 text-center text-slate-500">Acesso restrito a administradores.</div>;
  }

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-50 pb-16">
      <div className="bg-blue-950 text-white p-5 shadow-md">
        <h1 className="text-xl font-black tracking-tight">📦 Gestão de Almoxarifado</h1>
        <p className="text-xs text-blue-300">
          Controle completo de inventário, compras e movimentações
        </p>
      </div>

      <div className="p-4 space-y-6">
        {/* Alertas críticos */}
        {alertas.length > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-red-600 text-white grid place-items-center animate-pulse">
                <AlertTriangle size={16} />
              </div>
              <div>
                <p className="text-sm font-black text-red-800">
                  ⚠️ Falta de Material à Vista! Tomar Providências
                </p>
                <p className="text-[11px] text-red-600">
                  {alertas.length} item(s) em nível crítico
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {alertas.map((a) => (
                <div
                  key={a.id}
                  className="bg-white border border-red-200 rounded-lg p-3 flex items-center gap-2"
                >
                  <div className="h-8 w-8 rounded-md bg-red-100 text-red-700 grid place-items-center shrink-0">
                    <Package size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate">{a.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {a.sector} · mín. {a.min_stock} {a.unit_type}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-red-600 leading-none">{a.current_stock}</p>
                    <p className="text-[9px] text-red-500 uppercase">restam</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Building2 size={12} /> Unidade
            </label>
            <Select value={unidade} onValueChange={(v) => setUnidade(v as Unidade)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Botafogo">Botafogo</SelectItem>
                <SelectItem value="Ipanema">Ipanema</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Setor
            </label>
            <Select value={setorFiltro} onValueChange={setSetorFiltro}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos</SelectItem>
                {SETORES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Buscar
            </label>
            <div className="relative mt-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome do item…"
                className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <button
            onClick={() => setShowNewItem(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            <Plus size={14} /> Novo Item
          </button>
        </div>


        <Tabs defaultValue="inventario" className="w-full">
          <TabsList className="grid grid-cols-3 max-w-2xl">
            <TabsTrigger value="inventario">
              <Package size={14} className="mr-1" /> Inventário
            </TabsTrigger>
            <TabsTrigger value="compras">
              <ShoppingCart size={14} className="mr-1" /> Compras
            </TabsTrigger>
            <TabsTrigger value="historico">
              <History size={14} className="mr-1" /> Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inventario" className="mt-4">
            {isLoading ? (
              <div className="text-center p-8 text-slate-500">
                <Loader2 size={16} className="animate-spin inline mr-2" />Carregando…
              </div>
            ) : (
              <div className="space-y-4">
                {porSetor.map(([setor, list]) => (
                  <div key={setor} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                        {setor}
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                            <th className="text-left p-3 font-bold">Item</th>
                            <th className="p-2 font-bold">Estoque</th>
                            <th className="p-2 font-bold">Mín.</th>
                            <th className="p-2 font-bold">Unid.</th>
                            <th className="p-2 font-bold w-32">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((it) => {
                            const critico = it.current_stock <= it.min_stock;
                            const changes = dirty[it.id];
                            const changed = !!changes;
                            return (
                              <tr key={it.id} className="border-b border-slate-50 last:border-0">
                                <td className="p-3 text-slate-800 font-semibold">
                                  <div className="flex items-center gap-2">
                                    {critico && (
                                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                                    )}
                                    <input
                                      type="text"
                                      defaultValue={it.name}
                                      onChange={(e) => updateDirty(it.id, { name: e.target.value })}
                                      className="w-full min-w-[160px] border border-slate-200 rounded-md px-2 py-1 text-sm font-semibold focus:outline-none focus:border-blue-500"
                                    />
                                  </div>
                                </td>
                                <td className="p-2">
                                  <input
                                    type="number"
                                    min={0}
                                    defaultValue={it.current_stock}
                                    onChange={(e) =>
                                      updateDirty(it.id, {
                                        current_stock: Math.max(0, parseInt(e.target.value || "0", 10)),
                                      })
                                    }
                                    className={cn(
                                      "w-20 border rounded-md px-2 py-1 text-center text-sm font-bold",
                                      critico ? "border-red-300 text-red-700" : "border-slate-200",
                                    )}
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="number"
                                    min={0}
                                    defaultValue={it.min_stock}
                                    onChange={(e) =>
                                      updateDirty(it.id, {
                                        min_stock: Math.max(0, parseInt(e.target.value || "0", 10)),
                                      })
                                    }
                                    className="w-20 border border-slate-200 rounded-md px-2 py-1 text-center text-sm"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    defaultValue={it.unit_type}
                                    onChange={(e) => updateDirty(it.id, { unit_type: e.target.value })}
                                    className="w-24 border border-slate-200 rounded-md px-2 py-1 text-center text-xs focus:outline-none focus:border-blue-500"
                                  />
                                </td>
                                <td className="p-2">
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => salvar(it)}
                                      disabled={!changed || savingId === it.id}
                                      className={cn(
                                        "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold",
                                        changed
                                          ? "bg-blue-600 hover:bg-blue-700 text-white"
                                          : "bg-slate-100 text-slate-400 cursor-not-allowed",
                                      )}
                                    >
                                      {savingId === it.id ? (
                                        <Loader2 size={12} className="animate-spin" />
                                      ) : (
                                        <Save size={12} />
                                      )}
                                      Salvar
                                    </button>
                                    <button
                                      onClick={() => excluir(it)}
                                      disabled={deletingId === it.id}
                                      title="Excluir item"
                                      className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 disabled:opacity-50"
                                    >
                                      {deletingId === it.id ? (
                                        <Loader2 size={12} className="animate-spin" />
                                      ) : (
                                        <Trash2 size={12} />
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                {porSetor.length === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
                    Nenhum item encontrado.
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="compras" className="mt-4">
            <ComprasForm itens={itens} setores={SETORES} onDone={() => qc.invalidateQueries({ queryKey: ["inv_items"] })} />
          </TabsContent>

          <TabsContent value="historico" className="mt-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-800">Retiradas Aprovadas</h3>
                <p className="text-[11px] text-slate-500">Últimas 200 aprovações</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                      <th className="text-left p-3 font-bold">Data / Hora</th>
                      <th className="text-left p-2 font-bold">Retirou</th>
                      <th className="text-left p-2 font-bold">Item</th>
                      <th className="p-2 font-bold">Qtd.</th>
                      <th className="text-left p-2 font-bold">Destino</th>
                      <th className="text-left p-2 font-bold">Auditor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-slate-50 last:border-0">
                        <td className="p-3 text-xs text-slate-600 whitespace-nowrap">
                          {new Date(h.updated_at).toLocaleString("pt-BR")}
                        </td>
                        <td className="p-2 font-semibold text-slate-800">{h.requested_by}</td>
                        <td className="p-2 text-slate-700">{h.item?.name ?? "—"}</td>
                        <td className="p-2 text-center font-black">
                          {h.quantity} <span className="text-[10px] text-slate-400 font-normal">{h.item?.unit_type ?? ""}</span>
                        </td>
                        <td className="p-2 text-slate-600 text-xs">{h.purpose ?? "—"}</td>
                        <td className="p-2 text-slate-600 text-xs">{h.audited_by ?? "—"}</td>
                      </tr>
                    ))}
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          Nenhum registro ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {showNewItem && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setShowNewItem(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-black text-slate-800">Novo Item</h3>
                <p className="text-[11px] text-slate-500">Cadastrar item em {unidade}</p>
              </div>
              <button onClick={() => setShowNewItem(false)} className="h-8 w-8 rounded-lg hover:bg-slate-100 grid place-items-center text-slate-500">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nome do item</label>
                <input
                  type="text"
                  value={novo.name}
                  onChange={(e) => setNovo((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Ex.: Sabonete líquido"
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Setor</label>
                <Select value={novo.sector} onValueChange={(v) => setNovo((s) => ({ ...s, sector: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SETORES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Unid.</label>
                  <input
                    type="text"
                    value={novo.unit_type}
                    onChange={(e) => setNovo((s) => ({ ...s, unit_type: e.target.value }))}
                    placeholder="un"
                    className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Estoque</label>
                  <input
                    type="number"
                    min={0}
                    value={novo.current_stock}
                    onChange={(e) => setNovo((s) => ({ ...s, current_stock: Math.max(0, parseInt(e.target.value || "0", 10)) }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Mín.</label>
                  <input
                    type="number"
                    min={0}
                    value={novo.min_stock}
                    onChange={(e) => setNovo((s) => ({ ...s, min_stock: Math.max(0, parseInt(e.target.value || "0", 10)) }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <button
                onClick={criar}
                disabled={creating}
                className="w-full py-2.5 rounded-xl font-black text-sm inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Criar item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function ComprasForm({ itens, setores, onDone }: { itens: Item[]; setores: string[]; onDone: () => void }) {
  const [itemId, setItemId] = useState<string>("");
  const [qtd, setQtd] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const item = itens.find((i) => i.id === itemId);

  const registrar = async () => {
    if (!item || qtd <= 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("inventory_items" as never)
        .update({ current_stock: item.current_stock + qtd } as never)
        .eq("id", item.id);
      if (error) throw error;
      toast.success(`+${qtd} ${item.unit_type} de ${item.name} adicionados ao estoque`);
      setQtd(0);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar entrada");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-9 w-9 rounded-xl bg-emerald-100 text-emerald-700 grid place-items-center">
          <ShoppingCart size={16} />
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-800">Dar Entrada em Compras</h3>
          <p className="text-[11px] text-slate-500">Registre chegada de mercadoria e some ao estoque atual</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Item
          </label>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">Selecione…</option>
            {setores.map((s: string) => {
              const opts = itens.filter((i) => i.sector === s);
              if (opts.length === 0) return null;
              return (
                <optgroup key={s} label={s}>
                  {opts.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} · atual: {i.current_stock} {i.unit_type}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Quantidade recebida
          </label>
          <input
            type="number"
            min={0}
            value={qtd || ""}
            onChange={(e) => setQtd(Math.max(0, parseInt(e.target.value || "0", 10)))}
            placeholder="0"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {item && qtd > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
            Novo saldo será:{" "}
            <span className="font-black text-emerald-700">
              {item.current_stock + qtd} {item.unit_type}
            </span>{" "}
            (antes: {item.current_stock})
          </div>
        )}

        <button
          onClick={registrar}
          disabled={!item || qtd <= 0 || saving}
          className={cn(
            "w-full py-2.5 rounded-xl font-black text-sm inline-flex items-center justify-center gap-2",
            !item || qtd <= 0
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-700 text-white",
          )}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Adicionar ao Estoque
        </button>
      </div>
    </div>
  );
}
