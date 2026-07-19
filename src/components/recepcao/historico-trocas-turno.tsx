import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Clock, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TrocaTurnoIcon } from "@/components/recepcao/troca-turno-icon";

type Troca = {
  id: string;
  unidade: string;
  funcionario_saida: string;
  funcionario_entrada: string;
  caixa_status: string;
  caixa_obs: string | null;
  estoque_status: string;
  estoque_obs: string | null;
  gastos_detalhes: string | null;
  maquina_bebidas: string | null;
  observacoes: string | null;
  created_at: string;
};

function statusColor(s: string) {
  return s === "batendo"
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : "bg-red-500/20 text-red-300 border-red-500/40";
}

function statusLabel(s: string) {
  return s === "batendo" ? "Batendo" : "Divergente";
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  unidade: string;
}

export function HistoricoTrocasTurno({ unidade }: Props) {
  const [expandido, setExpandido] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["trocas_turno_historico", unidade],
    queryFn: async (): Promise<Troca[]> => {
      const { data, error } = await supabase
        .from("trocas_turno" as never)
        .select(
          "id, unidade, funcionario_saida, funcionario_entrada, caixa_status, caixa_obs, estoque_status, estoque_obs, gastos_detalhes, maquina_bebidas, observacoes, created_at",
        )
        .eq("unidade", unidade)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as Troca[];
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-orange-500 grid place-items-center text-white shadow-lg shadow-indigo-500/30">
          <TrocaTurnoIcon size={20} />
        </div>
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Trocas de Turno
          </h3>
          <p className="text-[11px] text-slate-400">
            Histórico dos turnos anteriores em {unidade}
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-500 py-4 text-center">Carregando…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          Nenhuma troca de turno registrada.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.map((t) => {
            const aberto = expandido === t.id;
            return (
              <li
                key={t.id}
                className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandido(aberto ? null : t.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-900/60 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      <span className="text-slate-400">De</span>{" "}
                      {t.funcionario_saida}{" "}
                      <span className="text-slate-400">→</span>{" "}
                      {t.funcionario_entrada}
                    </p>
                    <p className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <Clock size={10} /> {formatDate(t.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${statusColor(t.caixa_status)}`}
                      title="Caixa"
                    >
                      💰
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${statusColor(t.estoque_status)}`}
                      title="Estoque"
                    >
                      📦
                    </span>
                    {aberto ? (
                      <ChevronUp size={16} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-400" />
                    )}
                  </div>
                </button>

                {aberto && (
                  <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-800">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div
                        className={`px-2 py-1.5 rounded-lg border ${statusColor(t.caixa_status)}`}
                      >
                        <p className="font-black uppercase tracking-wider opacity-80">
                          💰 Caixa
                        </p>
                        <p className="font-bold">
                          {statusLabel(t.caixa_status)}
                        </p>
                        {t.caixa_obs && (
                          <p className="mt-1 opacity-90">{t.caixa_obs}</p>
                        )}
                      </div>
                      <div
                        className={`px-2 py-1.5 rounded-lg border ${statusColor(t.estoque_status)}`}
                      >
                        <p className="font-black uppercase tracking-wider opacity-80">
                          📦 Estoque
                        </p>
                        <p className="font-bold">
                          {statusLabel(t.estoque_status)}
                        </p>
                        {t.estoque_obs && (
                          <p className="mt-1 opacity-90">{t.estoque_obs}</p>
                        )}
                      </div>
                    </div>
                    {t.gastos_detalhes && (
                      <p className="text-[11px] text-slate-300">
                        <b className="text-slate-100">💸 Gastos:</b>{" "}
                        {t.gastos_detalhes}
                      </p>
                    )}
                    {t.maquina_bebidas && (
                      <p className="text-[11px] text-slate-300">
                        <b className="text-slate-100">🥤 Bebidas:</b>{" "}
                        {t.maquina_bebidas}
                      </p>
                    )}
                    {t.observacoes && (
                      <div className="text-[11px] text-slate-300 bg-slate-900/60 border border-slate-800 rounded-lg p-2 whitespace-pre-wrap">
                        <p className="font-black text-slate-100 mb-1 flex items-center gap-1">
                          <UserIcon size={10} /> Observações
                        </p>
                        {t.observacoes}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
