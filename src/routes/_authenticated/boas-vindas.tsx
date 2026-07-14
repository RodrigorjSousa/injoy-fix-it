import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Sun,
  Cloud,
  CloudRain,
  BedDouble,
  ConciergeBell,
  Wrench,
  ArrowRight,
  TrendingUp,
  Activity,
  BarChart3,
  Users,
  DollarSign,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChamados, useMe } from "@/lib/store";
import { useHotelMetrics } from "@/hooks/use-hotel-metrics";
import { cn } from "@/lib/utils";
import type { Unidade } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/boas-vindas")({
  component: BoasVindas,
});

/* ------------------------ Clock + weather widget ------------------------ */

function useClock() {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);
  return now;
}

function greetingFor(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function WeatherIcon({ hour }: { hour: number }) {
  if (hour >= 6 && hour < 17)
    return <Sun className="h-6 w-6 text-amber-400" />;
  if (hour >= 17 && hour < 20)
    return <Cloud className="h-6 w-6 text-slate-300" />;
  return <CloudRain className="h-6 w-6 text-sky-300" />;
}

function ClockWidget({ dark }: { dark: boolean }) {
  const now = useClock();
  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  const dateStr = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur-md",
        dark
          ? "bg-white/5 border-white/10 text-slate-100"
          : "bg-white/70 border-slate-200 text-slate-800",
      )}
    >
      <WeatherIcon hour={now.getHours()} />
      <div className="leading-tight">
        <div className="text-xl font-bold tabular-nums">
          {hh}:{mm}
        </div>
        <div className="text-[11px] uppercase tracking-wider opacity-70">
          {dateStr}
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Live housekeeping --------------------------- */

type HKRow = { property: Unidade; status: string | null; condition: string | null };

function useHousekeepingLive() {
  const [rows, setRows] = useState<HKRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchIt = async () => {
      const { data } = await supabase
        .from("room_housekeeping")
        .select("property, status, condition");
      if (cancelled) return;
      setRows((data ?? []) as HKRow[]);
    };
    fetchIt();
    const ch = supabase
      .channel("boas-vindas-hk")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_housekeeping" },
        () => fetchIt(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  return useMemo(() => {
    const per: Record<Unidade, { prontos: number; sujos: number; total: number }> = {
      Botafogo: { prontos: 0, sujos: 0, total: 0 },
      Ipanema: { prontos: 0, sujos: 0, total: 0 },
    };
    for (const r of rows) {
      if (!per[r.property]) continue;
      per[r.property].total++;
      if (r.condition === "maintenance") continue;
      if (r.status === "clean") per[r.property].prontos++;
      else if (r.status === "dirty") per[r.property].sujos++;
    }
    return per;
  }, [rows]);
}

/* --------------------------- Activity feed ------------------------------- */

type FeedItem = { id: string; text: string; when: string };

function useActivityFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [{ data: hk }, { data: chamados }] = await Promise.all([
        supabase
          .from("room_housekeeping_history")
          .select("id, room_number, action_type, task_name, camareira_name, created_at, property")
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("chamados")
          .select("id, unidade, categoria, status, created_at")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      if (cancelled) return;
      const feed: FeedItem[] = [];
      (hk ?? []).forEach((h) => {
        feed.push({
          id: `hk-${h.id}`,
          text: `${h.property}: ${stMap[h.status as string] ?? h.status} ${h.room_id ?? ""}`,
          when: h.changed_at,
        });
      });
      (chamados ?? []).forEach((c) => {
        feed.push({
          id: `ch-${c.id}`,
          text: `${c.unidade}: chamado de ${c.categoria} (${c.status})`,
          when: c.created_at,
        });
      });
      feed.sort((a, b) => (a.when < b.when ? 1 : -1));
      setItems(feed.slice(0, 8));
    };
    load();
    const ch = supabase
      .channel("boas-vindas-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_housekeeping_history" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chamados" },
        () => load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  return items;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

/* ------------------------- Circular progress ----------------------------- */

function CircularProgress({
  value,
  label,
  color = "#22d3ee",
}: {
  value: number;
  label: string;
  color?: string;
}) {
  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="stroke-white/10" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 800ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-2xl font-black tabular-nums text-white">{Math.round(value)}%</div>
          <div className="text-[10px] uppercase tracking-widest text-white/60">{label}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Main page -------------------------------- */

function BoasVindas() {
  const { data: me } = useMe();
  const isAdmin = !!me && (me.isAdmin || me.isGestor);

  if (isAdmin) return <AdminView nome={me?.funcionario?.nome ?? "Gestor"} />;
  return <OperacionalView me={me} />;
}

/* ------------------------------ Admin view ------------------------------- */

function AdminView({ nome }: { nome: string }) {
  const now = useClock();
  const greet = greetingFor(now.getHours());
  const { metrics } = useHotelMetrics();
  const hk = useHousekeepingLive();
  const feed = useActivityFeed();

  const unidades: Unidade[] = ["Botafogo", "Ipanema"];

  return (
    <div className="relative -mx-4 sm:-mx-6 lg:-mx-8 -my-6 min-h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-100">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 animate-fade-in">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-[11px] uppercase tracking-widest text-white/70">
                Cockpit executivo
              </span>
            </div>
            <h1 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">
              {greet}, <span className="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">{nome.split(" ")[0]}</span>.
            </h1>
            <p className="mt-1 text-sm text-white/60 max-w-xl">
              Pulso do negócio em tempo real — Botafogo & Ipanema.
            </p>
          </div>
          <ClockWidget dark />
        </header>

        {/* Property cards */}
        <div className="grid gap-5 md:grid-cols-2 animate-fade-in">
          {unidades.map((u, i) => {
            const m = metrics[u];
            const stats = hk[u];
            const occ = Number(m?.occupancy_percentage ?? 0);
            const prontos = stats?.prontos ?? m?.clean_rooms ?? 0;
            const sujos = stats?.sujos ?? m?.dirty_rooms ?? 0;
            const receber = Number(m?.pending_balance ?? 0);
            return (
              <div
                key={u}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-2xl transition hover:border-white/20"
                style={{ animation: `fade-in 0.6s ease ${i * 120}ms both` }}
              >
                <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">INJOY</div>
                    <div className="text-2xl font-black">{u}</div>
                  </div>
                  <CircularProgress value={occ} label="Ocupação" color={i === 0 ? "#22d3ee" : "#34d399"} />
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <MiniStat label="Prontos" value={prontos} tone="emerald" icon={CheckCircle2} />
                  <MiniStat label="Sujos" value={sujos} tone="rose" icon={BedDouble} />
                  <MiniStat
                    label="A receber"
                    value={receber.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                    tone="amber"
                    icon={DollarSign}
                    isMoney
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Feed + shortcuts */}
        <div className="grid gap-5 lg:grid-cols-3 animate-fade-in">
          <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <h2 className="text-sm font-bold uppercase tracking-widest text-white/80">
                  Atividades ao vivo
                </h2>
              </div>
              <Activity className="h-4 w-4 text-white/40" />
            </div>
            <ul className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {feed.length === 0 && (
                <li className="text-sm text-white/50">Sem atividades recentes.</li>
              )}
              {feed.map((f) => (
                <li key={f.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{f.text}</div>
                    <div className="text-[10px] uppercase tracking-widest text-white/40">{timeAgo(f.when)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <ShortcutBtn to="/gestao" label="Relatório & Gestão" icon={BarChart3} />
            <ShortcutBtn to="/configuracoes" label="Auditar Equipe" icon={Users} />
            <ShortcutBtn to="/dashboard" label="Dashboard" icon={TrendingUp} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
  icon: Icon,
  isMoney,
}: {
  label: string;
  value: number | string;
  tone: "emerald" | "rose" | "amber";
  icon: typeof CheckCircle2;
  isMoney?: boolean;
}) {
  const tones: Record<string, string> = {
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    rose: "text-rose-300 bg-rose-500/10 border-rose-500/20",
    amber: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  };
  return (
    <div className={cn("rounded-xl border p-3", tones[tone])}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest opacity-80">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={cn("mt-1 font-black tabular-nums", isMoney ? "text-lg" : "text-2xl")}>
        {value}
      </div>
    </div>
  );
}

function ShortcutBtn({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof BarChart3;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 transition hover:border-white/25 hover:bg-white/10"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-400/20 to-emerald-400/20 grid place-items-center">
          <Icon className="h-5 w-5 text-cyan-300" />
        </div>
        <div className="text-sm font-semibold">{label}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-white/50 group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}

/* --------------------------- Operacional view ---------------------------- */

function OperacionalView({ me }: { me: ReturnType<typeof useMe>["data"] }) {
  const now = useClock();
  const greet = greetingFor(now.getHours());
  const nome = me?.funcionario?.nome ?? me?.email?.split("@")[0] ?? "colega";
  const primeiroNome = nome.split(" ")[0];
  const { data: chamados = [] } = useChamados();

  const role: "recepcao" | "camareira" | "tecnico" | "outro" = me?.isRecepcao
    ? "recepcao"
    : me?.isCamareira
      ? "camareira"
      : me?.isFuncionario
        ? "tecnico"
        : "outro";

  const config = useMemo(() => {
    if (role === "camareira") {
      return {
        subtitle: "Pronto para garantir uma estadia 5 estrelas hoje?",
        ctaLabel: "Ir para minhas arrumações",
        ctaTo: "/camareiras",
        icon: BedDouble,
        accent: "from-rose-400 to-pink-500",
      };
    }
    if (role === "recepcao") {
      return {
        subtitle: "Seus hóspedes de hoje contam com você.",
        ctaLabel: "Abrir Painel de Recepção",
        ctaTo: "/recepcao",
        icon: ConciergeBell,
        accent: "from-indigo-400 to-blue-500",
      };
    }
    return {
      subtitle: "Sua escala de manutenção está pronta.",
      ctaLabel: "Ver Ordens de Serviço",
      ctaTo: "/painel",
      icon: Wrench,
      accent: "from-amber-400 to-orange-500",
    };
  }, [role]);

  const meusChamados = useMemo(() => {
    if (!me?.funcionario) return { abertos: 0, andamento: 0, concluidos: 0, total: 0 };
    const meus = chamados.filter((c) => c.responsavelId === me.funcionario!.id);
    return {
      abertos: meus.filter((c) => c.status === "Aberto").length,
      andamento: meus.filter((c) => c.status === "Em Andamento").length,
      concluidos: meus.filter((c) => c.status === "Concluído").length,
      total: meus.length,
    };
  }, [chamados, me]);

  // meta do dia (heurística simples): concluídos / total ativos
  const metaTotal = Math.max(meusChamados.total, 1);
  const metaFeitos = meusChamados.concluidos;
  const metaPct = Math.round((metaFeitos / metaTotal) * 100);

  const Icon = config.icon;

  return (
    <div className="relative -mx-4 sm:-mx-6 lg:-mx-8 -my-6 min-h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-br from-sky-50 via-white to-emerald-50">
      <div className="pointer-events-none absolute -top-32 -right-20 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />

      <div className="relative px-4 sm:px-6 lg:px-8 py-8 space-y-6 max-w-3xl mx-auto">
        <header className="flex flex-wrap items-start justify-between gap-4 animate-fade-in">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 border border-slate-200 px-3 py-1 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[11px] uppercase tracking-widest text-slate-600">
                Bem-vindo(a)
              </span>
            </div>
            <h1 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
              {greet}, <span className={cn("bg-gradient-to-r bg-clip-text text-transparent", config.accent)}>{primeiroNome}</span>!
            </h1>
            <p className="mt-1 text-sm text-slate-600 max-w-md">{config.subtitle}</p>
          </div>
          <ClockWidget dark={false} />
        </header>

        {/* Meta do dia */}
        <div className="rounded-3xl bg-white/70 border border-slate-200 backdrop-blur-xl p-6 shadow-sm animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Sua meta do dia</div>
              <div className="text-lg font-bold text-slate-900">
                {metaFeitos} de {metaTotal} {role === "camareira" ? "quartos" : "chamados"} concluídos
              </div>
            </div>
            <div className={cn("h-12 w-12 rounded-2xl grid place-items-center text-white bg-gradient-to-br shadow-md", config.accent)}>
              <Icon className="h-6 w-6" />
            </div>
          </div>
          <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={cn("h-full bg-gradient-to-r transition-all duration-700", config.accent)}
              style={{ width: `${metaPct}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <MiniStatLight label="Abertos" value={meusChamados.abertos} icon={Clock} />
            <MiniStatLight label="Em andamento" value={meusChamados.andamento} icon={Activity} />
            <MiniStatLight label="Concluídos" value={meusChamados.concluidos} icon={CheckCircle2} />
          </div>
        </div>

        {/* CTA principal */}
        <Link
          to={config.ctaTo}
          className={cn(
            "group relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 shadow-xl block animate-fade-in",
            config.accent,
          )}
        >
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative flex items-center justify-between text-white">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] opacity-80">Comece por aqui</div>
              <div className="text-2xl font-black">{config.ctaLabel}</div>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur grid place-items-center animate-pulse">
              <ArrowRight className="h-7 w-7" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

function MiniStatLight({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
}) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-2">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-xl font-black tabular-nums text-slate-900">{value}</div>
    </div>
  );
}
