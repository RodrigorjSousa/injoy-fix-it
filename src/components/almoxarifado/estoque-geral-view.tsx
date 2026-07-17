import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  property: string;
  sector: string;
  name: string;
  current_stock: number;
  min_stock: number;
  unit_type: string;
};

interface Props {
  unidade: "Botafogo" | "Ipanema";
}

export function EstoqueGeralView({ unidade }: Props) {
  const [busca, setBusca] = useState("");
  const [setorFiltro, setSetorFiltro] = useState<string>("__all");

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ["inv_items_view", unidade],
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
    refetchInterval: 30000,
  });

  const setores = useMemo(
    () => Array.from(new Set(itens.map((i) => i.sector))).sort(),
    [itens],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens
      .filter((i) => setorFiltro === "__all" || i.sector === setorFiltro)
      .filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [itens, busca, setorFiltro]);

  const porSetor = useMemo(() => {
    const map = new Map<string, Item[]>();
    filtrados.forEach((i) => {
      if (!map.has(i.sector)) map.set(i.sector, []);
      map.get(i.sector)!.push(i);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtrados]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar item…"
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={setorFiltro}
          onChange={(e) => setSetorFiltro(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="__all">Todos os setores</option>
          {setores.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-[11px] font-bold text-slate-500 ml-auto">
          {filtrados.length} item(s)
        </span>
      </div>

      {isLoading ? (
        <div className="text-center p-8 text-slate-500">
          <Loader2 size={16} className="animate-spin inline mr-2" />
          Carregando…
        </div>
      ) : porSetor.length === 0 ? (
        <div className="text-center p-8 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <Package className="mx-auto mb-2" size={28} />
          <p className="text-sm">Nenhum item encontrado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {porSetor.map(([setor, list]) => (
            <div
              key={setor}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  {setor}
                </h3>
                <span className="text-[10px] font-bold text-slate-500">
                  {list.length} item(s)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                      <th className="text-left p-3 font-bold">Item</th>
                      <th className="p-2 font-bold text-right">Estoque</th>
                      <th className="p-2 font-bold text-right">Mín.</th>
                      <th className="p-2 font-bold text-left">Unid.</th>
                      <th className="p-2 font-bold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((it) => {
                      const zerado = it.current_stock <= 0;
                      const critico = !zerado && it.current_stock <= it.min_stock;
                      return (
                        <tr
                          key={it.id}
                          className="border-b border-slate-50 last:border-0"
                        >
                          <td className="p-3 text-slate-800 font-semibold">{it.name}</td>
                          <td
                            className={cn(
                              "p-2 text-right font-black",
                              zerado
                                ? "text-slate-400"
                                : critico
                                  ? "text-red-600"
                                  : "text-emerald-600",
                            )}
                          >
                            {it.current_stock}
                          </td>
                          <td className="p-2 text-right text-slate-500">
                            {it.min_stock}
                          </td>
                          <td className="p-2 text-slate-500">{it.unit_type}</td>
                          <td className="p-2 text-center">
                            <span
                              className={cn(
                                "inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                                zerado
                                  ? "bg-slate-100 text-slate-500"
                                  : critico
                                    ? "bg-red-100 text-red-700"
                                    : "bg-emerald-100 text-emerald-700",
                              )}
                            >
                              {zerado ? "Zerado" : critico ? "Crítico" : "OK"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
