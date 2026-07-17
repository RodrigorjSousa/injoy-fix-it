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
  ClipboardCheck,
  GlassWater,
  MessageSquarePlus,
  Ban,
  ShoppingBag,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { VistoriaModal } from "@/components/recepcao/vistoria-modal";
import { VendaBebidasModal } from "@/components/recepcao/venda-bebidas-modal";
import { RecadoCamareiraModal } from "@/components/recepcao/recado-camareira-modal";
import { RecadosDaCamareiraSection } from "@/components/recepcao/recados-da-camareira";
import { RecadosEnviadosCamareiraSection } from "@/components/recepcao/recados-enviados-camareira";
import { AuditoriaAlmoxarifadoPanel } from "@/components/almoxarifado/auditoria-panel";
import { SolicitarCompraModal } from "@/components/almoxarifado/solicitar-compra-modal";
import { SolicitacoesCompraPanel } from "@/components/almoxarifado/solicitacoes-compra-panel";
import { TrocaTurnoModal } from "@/components/recepcao/troca-turno-modal";
import { useMe } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import { useUnidade } from "@/lib/unidade-context";
import { padQuarto } from "@/lib/tipos-quarto";
import { formatTaskLabel, isCheckInTask } from "@/lib/task-labels";
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
  proximoHospede?: string;
  proximoChegadaHora?: string;
  proximoPax?: number;
  proximoPagamentoPendente?: boolean;
  proximoPagamentoValor?: number;
  proximoDocPendente?: boolean;
  temProximoHospede?: boolean;
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
  const { unidade: unidadeAtiva } = useUnidade();
  const { data: me } = useMe();
  const [pesquisa, setPesquisa] = useState("");
  const [quartos, setQuartos] = useState<QuartoRecepcao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [checkinsLocais, setCheckinsLocais] = useState<Set<string | number>>(
    new Set(),
  );
  const [vistoriaAlvo, setVistoriaAlvo] = useState<{
    unidade: Unidade;
    roomNumber: string;
  } | null>(null);
  const [vendaBebidasOpen, setVendaBebidasOpen] = useState(false);
  const [compraOpen, setCompraOpen] = useState(false);
  const [trocaTurnoOpen, setTrocaTurnoOpen] = useState(false);
  const [recadoAlvo, setRecadoAlvo] = useState<
    { unidade: Unidade; quarto: string | null } | null
  >(null);
  const [vistoriadosHoje, setVistoriadosHoje] = useState<
    Map<string, { nome: string; hora: string }>
  >(new Map());

  const getCutoff = useCallback(() => {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(23, 0, 0, 0);
    if (now.getHours() < 23) cutoff.setDate(cutoff.getDate() - 1);
    return cutoff;
  }, []);

  const carregarVistoriados = useCallback(
    async (unidade: Unidade) => {
      const cutoff = getCutoff();
      const { data, error } = await supabase
        .from("room_inspections")
        .select("room_number, inspector_name, created_at")
        .eq("property", unidade)
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[recepcao] vistoriados:", error);
        return;
      }
      const map = new Map<string, { nome: string; hora: string }>();
      (data ?? []).forEach((r) => {
        if (!map.has(r.room_number)) {
          map.set(r.room_number, {
            nome: r.inspector_name ?? "Recepção",
            hora: r.created_at,
          });
        }
      });
      setVistoriadosHoje(map);
    },
    [getCutoff],
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

  useEffect(() => {
    carregarVistoriados(unidadeAtiva);
    const channel = supabase
      .channel(`recepcao-inspections-${unidadeAtiva}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_inspections", filter: `property=eq.${unidadeAtiva}` },
        () => carregarVistoriados(unidadeAtiva),
      )
      .subscribe();

    // Reset at 23:00
    const now = new Date();
    const next = new Date(now);
    next.setHours(23, 0, 5, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    const timer = setTimeout(() => {
      setVistoriadosHoje(new Map());
      carregarVistoriados(unidadeAtiva);
    }, next.getTime() - now.getTime());

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(timer);
    };
  }, [unidadeAtiva, carregarVistoriados]);

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
        <button
          onClick={() => setRecadoAlvo({ unidade: unidadeAtiva, quarto: null })}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-3 rounded-xl font-black text-sm text-white bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/30 hover:brightness-110 active:scale-95 transition-all"
        >
          <MessageSquarePlus size={18} />
          <span className="hidden sm:inline">Recado camareira</span>
          <span className="sm:hidden">📝</span>
        </button>
        <button
          onClick={() => setVendaBebidasOpen(true)}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-3 rounded-xl font-black text-sm text-white bg-gradient-to-br from-amber-500 to-orange-600 shadow-md shadow-amber-500/30 hover:brightness-110 active:scale-95 transition-all"
        >
          <GlassWater size={18} />
          <span className="hidden sm:inline">Frigobar</span>
          <span className="sm:hidden">🍹</span>
        </button>
        <button
          onClick={() => setCompraOpen(true)}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-3 rounded-xl font-black text-sm text-white bg-gradient-to-br from-orange-500 to-amber-600 shadow-md shadow-orange-500/30 hover:brightness-110 active:scale-95 transition-all"
        >
          <ShoppingBag size={18} />
          <span className="hidden sm:inline">Solicitar compra</span>
          <span className="sm:hidden">🛒</span>
        </button>
        {unidadeAtiva === "Botafogo" && (
          <button
            onClick={() => setTrocaTurnoOpen(true)}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-3 rounded-xl font-black text-sm text-white bg-gradient-to-br from-indigo-500 to-blue-600 shadow-md shadow-indigo-500/30 hover:brightness-110 active:scale-95 transition-all"
          >
            <RefreshCcw size={18} />
            <span className="hidden sm:inline">Trocar Turno</span>
            <span className="sm:hidden">🔄</span>
          </button>
        )}
      </div>

      <RecadosDaCamareiraSection
        unidade={unidadeAtiva}
        autorNome={me?.funcionario?.nome ?? me?.email ?? "Recepção"}
      />

      <RecadosEnviadosCamareiraSection
        unidade={unidadeAtiva}
        autorNome={me?.funcionario?.nome ?? me?.email ?? "Recepção"}
      />

      <div className="p-4 space-y-4">
        <AuditoriaAlmoxarifadoPanel unidade={unidadeAtiva} />
        <SolicitacoesCompraPanel unidade={unidadeAtiva} />
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
            const bloqueado = q.ocupacao === "Bloqueado";
            const motivoBloqueio = "Quarto em manutenção / fora de operação";
            return (
              <div
                key={q.id}
                className={`relative bg-white rounded-2xl shadow-sm p-5 space-y-4 flex flex-col justify-between ${
                  bloqueado
                    ? "border-2 border-red-500 ring-2 ring-red-200 shadow-red-100"
                    : "border border-slate-100"
                }`}
              >
                {bloqueado && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-3 -right-3 sm:-top-4 sm:-right-4 z-10"
                  >
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-600 border-4 border-white shadow-lg flex items-center justify-center animate-pulse">
                      <Ban size={28} strokeWidth={3} className="text-white" />
                    </div>
                  </div>
                )}
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
                    {(() => {
                      const tarefaExibida = formatTaskLabel(q.assignedTask);
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

                {bloqueado && (
                  <div className="rounded-xl border-2 border-red-500 bg-red-50 p-3 flex items-start gap-3 shadow-inner">
                    <div className="shrink-0 w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
                      <Ban size={22} strokeWidth={3} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-red-700">
                        Quarto Bloqueado
                      </p>
                      <p className="text-sm font-bold text-red-900 leading-snug break-words">
                        {motivoBloqueio}
                      </p>
                    </div>
                  </div>
                )}


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

                      {(q.pagamentoPendente || (q.docPendente && q.pagamentoPendente)) && (
                          <div className="space-y-1.5 pt-1">
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                              Atenção no Balcão:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {q.pagamentoPendente && (
                                <span className="animate-pulse inline-flex items-center gap-1 text-xs font-semibold bg-red-50 border-2 border-red-300 text-red-700 px-2.5 py-1 rounded-lg">
                                  <DollarSign size={14} /> RECEBER NO BALCÃO
                                  {q.pagamentoValor && q.pagamentoValor > 0 ? (
                                    <span className="ml-1 bg-red-600 text-white px-1.5 py-0.5 rounded font-black tracking-wide">
                                      {q.pagamentoValor.toLocaleString("pt-BR", {
                                        style: "currency",
                                        currency: "BRL",
                                      })}
                                    </span>
                                  ) : null}
                                </span>
                              )}
                              {q.docPendente && q.pagamentoPendente && (
                                <span className="animate-pulse inline-flex items-center gap-1 text-xs font-semibold bg-amber-50 border-2 border-amber-300 text-amber-700 px-2.5 py-1 rounded-lg">
                                  <FileText size={14} /> DOC PENDENTE
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                      {q.temProximoHospede && (
                        <div className="mt-2 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/70 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">
                              ➡️ Próximo hóspede (chega hoje)
                            </p>
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-md">
                              Após check-out
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
                            <User size={15} className="text-blue-500" />
                            <span className="truncate">{q.proximoHospede}</span>
                            {q.proximoPax ? (
                              <span className="text-[11px] font-normal text-blue-700 bg-white/70 px-2 py-0.5 rounded-md shrink-0 border border-blue-100">
                                {q.proximoPax} pax
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-blue-800">
                            <Clock size={13} className="text-blue-500" />
                            Chegada prevista:{" "}
                            <span className="font-semibold">{q.proximoChegadaHora || "A definir"}</span>
                          </div>
                          {(q.proximoPagamentoPendente || q.proximoDocPendente) && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {q.proximoPagamentoPendente && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-md">
                                  <DollarSign size={12} /> Pagamento pendente
                                  {q.proximoPagamentoValor && q.proximoPagamentoValor > 0 ? (
                                    <span className="ml-1 bg-red-600 text-white px-1 py-0.5 rounded font-black">
                                      {q.proximoPagamentoValor.toLocaleString("pt-BR", {
                                        style: "currency",
                                        currency: "BRL",
                                      })}
                                    </span>
                                  ) : null}
                                </span>
                              )}
                              {q.proximoDocPendente && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-md">
                                  <FileText size={12} /> Doc. em falta
                                </span>
                              )}
                            </div>
                          )}
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

                <div className="space-y-2">
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
                  {q.ocupacao !== "Bloqueado" &&
                    (() => {
                      const v = vistoriadosHoje.get(padQuarto(q.quarto));
                      if (v) {
                        const hora = new Date(v.hora).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        return (
                          <div className="w-full py-2 rounded-xl font-bold text-sm bg-emerald-100 border border-emerald-300 text-emerald-800 flex flex-col items-center justify-center gap-0.5 transition-all duration-300 animate-fade-in">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 size={16} /> VISTORIADO
                            </div>
                            <span className="text-[10px] font-semibold text-emerald-700/80 normal-case">
                              por {v.nome} · {hora}
                            </span>
                          </div>
                        );
                      }
                      if (isCheckInTask(q.assignedTask)) {
                        return (
                          <button
                            onClick={() =>
                              setVistoriaAlvo({
                                unidade: q.unidade,
                                roomNumber: padQuarto(q.quarto),
                              })
                            }
                            className="w-full py-2.5 rounded-xl font-bold text-sm border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-700 flex items-center justify-center gap-2 transition-all duration-300"
                          >
                            <ClipboardCheck size={16} /> 🔍 Vistoriar Quarto
                          </button>
                        );
                      }
                      return null;
                    })()}
                  {q.ocupacao !== "Bloqueado" && (
                    <button
                      onClick={() =>
                        setRecadoAlvo({
                          unidade: q.unidade,
                          quarto: padQuarto(q.quarto),
                        })
                      }
                      className="w-full py-2.5 rounded-xl font-bold text-sm border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center gap-2"
                    >
                      <MessageSquarePlus size={16} /> Deixar recado camareira
                    </button>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>

      {vistoriaAlvo && (
        <VistoriaModal
          open={!!vistoriaAlvo}
          onClose={() => setVistoriaAlvo(null)}
          onSuccess={() => {
            setVistoriadosHoje((prev) => {
              const next = new Map(prev);
              next.set(vistoriaAlvo.roomNumber, {
                nome: me?.funcionario?.nome ?? me?.email ?? "Recepção",
                hora: new Date().toISOString(),
              });
              return next;
            });
            carregar(unidadeAtiva);
            carregarVistoriados(unidadeAtiva);
          }}
          unidade={vistoriaAlvo.unidade}
          roomNumber={vistoriaAlvo.roomNumber}
        />
      )}

      <VendaBebidasModal
        open={vendaBebidasOpen}
        onClose={() => setVendaBebidasOpen(false)}
        unidade={unidadeAtiva}
        recepcionistaName={me?.funcionario?.nome ?? me?.email ?? "Recepção"}
        roomsAtivos={Array.from(new Set(quartos.map((q) => padQuarto(q.quarto)))).sort()}
      />

      <RecadoCamareiraModal
        open={!!recadoAlvo}
        onClose={() => setRecadoAlvo(null)}
        unidadePadrao={recadoAlvo?.unidade ?? unidadeAtiva}
        quarto={recadoAlvo?.quarto ?? null}
        autorNome={me?.funcionario?.nome ?? me?.email ?? "Recepção"}
      />

      <SolicitarCompraModal
        open={compraOpen}
        onClose={() => setCompraOpen(false)}
        unidade={unidadeAtiva}
        origem="recepcao"
      />

      {unidadeAtiva === "Botafogo" && (
        <TrocaTurnoModal
          open={trocaTurnoOpen}
          onClose={() => setTrocaTurnoOpen(false)}
          unidade="Botafogo"
        />
      )}
    </div>
  );
}

