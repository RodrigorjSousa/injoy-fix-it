import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Unidade } from "@/lib/store";

type Counts = {
  limpos: number;
  emFaxina: number;
  sujos: number;
  bloqueados: number;
};

const ZERO: Counts = { limpos: 0, emFaxina: 0, sujos: 0, bloqueados: 0 };

export function StatusOperacaoQuartos({ unidade }: { unidade: Unidade }) {
  const [counts, setCounts] = useState<Counts>(ZERO);

  const fetchCounts = useCallback(async () => {
    const { data, error } = await supabase
      .from("room_housekeeping")
      .select("*")
      .eq("property", unidade);
    if (error) {
      console.error("[status-operacao] fetch", error);
      return;
    }
    const next: Counts = { ...ZERO };
    for (const r of data ?? []) {
      if (r.condition === "maintenance") {
        next.bloqueados += 1;
        continue;
      }
      if (r.status === "cleaning") next.emFaxina += 1;
      else if (r.status === "clean") next.limpos += 1;
      else if (r.status === "dirty") next.sujos += 1;
    }
    console.log("[status-operacao] counts", unidade, next);
    setCounts(next);
  }, [unidade]);

  useEffect(() => {
    setCounts(ZERO);
  }, [unidade]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    const channel = supabase
      .channel(`mudancas-limpeza-${unidade}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_housekeeping" },
        () => fetchCounts(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCounts, unidade]);

  const cards: Array<{
    label: string;
    value: number;
    card: string;
    dot: string;
  }> = [
    {
      label: "Prontos / Limpos",
      value: counts.limpos,
      card: "bg-emerald-50 border-emerald-100",
      dot: "bg-emerald-500",
    },
    {
      label: "Em Faxina",
      value: counts.emFaxina,
      card: "bg-amber-50 border-amber-100",
      dot: "bg-amber-500",
    },
    {
      label: "Sujos (Check-out)",
      value: counts.sujos,
      card: "bg-red-50 border-red-100",
      dot: "bg-red-500",
    },
    {
      label: "Bloqueados OS",
      value: counts.bloqueados,
      card: "bg-slate-100 border-slate-200",
      dot: "bg-slate-500",
    },
  ];

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
        Status da Operação de Quartos
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl border transition-colors",
              c.card,
            )}
          >
            <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", c.dot)} />
            <div className="min-w-0">
              <p className="text-2xl font-bold text-slate-800 tabular-nums">
                {c.value}
              </p>
              <p className="text-xs text-slate-500 truncate">{c.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
