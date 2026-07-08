import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, CheckCircle2, AlertTriangle, Hammer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/camareiras")({
  component: PainelCamareiras,
});

type Unidade = "Botafogo" | "Ipanema";

type RoomRow = {
  property: Unidade;
  room_number: string;
  room_type: string | null;
  status: string | null;
  condition: string | null;
  assigned_task: string | null;
  color_code: string | null;
  updated_at: string;
};

type Filtro = "Todos" | "Limpo" | "Sujo" | "Manutenção";

function estiloTarefa(t: string | null) {
  switch (t) {
    case "GERAL - CHECK-IN":
      return "bg-red-600 text-white border-red-700";
    case "GERAL":
      return "bg-orange-500 text-white border-orange-600";
    case "TROCA":
      return "bg-purple-600 text-white border-purple-700";
    case "ARRUMAÇÃO":
      return "bg-blue-600 text-white border-blue-700";
    case "REVISÃO":
      return "bg-cyan-500 text-white border-cyan-600";
    default:
      return "bg-emerald-600 text-white border-emerald-700";
  }
}

function corLegenda(c: string | null) {
  switch (c) {
    case "VERDE":
      return "bg-emerald-500";
    case "AZUL FORTE":
      return "bg-blue-700";
    case "AZUL FRACO":
      return "bg-sky-400";
    default:
      return "bg-slate-400";
  }
}

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
      toast.success("Mapa atualizado", { id: t });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao sincronizar", { id: t });
    } finally {
      setSyncing(false);
    }
  }, [carregar, syncing]);

  const filtrados = useMemo(() => {
    return quartos.filter((q) => {
      if (q.property !== unidadeAtiva) return false;
      if (filtro === "Limpo" && q.status !== "clean") return false;
      if (filtro === "Sujo" && q.status !== "dirty") return false;
      if (filtro === "Manutenção" && q.condition !== "maintenance") return false;
      if (busca && !`${q.room_number} ${q.room_type ?? ""}`.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [quartos, unidadeAtiva, filtro, busca]);

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <div className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-sm">
        <div>
          <h1 className="text-xl font-bold">Camareiras</h1>
          <p className="text-xs text-slate-400">Mapa de tarefas diárias sincronizado ao Cloudbeds</p>
        </div>
        <button
          onClick={sincronizar}
          disabled={syncing}
          className="p-2 bg-slate-800 rounded-lg disabled:opacity-60"
          aria-label="Sincronizar"
        >
          <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="p-4 grid grid-cols-2 gap-3 bg-white border-b border-slate-100">
        {(["Botafogo", "Ipanema"] as Unidade[]).map((u) => (
          <button
            key={u}
            onClick={() => setUnidadeAtiva(u)}
            className={cn(
              "py-2 rounded-xl text-sm font-bold border",
              unidadeAtiva === u
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-600",
            )}
          >
            🏢 INJOY {u}
          </button>
        ))}
      </div>

      <div className="p-4 bg-white border-b space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar quarto ou tipo..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(["Todos", "Limpo", "Sujo", "Manutenção"] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all",
                filtro === f ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading && quartos.length === 0 ? (
          <p className="text-center text-slate-400 col-span-2 py-8 animate-pulse">
            Sincronizando tarefas com a agenda do Cloudbeds...
          </p>
        ) : filtrados.length === 0 ? (
          <p className="col-span-2 text-center text-sm text-slate-400 py-8 bg-white rounded-xl border border-dashed border-slate-200">
            Nenhum quarto encontrado em INJOY {unidadeAtiva}.
          </p>
        ) : (
          filtrados.map((q) => (
            <div
              key={`${q.property}-${q.room_number}`}
              className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4"
            >
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">
                    Quarto APT {q.room_number}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">{q.room_type || "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn("w-3 h-3 rounded-full", corLegenda(q.color_code))}
                    title={`Estado Cloudbeds: ${q.color_code ?? "—"}`}
                  />
                  <span
                    className={cn(
                      "text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-wide border-2",
                      estiloTarefa(q.assigned_task),
                    )}
                  >
                    {q.assigned_task ?? "VERIFICAÇÃO"}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="flex items-center gap-1 font-semibold">
                  {q.status === "clean" ? (
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  ) : (
                    <AlertTriangle size={16} className="text-amber-500" />
                  )}
                  Quarto {q.status === "clean" ? "Limpo" : "Sujo"}
                </span>
                <span className="flex items-center gap-1 font-semibold">
                  <Hammer
                    size={16}
                    className={q.condition === "maintenance" ? "text-red-500" : "text-slate-400"}
                  />
                  Condição: {q.condition === "maintenance" ? "Em Manutenção" : "Normal"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
