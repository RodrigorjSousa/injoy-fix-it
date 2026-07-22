import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import { todaySP } from "@/lib/tz";

export type HotelMetricRow = {
  property: Unidade;
  date: string;
  occupancy_percentage: number;
  clean_rooms: number;
  dirty_rooms: number;
  maintenance_rooms: number;
  pending_balance: number;
  available_rooms: number | null;
  pending_docs_count: number | null;
  updated_at: string;
};

type MetricsByProperty = Partial<Record<Unidade, HotelMetricRow>>;

export function useHotelMetrics() {
  const [metrics, setMetrics] = useState<MetricsByProperty>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data, error: qErr } = await supabase
        .from("hotel_metrics")
        .select("*")
        .eq("date", today);
      if (qErr) throw qErr;
      const map: MetricsByProperty = {};
      for (const row of data ?? []) {
        if (!row?.property) continue;
        map[row.property as Unidade] = row as HotelMetricRow;
      }
      setMetrics(map);
    } catch (err) {
      console.error("[hotel-metrics] fetch error", err);
      setError(err instanceof Error ? err.message : "Falha ao carregar métricas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    const channel = supabase
      .channel("gestao-housekeeping-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_housekeeping" },
        () => fetchMetrics(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hotel_metrics" },
        () => fetchMetrics(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMetrics]);

  const sincronizar = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    const t = toast.loading("Sincronizando com Cloudbeds...");
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("consolidar-dados", {
        body: {},
      });
      if (fnErr) throw fnErr;
      if (data && (data as { success?: boolean }).success === false) {
        throw new Error((data as { error?: string }).error || "Falha na sincronização");
      }
      await fetchMetrics();
      toast.success("Dados atualizados do Cloudbeds", { id: t });
    } catch (err) {
      console.error("[hotel-metrics] sync error", err);
      const msg = err instanceof Error ? err.message : "Falha ao sincronizar";
      setError(msg);
      toast.error(msg, { id: t });
    } finally {
      setSyncing(false);
    }
  }, [fetchMetrics, syncing]);

  return { metrics, loading, syncing, error, sincronizar, refetch: fetchMetrics };
}
