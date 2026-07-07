import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertTriangle, CircleCheck, CircleAlert, Wrench, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/camareiras")({
  component: PainelCamareiras,
});

type Unidade = "Botafogo" | "Ipanema";
type StatusLimpeza = "clean" | "dirty" | "maintenance" | string;

type RoomRow = {
  property: Unidade;
  room_number: string;
  room_type: string | null;
  status: StatusLimpeza | null;
  condition: string | null;
  updated_at: string;
};

type Filtro = "Todos" | "clean" | "dirty" | "maintenance";

const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  clean: { label: "Limpo", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" },
  dirty: { label: "Sujo", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  maintenance: { label: "Manutenção", dot: "bg-red-500", badge: "bg-red-100 text-red-700" },
};

function PainelCamareiras() {
  const [unidadeAtiva, setUnidadeAtiva] = useState<Unidade>("Botafogo");
  const [filtro, setFiltro] = useState<Filtro>("Todos");
  const [busca, setBusca] = useState("");
  const [quartos, setQuartos] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("room_housekeeping")
      .select("*")
      .order("room_number", { ascending: true });
    setLoading(false);
    if (error) {
      toast.error("Falha ao carregar quartos");
      console.error(error);
      return;
    }
    setQuartos((data ?? []) as RoomRow[]);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const sincronizar = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    const t = toast.loading("Sincronizando com Cloudbeds...");
    try {
      const { data, error } = await supabase.functions.invoke("consolidar-dados", { body: {} });
      if (error) throw error;
      if (data && (data as any).success === false) throw new Error((data as any).error);
      await carregar();
      toast.success("Quartos atualizados", { id: t });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao sincronizar", { id: t });
    } finally {
      setSyncing(false);
    }
  }, [carregar, syncing]);

  const filtrados = useMemo(() => {
    return quartos.filter((q) => {
      if (q.property !== unidadeAtiva) return false;
      if (filtro !== "Todos" && (q.status || "dirty") !== filtro) return false;
      if (busca && !`${q.room_number} ${q.room_type ?? ""}`.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [quartos, unidadeAtiva, filtro, busca]);

  const contagem = useMemo(() => {
    const base = quartos.filter((q) => q.property === unidadeAtiva);
    return {
      total: base.length,
      clean: base.filter((q) => q.status === "clean").length,
      dirty: base.filter((q) => q.status === "dirty").length,
      maintenance: base.filter((q) => q.status === "maintenance").length,
    };
  }, [quartos, unidadeAtiva]);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 font-sans antialiased">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Camareiras</h1>
          <p className="text-sm text-slate-500">Status de limpeza em tempo real do Cloudbeds.</p>
        </div>
        <button
          onClick={sincronizar}
          disabled={syncing}
          className="p-2.5 bg-blue-950 text-white rounded-xl disabled:opacity-60"
          aria-label="Sincronizar"
        >
          <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
        {(["Botafogo", "Ipanema"] as Unidade[]).map((u) => (
          <button
            key={u}
            onClick={() => setUnidadeAtiva(u)}
            className={cn(
              "py-3 rounded-lg font-bold text-sm transition-all",
              unidadeAtiva === u
                ? "bg-teal-50 border border-teal-600 text-teal-800 shadow-sm"
                : "text-slate-600 hover:bg-slate-50",
            )}
          >
            🏢 INJOY {u}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatCard label="Total" value={contagem.total} tone="slate" />
        <StatCard label="Limpos" value={contagem.clean} tone="emerald" />
        <StatCard label="Sujos" value={contagem.dirty} tone="amber" />
        <StatCard label="Manut." value={contagem.maintenance} tone="red" />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar quarto ou tipo…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-teal-500"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
        {(["Todos", "clean", "dirty", "maintenance"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFiltro(s)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
              filtro === s
                ? "bg-teal-700 text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-600",
            )}
          >
            {s === "Todos" ? "Todos" : STATUS_META[s]?.label ?? s}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {loading && quartos.length === 0 ? (
          <p className="text-sm text-slate-400 col-span-full text-center py-8">Carregando…</p>
        ) : filtrados.length === 0 ? (
          <p className="col-span-full text-center text-sm text-slate-400 py-8 bg-white rounded-xl border border-dashed border-slate-200">
            Nenhum quarto encontrado em INJOY {unidadeAtiva}.
          </p>
        ) : (
          filtrados.map((q) => {
            const status = (q.status || "dirty") as keyof typeof STATUS_META;
            const meta = STATUS_META[status] ?? STATUS_META.dirty;
            return (
              <div key={`${q.property}-${q.room_number}`} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2.5 h-2.5 rounded-full", meta.dot)} />
                      <h2 className="text-lg font-black text-slate-800 tracking-tight">Quarto {q.room_number}</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{q.room_type || "—"}</p>
                  </div>
                  <span className={cn("text-[10px] font-black px-2.5 py-1 rounded-md tracking-wide", meta.badge)}>
                    {meta.label.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 pt-1 border-t border-slate-100">
                  {status === "clean" && <CircleCheck size={14} className="text-emerald-500" />}
                  {status === "dirty" && <CircleAlert size={14} className="text-amber-500" />}
                  {status === "maintenance" && <Wrench size={14} className="text-red-500" />}
                  <span>Condição: <span className="font-semibold text-slate-700">{q.condition || "normal"}</span></span>
                  <span className="ml-auto text-slate-400">
                    {new Date(q.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {status === "maintenance" && (
                  <div className="flex items-center gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
                    <AlertTriangle size={13} /> Quarto bloqueado por manutenção
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "slate" | "emerald" | "amber" | "red" }) {
  const toneCls = {
    slate: "bg-white border-slate-200 text-slate-800",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-800",
    amber: "bg-amber-50 border-amber-100 text-amber-800",
    red: "bg-red-50 border-red-100 text-red-800",
  }[tone];
  return (
    <div className={cn("rounded-xl border p-3", toneCls)}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-xl font-black mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}
