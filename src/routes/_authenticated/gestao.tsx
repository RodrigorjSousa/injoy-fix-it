import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpRight, TrendingUp, Building2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Unidade } from "@/lib/store";
import { getTipoQuarto, padQuarto } from "@/lib/tipos-quarto";
import { useHotelMetrics } from "@/hooks/use-hotel-metrics";
import { ErrorState } from "@/components/ui/data-state";
import { TempoCamareirasChart } from "@/components/gestao/tempo-camareiras-chart";
import { StatusOperacaoQuartos } from "@/components/gestao/status-operacao-quartos";

export const Route = createFileRoute("/_authenticated/gestao")({
  component: DashboardGestao,
});

type DadosHotel = {
  ocupacaoAtual: number;
  totalQuartos: number;
  quartosLimpos: number;
  quartosEmLimpeza: number;
  quartosSujos: number;
  quartosManutencao: number;
  faturamentoPendente: string;
  documentosFaltando: number;
};

const DADOS_POR_UNIDADE: Record<Unidade, DadosHotel> = {
  Botafogo: {
    ocupacaoAtual: 78,
    totalQuartos: 40,
    quartosLimpos: 22,
    quartosEmLimpeza: 6,
    quartosSujos: 9,
    quartosManutencao: 3,
    faturamentoPendente: "R$ 2.450,00",
    documentosFaltando: 4,
  },
  Ipanema: {
    ocupacaoAtual: 91,
    totalQuartos: 28,
    quartosLimpos: 18,
    quartosEmLimpeza: 4,
    quartosSujos: 5,
    quartosManutencao: 1,
    faturamentoPendente: "R$ 3.980,00",
    documentosFaltando: 2,
  },
};

type Urgencia = "Urgente" | "Normal" | "Leve";
type StatusChamado = "Aberto" | "Em Atendimento" | "Resolvido";

interface ChamadoManut {
  id: number;
  property: Unidade;
  quarto: string;
  categoria: string;
  urgencia: Urgencia;
  tecnico: string;
  status: StatusChamado;
}

const chamadosManutencaoAtivos: ChamadoManut[] = [
  { id: 101, property: "Botafogo", quarto: "01", categoria: "Elétrica", urgencia: "Urgente", tecnico: "Rodrigo Sousa", status: "Aberto" },
  { id: 102, property: "Botafogo", quarto: "02", categoria: "Ar Condicionado", urgencia: "Urgente", tecnico: "Rodrigo Sousa", status: "Em Atendimento" },
  { id: 103, property: "Botafogo", quarto: "107", categoria: "Hidráulica", urgencia: "Normal", tecnico: "Técnico Geral", status: "Aberto" },
  { id: 104, property: "Botafogo", quarto: "301", categoria: "Mobiliário", urgencia: "Leve", tecnico: "Marceneiro Terceirizado", status: "Resolvido" },
  { id: 201, property: "Ipanema", quarto: "410", categoria: "Ar Condicionado", urgencia: "Urgente", tecnico: "Rodrigo Sousa", status: "Aberto" },
  { id: 202, property: "Ipanema", quarto: "205", categoria: "Elétrica", urgencia: "Normal", tecnico: "Técnico Geral", status: "Em Atendimento" },
  { id: 203, property: "Ipanema", quarto: "308", categoria: "Hidráulica", urgencia: "Leve", tecnico: "Técnico Geral", status: "Resolvido" },
];

function DashboardGestao() {
  const [unidadeAtiva, setUnidadeAtiva] = useState<Unidade>("Botafogo");
  const { metrics, syncing, sincronizar, error: metricsError } = useHotelMetrics();
  const live = metrics[unidadeAtiva];
  const dadosHotel: DadosHotel = useMemo(() => {
    const base = DADOS_POR_UNIDADE[unidadeAtiva];
    if (!live) return base;
    return {
      ...base,
      ocupacaoAtual: Math.round(Number(live.occupancy_percentage) || 0),
      quartosLimpos: live.clean_rooms,
      quartosSujos: live.dirty_rooms,
      quartosManutencao: live.maintenance_rooms,
      quartosEmLimpeza: live.dirty_rooms,
      faturamentoPendente: `R$ ${Number(live.pending_balance || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      totalQuartos: (live.available_rooms ?? base.totalQuartos) + (live.clean_rooms || 0) + (live.dirty_rooms || 0) + (live.maintenance_rooms || 0),
      documentosFaltando: live.pending_docs_count ?? base.documentosFaltando,
    };
  }, [unidadeAtiva, live]);

  const chamadosUnidade = useMemo(
    () => chamadosManutencaoAtivos.filter((c) => c.property === unidadeAtiva),
    [unidadeAtiva],
  );
  const ativos = chamadosUnidade.filter((c) => c.status !== "Resolvido").length;

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-50 font-sans antialiased pb-12">
      <div className="bg-blue-950 text-white p-5 shadow-md sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">INJOY HOTÉIS</h1>
          <p className="text-xs text-blue-300">Painel de Gestão e Indicadores · INJOY {unidadeAtiva}</p>
        </div>
        <button
          onClick={sincronizar}
          disabled={syncing}
          className="p-2 bg-blue-900/60 rounded-lg active:bg-blue-900 text-blue-100 disabled:opacity-60"
          aria-label="Sincronizar com Cloudbeds"
        >
          <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Seletor de Unidade */}
        <div className="flex gap-2">
          {(["Botafogo", "Ipanema"] as Unidade[]).map((u) => {
            const active = unidadeAtiva === u;
            return (
              <button
                key={u}
                onClick={() => setUnidadeAtiva(u)}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all",
                  active
                    ? "border-blue-700 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-500 hover:border-blue-300",
                )}
              >
                <Building2 className="h-4 w-4" /> INJOY {u}
              </button>
            );
          })}
        </div>

        {metricsError && !live && (
          <ErrorState
            title="Métricas ao vivo indisponíveis"
            description={`${metricsError}. Mostrando valores estimados — toque em sincronizar para tentar novamente.`}
            onRetry={sincronizar}
            retrying={syncing}
          />
        )}


        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm font-semibold text-slate-500">Taxa de Ocupação Hoje</p>
              <h2 className="text-3xl font-black text-slate-900">{dadosHotel.ocupacaoAtual}%</h2>
            </div>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp size={22} />
            </div>
          </div>
          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mt-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-500"
              style={{ width: `${dadosHotel.ocupacaoAtual}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            <ArrowUpRight size={14} /> {live?.available_rooms ?? (dadosHotel.totalQuartos - dadosHotel.quartosManutencao)} quartos disponíveis para venda.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">A Receber no Balcão</p>
              <p className="text-lg font-black text-red-600 mt-1">{dadosHotel.faturamentoPendente}</p>
            </div>
            <span className="text-[10px] text-slate-500 mt-3 block">Check-ins com pendência</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Docs Pendentes</p>
              <p className="text-lg font-black text-amber-600 mt-1">{dadosHotel.documentosFaltando} Hóspedes</p>
            </div>
            <span className="text-[10px] text-slate-500 mt-3 block">Falta check-in online</span>
          </div>
        </div>

        <StatusOperacaoQuartos unidade={unidadeAtiva} />


        <TempoCamareirasChart unidade={unidadeAtiva} />

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Chamados de Manutenção Ativos</h3>
            <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-md font-bold">
              {ativos} Ativos
            </span>
          </div>

          <div className="space-y-3">
            {chamadosUnidade.length === 0 && (
              <div className="text-center text-xs text-slate-500 py-6">
                Nenhum chamado registrado em INJOY {unidadeAtiva}.
              </div>
            )}
            {chamadosUnidade.map((chamado) => (
              <div key={chamado.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-black text-slate-800 text-sm">
                    Quarto {padQuarto(chamado.quarto)} - {getTipoQuarto(chamado.property, chamado.quarto)}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md font-bold ${
                      chamado.urgencia === "Urgente" ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {chamado.urgencia}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-600">
                  <p>
                    Categoria: <span className="font-semibold text-slate-800">{chamado.categoria}</span>
                  </p>
                  <p>
                    Status: <span className="font-semibold text-blue-600">{chamado.status}</span>
                  </p>
                </div>

                <div className="pt-1.5 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-slate-400">Responsável Técnico:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded ${
                      chamado.tecnico === "Rodrigo Sousa" ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    🛠️ {chamado.tecnico}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
