import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Sun, Sunrise, Moon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Unidade = "Botafogo" | "Ipanema";
type PeriodKey = "manha" | "tarde" | "noite";

type StatusRow = {
  id: string;
  property: string;
  period: PeriodKey;
  is_completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
};

type DirectoryRow = {
  id: string;
  property: string;
  period: PeriodKey;
  item_name: string;
};

const PERIODS: {
  key: PeriodKey;
  title: string;
  subtitle: string;
  icon: typeof Sun;
  gradient: string;
}[] = [
  {
    key: "manha",
    title: "🌅 Manhã",
    subtitle: "Início dos trabalhos",
    icon: Sunrise,
    gradient: "from-amber-400 to-orange-500",
  },
  {
    key: "tarde",
    title: "☀️ Tarde",
    subtitle: "Meio do dia",
    icon: Sun,
    gradient: "from-sky-400 to-blue-500",
  },
  {
    key: "noite",
    title: "🌙 Noite",
    subtitle: "Final do expediente",
    icon: Moon,
    gradient: "from-indigo-500 to-purple-600",
  },
];

export function PeriodChecklistSection({
  unidade,
  camareiraName,
}: {
  unidade: Unidade;
  camareiraName: string | null;
}) {
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [directory, setDirectory] = useState<DirectoryRow[]>([]);
  const [marked, setMarked] = useState<Record<PeriodKey, Set<string>>>({
    manha: new Set(),
    tarde: new Set(),
    noite: new Set(),
  });
  const [saving, setSaving] = useState<PeriodKey | null>(null);

  const carregarStatuses = useCallback(async () => {
    const { data, error } = await supabase
      .from("daily_period_status" as never)
      .select("*")
      .eq("property", unidade);
    if (error) {
      console.error("[period-checklist] load status", error);
      return;
    }
    setStatuses((data as unknown as StatusRow[]) ?? []);
  }, [unidade]);

  const carregarDirectory = useCallback(async () => {
    const { data, error } = await supabase
      .from("period_items_directory" as never)
      .select("*")
      .eq("property", unidade)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[period-checklist] load directory", error);
      return;
    }
    setDirectory((data as unknown as DirectoryRow[]) ?? []);
  }, [unidade]);

  useEffect(() => {
    carregarStatuses();
    carregarDirectory();
  }, [carregarStatuses, carregarDirectory]);

  useEffect(() => {
    const channel = supabase
      .channel(`daily_period_status_${unidade}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_period_status" },
        () => carregarStatuses(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "period_items_directory" },
        () => carregarDirectory(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregarStatuses, carregarDirectory, unidade]);

  const statusByPeriod = useMemo(() => {
    const map = new Map<PeriodKey, StatusRow>();
    for (const s of statuses) map.set(s.period, s);
    return map;
  }, [statuses]);

  const itemsByPeriod = useMemo(() => {
    const map: Record<PeriodKey, string[]> = { manha: [], tarde: [], noite: [] };
    for (const d of directory) {
      if (d.period in map) map[d.period].push(d.item_name);
    }
    return map;
  }, [directory]);

  const toggle = (period: PeriodKey, item: string) => {
    setMarked((prev) => {
      const set = new Set(prev[period]);
      if (set.has(item)) set.delete(item);
      else set.add(item);
      return { ...prev, [period]: set };
    });
  };

  const finalizar = async (period: PeriodKey, items: string[]) => {
    if (!camareiraName) {
      toast.error("Perfil de camareira não identificado");
      return;
    }
    setSaving(period);

    const { error: logError } = await supabase
      .from("period_checklist_logs" as never)
      .insert({
        property: unidade,
        camareira_name: camareiraName,
        period,
        completed_items: items,
      } as never);

    if (logError) {
      setSaving(null);
      toast.error("Falha ao registrar turno");
      return;
    }

    const nowIso = new Date().toISOString();
    const { error: statusError } = await supabase
      .from("daily_period_status" as never)
      .update({
        is_completed: true,
        completed_by: camareiraName,
        completed_at: nowIso,
        updated_at: nowIso,
      } as never)
      .eq("property", unidade)
      .eq("period", period);

    setSaving(null);
    if (statusError) {
      toast.error("Falha ao atualizar estado do turno");
      return;
    }
    toast.success("Turno finalizado com sucesso");
    setMarked((prev) => ({ ...prev, [period]: new Set() }));
    carregarStatuses();
  };

  return (
    <div className="p-4 bg-white border-b">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-slate-900 text-white grid place-items-center">
          <CheckCircle2 size={16} />
        </div>
        <div>
          <h2 className="font-black text-slate-800 text-sm uppercase tracking-wider">
            Checklist de Período
          </h2>
          <p className="text-[11px] text-slate-500">
            Rotinas fixas do dia · INJOY {unidade}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PERIODS.map((p) => {
          const items = itemsByPeriod[p.key];
          const status = statusByPeriod.get(p.key);
          const done = !!status?.is_completed;
          const checkedSet = marked[p.key];
          const allChecked = items.length > 0 && items.every((it) => checkedSet.has(it));
          const Icon = p.icon;
          return (
            <div
              key={p.key}
              className={cn(
                "rounded-2xl border shadow-sm p-4 flex flex-col transition-colors",
                done
                  ? "bg-emerald-50 border-emerald-300"
                  : "bg-white border-slate-200",
              )}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className={cn(
                    "h-9 w-9 rounded-xl grid place-items-center text-white shadow-sm bg-gradient-to-br",
                    p.gradient,
                  )}
                >
                  <Icon size={16} />
                </div>
                <div>
                  <p className="font-black text-slate-800 text-sm leading-tight">
                    {p.title}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    {p.subtitle}
                  </p>
                </div>
              </div>

              {items.length === 0 ? (
                <p className="text-xs text-slate-400 italic flex-1">
                  Nenhuma tarefa cadastrada para este período.
                </p>
              ) : (
                <ul className="space-y-2 flex-1">
                  {items.map((item) => {
                    const checked = done || checkedSet.has(item);
                    return (
                      <li key={item}>
                        <label
                          className={cn(
                            "flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 cursor-pointer",
                            done
                              ? "text-emerald-800 cursor-not-allowed"
                              : "text-slate-700 hover:bg-slate-50",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={done || saving === p.key}
                            onChange={() => toggle(p.key, item)}
                            className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                          />
                          <span className={cn(done && "line-through opacity-80")}>
                            {item}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              {done ? (
                <div className="mt-3 text-[11px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                  <CheckCircle2 size={13} />
                  <span>
                    ✓ Concluído hoje por{" "}
                    <span className="font-black">
                      {status?.completed_by ?? "—"}
                    </span>
                    {status?.completed_at && (
                      <>
                        {" "}
                        às{" "}
                        {new Date(status.completed_at).toLocaleTimeString(
                          "pt-BR",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </>
                    )}
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => finalizar(p.key, items)}
                  disabled={!allChecked || saving === p.key}
                  className={cn(
                    "mt-3 w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white flex items-center justify-center gap-2 shadow-sm transition-all",
                    allChecked
                      ? "bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                      : "bg-slate-300 cursor-not-allowed",
                  )}
                >
                  {saving === p.key ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  Finalizar Turno {p.title.replace(/^\S+\s/, "")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
