import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Wrench,
  ClipboardCheck,
  RefreshCw,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Trophy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useRegistrosBonificacaoMes, formatBRL } from "@/lib/bonificacao";
import { BonificacaoPanelModal } from "@/components/gestao/bonificacao-panel-modal";
import { PontoFuncionariosModal } from "@/components/gestao/ponto-funcionarios-modal";
import { useMe } from "@/lib/store";


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
  const [funcionariosCount, setFuncionariosCount] = useState<number>(0);
  const [vistoriaOpen, setVistoriaOpen] = useState(false);
  const [bonifOpen, setBonifOpen] = useState(false);
  const [pontoOpen, setPontoOpen] = useState(false);
  const { data: registrosBonif = [] } = useRegistrosBonificacaoMes(unidade);
  const totalBonif = useMemo(
    () => registrosBonif.reduce((s, r) => s + Number(r.valor_calculado), 0),
    [registrosBonif],
  );

  useEffect(() => {
    let cancelled = false;

    const carregar = async () => {
      const today = new Date();
      const startISO = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).toISOString();

      const [{ data: chamadosData }, { data: roomsData }, { data: inspData }, { data: trocaData }, { data: funcData }] = await Promise.all([
        supabase.from("chamados").select("status").eq("unidade", unidade),
        supabase
          .from("room_housekeeping")
          .select("room_number")
          .eq("property", unidade)
          .order("room_number", { ascending: true }),
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
        supabase.from("funcionarios").select("id", { count: "exact", head: false }),
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
      setRooms((roomsData ?? []) as Array<{ room_number: string }>);
      setInspectedToday(new Set((inspData ?? []).map((r: { room_number: string }) => r.room_number)));
      setTrocasNovas((trocaData ?? []).length);
      setFuncionariosCount((funcData ?? []).length);
    };

    carregar().catch((e) => console.error("[PainelControleRapido]", e));
    return () => {
      cancelled = true;
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
        <Link to="/manutencao" className={cardBase}>
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
        <button
          type="button"
          onClick={() => setVistoriaOpen(true)}
          className={cn(cardBase, "text-left")}
        >
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Vistoria da Recepção
            </p>
            <ClipboardCheck className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="mt-4">
            <p className="text-4xl font-black text-white leading-none">
              {vistoriados.length}
              <span className="text-slate-500"> / {totalQuartos || 0}</span>
            </p>
            <p className="text-xs text-slate-500 mt-2">Quartos vistoriados hoje</p>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
              style={{
                width: `${totalQuartos ? Math.round((vistoriados.length / totalQuartos) * 100) : 0}%`,
              }}
            />
          </div>
        </button>
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

        {/* CARD 4 - Ponto Pontomais (apenas Gestor/Admin) */}
        {isGestor && (
        <button
          type="button"
          onClick={() => setPontoOpen(true)}
          className={cn(cardBase, "text-left")}
        >
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Ponto dos Funcionários
            </p>
            <Clock className="h-5 w-5 text-blue-400" />
          </div>
          <div className="mt-4">
            <p className="text-2xl font-black text-white leading-tight">Verificar Batidas</p>
            <p className="text-xs text-slate-500 mt-2">
              {funcionariosCount > 0
                ? `${funcionariosCount} funcionário${funcionariosCount > 1 ? "s" : ""} cadastrado${funcionariosCount > 1 ? "s" : ""}`
                : "Registro de ponto"}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Sincronizado com Pontomais
          </div>
        </button>
        )}

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


      {/* Modal Vistoria */}
      <Dialog open={vistoriaOpen} onOpenChange={setVistoriaOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vistoria da Recepção · INJOY {unidade}</DialogTitle>
            <DialogDescription>
              {vistoriados.length} de {totalQuartos} quartos vistoriados hoje
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <div className="flex items-center gap-2 mb-2 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                <h4 className="text-xs font-black uppercase tracking-wide">
                  Vistoriados ({vistoriados.length})
                </h4>
              </div>
              <div className="max-h-[45vh] overflow-y-auto space-y-1 pr-1">
                {vistoriados.length === 0 && (
                  <p className="text-xs text-slate-500">Nenhum ainda hoje.</p>
                )}
                {vistoriados.map((r) => (
                  <div
                    key={r.room_number}
                    className="text-xs font-bold rounded-md px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200"
                  >
                    Quarto {r.room_number}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2 text-amber-600">
                <AlertCircle className="h-4 w-4" />
                <h4 className="text-xs font-black uppercase tracking-wide">
                  Faltam ({naoVistoriados.length})
                </h4>
              </div>
              <div className="max-h-[45vh] overflow-y-auto space-y-1 pr-1">
                {naoVistoriados.length === 0 && (
                  <p className="text-xs text-slate-500">Todos vistoriados! 🎉</p>
                )}
                {naoVistoriados.map((r) => (
                  <div
                    key={r.room_number}
                    className="text-xs font-bold rounded-md px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200"
                  >
                    Quarto {r.room_number}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
