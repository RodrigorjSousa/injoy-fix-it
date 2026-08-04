import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Search,
  Building2,
  Banknote,
  Plus,
  Minus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/store";
import { EmptyState, ErrorState, LoadingState, friendlyError } from "@/components/ui/data-state";

export const Route = createFileRoute("/_authenticated/historico-caixa")({
  component: HistoricoCaixaPage,
});

type CashMovement = {
  id: string;
  property: string;
  amount: number;
  type: "in" | "out";
  reason: string;
  performed_by: string;
  created_at: string;
};

type Unidade = "Todas" | "Botafogo" | "Ipanema";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const PAGE_SIZE = 50;

function HistoricoCaixaPage() {
  const { data: me } = useMe();
  const isGestor = !!me && (me.isGestor || me.isAdmin);

  const [rows, setRows] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [unidade, setUnidade] = useState<Unidade>("Todas");
  const [nome, setNome] = useState("");
  const [data, setData] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      let q = supabase
        .from("recepcao_caixa_movimentos" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (unidade !== "Todas") q = q.eq("property", unidade);
      
      const { data: d, error } = await q;
      if (error) throw error;
      setRows((d as any) || []);
    } catch (e) {
      setErro(friendlyError(e));
      toast.error("Não foi possível carregar o histórico do caixa");
    } finally {
      setLoading(false);
    }
  }, [unidade]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = rows.filter((r) => {
    if (nome && !r.performed_by.toLowerCase().includes(nome.toLowerCase()) && !r.reason.toLowerCase().includes(nome.toLowerCase())) return false;
    if (data) {
      const d = new Date(r.created_at);
      const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (s !== data) return false;
    }
    return true;
  });

  const deleteRow = async (id: string) => {
    if (!confirm("Deseja realmente excluir este registro?")) return;
    try {
      const { error } = await supabase.from("recepcao_caixa_movimentos" as any).delete().eq("id", id);
      if (error) throw error;
      toast.success("Registro removido");
      fetchRows();
    } catch (e) {
      toast.error("Falha ao excluir");
    }
  };

  if (!isGestor) {
    return (
      <div className="p-6">
        <ErrorState
          title="Acesso restrito"
          description="Apenas gestores podem visualizar o histórico de dinheiro do caixa."
        />
      </div>
    );
  }

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-50 pb-12 font-sans">
      <div className="bg-blue-950 text-white p-5 shadow-md sticky top-0 z-10 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500 grid place-items-center shadow-lg">
            <Banknote size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Relatório de Dinheiro do Caixa</h1>
            <p className="text-xs text-blue-300">Controle de entradas e saídas emergenciais</p>
          </div>
        </div>
        <button
          onClick={fetchRows}
          className="p-2 bg-blue-900/60 rounded-lg text-blue-100"
          aria-label="Atualizar"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Filtros */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Unidade</label>
            <div className="flex gap-2 mt-1">
              {(["Todas", "Botafogo", "Ipanema"] as Unidade[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnidade(u)}
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold",
                    unidade === u ? "border-blue-700 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-500"
                  )}
                >
                  <Building2 size={12} /> {u}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Busca</label>
            <div className="relative mt-1">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome ou motivo..."
                className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Data</label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 rounded-lg border border-slate-200 text-sm"
            />
          </div>
        </div>

        {loading ? (
          <LoadingState label="Carregando histórico..." />
        ) : erro ? (
          <ErrorState title="Erro" description={erro} onRetry={fetchRows} />
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhum registro encontrado" description="Ajuste os filtros ou verifique se há lançamentos." />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Data/Hora</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Unidade</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Quem Gastou</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Motivo</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Valor</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">{fmtDateTime(r.created_at).split(" ")[0]}</span>
                          <span className="text-[10px] text-slate-400">{fmtDateTime(r.created_at).split(" ")[1]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-xs font-semibold text-slate-600">INJOY {r.property}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                            {r.performed_by.charAt(0)}
                          </div>
                          <span className="text-xs font-medium text-slate-700">{r.performed_by}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-xs text-slate-600 line-clamp-2 min-w-[150px]">{r.reason}</p>
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className={cn(
                          "inline-flex items-center gap-1 font-black text-sm",
                          r.type === "in" ? "text-emerald-600" : "text-red-600"
                        )}>
                          {r.type === "in" ? <Plus size={12} /> : <Minus size={12} />}
                          {brl(r.amount)}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => deleteRow(r.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Mostrando {filtered.length} de {rows.length} registros recentes
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
