import { useEffect, useState, useCallback } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";

type LogRow = {
  id: string;
  property: string;
  room_number: string;
  guest_name: string | null;
  camareira_name: string;
  created_at: string;
};

export function CheckoutsCloudbedsCard({ unidade }: { unidade: Unidade }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cloudbeds_checkout_logs" as never)
      .select("id,property,room_number,guest_name,camareira_name,created_at")
      .eq("property", unidade)
      .order("created_at", { ascending: false })
      .limit(50);
    setRows(((data as unknown) as LogRow[]) ?? []);
    setLoading(false);
  }, [unidade]);

  useEffect(() => {
    carregar();
    const ch = supabase
      .channel(`ckout-logs-${unidade}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cloudbeds_checkout_logs" },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [unidade, carregar]);

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-rose-500 to-red-700 grid place-items-center text-white">
            <LogOut className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">Check-outs no Cloudbeds (Camareiras)</p>
            <p className="text-xs text-slate-500">Últimos check-outs realizados diretamente pelas camareiras · INJOY {unidade}</p>
          </div>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          aria-label="Recarregar"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">Nenhum check-out registrado ainda.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((r) => {
            const d = new Date(r.created_at);
            const dataFmt = d.toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", year: "2-digit",
              hour: "2-digit", minute: "2-digit",
            });
            return (
              <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">
                    Quarto {r.room_number} · {r.guest_name ?? "—"}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    Solicitado por <span className="font-medium text-slate-700">{r.camareira_name}</span>
                  </p>
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap">{dataFmt}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
