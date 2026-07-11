import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import { padQuarto, getTipoQuarto } from "@/lib/tipos-quarto";
import { Clock3 } from "lucide-react";

type Row = {
  room_number: string;
  service_started_at: string;
  service_ended_at: string;
  assigned_camareira: string | null;
};

type Props = { unidade: Unidade };

export function TempoCamareirasChart({ unidade }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("room_housekeeping")
        .select("room_number, service_started_at, service_ended_at, assigned_camareira")
        .eq("property", unidade)
        .not("service_started_at", "is", null)
        .not("service_ended_at", "is", null)
        .gte("service_ended_at", startOfDay.toISOString())
        .order("service_ended_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      setRows((data ?? []) as Row[]);
      setLoading(false);
    }
    load();
    const ch = supabase
      .channel(`tempo-cam-${unidade}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_housekeeping" }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [unidade]);

  const chartData = useMemo(() => {
    const byRoom = new Map<string, { total: number; count: number; last: number }>();
    for (const r of rows) {
      const start = new Date(r.service_started_at).getTime();
      const end = new Date(r.service_ended_at).getTime();
      const mins = (end - start) / 60000;
      if (!isFinite(mins) || mins <= 0 || mins > 60 * 12) continue;
      const cur = byRoom.get(r.room_number) ?? { total: 0, count: 0, last: 0 };
      cur.total += mins;
      cur.count += 1;
      cur.last = mins;
      byRoom.set(r.room_number, cur);
    }
    const round1 = (n: number) => Math.round(n * 10) / 10;
    return Array.from(byRoom.entries())
      .map(([room, v]) => ({
        room,
        label: `${padQuarto(room)}`,
        tipo: getTipoQuarto(unidade, room),
        media: round1(v.total / v.count),
        ultimo: round1(v.last),
        servicos: v.count,
      }))
      .sort((a, b) => b.media - a.media)
      .slice(0, 30);
  }, [rows, unidade]);

  const geralMedia = useMemo(() => {
    if (chartData.length === 0) return 0;
    return Math.round((chartData.reduce((s, d) => s + d.media, 0) / chartData.length) * 10) / 10;
  }, [chartData]);

  const totalServicos = useMemo(
    () => chartData.reduce((s, d) => s + d.servicos, 0),
    [chartData],
  );

  const colorFor = (mins: number) => {
    if (mins <= 25) return "#10b981";
    if (mins <= 45) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Tempo das Camareiras por Quarto</h3>
          <p className="text-xs text-slate-500 mt-0.5">Serviços concluídos hoje · duração entre início e fim</p>
        </div>
        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
          <Clock3 size={18} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
          <div className="text-slate-500">Média geral</div>
          <div className="font-bold text-slate-800 text-base">{geralMedia} min</div>
        </div>
        <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
          <div className="text-slate-500">Serviços concluídos hoje</div>
          <div className="font-bold text-slate-800 text-base">{totalServicos}</div>
        </div>
        <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
          <div className="text-slate-500">Quartos atendidos</div>
          <div className="font-bold text-slate-800 text-base">{chartData.length}</div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 grid place-items-center text-xs text-slate-400">Carregando…</div>
      ) : chartData.length === 0 ? (
        <div className="h-40 grid place-items-center text-xs text-slate-500 text-center px-4">
          Ainda não há serviços concluídos hoje em INJOY {unidade}. Assim que uma camareira iniciar e finalizar um serviço, os tempos aparecerão aqui.
        </div>
      ) : (
        <div className="w-full" style={{ height: Math.max(288, chartData.length * 28) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} angle={-25} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} label={{ value: "min", angle: -90, position: "insideLeft", offset: 20, style: { fontSize: 11, fill: "#64748b" } }} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                formatter={(value: number, name: string) => [`${value} min`, name === "media" ? "Média" : name]}
                labelFormatter={(l, p) => {
                  const d = p?.[0]?.payload as { tipo?: string } | undefined;
                  return `Quarto ${l}${d?.tipo ? ` · ${d.tipo}` : ""}`;
                }}
              />
              <Bar dataKey="media" name="Média" radius={[6, 6, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={colorFor(d.media)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> até 25 min</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> 26–45 min</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> acima de 45 min</span>
      </div>
    </div>
  );
}
