import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, X, ImageIcon, Clock, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/store";
import { EmptyState, ErrorState, LoadingState, friendlyError } from "@/components/ui/data-state";

export const Route = createFileRoute("/_authenticated/historico-limpeza")({
  component: HistoricoLimpezaPage,
});

type HistRow = {
  id: string;
  property: string;
  room_number: string;
  camareira_name: string;
  action_type: string;
  task_name: string;
  started_at: string | null;
  ended_at: string | null;
  photo_url: string | null;
  comment: string | null;
  created_at: string;
};

type Unidade = "Todas" | "Botafogo" | "Ipanema";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function duracao(started: string | null, ended: string | null) {
  if (!started || !ended) return "—";
  const ms = new Date(ended).getTime() - new Date(started).getTime();
  if (ms < 0 || Number.isNaN(ms)) return "—";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return `${h}h ${pad(r)}min`;
}

function HistoricoLimpezaPage() {
  const { data: me } = useMe();
  const isFull = !!me && (me.isGestor || me.isAdmin);

  const [rows, setRows] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [data, setData] = useState<string>(todayStr());
  const [mes, setMes] = useState<string>("");
  const [ano, setAno] = useState<string>("");
  const [camareira, setCamareira] = useState<string>("");
  const [unidade, setUnidade] = useState<Unidade>("Todas");
  const [fotoAberta, setFotoAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      // biome-ignore lint/suspicious/noExplicitAny: tabela nova ainda não está no types.ts gerado
      const { data: d, error } = await (supabase as any)
        .from("room_housekeeping_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      setRows((d ?? []) as HistRow[]);
    } catch (err) {
      const msg = friendlyError(err, "Falha ao carregar histórico");
      setErro(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFull) carregar();
  }, [carregar, isFull]);

  useEffect(() => {
    const ch = supabase
      .channel("room_housekeeping_history_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_housekeeping_history" },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [carregar]);

  const camareirasUnicas = useMemo(
    () => Array.from(new Set(rows.map((r) => r.camareira_name).filter(Boolean))).sort(),
    [rows],
  );

  const filtrados = useMemo(() => {
    return rows.filter((r) => {
      const dt = new Date(r.created_at);
      if (data) {
        const [y, m, d] = data.split("-").map(Number);
        if (dt.getFullYear() !== y || dt.getMonth() + 1 !== m || dt.getDate() !== d) return false;
      } else {
        if (mes && dt.getMonth() + 1 !== Number(mes)) return false;
        if (ano && dt.getFullYear() !== Number(ano)) return false;
      }
      if (unidade !== "Todas" && r.property !== unidade) return false;
      if (camareira && !r.camareira_name.toLowerCase().includes(camareira.toLowerCase())) return false;
      return true;
    });
  }, [rows, data, mes, ano, unidade, camareira]);

  const resumo = useMemo(() => {
    const total = filtrados.length;
    const dnd = filtrados.filter((r) => r.action_type === "NÃO PERTURBE").length;
    const limpezas = total - dnd;
    return { total, dnd, limpezas };
  }, [filtrados]);

  if (!isFull) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-3">
        <h1 className="text-2xl font-semibold">Acesso restrito</h1>
        <p className="text-muted-foreground">
          Este relatório é exclusivo para Gestores e Administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-50 pb-16">
      <div className="bg-blue-950 text-white p-5 shadow-md sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Histórico de Produção de Limpeza</h1>
          <p className="text-xs text-blue-300">Relatório cumulativo das camareiras</p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="p-2 bg-blue-900/60 rounded-lg active:bg-blue-900 text-blue-100 disabled:opacity-60"
          aria-label="Recarregar"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filtros</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs font-semibold text-slate-600 space-y-1">
              Dia
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600 space-y-1">
              Mês
              <select
                value={mes}
                onChange={(e) => {
                  setMes(e.target.value);
                  if (e.target.value) setData("");
                }}
                className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
              >
                <option value="">—</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{pad(m)}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 space-y-1">
              Ano
              <input
                type="number"
                placeholder={String(new Date().getFullYear())}
                value={ano}
                onChange={(e) => {
                  setAno(e.target.value);
                  if (e.target.value) setData("");
                }}
                className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600 space-y-1">
              Unidade
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value as Unidade)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
              >
                <option value="Todas">Todas</option>
                <option value="Botafogo">Botafogo</option>
                <option value="Ipanema">Ipanema</option>
              </select>
            </label>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              list="camareiras-list"
              value={camareira}
              onChange={(e) => setCamareira(e.target.value)}
              placeholder="Nome da camareira..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <datalist id="camareiras-list">
              {camareirasUnicas.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Registros</p>
            <p className="text-2xl font-black text-slate-900">{resumo.total}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Limpezas</p>
            <p className="text-2xl font-black text-emerald-600">{resumo.limpezas}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Não Perturbe</p>
            <p className="text-2xl font-black text-red-600">{resumo.dnd}</p>
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <LoadingState label="Carregando histórico..." />
        ) : erro && rows.length === 0 ? (
          <ErrorState title="Falha ao carregar" description={erro} onRetry={carregar} retrying={loading} />
        ) : filtrados.length === 0 ? (
          <EmptyState
            title="Nenhum registro para os filtros"
            description="Ajuste dia, mês, ano, unidade ou nome da camareira."
          />
        ) : (
          <div className="space-y-3">
            {filtrados.map((r) => {
              const isDnd = r.action_type === "NÃO PERTURBE";
              return (
                <div
                  key={r.id}
                  className={cn(
                    "bg-white rounded-2xl border shadow-sm p-4 flex gap-3",
                    isDnd ? "border-red-200" : "border-slate-200",
                  )}
                >
                  {isDnd && r.photo_url ? (
                    <button
                      onClick={() => setFotoAberta(r.photo_url)}
                      className="shrink-0"
                      aria-label="Ampliar foto"
                    >
                      <img
                        src={r.photo_url}
                        alt="Placa Não Perturbe"
                        className="w-16 h-16 rounded-lg object-cover border border-red-300"
                      />
                    </button>
                  ) : isDnd ? (
                    <div className="w-16 h-16 rounded-lg bg-red-50 border border-red-200 grid place-items-center text-red-500">
                      <ImageIcon size={18} />
                    </div>
                  ) : null}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900">
                          APT {r.room_number}{" "}
                          <span className="text-xs font-semibold text-slate-500">
                            <Building2 size={12} className="inline -mt-0.5" /> INJOY {r.property}
                          </span>
                        </p>
                        <p className="text-xs text-slate-600 truncate">
                          <span className="font-bold">{r.camareira_name}</span> · {r.task_name}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider whitespace-nowrap",
                          isDnd ? "bg-red-600 text-white" : "bg-emerald-600 text-white",
                        )}
                      >
                        {isDnd ? "🚫 DND" : "✔ Limpeza"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} /> Início: {fmtDateTime(r.started_at)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} /> Fim: {fmtDateTime(r.ended_at)}
                      </span>
                      <span className="font-semibold text-slate-700">
                        Duração: {duracao(r.started_at, r.ended_at)}
                      </span>
                    </div>
                    {r.comment ? (
                      <p className="mt-2 text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-2">
                        “{r.comment}”
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {fotoAberta && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setFotoAberta(null)}
        >
          <button
            onClick={() => setFotoAberta(null)}
            className="absolute top-4 right-4 p-2 bg-white/90 rounded-full"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
          <img
            src={fotoAberta}
            alt="Foto ampliada"
            className="max-w-full max-h-full rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
