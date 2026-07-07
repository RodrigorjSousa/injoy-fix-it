import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  User,
  Clock,
  Calendar,
  DollarSign,
  FileText,
  CheckCircle2,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import { padQuarto } from "@/lib/tipos-quarto";

export const Route = createFileRoute("/_authenticated/recepcao")({
  component: RecepcaoPage,
});

type StatusLimpeza = "Limpo" | "Sujo" | "Em Limpeza";
type StatusCheckin = "Aguardando" | "Realizado";

interface QuartoRecepcao {
  id: number | string;
  unidade: Unidade;
  quarto: string;
  tipoQuarto: string;
  statusLimpeza: StatusLimpeza;
  hospede: string;
  chegadaHora: string;
  dataSaida: string;
  pax: number;
  pagamentoPendente: boolean;
  docPendente: boolean;
  statusCheckin: StatusCheckin;
}

function RecepcaoPage() {
  const [unidadeAtiva, setUnidadeAtiva] = useState<Unidade>("Botafogo");
  const [pesquisa, setPesquisa] = useState("");
  const [quartos, setQuartos] = useState<QuartoRecepcao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [checkinsLocais, setCheckinsLocais] = useState<Set<string | number>>(
    new Set(),
  );

  const carregar = useCallback(async (unidade: Unidade) => {
    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        `dados-recepcao?property=${unidade}`,
        { method: "GET" },
      );
      if (error) throw error;
      if (data?.success) {
        setQuartos(data.data as QuartoRecepcao[]);
      } else {
        setQuartos([]);
      }
    } catch (err) {
      console.error("[recepcao] erro ao buscar:", err);
      toast.error("Falha ao carregar dados do Cloudbeds");
      setQuartos([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(unidadeAtiva);
  }, [unidadeAtiva, carregar]);

  const fazerCheckin = (id: string | number) => {
    setCheckinsLocais((prev) => new Set(prev).add(id));
    toast.success("Check-in realizado");
  };

  const quartosFiltrados = useMemo(
    () =>
      quartos
        .map((q) =>
          checkinsLocais.has(q.id) ? { ...q, statusCheckin: "Realizado" as const } : q,
        )
        .filter(
          (q) =>
            q.quarto.includes(pesquisa) ||
            q.hospede.toLowerCase().includes(pesquisa.toLowerCase()),
        ),
    [quartos, pesquisa, checkinsLocais],
  );

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-[#f8fafc] font-sans antialiased pb-12">
      <div className="bg-[#0f172a] text-white p-4 shadow-sm sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-200">INJOY HOTÉIS</h1>
          <p className="text-xs text-slate-400">Painel de Controle da Recepção</p>
        </div>
        <button
          onClick={() => carregar(unidadeAtiva)}
          disabled={carregando}
          className="p-2 bg-slate-800 rounded-lg active:bg-slate-700 text-slate-300 disabled:opacity-60"
          aria-label="Atualizar"
        >
          <RefreshCw size={18} className={carregando ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="p-4 grid grid-cols-2 gap-4 bg-white border-b border-slate-100 shadow-sm">
        {(["Botafogo", "Ipanema"] as Unidade[]).map((u) => {
          const active = unidadeAtiva === u;
          return (
            <button
              key={u}
              onClick={() => setUnidadeAtiva(u)}
              className={`py-2.5 rounded-full font-semibold text-sm transition-all border ${
                active
                  ? "border-blue-600 bg-blue-50 text-blue-700 font-bold"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              🏢 INJOY {u}
            </button>
          );
        })}
      </div>

      <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por quarto ou hóspede..."
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {carregando ? (
          <p className="text-center text-slate-400 col-span-full py-12">
            Carregando dados operacionais do Cloudbeds...
          </p>
        ) : quartosFiltrados.length === 0 ? (
          <p className="text-center text-slate-400 col-span-full py-12">
            Nenhum check-in ou hóspede ativo localizado para hoje em INJOY {unidadeAtiva}.
          </p>
        ) : (
          quartosFiltrados.map((q) => (
            <div
              key={q.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4 flex flex-col justify-between"
            >
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">
                    Quarto {padQuarto(q.quarto)} - {q.tipoQuarto}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    INJOY {q.unidade}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full shrink-0 ${
                    q.statusLimpeza === "Limpo"
                      ? "bg-emerald-100 text-emerald-800"
                      : q.statusLimpeza === "Em Limpeza"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      q.statusLimpeza === "Limpo"
                        ? "bg-emerald-500"
                        : q.statusLimpeza === "Em Limpeza"
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                  ></span>
                  {q.statusLimpeza}
                </span>
              </div>

              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
                  <User size={16} className="text-slate-400" />
                  <span>{q.hospede}</span>
                  <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    {q.pax} pax
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <p className="flex items-center gap-1">
                    <Clock size={14} className="text-slate-400" />
                    Chegada:{" "}
                    <span className="font-semibold text-slate-800">{q.chegadaHora}</span>
                  </p>
                  <p className="flex items-center gap-1">
                    <Calendar size={14} className="text-slate-400" />
                    Saída:{" "}
                    <span className="font-semibold text-slate-800">{q.dataSaida}</span>
                  </p>
                </div>

                {(q.pagamentoPendente || q.docPendente) &&
                  q.statusCheckin !== "Realizado" && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Atenção no Balcão:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {q.pagamentoPendente && (
                          <span className="animate-pulse inline-flex items-center gap-1 text-xs font-semibold bg-red-50 border-2 border-red-300 text-red-700 px-2.5 py-1 rounded-lg">
                            <DollarSign size={14} /> Pagamento Pendente
                          </span>
                        )}
                        {q.docPendente && (
                          <span className="animate-pulse inline-flex items-center gap-1 text-xs font-semibold bg-amber-50 border-2 border-amber-300 text-amber-700 px-2.5 py-1 rounded-lg">
                            <FileText size={14} /> Documento em Falta
                          </span>
                        )}
                      </div>
                    </div>
                  )}
              </div>

              <div>
                {q.statusCheckin === "Realizado" ? (
                  <div className="w-full py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                    <CheckCircle2 size={16} /> Hóspede em Quarto
                  </div>
                ) : (
                  <button
                    onClick={() => fazerCheckin(q.id)}
                    disabled={q.statusLimpeza !== "Limpo"}
                    className={`w-full py-3 rounded-xl font-bold text-sm transition-all shadow-sm ${
                      q.statusLimpeza === "Limpo"
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none"
                    }`}
                  >
                    {q.statusLimpeza !== "Limpo"
                      ? "Aguardando Camareira Liberar"
                      : "Realizar Check-in"}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
