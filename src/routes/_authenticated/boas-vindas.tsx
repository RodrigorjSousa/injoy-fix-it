import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Award,
  AlertTriangle,
  Sparkles,
  DollarSign,
  FileText,
  TrendingUp,
  CheckCircle2,
  Flame,
  AlertCircle,
  Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import { useUnidade } from "@/lib/unidade-context";
import type { Unidade } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/boas-vindas")({
  component: BoasVindas,
});

function obterSaudacaoHora() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

type Metricas = {
  taxaOcupacao: number;
  receberBalcao: number;
  docsPendentes: number;
};

type StatusQuartos = {
  prontos: number;
  emFaxina: number;
  sujos: number;
  bloqueados: number;
};

const EMPTY_STATUS: StatusQuartos = { prontos: 0, emFaxina: 0, sujos: 0, bloqueados: 0 };

function calcularStatus(rows: Array<{ status: string | null; condition: string | null }>): StatusQuartos {
  const c = { ...EMPTY_STATUS };
  for (const r of rows) {
    if (r.condition === "maintenance") c.bloqueados++;
    else if (r.status === "clean") c.prontos++;
    else if (r.status === "cleaning") c.emFaxina++;
    else if (r.status === "dirty") c.sujos++;
  }
  return c;
}

function BoasVindas() {
  const { data: me } = useMe();
  const { unidade, setUnidade, unidades } = useUnidade();

  const [nome, setNome] = useState<string>("");
  const [rating, setRating] = useState<number>(8.5);
  const [metricas, setMetricas] = useState<Metricas>({
    taxaOcupacao: 0,
    receberBalcao: 0,
    docsPendentes: 0,
  });
  const [statusQuartos, setStatusQuartos] = useState<StatusQuartos>(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);

  // Carrega nome do perfil uma vez (com fallback para metadados do Auth)
  useEffect(() => {
    let cancelled = false;
    const GENERICOS = ["administrador", "admin", "user", "usuario", "usuário", "gestor", "funcionario", "funcionário"];
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", user.id)
        .maybeSingle();

      const nomeCompleto =
        profileData?.nome ||
        (user.user_metadata as any)?.full_name ||
        (user.user_metadata as any)?.name ||
        (user.user_metadata as any)?.nome ||
        "";

      let primeiro = "";
      if (nomeCompleto) {
        const p = nomeCompleto.trim().split(/\s+/)[0];
        if (p && !GENERICOS.includes(p.toLowerCase())) {
          primeiro = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
        }
      }

      if (!cancelled && primeiro) setNome(primeiro);
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.userId]);


  // Carrega métricas + status de quartos por unidade
  useEffect(() => {
    let cancelled = false;

    const carregar = async () => {
      try {
        const [{ data: metric }, { data: quartos }] = await Promise.all([
          supabase
            .from("hotel_metrics")
            .select("*")
            .eq("property", unidade)
            .order("date", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("room_housekeeping")
            .select("status, condition")
            .eq("property", unidade),
        ]);

        if (cancelled) return;

        const m = metric as
          | {
              rating?: number | null;
              occupancy_percentage?: number | null;
              pending_balance?: number | null;
              pending_docs_count?: number | null;
            }
          | null;

        setRating(
          m?.rating != null ? Number(m.rating) : unidade === "Botafogo" ? 8.6 : 7.8,
        );
        setMetricas({
          taxaOcupacao: Number(m?.occupancy_percentage ?? 63),
          receberBalcao: Number(m?.pending_balance ?? 0),
          docsPendentes: Number(m?.pending_docs_count ?? 0),
        });
        setStatusQuartos(calcularStatus((quartos ?? []) as Array<{ status: string | null; condition: string | null }>));
      } catch (e) {
        console.error("[BoasVindas] erro ao carregar:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    carregar();

    // Realtime: status de quartos
    const channel = supabase
      .channel(`boas-vindas-${unidade}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_housekeeping",
          filter: `property=eq.${unidade}`,
        },
        async () => {
          const { data } = await supabase
            .from("room_housekeeping")
            .select("status, condition")
            .eq("property", unidade);
          if (!cancelled)
            setStatusQuartos(
              calcularStatus(
                (data ?? []) as Array<{ status: string | null; condition: string | null }>,
              ),
            );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [unidade]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500" />
      </div>
    );
  }

  const GENERICOS_DISPLAY = ["administrador", "admin", "user", "usuario", "usuário", "gestor", "funcionario", "funcionário"];
  const candidatoFuncionario = me?.funcionario?.nome?.trim().split(/\s+/)[0] || "";
  const candidatoEmail = me?.email?.split("@")[0] || "";
  const fallback = !GENERICOS_DISPLAY.includes(candidatoFuncionario.toLowerCase())
    ? candidatoFuncionario
    : candidatoEmail;
  const primeiroNome = nome || fallback || "Colaborador";

  const metaBatida = rating >= 8.0;
  const visaoCompleta = Boolean(me?.isAdmin || me?.isGestor);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white p-4 md:p-6 font-sans space-y-6 pb-12">
      {/* 1. Header com seletor de unidade */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-tr from-teal-500 to-emerald-500 rounded-xl flex items-center justify-center font-black text-white shadow-lg">
            IJ
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight">INJOY HOTÉIS</h1>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              Unidade Selecionada: {unidade}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {unidades.map((u: Unidade) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnidade(u)}
              className={`px-4 py-2 rounded-xl font-bold text-xs border transition-all ${
                unidade === u
                  ? "bg-teal-500 text-slate-950 border-teal-400"
                  : "text-slate-300 border-white/10 hover:bg-white/5"
              }`}
            >
              🏢 {u}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Saudação + Nota Cloudbeds */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-6 space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] bg-slate-800 text-teal-400 px-2 py-0.5 rounded-full font-bold">
              <Sparkles size={10} /> Sistema Ativo
            </span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">
            {obterSaudacaoHora()}
            <span className="text-teal-400">,</span>
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">
              {primeiroNome}!
            </span>
          </h2>
          <p className="text-sm text-slate-400 max-w-md">
            Painel unificado de controle de qualidade, notas operacionais e andamento de turnos.
          </p>
        </div>

        <div
          className={`lg:col-span-6 relative overflow-hidden rounded-3xl border-2 p-5 shadow-2xl backdrop-blur-md transition-all duration-300 ${
            metaBatida
              ? "bg-gradient-to-br from-emerald-950/40 to-teal-950/20 border-emerald-500/30"
              : "bg-gradient-to-br from-amber-950/40 to-red-950/20 border-amber-500/30"
          }`}
        >
          <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
            {metaBatida ? (
              <Award size={160} className="text-emerald-400" />
            ) : (
              <AlertTriangle size={160} className="text-amber-400" />
            )}
          </div>
          <div className="flex items-center gap-4 relative z-10">
            <div
              className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center font-black text-2xl shadow-lg border-2 shrink-0 ${
                metaBatida
                  ? "bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 border-emerald-300 animate-pulse"
                  : "bg-gradient-to-tr from-amber-500 to-orange-400 text-slate-950 border-amber-300"
              }`}
            >
              <span>{rating.toFixed(1)}</span>
              <span className="text-[8px] uppercase font-bold -mt-1">Cloudbeds</span>
            </div>
            <div className="min-w-0">
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  metaBatida
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-amber-500/20 text-amber-400"
                }`}
              >
                {metaBatida ? "🏆 META ATINGIDA" : "⚠️ ABAIXO DA META"}
              </span>
              <p className="text-xs text-white/80 mt-1 leading-relaxed">
                {metaBatida
                  ? `Equipe de parabéns! Bônus garantido para o time de ${unidade}.`
                  : `Precisamos de foco para subir a nota e garantir o bônus de ${unidade}.`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Indicadores de Gestão */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3 backdrop-blur-md">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">
              Taxa de Ocupação Hoje
            </span>
            <TrendingUp size={16} />
          </div>
          <div className="space-y-2">
            <h3 className="text-3xl font-black">{Math.round(metricas.taxaOcupacao)}%</h3>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-teal-400 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, metricas.taxaOcupacao))}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3 backdrop-blur-md">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">
              A Receber no Balcão
            </span>
            <DollarSign size={16} className="text-red-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-3xl font-black text-red-400">
              R${" "}
              {metricas.receberBalcao.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h3>
            <p className="text-[10px] text-slate-400 font-bold">
              Cobrança ativa obrigatória no check-in
            </p>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3 backdrop-blur-md">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Docs Pendentes</span>
            <FileText size={16} className="text-amber-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-3xl font-black text-amber-400">
              {metricas.docsPendentes} Hóspedes
            </h3>
            <p className="text-[10px] text-slate-400 font-bold">
              Falta preenchimento de ficha de entrada
            </p>
          </div>
        </div>
      </div>

      {/* 4. Status da Operação de Quartos (Realtime) */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4 backdrop-blur-md">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
              Status da Operação de Quartos
            </h3>
            <p className="text-[10px] text-slate-400 font-bold">
              Acompanhamento de andamento em tempo real
            </p>
          </div>
          <span className="bg-teal-500/10 border border-teal-500/20 text-teal-400 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest animate-pulse">
            ● Tempo Real Ativo
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-500 text-slate-950 rounded-xl flex items-center justify-center font-bold shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div className="min-w-0">
              <h4 className="text-2xl font-black text-emerald-400">
                {statusQuartos.prontos}
              </h4>
              <p className="text-[10px] text-slate-400 font-bold">Prontos / Liberados</p>
            </div>
          </div>

          <div className="bg-amber-950/20 border border-amber-500/20 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-amber-500 text-slate-950 rounded-xl flex items-center justify-center font-bold shrink-0">
              <Flame size={20} className="animate-pulse" />
            </div>
            <div className="min-w-0">
              <h4 className="text-2xl font-black text-amber-400">{statusQuartos.emFaxina}</h4>
              <p className="text-[10px] text-slate-400 font-bold">Em Faxina</p>
            </div>
          </div>

          <div className="bg-red-950/20 border border-red-500/20 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-red-500 text-slate-950 rounded-xl flex items-center justify-center font-bold shrink-0">
              <AlertCircle size={20} />
            </div>
            <div className="min-w-0">
              <h4 className="text-2xl font-black text-red-400">{statusQuartos.sujos}</h4>
              <p className="text-[10px] text-slate-400 font-bold">Sujos (Check-out)</p>
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-600 text-white rounded-xl flex items-center justify-center font-bold shrink-0">
              <Wrench size={20} />
            </div>
            <div className="min-w-0">
              <h4 className="text-2xl font-black text-slate-300">
                {statusQuartos.bloqueados}
              </h4>
              <p className="text-[10px] text-slate-400 font-bold">Bloqueados OS</p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center text-[10px] text-slate-600 font-medium uppercase tracking-widest pt-4">
        INJOY Hotéis • Tecnologia e Gestão Hoteleira de Alta Performance
      </div>
    </div>
  );
}
