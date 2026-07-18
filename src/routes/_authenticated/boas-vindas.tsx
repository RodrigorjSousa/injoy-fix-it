import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  Thermometer,
  Navigation,
  User as UserIcon,
  Clock,
  Megaphone,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import { useUnidade } from "@/lib/unidade-context";
import type { Unidade } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RecadorGestorModal } from "@/components/recados-gestor/recador-gestor-modal";
import { PassagemTurnoCard } from "@/components/recepcao/passagem-turno-card";
import { AuditoriaFuncionarioCard } from "@/components/almoxarifado/auditoria-funcionario-card";
import { ChegadasHojeCards } from "@/components/gestao/chegadas-hoje-cards";
import { PainelControleRapido } from "@/components/gestao/painel-controle-rapido";


import { cn } from "@/lib/utils";

type StatusKey = "prontos" | "emFaxina" | "sujos" | "bloqueados";
type RoomRow = {
  id: string;
  room_number: string;
  room_type: string | null;
  status: string | null;
  condition: string | null;
  assigned_camareira: string | null;
  guest_name: string | null;
  updated_at: string;
};
function classifyRoom(r: Pick<RoomRow, "status" | "condition">): StatusKey | null {
  if (r.condition === "maintenance") return "bloqueados";
  if (r.status === "clean") return "prontos";
  if (r.status === "cleaning") return "emFaxina";
  if (r.status === "dirty") return "sujos";
  return null;
}
const STATUS_LABEL: Record<StatusKey, string> = {
  prontos: "Quartos Prontos e Liberados",
  emFaxina: "Quartos em Faxina",
  sujos: "Quartos Sujos (Check-out)",
  bloqueados: "Quartos Bloqueados (Ordem de Serviço)",
};

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

type Clima = {
  temp: number | null;
  condicao: "loading" | "clear" | "cloudy" | "rainy" | "stormy";
  msg: string;
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
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<StatusKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [openRecador, setOpenRecador] = useState(false);
  const [clima, setClima] = useState<Clima>({
    temp: null,
    condicao: "loading",
    msg: "Buscando clima local...",
  });

  // Nome do perfil
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

  // Clima via geolocalização + open-meteo
  useEffect(() => {
    let cancelled = false;
    const setDefault = () =>
      !cancelled &&
      setClima({ temp: 25, condicao: "clear", msg: "✨ Clima agradável. Vamos garantir um ótimo dia!" });

    if (!("geolocation" in navigator)) {
      setDefault();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
          );
          const data = await res.json();
          const cw = data?.current_weather;
          if (!cw) return setDefault();
          const temp = Math.round(cw.temperature);
          const code = cw.weathercode as number;
          let condicao: Clima["condicao"] = "clear";
          let msg = "✨ Clima perfeito! Vamos garantir um check-in inesquecível.";
          if ([1, 2, 3].includes(code)) {
            condicao = "cloudy";
            msg = "☁️ Tempo nublado. Ótimo dia para focar nos detalhes internos!";
          } else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
            condicao = "rainy";
            msg = "🌧️ Piso molhado na recepção! Atenção às placas de alerta e guarda-chuvas.";
          } else if ([95, 96, 99].includes(code)) {
            condicao = "stormy";
            msg = "⚡ Alerta de tempestade! Fechem as janelas dos quartos vazios.";
          } else if (temp >= 28) {
            msg = "☀️ Dia quente! Abasteça a água saborizada com bastante gelo.";
          }
          if (!cancelled) setClima({ temp, condicao, msg });
        } catch {
          setDefault();
        }
      },
      () => setDefault(),
      { timeout: 8000 },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Métricas + status (fonte da verdade: hotel_metrics/Cloudbeds; faxina: room_housekeeping)
  useEffect(() => {
    let cancelled = false;

    const buscarStatus = async () => {
      const today = new Date().toISOString().split("T")[0];
      const [{ data: metric }, { data: quartos }] = await Promise.all([
        supabase
          .from("hotel_metrics")
          .select("*")
          .eq("property", unidade)
          .eq("date", today)
          .maybeSingle(),
        supabase
          .from("room_housekeeping")
          .select("id, room_number, room_type, status, condition, assigned_camareira, guest_name, updated_at")
          .eq("property", unidade)
          .order("room_number", { ascending: true }),
      ]);
      if (cancelled) return;
      setRooms((quartos ?? []) as RoomRow[]);
      const m = metric as
        | {
            rating?: number | null;
            occupancy_percentage?: number | null;
            pending_balance?: number | null;
            pending_docs_count?: number | null;
            clean_rooms?: number | null;
            dirty_rooms?: number | null;
            maintenance_rooms?: number | null;
          }
        | null;
      setRating(m?.rating != null ? Number(m.rating) : unidade === "Botafogo" ? 8.6 : 7.8);
      setMetricas({
        taxaOcupacao: Number(m?.occupancy_percentage ?? 63),
        receberBalcao: Number(m?.pending_balance ?? 0),
        docsPendentes: Number(m?.pending_docs_count ?? 0),
      });
      // "Em faxina" só existe no controle local
      const emFaxinaLocal = (quartos ?? []).filter(
        (r: { status: string | null; condition: string | null }) =>
          r.status === "cleaning" && r.condition !== "maintenance",
      ).length;
      if (m) {
        setStatusQuartos({
          prontos: Number(m.clean_rooms ?? 0),
          emFaxina: emFaxinaLocal,
          sujos: Math.max(0, Number(m.dirty_rooms ?? 0) - emFaxinaLocal),
          bloqueados: Number(m.maintenance_rooms ?? 0),
        });
      } else {
        setStatusQuartos(
          calcularStatus((quartos ?? []) as Array<{ status: string | null; condition: string | null }>),
        );
      }
    };

    const carregar = async () => {
      try {
        await buscarStatus();
      } catch (e) {
        console.error("[BoasVindas] erro ao carregar:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Sincroniza com Cloudbeds ao entrar e a cada 15 minutos
    const sincronizar = async () => {
      try {
        await supabase.functions.invoke("consolidar-dados", { body: {} });
      } catch (e) {
        console.error("[BoasVindas] erro ao sincronizar Cloudbeds:", e);
      } finally {
        await buscarStatus();
      }
    };

    carregar();
    sincronizar();
    const interval = setInterval(sincronizar, 15 * 60 * 1000);

    const channel = supabase
      .channel(`boas-vindas-${unidade}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_housekeeping", filter: `property=eq.${unidade}` },
        () => {
          buscarStatus().catch((e) => console.error("[BoasVindas] refresh housekeeping:", e));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hotel_metrics", filter: `property=eq.${unidade}` },
        () => {
          buscarStatus().catch((e) => console.error("[BoasVindas] refresh metrics:", e));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [unidade]);

  const roomsSelecionados = useMemo(
    () => (selectedStatus ? rooms.filter((r) => classifyRoom(r) === selectedStatus) : []),
    [rooms, selectedStatus],
  );

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

  const renderIconeClima = () => {
    switch (clima.condicao) {
      case "clear":
        return <Sun className="text-yellow-400 w-12 h-12" />;
      case "cloudy":
        return <Cloud className="text-slate-300 w-12 h-12" />;
      case "rainy":
        return <CloudRain className="text-blue-400 w-12 h-12" />;
      case "stormy":
        return <CloudLightning className="text-purple-400 w-12 h-12" />;
      default:
        return <Thermometer className="text-teal-400 w-12 h-12 animate-pulse" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white p-4 md:p-6 font-sans space-y-6 pb-12">
      {/* Header / Seletor de Unidade */}
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

      {visaoCompleta && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setOpenRecador(true)}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white font-black text-sm uppercase tracking-wider shadow-lg hover:shadow-2xl hover:scale-[1.02] transition-all border-2 border-red-400 animate-pulse"
          >
            <Megaphone className="h-5 w-5" />
            📣 Recador do Gestor
          </button>
          
        </div>
      )}

      

      <RecadorGestorModal
        open={openRecador}
        onOpenChange={setOpenRecador}
        gestorNome={primeiroNome}
        gestorId={me?.userId ?? ""}
      />

      <PassagemTurnoCard unidade={unidade} nome={primeiroNome} />

      <AuditoriaFuncionarioCard unidade={unidade} />

      {visaoCompleta && <ChegadasHojeCards unidade={unidade} />}



      {visaoCompleta ? (
        <>
          {/* ========== LAYOUT GESTOR/ADMIN (CLÁSSICO) ========== */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-6 space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] bg-slate-800 text-teal-400 px-2 py-0.5 rounded-full font-bold">
                  <Sparkles size={10} /> Sistema Ativo
                </span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" })}
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
                      metaBatida ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
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

          {/* 3 cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3 backdrop-blur-md">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Taxa de Ocupação Hoje</span>
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
                <span className="text-xs font-bold uppercase tracking-wider">A Receber no Balcão</span>
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
                <h3 className="text-3xl font-black text-amber-400">{metricas.docsPendentes} Hóspedes</h3>
                <p className="text-[10px] text-slate-400 font-bold">
                  Falta preenchimento de ficha de entrada
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* ========== LAYOUT OPERACIONAL ========== */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Coluna Esquerda */}
            <div className="lg:col-span-7 space-y-5 flex flex-col">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-3 py-1 rounded-full font-bold uppercase tracking-widest">
                  <Sparkles size={10} /> Portal Operacional
                </span>
                <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">
                  {obterSaudacaoHora()}
                  <span className="text-teal-400">,</span>
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">
                    {primeiroNome}!
                  </span>
                </h2>
              </div>

              {/* Meta */}
              <div
                className={`relative overflow-hidden rounded-2xl border-2 p-5 shadow-xl ${
                  metaBatida
                    ? "bg-gradient-to-br from-emerald-950/40 to-teal-950/20 border-emerald-500/40"
                    : "bg-gradient-to-br from-amber-950/40 to-red-950/20 border-amber-500/40"
                }`}
              >
                <div className="flex items-center gap-4 relative z-10">
                  <div
                    className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center font-black text-lg border-2 shrink-0 ${
                      metaBatida
                        ? "bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 border-emerald-300 animate-pulse"
                        : "bg-gradient-to-tr from-amber-500 to-orange-400 text-slate-950 border-amber-300"
                    }`}
                  >
                    <span>{rating.toFixed(1)}</span>
                    <span className="text-[7px] uppercase font-bold -mt-0.5">Nota</span>
                  </div>
                  <div className="space-y-1 min-w-0">
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        metaBatida ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {metaBatida ? "🏆 METAS E BÔNUS ATIVOS" : "⚠️ ATENÇÃO COM A META"}
                    </span>
                    <p className="text-xs text-white/90 font-semibold leading-snug">
                      {metaBatida
                        ? `Bônus garantido para os colaboradores de ${unidade}.`
                        : "Vamos recuperar nossa nota e garantir o bônus."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Ocupação */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 backdrop-blur-md">
                <div className="flex justify-between items-center text-slate-400">
                  <span className="text-xs font-bold uppercase tracking-wider">Taxa de Ocupação Hoje</span>
                  <span className="text-xs font-black text-teal-400">
                    {Math.round(metricas.taxaOcupacao)}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-teal-400 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, metricas.taxaOcupacao))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Coluna Direita: Clima */}
            <div className="lg:col-span-5 bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col justify-between shadow-2xl backdrop-blur-md relative overflow-hidden">
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <span className="text-[9px] font-black bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 w-max">
                    <Navigation size={10} className="animate-pulse text-teal-400" /> Clima Local
                  </span>
                  <h3 className="text-lg font-black text-white mt-2">Condições no Hotel</h3>
                </div>
                <span className="text-4xl font-black text-white tracking-tighter">
                  {clima.temp ?? "--"}°C
                </span>
              </div>

              <div className="my-6 flex items-center gap-5 bg-slate-900/40 p-4 rounded-2xl border border-white/5 relative z-10">
                {renderIconeClima()}
                <div className="space-y-1">
                  <h4 className="text-sm font-extrabold text-white">Clima em {unidade}</h4>
                  <p className="text-xs text-slate-400 font-medium">Sincronizado automaticamente</p>
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-3 border border-white/5 text-xs text-slate-300 leading-relaxed font-semibold">
                {clima.msg}
              </div>
            </div>
          </div>

          {/* Status da Operação de Quartos (Operacional) */}
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
              {([
                { k: "prontos" as StatusKey, Icon: CheckCircle2, iconBg: "bg-emerald-500 text-slate-950", card: "bg-emerald-950/20 border-emerald-500/20 hover:border-emerald-400/60", value: "text-emerald-400", label: "Prontos / Liberados", pulse: false },
                { k: "emFaxina" as StatusKey, Icon: Flame, iconBg: "bg-amber-500 text-slate-950", card: "bg-amber-950/20 border-amber-500/20 hover:border-amber-400/60", value: "text-amber-400", label: "Em Faxina", pulse: true },
                { k: "sujos" as StatusKey, Icon: AlertCircle, iconBg: "bg-red-500 text-slate-950", card: "bg-red-950/20 border-red-500/20 hover:border-red-400/60", value: "text-red-400", label: "Sujos (Check-out)", pulse: false },
                { k: "bloqueados" as StatusKey, Icon: Wrench, iconBg: "bg-slate-600 text-white", card: "bg-slate-800/40 border-slate-700 hover:border-slate-500", value: "text-slate-300", label: "Bloqueados OS", pulse: false },
              ]).map(({ k, Icon, iconBg, card, value, label, pulse }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelectedStatus(k)}
                  className={cn(
                    "text-left rounded-2xl p-4 flex items-center gap-4 border transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400",
                    card,
                  )}
                  aria-label={`Ver ${label}`}
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0", iconBg)}>
                    <Icon size={20} className={pulse ? "animate-pulse" : undefined} />
                  </div>
                  <div className="min-w-0">
                    <h4 className={cn("text-2xl font-black", value)}>{statusQuartos[k]}</h4>
                    <p className="text-[10px] text-slate-400 font-bold">{label}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Status da Operação — apenas para gestão (final) */}
      {visaoCompleta && (
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
            {([
              { k: "prontos" as StatusKey, Icon: CheckCircle2, iconBg: "bg-emerald-500 text-slate-950", card: "bg-emerald-950/20 border-emerald-500/20 hover:border-emerald-400/60", value: "text-emerald-400", label: "Prontos / Liberados", pulse: false },
              { k: "emFaxina" as StatusKey, Icon: Flame, iconBg: "bg-amber-500 text-slate-950", card: "bg-amber-950/20 border-amber-500/20 hover:border-amber-400/60", value: "text-amber-400", label: "Em Faxina", pulse: true },
              { k: "sujos" as StatusKey, Icon: AlertCircle, iconBg: "bg-red-500 text-slate-950", card: "bg-red-950/20 border-red-500/20 hover:border-red-400/60", value: "text-red-400", label: "Sujos (Check-out)", pulse: false },
              { k: "bloqueados" as StatusKey, Icon: Wrench, iconBg: "bg-slate-600 text-white", card: "bg-slate-800/40 border-slate-700 hover:border-slate-500", value: "text-slate-300", label: "Bloqueados OS", pulse: false },
            ]).map(({ k, Icon, iconBg, card, value, label, pulse }) => (
              <button
                key={k}
                type="button"
                onClick={() => setSelectedStatus(k)}
                className={cn(
                  "text-left rounded-2xl p-4 flex items-center gap-4 border transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400",
                  card,
                )}
                aria-label={`Ver ${label}`}
              >
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0", iconBg)}>
                  <Icon size={20} className={pulse ? "animate-pulse" : undefined} />
                </div>
                <div className="min-w-0">
                  <h4 className={cn("text-2xl font-black", value)}>{statusQuartos[k]}</h4>
                  <p className="text-[10px] text-slate-400 font-bold">{label}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <Dialog open={selectedStatus !== null} onOpenChange={(o) => !o && setSelectedStatus(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedStatus ? STATUS_LABEL[selectedStatus] : "Quartos"}</DialogTitle>
            <DialogDescription>
              INJOY {unidade} · {roomsSelecionados.length}{" "}
              {roomsSelecionados.length === 1 ? "quarto" : "quartos"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {roomsSelecionados.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-500">
                Nenhum quarto neste status no momento.
              </div>
            ) : (
              <ul className="space-y-2">
                {roomsSelecionados.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 bg-slate-50">
                    <div className="h-11 w-11 shrink-0 rounded-lg bg-white grid place-items-center font-black text-sm text-slate-900 border border-slate-200">
                      {r.room_number}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 truncate">Quarto {r.room_number}</p>
                        {r.room_type && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-white px-1.5 py-0.5 rounded border">
                            {r.room_type}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
                        {r.assigned_camareira && (
                          <span className="inline-flex items-center gap-1">
                            <UserIcon size={12} /> {r.assigned_camareira}
                          </span>
                        )}
                        {r.guest_name && <span className="truncate">Hóspede: {r.guest_name}</span>}
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Clock size={12} />
                          {new Date(r.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="text-center text-[10px] text-slate-600 font-medium uppercase tracking-widest pt-4">
        INJOY Hotéis • Tecnologia e Gestão Hoteleira de Alta Performance
      </div>
    </div>
  );
}
