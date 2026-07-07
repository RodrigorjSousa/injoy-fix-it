import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Play, RotateCcw, AlertTriangle, Users, Calendar, Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/camareiras")({
  component: PainelCamareiras,
});

type Status = "Pendente" | "Em Andamento" | "Concluído";
type Quarto = {
  id: number;
  quarto: string;
  tipoQuarto: string;
  unidade: "Botafogo" | "Ipanema";
  tipoTarefa: string;
  status: Status;
  pax: number;
  saida: string;
};

// --- BANCO DE DADOS MOCK FIEL ÀS UNIDADES DO CLOUDBEDS ---
const dadosQuartosCloudbeds: Quarto[] = [
  // === UNIDADE: BOTAFOGO ===
  { id: 1, quarto: "01", tipoQuarto: "Suíte Standard Twin", unidade: "Botafogo", tipoTarefa: "VERIFICAÇÃO CHECK-IN", status: "Concluído", pax: 1, saida: "08/07/2026" },
  { id: 2, quarto: "06", tipoQuarto: "Suíte Standard Twin", unidade: "Botafogo", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 2, saida: "09/07/2026" },
  { id: 3, quarto: "118", tipoQuarto: "Suíte Standard Twin", unidade: "Botafogo", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 2, saida: "10/07/2026" },
  { id: 4, quarto: "107", tipoQuarto: "Suíte Standard Queen", unidade: "Botafogo", tipoTarefa: "VERIFICAÇÃO CHECK-IN", status: "Pendente", pax: 2, saida: "11/07/2026" },
  { id: 5, quarto: "110", tipoQuarto: "Suíte Standard Queen", unidade: "Botafogo", tipoTarefa: "GERAL CHECK-OUT", status: "Em Andamento", pax: 2, saida: "08/07/2026" },
  { id: 6, quarto: "108", tipoQuarto: "Suíte Superior Queen", unidade: "Botafogo", tipoTarefa: "VERIFICAÇÃO CHECK-IN", status: "Pendente", pax: 1, saida: "07/07/2026" },
  { id: 7, quarto: "109", tipoQuarto: "Suíte Superior Queen", unidade: "Botafogo", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 2, saida: "12/07/2026" },
  { id: 8, quarto: "111", tipoQuarto: "Suíte Superior Queen", unidade: "Botafogo", tipoTarefa: "VERIFICAÇÃO CHECK-IN", status: "Concluído", pax: 2, saida: "13/07/2026" },
  { id: 9, quarto: "113", tipoQuarto: "Suíte Superior Queen", unidade: "Botafogo", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 1, saida: "09/07/2026" },
  { id: 10, quarto: "114", tipoQuarto: "Suíte Superior Queen", unidade: "Botafogo", tipoTarefa: "GERAL CHECK-OUT", status: "Em Andamento", pax: 2, saida: "10/07/2026" },
  { id: 11, quarto: "112", tipoQuarto: "Suíte Tripla", unidade: "Botafogo", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 3, saida: "12/07/2026" },
  { id: 12, quarto: "02", tipoQuarto: "Estúdio Standard", unidade: "Botafogo", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 2, saida: "09/07/2026" },
  { id: 13, quarto: "03", tipoQuarto: "Estúdio Standard", unidade: "Botafogo", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 2, saida: "08/07/2026" },
  { id: 14, quarto: "115", tipoQuarto: "Estúdio Standard", unidade: "Botafogo", tipoTarefa: "VERIFICAÇÃO CHECK-IN", status: "Pendente", pax: 3, saida: "11/07/2026" },
  { id: 15, quarto: "401", tipoQuarto: "Estúdio Superior", unidade: "Botafogo", tipoTarefa: "GERAL CHECK-OUT", status: "Concluído", pax: 1, saida: "08/07/2026" },
  { id: 16, quarto: "05", tipoQuarto: "Apartamento Superior", unidade: "Botafogo", tipoTarefa: "GERAL CHECK-OUT", status: "Em Andamento", pax: 2, saida: "08/07/2026" },
  { id: 17, quarto: "117", tipoQuarto: "Apartamento Superior", unidade: "Botafogo", tipoTarefa: "VERIFICAÇÃO CHECK-IN", status: "Pendente", pax: 2, saida: "14/07/2026" },
  { id: 18, quarto: "301", tipoQuarto: "Apartamento Deluxe", unidade: "Botafogo", tipoTarefa: "VERIFICAÇÃO CHECK-IN", status: "Pendente", pax: 4, saida: "14/07/2026" },
  { id: 19, quarto: "501", tipoQuarto: "Apartamento Deluxe", unidade: "Botafogo", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 3, saida: "15/07/2026" },

  // === UNIDADE: IPANEMA ===
  { id: 20, quarto: "307", tipoQuarto: "Suíte Twin", unidade: "Ipanema", tipoTarefa: "VERIFICAÇÃO CHECK-IN", status: "Pendente", pax: 1, saida: "08/07/2026" },
  { id: 21, quarto: "01", tipoQuarto: "Estúdio Standard Twin", unidade: "Ipanema", tipoTarefa: "VERIFICAÇÃO CHECK-IN", status: "Pendente", pax: 2, saida: "08/07/2026" },
  { id: 22, quarto: "104", tipoQuarto: "Estúdio Triplo Standard", unidade: "Ipanema", tipoTarefa: "GERAL CHECK-OUT", status: "Concluído", pax: 3, saida: "09/07/2026" },
  { id: 23, quarto: "02", tipoQuarto: "Estúdio Triplo Standard", unidade: "Ipanema", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 3, saida: "10/07/2026" },
  { id: 24, quarto: "103", tipoQuarto: "Loft Queen", unidade: "Ipanema", tipoTarefa: "GERAL CHECK-OUT", status: "Em Andamento", pax: 2, saida: "11/07/2026" },
  { id: 25, quarto: "205", tipoQuarto: "Loft Queen", unidade: "Ipanema", tipoTarefa: "VERIFICAÇÃO CHECK-IN", status: "Pendente", pax: 2, saida: "12/07/2026" },
  { id: 26, quarto: "309", tipoQuarto: "Loft Queen", unidade: "Ipanema", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 2, saida: "08/07/2026" },
  { id: 27, quarto: "308", tipoQuarto: "Loft Twin", unidade: "Ipanema", tipoTarefa: "GERAL CHECK-OUT", status: "Concluído", pax: 2, saida: "13/07/2026" },
  { id: 28, quarto: "206", tipoQuarto: "Estúdio Familia", unidade: "Ipanema", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 4, saida: "10/07/2026" },
  { id: 29, quarto: "411", tipoQuarto: "Mezanino Queen Varanda", unidade: "Ipanema", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 2, saida: "11/07/2026" },
  { id: 30, quarto: "412", tipoQuarto: "Mezanino Queen Varanda", unidade: "Ipanema", tipoTarefa: "VERIFICAÇÃO CHECK-IN", status: "Em Andamento", pax: 2, saida: "15/07/2026" },
  { id: 31, quarto: "410", tipoQuarto: "Mezanino Twin", unidade: "Ipanema", tipoTarefa: "GERAL CHECK-OUT", status: "Pendente", pax: 2, saida: "09/07/2026" },
];

function PainelCamareiras() {
  const [unidadeAtiva, setUnidadeAtiva] = useState<"Botafogo" | "Ipanema">("Botafogo");
  const [filtroStatus, setFiltroStatus] = useState<"Todos" | Status>("Todos");
  const [quartos, setQuartos] = useState<Quarto[]>(dadosQuartosCloudbeds);

  const alterarStatus = (id: number, novoStatus: Status) => {
    setQuartos(quartos.map((q) => (q.id === id ? { ...q, status: novoStatus } : q)));
  };

  const quartosFiltrados = quartos.filter(
    (q) => q.unidade === unidadeAtiva && (filtroStatus === "Todos" || q.status === filtroStatus),
  );

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 font-sans antialiased bg-slate-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Camareiras</h1>
        <p className="text-sm text-slate-500">Controle de faxina e abertura rápida de manutenção.</p>
      </div>

      {/* Abas Superiores Botafogo / Ipanema */}
      <div className="grid grid-cols-2 gap-4 mb-6 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
        <button
          onClick={() => setUnidadeAtiva("Botafogo")}
          className={`py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            unidadeAtiva === "Botafogo"
              ? "bg-teal-50 border border-teal-600 text-teal-800 shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          🏢 Botafogo
        </button>
        <button
          onClick={() => setUnidadeAtiva("Ipanema")}
          className={`py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            unidadeAtiva === "Ipanema"
              ? "bg-teal-50 border border-teal-600 text-teal-800 shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          🏢 Ipanema
        </button>
      </div>

      {/* Filtros rápidos de status */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
        {(["Todos", "Pendente", "Em Andamento", "Concluído"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFiltroStatus(status)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              filtroStatus === status
                ? "bg-teal-700 text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-600 active:bg-slate-100"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Grid de Cards Dinâmicos */}
      <div className="space-y-4">
        {quartosFiltrados.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8 bg-white rounded-xl border border-dashed border-slate-200">
            Nenhum quarto pendente para Injoy {unidadeAtiva}.
          </p>
        ) : (
          quartosFiltrados.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-black text-slate-800 tracking-tight">
                    Quarto {item.quarto} – {item.tipoQuarto}
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                    INJOY {item.unidade.toUpperCase()}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button className="text-slate-400 hover:text-slate-600 transition-colors">
                    <Info size={16} />
                  </button>
                  <span className="bg-emerald-600 text-white text-[10px] font-black px-2.5 py-1 rounded-md tracking-wide">
                    {item.tipoTarefa}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">STATUS:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      item.status === "Pendente"
                        ? "bg-red-100 text-red-700"
                        : item.status === "Em Andamento"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-slate-600">
                  <Users size={13} className="text-slate-400" />
                  <span>
                    Hóspedes: {item.pax} {item.pax > 1 ? "pessoas" : "pessoa"}
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-slate-600">
                  <Calendar size={13} className="text-slate-400" />
                  <span>Saída: {item.saida}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                {item.status === "Pendente" && (
                  <button
                    onClick={() => alterarStatus(item.id, "Em Andamento")}
                    className="flex-1 bg-slate-900 text-white text-sm py-3 rounded-xl font-bold flex items-center justify-center gap-2 active:bg-slate-800 transition-colors"
                  >
                    <Play size={16} fill="currentColor" /> Iniciar Limpeza
                  </button>
                )}

                {item.status === "Em Andamento" && (
                  <button
                    onClick={() => alterarStatus(item.id, "Concluído")}
                    className="flex-1 bg-emerald-600 text-white text-sm py-3 rounded-xl font-bold flex items-center justify-center gap-2 active:bg-emerald-700 transition-colors"
                  >
                    ✔ Finalizar Faxina
                  </button>
                )}

                {item.status === "Concluído" && (
                  <button
                    onClick={() => alterarStatus(item.id, "Pendente")}
                    className="flex-1 bg-slate-100 text-slate-700 text-sm py-3 rounded-xl font-bold flex items-center justify-center gap-2 active:bg-slate-200 border border-slate-200 transition-colors"
                  >
                    <RotateCcw size={15} /> Reabrir
                  </button>
                )}

                <button
                  onClick={() => alert(`Abrir chamado de manutenção para o Quarto ${item.quarto} de ${item.unidade}`)}
                  className="bg-red-600 text-white px-4 rounded-xl flex items-center justify-center active:bg-red-700 transition-colors shadow-sm"
                  title="Reportar Manutenção"
                >
                  <AlertTriangle size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
