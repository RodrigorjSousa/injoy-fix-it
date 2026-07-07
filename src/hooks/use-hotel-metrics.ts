import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";

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

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("hotel_metrics")
      .select("*")
      .eq("date", today);
    setLoading(false);
    if (error) {
      console.error("[hotel-metrics] fetch error", error);
      return;
    }
    const map: MetricsByProperty = {};
    for (const row of data ?? []) {
      map[row.property as Unidade] = row as HotelMetricRow;
    }
    setMetrics(map);
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const sincronizar = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    const t = toast.loading("Sincronizando com Cloudbeds...");
    try {
      const { data, error } = await supabase.functions.invoke("consolidar-dados", {
        body: {},
      });
      if (error) throw error;
      if (data && (data as any).success === false) {
        throw new Error((data as any).error || "Falha na sincronização");
      }
      await fetchMetrics();
      toast.success("Dados atualizados do Cloudbeds", { id: t });
    } catch (err) {
      console.error("[hotel-metrics] sync error", err);
      toast.error(
        err instanceof Error ? err.message : "Falha ao sincronizar",
        { id: t },
      );
    } finally {
      setSyncing(false);
    }
  }, [fetchMetrics, syncing]);

  return { metrics, loading, syncing, sincronizar, refetch: fetchMetrics };
}
