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
  BedDouble,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import { padQuarto } from "@/lib/tipos-quarto";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  friendlyError,
} from "@/components/ui/data-state";

export const Route = createFileRoute("/_authenticated/recepcao")({
  component: RecepcaoPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6">
      <ErrorState
        title="Falha ao carregar a recepção"
        description={friendlyError(error)}
        onRetry={reset}
      />
    </div>
  ),
});

type StatusLimpeza = "Limpo" | "Sujo" | "Em Limpeza";
type StatusCheckin = "Aguardando" | "Realizado";
type Ocupacao = "Livre" | "Ocupado" | "Bloqueado";

interface QuartoRecepcao {
  id: number | string;
  unidade: Unidade;
  quarto: string;
  tipoQuarto: string;
  statusLimpeza: StatusLimpeza;
  assignedTask: string | null;
  blinkTroca: boolean;
  serviceStatus: string | null;
  assignedCamareira: string | null;
  ocupacao: Ocupacao;
  hospede: string;
  chegadaHora: string;
  dataSaida: string;
  pax: number;
  pagamentoPendente: boolean;
  pagamentoValor?: number;
  docPendente: boolean;
  statusCheckin: StatusCheckin;
  temReserva: boolean;
}

const OCUPACAO_STYLE: Record<
  Ocupacao,
  { bg: string; border: string; text: string; dot: string; label: string }
> = {
  Livre: {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Livre",
  },
  Ocupado: {
    bg: "bg-orange-50",
    border: "border-orange-300",
    text: "text-orange-700",
    dot: "bg-orange-500",
    label: "Ocupado",
  },
  Bloqueado: {
    bg: "bg-red-50",
    border: "border-red-300",
    text: "text-red-700",
    dot: "bg-red-500",
    label: "Bloqueado",
  },
};

function RecepcaoPage() {
  const [unidadeAtiva, setUnidadeAtiva] = useState<Unidade>("Botafogo");
  const [pesquisa, setPesquisa] = useState("");
  const [quartos, setQuartos] = useState<QuartoRecepcao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [checkinsLocais, setCheckinsLocais] = useState<Set<string | number>>(
    new Set(),
  );

  const carregar = useCallback(async (unidade: Unidade) => {
    setCarregando(true);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        `dados-recepcao?property=${unidade}`,
        { method: "GET" },
      );
      if (error) throw error;
      if (data?.success && Array.isArray(data.data)) {
        setQuartos(data.data as QuartoRecepcao[]);
      } else if (data?.error) {
        throw new Error(String(data.error));
      } else {
        setQuartos([]);
      }
    } catch (err) {
      const msg = friendlyError(err, "Falha ao carregar dados do Cloudbeds");
      console.error("[recepcao] erro ao buscar:", err);
      setErro(msg);
      setQuartos([]);
      toast.error(msg);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(unidadeAtiva);
  }, [unidadeAtiva, carregar]);

  useEffect(() => {
    const channel = supabase
      .channel(`recepcao-housekeeping-${unidadeAtiva}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_housekeeping", filter: `property=eq.${unidadeAtiva}` },
        () => carregar(unidadeAtiva),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [unidadeAtiva, carregar]);

  const fazerCheckin = (id: string | number) => {
    setCheckinsLocais((prev) => new Set(prev).add(id));
    toast.success("Check-in realizado");
  };

  const quartosFiltrados = useMemo(
    () =>
      quartos
        .map((q) =>
          checkinsLocais.has(q.id)
            ? { ...q, statusCheckin: "Realizado" as const, ocupacao: "Ocupado" as const }
            : q,
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

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {carregando && quartos.length === 0 ? (
          <div className="col-span-full">
            <LoadingState label="Carregando dados operacionais do Cloudbeds..." />
          </div>
        ) : erro && quartos.length === 0 ? (
          <div className="col-span-full">
            <ErrorState
              title="Não foi possível carregar a recepção"
              description={erro}
              onRetry={() => carregar(unidadeAtiva)}
              retrying={carregando}
            />
          </div>
        ) : quartosFiltrados.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              title={`Nenhum quarto localizado para INJOY ${unidadeAtiva}`}
              description={
                pesquisa
                  ? "Ajuste a busca ou limpe o filtro para ver todos os quartos."
                  : "Assim que houver reservas ou housekeeping sincronizados, eles aparecerão aqui."
              }
            />
          </div>
        ) : (
          quartosFiltrados.map((q) => {
            const ocupStyle = OCUPACAO_STYLE[q.ocupacao];
            return (
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
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ${ocupStyle.bg} ${ocupStyle.border} ${ocupStyle.text}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${ocupStyle.dot}`}></span>
                      {ocupStyle.label}
                    </span>
                    {q.assignedTask && (() => {
                      const tarefaExibida =
                        q.assignedTask === "TROCA"
                          ? "TROCA + ARRUMAÇÃO"
                          : q.assignedTask === "REVISÃO"
                            ? "REVISÃO CHECK IN"
                            : q.assignedTask;
                      return (
                        <span
                          className={`inline-flex items-center text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wide border ${
                            tarefaExibida === "GERAL - CHECK-IN"
                              ? "bg-red-600 text-white border-red-700"
                              : tarefaExibida === "GERAL"
                                ? "bg-sky-400 text-white border-sky-500"
                                : tarefaExibida === "TROCA + ARRUMAÇÃO"
                                  ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white border-purple-700"
                                  : tarefaExibida === "ARRUMAÇÃO"
                                    ? "bg-blue-600 text-white border-blue-700"
                                    : tarefaExibida === "REVISÃO CHECK IN"
                                      ? "bg-orange-500 text-white border-orange-600"
                                      : "bg-emerald-600 text-white border-emerald-700"
                          }`}
                        >
                          {tarefaExibida}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {q.blinkTroca && (
                  <span className="w-full text-center inline-flex items-center justify-center gap-1 text-xs font-black bg-red-600 text-white py-2 rounded-xl animate-pulse tracking-widest border-2 border-white shadow-md">
                    ⚠️ TROCA NO CHECK-OUT! (ATENÇÃO)
                  </span>
                )}

                {q.serviceStatus === "in_progress" && q.assignedCamareira && (
                  <div className="w-full flex items-center justify-center gap-2 text-xs font-bold bg-yellow-50 border-2 border-yellow-300 text-yellow-800 py-2 rounded-xl">
                    🧹 Em serviço:
                    <span className="animate-pulse font-black text-yellow-900 tracking-wide">
                      {q.assignedCamareira}
                    </span>
                  </div>
                )}

                {q.serviceStatus === "done" && q.assignedCamareira && (
                  <div className="w-full flex items-center justify-center gap-1.5 text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 py-2 rounded-xl">
                    <CheckCircle2 size={14} /> Liberado por {q.assignedCamareira}
                  </div>
                )}


                <div className="space-y-3 flex-1">
                  {q.temReserva ? (
                    <>
                      <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
                        <User size={16} className="text-slate-400" />
                        <span className="truncate">{q.hospede}</span>
                        <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                          {q.pax} pax
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <p className="flex items-center gap-1">
                          <Clock size={14} className="text-slate-400" />
                          Chegada:{" "}
                          <span className="font-semibold text-slate-800">
                            {q.chegadaHora}
                          </span>
                        </p>
                        <p className="flex items-center gap-1">
                          <Calendar size={14} className="text-slate-400" />
                          Saída:{" "}
                          <span className="font-semibold text-slate-800">
                            {q.dataSaida}
                          </span>
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
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500 text-sm bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <BedDouble size={16} className="text-slate-400" />
                      <span>
                        {q.ocupacao === "Bloqueado"
                          ? "Quarto bloqueado / fora de serviço"
                          : "Sem reserva ativa para hoje"}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  {q.ocupacao === "Bloqueado" ? (
                    <div className="w-full py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                      Quarto Bloqueado
                    </div>
                  ) : q.statusCheckin === "Realizado" ? (
                    <div className="w-full py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                      <CheckCircle2 size={16} /> Hóspede em Quarto
                    </div>
                  ) : q.temReserva ? (
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
                  ) : (
                    <div className="w-full py-2.5 bg-slate-50 border border-slate-200 text-slate-500 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
                      Disponível para venda
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
