import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Wrench,
  ClipboardCheck,
  RefreshCw,
  ArrowUpRight,
  Trophy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useRegistrosBonificacaoMes, formatBRL } from "@/lib/bonificacao";
import { BonificacaoPanelModal } from "@/components/gestao/bonificacao-panel-modal";
import { useMe } from "@/lib/store";
import { isCheckInTask } from "@/lib/task-labels";
import { nowSP } from "@/lib/tz";


type Props = {
  unidade: Unidade;
};

type ChamadosCounts = { abertos: number; andamento: number; concluidos: number };

export function PainelControleRapido({ unidade }: Props) {
  const { data: me } = useMe();
  const isGestor = !!me && (me.isGestor || me.isAdmin);

  const [chamados, setChamados] = useState<ChamadosCounts>({
    abertos: 7,
    andamento: 0,
    concluidos: 8,
  });
  const [rooms, setRooms] = useState<Array<{ room_number: string }>>([]);
  const [inspectedToday, setInspectedToday] = useState<Set<string>>(new Set());
  const [trocasNovas, setTrocasNovas] = useState<number>(0);
  const [bonifOpen, setBonifOpen] = useState(false);
  const { data: registrosBonif = [] } = useRegistrosBonificacaoMes(unidade);
  const totalBonif = useMemo(
    () => registrosBonif.reduce((s, r) => s + Number(r.valor_calculado), 0),
    [registrosBonif],
  );

  useEffect(() => {
    let cancelled = false;

    const getCutoff = () => {
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setHours(23, 0, 0, 0);
      if (now.getHours() < 23) cutoff.setDate(cutoff.getDate() - 1);
      return cutoff;
    };

    const carregar = async () => {
      const startISO = getCutoff().toISOString();

      const [
        { data: chamadosData },
        recepcaoRes,
        { data: inspData },
        { data: trocaData },
      ] = await Promise.all([
        supabase.from("chamados").select("status").eq("unidade", unidade),
        supabase.functions.invoke(`dados-recepcao?property=${unidade}`, { method: "GET" }),
        supabase
          .from("room_inspections")
          .select("room_number, created_at")
          .eq("property", unidade)
          .gte("created_at", startISO),
        supabase
          .from("trocas_turno")
          .select("id")
          .eq("unidade", unidade)
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()),
      ]);

      if (cancelled) return;

      if (chamadosData) {
        const counts: ChamadosCounts = { abertos: 0, andamento: 0, concluidos: 0 };
        for (const c of chamadosData) {
          if (c.status === "Aberto") counts.abertos++;
          else if (c.status === "Em Andamento") counts.andamento++;
          else if (c.status === "Concluído") counts.concluidos++;
        }
        setChamados(counts);
      }
      // Fonte de verdade: dados-recepcao (mesma base do card da Recepção).
      // Só conta como "vistoria do dia" o que a Recepção mostra: quartos
      // não bloqueados com tarefa de check-in OU já vistoriados hoje.
      const recepcaoData = (recepcaoRes.data?.data ?? []) as Array<{
        quarto: string;
        assignedTask: string | null;
        ocupacao: string;
      }>;
      const inspectedSet = new Set(
        (inspData ?? []).map((r: { room_number: string }) => String(r.room_number)),
      );
      const relevantes = new Set<string>();
      for (const q of recepcaoData) {
        const num = String(q.quarto);
        if (q.ocupacao === "Bloqueado") continue;
        if (isCheckInTask(q.assignedTask) || inspectedSet.has(num)) {
          relevantes.add(num);
        }
      }
      setRooms(Array.from(relevantes).map((room_number) => ({ room_number })));
      setInspectedToday(inspectedSet);
      setTrocasNovas((trocaData ?? []).length);
    };

    carregar().catch((e) => console.error("[PainelControleRapido]", e));

    const inspChannel = supabase
      .channel(`painel-inspections-${unidade}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_inspections", filter: `property=eq.${unidade}` },
        () => carregar().catch(() => {}),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_housekeeping", filter: `property=eq.${unidade}` },
        () => carregar().catch(() => {}),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(inspChannel);
    };
  }, [unidade]);


  const totalChamadosAtivos = chamados.abertos + chamados.andamento;
  const totalQuartos = rooms.length;
  const vistoriados = useMemo(
    () => rooms.filter((r) => inspectedToday.has(r.room_number)),
    [rooms, inspectedToday],
  );
  const naoVistoriados = useMemo(
    () => rooms.filter((r) => !inspectedToday.has(r.room_number)),
    [rooms, inspectedToday],
  );
  void naoVistoriados;

  const cardBase =
    "relative bg-slate-900 rounded-2xl border border-slate-800 p-5 cursor-pointer hover:bg-slate-800 transition-all group flex flex-col justify-between min-h-[190px]";

  return (
    <div className="mt-8 space-y-3">
      <div>
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">
          Painel de Controle Rápido
        </h3>
        <p className="text-[10px] text-slate-400 font-bold">
          Atalhos operacionais para gestão diária
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* CARD 1 - Chamados Ativos */}
        <Link to="/painel" className={cardBase}>
          <div className="flex items-start justify-between">
            <div className="h-11 w-11 rounded-full bg-blue-600/20 border border-blue-500/40 grid place-items-center text-blue-400">
              <Wrench className="h-5 w-5" />
            </div>
            <ArrowUpRight className="h-4 w-4 text-slate-500 group-hover:text-slate-300" />
          </div>
          <div className="mt-4">
            <p className="text-4xl font-black text-white leading-none">
              {totalChamadosAtivos || 7}
            </p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-2">
              Chamados Ativos
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-red-600 text-white">
              {chamados.abertos} abertos
            </span>
            <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-amber-500 text-white">
              {chamados.andamento} em andamento
            </span>
            <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-emerald-600 text-white">
              {chamados.concluidos} concluídos
            </span>
          </div>
        </Link>

        {/* CARD 2 - Vistoria da Recepção (apenas Gestor/Admin) */}
        {isGestor && (
        <Link
          to="/historico-vistorias"
          className={cn(cardBase, "text-left overflow-hidden pb-7")}
        >
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Vistoria da Recepção
            </p>
            <ClipboardCheck className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="mt-4">
            <p className="text-4xl font-black text-white leading-none">
              {vistoriados.length}
              <span className="text-slate-500"> / {totalQuartos || 0}</span>
            </p>
            <p className="text-xs text-slate-500 mt-2">
              {totalQuartos - vistoriados.length > 0
                ? `Falta${totalQuartos - vistoriados.length > 1 ? "m" : ""} ${totalQuartos - vistoriados.length} vistoria${totalQuartos - vistoriados.length > 1 ? "s" : ""} hoje`
                : totalQuartos > 0
                  ? "Todas as vistorias concluídas"
                  : "Sem check-ins hoje"}
            </p>
          </div>
          <div className="absolute left-0 right-0 bottom-0 h-2 bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{
                width: `${totalQuartos ? Math.round((vistoriados.length / totalQuartos) * 100) : 0}%`,
              }}
            />
          </div>
        </Link>
        )}


        {/* CARD 3 - Troca de Turnos */}
        <Link to="/relatorios-turno" className={cardBase}>
          {trocasNovas > 0 && (
            <span className="absolute -top-2 -right-2 h-6 min-w-[24px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black grid place-items-center animate-pulse shadow-lg">
              {trocasNovas}
            </span>
          )}
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Troca de Turnos
            </p>
            <RefreshCw className="h-5 w-5 text-teal-400" />
          </div>
          <div className="mt-4">
            <p className="text-2xl font-black text-white leading-tight">Acessar Relatórios</p>
            <p className="text-xs text-slate-500 mt-2">
              {trocasNovas > 0
                ? `${trocasNovas} novo${trocasNovas > 1 ? "s" : ""} turno registrado`
                : "Passagens de serviço"}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Ver histórico completo
          </div>
        </Link>


        {/* CARD 5 - Bonificação Recepção */}
        <button
          type="button"
          onClick={() => setBonifOpen(true)}
          className={cn(cardBase, "text-left")}
        >
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Bonificação Recepção
            </p>
            <Trophy className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="mt-4">
            <p
              className={cn(
                "text-3xl font-black leading-none",
                totalBonif >= 0 ? "text-emerald-400" : "text-red-400",
              )}
            >
              {formatBRL(totalBonif)}
            </p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-2">
              Saldo acumulado neste mês
            </p>

          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
            <ArrowUpRight className="h-3.5 w-3.5" />
            {registrosBonif.length} avaliação{registrosBonif.length === 1 ? "" : "s"} registrada{registrosBonif.length === 1 ? "" : "s"}
          </div>
        </button>
      </div>

      <BonificacaoPanelModal open={bonifOpen} onOpenChange={setBonifOpen} unidade={unidade} />
      

    </div>
  );
}
