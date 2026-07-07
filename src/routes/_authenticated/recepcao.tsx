import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  User,
  Calendar,
  Clock,
  DollarSign,
  FileText,
  CheckCircle2,
  RefreshCw,
  Search,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Unidade } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/recepcao")({
  component: RecepcaoPage,
});

type StatusLimpeza = "Pendente" | "Em Andamento" | "Concluído";
type StatusCheckin = "Aguardando" | "Realizado";

interface QuartoRecepcao {
  id: number;
  property: Unidade;
  quarto: string;
  tipo: string;
  statusLimpeza: StatusLimpeza;
  hospede: string;
  chegadaHora: string;
  dataSaida: string;
  pax: number;
  pagamentoPendente: boolean;
  docPendente: boolean;
  statusCheckin: StatusCheckin;
}

const quartosRecepcaoInicial: QuartoRecepcao[] = [
  {
    id: 1,
    property: "Botafogo",
    quarto: "102",
    tipo: "Standard",
    statusLimpeza: "Pendente",
    hospede: "Carlos Silva",
    chegadaHora: "14:00",
    dataSaida: "12/07/2026",
    pax: 2,
    pagamentoPendente: true,
    docPendente: false,
    statusCheckin: "Aguardando",
  },
  {
    id: 2,
    property: "Botafogo",
    quarto: "204",
    tipo: "Master Suíte",
    statusLimpeza: "Concluído",
    hospede: "Mariana Costa",
    chegadaHora: "11:30",
    dataSaida: "15/07/2026",
    pax: 1,
    pagamentoPendente: false,
    docPendente: true,
    statusCheckin: "Aguardando",
  },
  {
    id: 3,
    property: "Botafogo",
    quarto: "105",
    tipo: "Standard",
    statusLimpeza: "Em Andamento",
    hospede: "Roberto Almeida",
    chegadaHora: "16:00",
    dataSaida: "10/07/2026",
    pax: 3,
    pagamentoPendente: false,
    docPendente: false,
    statusCheckin: "Aguardando",
  },
  {
    id: 4,
    property: "Ipanema",
    quarto: "301",
    tipo: "Presidencial",
    statusLimpeza: "Concluído",
    hospede: "Ana Julia Souza",
    chegadaHora: "13:15",
    dataSaida: "19/07/2026",
    pax: 4,
    pagamentoPendente: false,
    docPendente: false,
    statusCheckin: "Realizado",
  },
  {
    id: 5,
    property: "Ipanema",
    quarto: "410",
    tipo: "Deluxe Vista Mar",
    statusLimpeza: "Pendente",
    hospede: "Felipe Moraes",
    chegadaHora: "15:00",
    dataSaida: "14/07/2026",
    pax: 2,
    pagamentoPendente: true,
    docPendente: true,
    statusCheckin: "Aguardando",
  },
  {
    id: 6,
    property: "Ipanema",
    quarto: "205",
    tipo: "Standard",
    statusLimpeza: "Concluído",
    hospede: "Beatriz Lima",
    chegadaHora: "12:00",
    dataSaida: "11/07/2026",
    pax: 2,
    pagamentoPendente: false,
    docPendente: false,
    statusCheckin: "Aguardando",
  },
];

function RecepcaoPage() {
  const [quartos, setQuartos] = useState<QuartoRecepcao[]>(quartosRecepcaoInicial);
  const [pesquisa, setPesquisa] = useState("");
  const [unidadeAtiva, setUnidadeAtiva] = useState<Unidade>("Botafogo");

  const fazerCheckin = (id: number) => {
    setQuartos((prev) =>
      prev.map((q) => (q.id === id ? { ...q, statusCheckin: "Realizado" } : q)),
    );
    toast.success("Check-in realizado");
  };

  const quartosFiltrados = useMemo(
    () =>
      quartos
        .filter((q) => q.property === unidadeAtiva)
        .filter(
          (q) =>
            q.quarto.includes(pesquisa) ||
            q.hospede.toLowerCase().includes(pesquisa.toLowerCase()),
        ),
    [quartos, unidadeAtiva, pesquisa],
  );

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-100 font-sans antialiased pb-12">
      <div className="bg-slate-900 text-white p-4 shadow-md sticky top-0 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Injoy Fix-It</h1>
          <p className="text-xs text-slate-400">Painel de Controle da Recepção</p>
        </div>
        <button
          onClick={() => toast.info("Sincronizando com Cloudbeds...")}
          className="p-2 bg-slate-800 rounded-lg active:bg-slate-700 transition-colors"
          aria-label="Sincronizar"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Seletor de Unidade */}
      <div className="p-4 pb-0 flex gap-2">
        {(["Botafogo", "Ipanema"] as Unidade[]).map((u) => {
          const active = unidadeAtiva === u;
          return (
            <button
              key={u}
              onClick={() => setUnidadeAtiva(u)}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all",
                active
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:border-blue-300",
              )}
            >
              <Building2 className="h-4 w-4" /> INJOY {u}
            </button>
          );
        })}
      </div>

      <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-2 mt-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por quarto ou hóspede..."
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-slate-500 outline-none"
          />
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {quartosFiltrados.map((q) => (
          <div
            key={q.id}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between"
          >
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <span className="text-2xl font-black text-slate-800">Q. {q.quarto}</span>
                <span className="text-xs text-slate-500 block">
                  {q.tipo} · INJOY {q.property}
                </span>
              </div>
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full ${
                  q.statusLimpeza === "Pendente"
                    ? "bg-red-100 text-red-700"
                    : q.statusLimpeza === "Em Andamento"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {q.statusLimpeza === "Pendente"
                  ? "🔴 Sujo"
                  : q.statusLimpeza === "Em Andamento"
                    ? "🟡 Em Limpeza"
                    : "🟢 Limpo"}
              </span>
            </div>

            <div className="p-4 space-y-3 flex-1">
              <div className="flex items-center gap-2 text-slate-800 font-bold">
                <User size={16} className="text-slate-500" />
                <span>{q.hospede}</span>
                <span className="text-xs font-normal text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                  {q.pax} pax
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-xl">
                <p className="flex items-center gap-1">
                  <Clock size={14} className="text-slate-400" />
                  Chegada: <span className="font-semibold">{q.chegadaHora}</span>
                </p>
                <p className="flex items-center gap-1">
                  <Calendar size={14} className="text-slate-400" />
                  Saída: <span className="font-semibold">{q.dataSaida}</span>
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
                        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-50 border border-red-200 text-red-700 px-2.5 py-1 rounded-lg">
                          <DollarSign size={14} /> Pagamento Pendente
                        </span>
                      )}
                      {q.docPendente && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-lg">
                          <FileText size={14} /> Documento em Falta
                        </span>
                      )}
                    </div>
                  </div>
                )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50">
              {q.statusCheckin === "Realizado" ? (
                <div className="w-full py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} /> Hóspede em Quarto
                </div>
              ) : (
                <button
                  onClick={() => fazerCheckin(q.id)}
                  disabled={q.statusLimpeza !== "Concluído"}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all shadow-sm ${
                    q.statusLimpeza === "Concluído"
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none"
                  }`}
                >
                  {q.statusLimpeza !== "Concluído"
                    ? "Aguardando Camareira Liberar"
                    : "Realizar Check-in"}
                </button>
              )}
            </div>
          </div>
        ))}

        {quartosFiltrados.length === 0 && (
          <div className="col-span-full text-center text-sm text-slate-500 py-12">
            Nenhum quarto encontrado em INJOY {unidadeAtiva}.
          </div>
        )}
      </div>
    </div>
  );
}
