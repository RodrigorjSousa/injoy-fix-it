import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/gestao")({
  component: DashboardGestao,
});

const dadosHotel = {
  ocupacaoAtual: 78,
  totalQuartos: 40,
  quartosLimpos: 22,
  quartosEmLimpeza: 6,
  quartosSujos: 9,
  quartosManutencao: 3,
  faturamentoPendente: "R$ 2.450,00",
  documentosFaltando: 4,
};

type Urgencia = "Urgente" | "Normal" | "Leve";
type StatusChamado = "Aberto" | "Em Atendimento" | "Resolvido";

interface ChamadoManut {
  id: number;
  quarto: string;
  categoria: string;
  urgencia: Urgencia;
  tecnico: string;
  status: StatusChamado;
}

const chamadosManutencaoAtivos: ChamadoManut[] = [
  { id: 101, quarto: "102", categoria: "Elétrica", urgencia: "Urgente", tecnico: "Rodrigo Sousa", status: "Aberto" },
  { id: 102, quarto: "204", categoria: "Ar Condicionado", urgencia: "Urgente", tecnico: "Rodrigo Sousa", status: "Em Atendimento" },
  { id: 103, quarto: "105", categoria: "Hidráulica", urgencia: "Normal", tecnico: "Técnico Geral", status: "Aberto" },
  { id: 104, quarto: "301", categoria: "Mobiliário", urgencia: "Leve", tecnico: "Marceneiro Terceirizado", status: "Resolvido" },
];

function DashboardGestao() {
  const ativos = chamadosManutencaoAtivos.filter((c) => c.status !== "Resolvido").length;

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-50 font-sans antialiased pb-12">
      <div className="bg-blue-950 text-white p-5 shadow-md sticky top-0 z-10">
        <h1 className="text-xl font-bold tracking-tight">Injoy Fix-It</h1>
        <p className="text-xs text-blue-300">Painel de Gestão e Indicadores</p>
      </div>

      <div className="p-4 space-y-6">
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
            <ArrowUpRight size={14} /> {dadosHotel.totalQuartos - dadosHotel.quartosManutencao} quartos disponíveis para venda.
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

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Status da Operação de Quartos</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 bg-emerald-50 p-3 rounded-xl border border-emerald-100">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
              <div>
                <p className="text-xl font-bold text-slate-800">{dadosHotel.quartosLimpos}</p>
                <p className="text-xs text-slate-500">Prontos / Limpos</p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-amber-50 p-3 rounded-xl border border-amber-100">
              <div className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
              <div>
                <p className="text-xl font-bold text-slate-800">{dadosHotel.quartosEmLimpeza}</p>
                <p className="text-xs text-slate-500">Em Faxina</p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-red-50 p-3 rounded-xl border border-red-100">
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />
              <div>
                <p className="text-xl font-bold text-slate-800">{dadosHotel.quartosSujos}</p>
                <p className="text-xs text-slate-500">Sujos (Check-out)</p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-100 p-3 rounded-xl border border-slate-200">
              <div className="w-2.5 h-2.5 bg-slate-500 rounded-full" />
              <div>
                <p className="text-xl font-bold text-slate-800">{dadosHotel.quartosManutencao}</p>
                <p className="text-xs text-slate-500">Bloqueados OS</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Chamados de Manutenção Ativos</h3>
            <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-md font-bold">
              {ativos} Ativos
            </span>
          </div>

          <div className="space-y-3">
            {chamadosManutencaoAtivos.map((chamado) => (
              <div key={chamado.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-black text-slate-800 text-sm">Quarto {chamado.quarto}</span>
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
