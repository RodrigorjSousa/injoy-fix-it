import { useEffect, useState } from "react";
import { Clock, User as UserIcon, X } from "lucide-react";
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

interface Props {
  unidade: string;
  nome: string;
}

const STORAGE_KEY = "passagem-turno-dismissed";

function statusColor(s: string) {
  return s === "batendo"
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : "bg-red-500/20 text-red-300 border-red-500/40";
}

function statusLabel(s: string) {
  return s === "batendo" ? "Batendo" : "Divergente";
}

export function PassagemTurnoCard({ unidade, nome }: Props) {
  const [troca, setTroca] = useState<Troca | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    let cancelled = false;
    const buscar = async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("trocas_turno" as never)
        .select(
          "id, unidade, funcionario_saida, funcionario_entrada, caixa_status, caixa_obs, estoque_status, estoque_obs, gastos_detalhes, maquina_bebidas, observacoes, created_at",
        )
        .eq("unidade", unidade)
        .gte("created_at", oneHourAgo)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error || cancelled) return;
      const nomeLower = nome.trim().toLowerCase();
      const primeiro = nomeLower.split(/\s+/)[0] ?? "";
      const match = ((data ?? []) as unknown as Troca[]).find((t) => {
        const alvo = (t.funcionario_entrada ?? "").toLowerCase();
        if (!alvo) return false;
        if (nomeLower && alvo.includes(nomeLower)) return true;
        if (primeiro && primeiro.length >= 3 && alvo.includes(primeiro)) return true;
        return false;
      });
      setTroca(match ?? null);
    };
    buscar();
    const interval = setInterval(buscar, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [unidade, nome]);

  if (!troca || dismissed.has(troca.id)) return null;

  const ageMin = Math.max(0, Math.floor((Date.now() - new Date(troca.created_at).getTime()) / 60000));
  const restante = Math.max(0, 60 - ageMin);
  if (restante === 0) return null;

  const dismiss = () => {
    const next = new Set(dismissed);
    next.add(troca.id);
    setDismissed(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      /* noop */
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-950/60 via-slate-900 to-orange-950/40 p-5 shadow-xl">
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
        aria-label="Dispensar"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-4">
        <div className="h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-orange-500 grid place-items-center text-white shadow-lg shadow-indigo-500/30">
          <TrocaTurnoIcon size={26} />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">
              🔄 Passagem de turno recebida
            </p>
            <h3 className="text-lg font-black text-white leading-tight">
              Você assumiu o turno em {troca.unidade}
            </h3>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <UserIcon size={12} /> Entregue por <b className="text-slate-200">{troca.funcionario_saida}</b>
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> há {ageMin} min · visível por mais {restante} min
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className={`px-3 py-2 rounded-lg border ${statusColor(troca.caixa_status)}`}>
              <p className="font-black uppercase tracking-wider opacity-80">💰 Caixa</p>
              <p className="font-bold">{statusLabel(troca.caixa_status)}</p>
              {troca.caixa_obs && <p className="mt-1 opacity-90 line-clamp-2">{troca.caixa_obs}</p>}
            </div>
            <div className={`px-3 py-2 rounded-lg border ${statusColor(troca.estoque_status)}`}>
              <p className="font-black uppercase tracking-wider opacity-80">📦 Estoque</p>
              <p className="font-bold">{statusLabel(troca.estoque_status)}</p>
              {troca.estoque_obs && <p className="mt-1 opacity-90 line-clamp-2">{troca.estoque_obs}</p>}
            </div>
          </div>

          {troca.gastos_detalhes && (
            <p className="text-xs text-slate-300">
              <b className="text-slate-100">💸 Gastos:</b> {troca.gastos_detalhes}
            </p>
          )}
          {troca.maquina_bebidas && (
            <p className="text-xs text-slate-300">
              <b className="text-slate-100">🥤 Bebidas:</b> {troca.maquina_bebidas}
            </p>
          )}
          {troca.observacoes && (
            <div className="text-xs text-slate-300 bg-slate-900/60 border border-slate-800 rounded-lg p-3 whitespace-pre-wrap">
              <p className="font-black text-slate-100 mb-1">📝 Observações</p>
              {troca.observacoes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
