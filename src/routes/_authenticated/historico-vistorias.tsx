import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, X, ImageIcon, Building2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/store";
import { EmptyState, ErrorState, LoadingState, friendlyError } from "@/components/ui/data-state";

export const Route = createFileRoute("/_authenticated/historico-vistorias")({
  component: HistoricoVistoriasPage,
});

type Inspection = {
  id: string;
  property: string;
  room_number: string;
  inspector_name: string;
  inspector_id: string | null;
  checklist: Record<string, boolean> | null;
  photo_url: string | null;
  created_at: string;
};

type Unidade = "Todas" | "Botafogo" | "Ipanema";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function HistoricoVistoriasPage() {
  const { data: me } = useMe();
  const isFull = !!me && (me.isGestor || me.isAdmin);

  const [rows, setRows] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [unidade, setUnidade] = useState<Unidade>("Todas");
  const [nome, setNome] = useState("");
  const [data, setData] = useState("");
  const [foto, setFoto] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      let q = supabase.from("room_inspections").select("*").order("created_at", { ascending: false }).limit(500);
      if (unidade !== "Todas") q = q.eq("property", unidade);
      const { data: d, error } = await q;
      if (error) throw error;
      setRows((d ?? []) as Inspection[]);
    } catch (e) {
      setErro(friendlyError(e));
      toast.error("Não foi possível carregar as vistorias");
    } finally {
      setLoading(false);
    }
  }, [unidade]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (nome && !r.inspector_name.toLowerCase().includes(nome.toLowerCase())) return false;
      if (data) {
        const d = new Date(r.created_at);
        const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (s !== data) return false;
      }
      return true;
    });
  }, [rows, nome, data]);

  if (!isFull) {
    return (
      <div className="p-6">
        <ErrorState title="Acesso restrito" description="Apenas gestores podem visualizar o histórico de vistorias." />
      </div>
    );
  }

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-50 pb-12">
      <div className="bg-blue-950 text-white p-5 shadow-md sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Histórico de Vistorias</h1>
          <p className="text-xs text-blue-300">Vistorias preventivas realizadas pela recepção</p>
        </div>
        <button onClick={fetchRows} className="p-2 bg-blue-900/60 rounded-lg text-blue-100" aria-label="Atualizar">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="p-4 space-y-4">
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
                    unidade === u ? "border-blue-700 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-500",
                  )}
                >
                  <Building2 size={12} /> {u}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Recepcionista</label>
            <div className="relative mt-1">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Buscar nome…"
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
          <LoadingState label="Carregando vistorias…" />
        ) : erro ? (
          <ErrorState title="Erro" description={erro} onRetry={fetchRows} />
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhuma vistoria encontrada" description="Ajuste os filtros para ver resultados." />
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const items = r.checklist ? Object.entries(r.checklist) : [];
              const ok = items.filter(([, v]) => v).length;
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">INJOY {r.property}</p>
                      <h3 className="text-base font-black text-slate-900">Quarto {r.room_number}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Vistoriado por <span className="font-semibold text-slate-700">{r.inspector_name}</span> · {fmtDateTime(r.created_at)}
                      </p>
                    </div>
                    {r.photo_url && (
                      <button onClick={() => setFoto(r.photo_url)} className="shrink-0">
                        <img src={r.photo_url} alt="Vistoria" className="h-16 w-16 rounded-lg object-cover border border-slate-200" />
                      </button>
                    )}
                  </div>

                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Checklist ({ok}/{items.length})
                    </p>
                    <ul className="space-y-1">
                      {items.map(([k, v]) => (
                        <li key={k} className="flex items-center gap-2 text-xs">
                          {v ? (
                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle size={14} className="text-rose-500 shrink-0" />
                          )}
                          <span className={v ? "text-slate-700" : "text-rose-600"}>{k}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {foto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setFoto(null)}>
          <button className="absolute top-4 right-4 bg-white/90 rounded-full p-2" onClick={() => setFoto(null)}>
            <X size={20} />
          </button>
          <img src={foto} alt="Vistoria" className="max-h-[90vh] max-w-full rounded-xl" />
          <ImageIcon className="hidden" />
        </div>
      )}
    </div>
  );
}
