import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles, AlertTriangle, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";

type Counters = {
  prontos: number;
  emFaxina: number;
  sujos: number;
  bloqueados: number;
};

const EMPTY: Counters = { prontos: 0, emFaxina: 0, sujos: 0, bloqueados: 0 };

type Row = { status: string | null; condition: string | null };

function calcular(rows: Row[]): Counters {
  const c = { ...EMPTY };
  for (const r of rows) {
    const status = r.status ?? "";
    const condition = r.condition ?? "";
    if (condition === "maintenance") {
      c.bloqueados++;
      continue;
    }
    if (status === "clean") c.prontos++;
    else if (status === "cleaning") c.emFaxina++;
    else if (status === "dirty") c.sujos++;
  }
  return c;
}

export function StatusOperacaoQuartos({ unidade }: { unidade: Unidade }) {
  const [counters, setCounters] = useState<Counters>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const fetchCounters = async () => {
      const { data, error } = await supabase
        .from("room_housekeeping")
        .select("status, condition")
        .eq("property", unidade);
      if (cancelled) return;
      if (error) {
        console.error("[status-operacao-quartos] fetch error", error);
        return;
      }
      setCounters(calcular((data ?? []) as Row[]));
    };

    fetchCounters();

    const channel = supabase
      .channel(`mudancas-limpeza-${unidade}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_housekeeping",
          filter: `property=eq.${unidade}`,
        },
        () => {
          fetchCounters();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [unidade]);

  const cards = [
    {
      label: "Prontos / Liberados",
      value: counters.prontos,
      icon: CheckCircle2,
      accent: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      dot: "bg-emerald-500",
    },
    {
      label: "Em Faxina",
      value: counters.emFaxina,
      icon: Sparkles,
      accent: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
      dot: "bg-amber-500",
    },
    {
      label: "Sujos (Check-out)",
      value: counters.sujos,
      icon: AlertTriangle,
      accent: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-100",
      dot: "bg-red-500",
    },
    {
      label: "Bloqueados OS",
      value: counters.bloqueados,
      icon: Wrench,
      accent: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
      dot: "bg-blue-500",
    },
  ];

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Status da Operação de Quartos
          </p>
          <h3 className="text-base font-black text-slate-900 mt-0.5">
            INJOY {unidade}
          </h3>
        </div>
        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
          Tempo real
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className={cn(
                "rounded-xl border p-3 flex items-center gap-3",
                c.bg,
                c.border,
              )}
            >
              <div className={cn("p-2 rounded-lg bg-white/70", c.accent)}>
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", c.dot)} />
                  <p className="text-[11px] font-semibold text-slate-600 truncate">
                    {c.label}
                  </p>
                </div>
                <p className={cn("text-2xl font-black leading-tight", c.accent)}>
                  {c.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
