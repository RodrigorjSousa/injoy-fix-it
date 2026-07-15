import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, CheckCircle2, AlertTriangle, Hammer, User, DollarSign, FileText, Play, X, Ban, ClipboardCheck, Clock, ListChecks, Shirt, Package, MessageSquarePlus, LogOut } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { cloudbedsCheckoutRoom } from "@/lib/cloudbeds-checkout.functions";

import { toast } from "sonner";
import { DndModal } from "@/components/camareiras/dnd-modal";
import { ExtraTasksModal } from "@/components/camareiras/extra-tasks-modal";
import { LaundryModal } from "@/components/camareiras/laundry-modal";
import { PeriodChecklistSection } from "@/components/camareiras/period-checklist";
import { RecadosCamareirasSection, RecadosDoQuartoSection } from "@/components/camareiras/recados-recepcao";
import { RecadoRecepcaoModal } from "@/components/camareiras/recado-recepcao-modal";
import { RetiradaAlmoxarifadoModal } from "@/components/almoxarifado/retirada-modal";
import { VistoriaModal } from "@/components/recepcao/vistoria-modal";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/store";
import { useUnidade } from "@/lib/unidade-context";
import { formatTaskLabel, isCheckInTask } from "@/lib/task-labels";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  friendlyError,
} from "@/components/ui/data-state";

export const Route = createFileRoute("/_authenticated/camareiras")({
  component: PainelCamareiras,
  errorComponent: ({ error, reset }) => (
    <div className="p-6">
      <ErrorState
        title="Falha ao carregar camareiras"
        description={friendlyError(error)}
        onRetry={reset}
      />
    </div>
  ),
});

type Unidade = "Botafogo" | "Ipanema";

type RoomRow = {
  property: Unidade;
  room_number: string;
  room_type: string | null;
  status: string | null;
  condition: string | null;
  assigned_task: string | null;
  color_code: string | null;
  guest_name: string | null;
  pax: number | null;
  has_pending_payment: boolean | null;
  pending_payment_amount: number | null;
  has_pending_docs: boolean | null;
  arrival_time: string | null;

  blink_troca: boolean | null;
  service_status: string | null;
  assigned_camareira: string | null;
  service_started_at: string | null;
  service_ended_at: string | null;
  is_dnd: boolean | null;
  dnd_photo_url: string | null;
  room_comment: string | null;
  updated_at: string;
};

type Funcionario = { id: string; nome: string };


type Filtro = "Todos" | "Limpo" | "Sujo" | "Manutenção";

function estiloTarefa(t: string | null) {
  switch (t) {
    case "GERAL - CHECK-IN":
      return "bg-red-600 text-white border-red-700";
    case "GERAL":
      return "bg-sky-400 text-white border-sky-500";
    case "TROCA + ARRUMAÇÃO":
      return "bg-gradient-to-r from-purple-600 to-blue-600 text-white border-purple-700";
    case "TROCA":
      return "bg-purple-600 text-white border-purple-700";
    case "ARRUMAÇÃO":
      return "bg-blue-600 text-white border-blue-700";
    case "REVISÃO CHECK IN":
      return "bg-orange-500 text-white border-orange-600";
    default:
      return "bg-emerald-600 text-white border-emerald-700";
  }
}

function corLegenda(c: string | null) {
  switch (c) {
    case "VERDE":
      return "bg-emerald-500";
    case "AZUL FORTE":
      return "bg-blue-700";
    case "AZUL FRACO":
      return "bg-sky-400";
    default:
      return "bg-slate-400";
  }
}

function PainelCamareiras() {
  const { data: me } = useMe();
  const nomeAutomatico = useMemo(() => {
    if (!me?.isCamareira) return null;
    return me.funcionario?.nome ?? null;
  }, [me]);
  const { unidade: unidadeAtiva } = useUnidade();
  const [filtro, setFiltro] = useState<Filtro>("Todos");
  const [busca, setBusca] = useState("");
  const [quartos, setQuartos] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [selecionarPara, setSelecionarPara] = useState<RoomRow | null>(null);
  const [dndPara, setDndPara] = useState<RoomRow | null>(null);
  const [vistoriaPara, setVistoriaPara] = useState<RoomRow | null>(null);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [extraTasksOpen, setExtraTasksOpen] = useState(false);
  const [laundryOpen, setLaundryOpen] = useState(false);
  const [almoxarifadoOpen, setAlmoxarifadoOpen] = useState(false);
  const [recadoRecepcaoOpen, setRecadoRecepcaoOpen] = useState(false);



  const salvarComentario = useCallback(async (q: RoomRow, texto: string) => {
    if ((q.room_comment ?? "") === texto) return;
    const { error } = await supabase
      .from("room_housekeeping")
      // biome-ignore lint/suspicious/noExplicitAny: coluna nova ainda não está no types.ts gerado
      .update({ room_comment: texto, updated_at: new Date().toISOString() } as any)
      .eq("property", q.property)
      .eq("room_number", q.room_number);
    if (error) {
      toast.error("Falha ao salvar comentário");
      return;
    }
    toast.success("Comentário salvo");
  }, []);

  const carregarCamareiras = useCallback(async () => {
    // biome-ignore lint/suspicious/noExplicitAny: RPC ainda não presente no types.ts gerado
    const { data, error } = await (supabase as any).rpc("list_camareiras");
    if (error) {
      console.error("[camareiras] load list error", error);
      return;
    }
    setFuncionarios((data ?? []) as Funcionario[]);
  }, []);

  useEffect(() => {
    carregarCamareiras();
  }, [carregarCamareiras]);

  useEffect(() => {
    const channel = supabase
      .channel("camareiras_lista_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles" },
        () => carregarCamareiras(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "funcionarios" },
        () => carregarCamareiras(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregarCamareiras]);


  const iniciarServico = useCallback(async (q: RoomRow, nome: string) => {
    const { error } = await supabase
      .from("room_housekeeping")
      // biome-ignore lint/suspicious/noExplicitAny: colunas novas ainda não estão no types.ts gerado
      .update({
        service_status: "in_progress",
        assigned_camareira: nome,
        service_started_at: new Date().toISOString(),
        service_ended_at: null,
        status: "cleaning",
      } as any)
      .eq("property", q.property)
      .eq("room_number", q.room_number);
    if (error) {
      toast.error("Falha ao iniciar serviço");
      return;
    }
    toast.success(`Serviço iniciado por ${nome}`);
    setSelecionarPara(null);
  }, []);

  const finalizarServico = useCallback(async (q: RoomRow) => {
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("room_housekeeping")
      // biome-ignore lint/suspicious/noExplicitAny: colunas novas ainda não estão no types.ts gerado
      .update({
        service_status: "done",
        service_ended_at: nowIso,
        status: "clean",
        condition: "normal",
      } as any)
      .eq("property", q.property)
      .eq("room_number", q.room_number);
    if (error) {
      toast.error("Falha ao finalizar serviço");
      return;
    }

    // Grava histórico cumulativo da limpeza
    const { error: histErr } = await supabase
      .from("room_housekeeping_history")
      // biome-ignore lint/suspicious/noExplicitAny: tabela nova ainda não está no types.ts gerado
      .insert({
        property: q.property,
        room_number: q.room_number,
        camareira_name: q.assigned_camareira ?? nomeAutomatico ?? "—",
        action_type: "LIMPEZA",
        task_name: q.assigned_task ?? "ARRUMAÇÃO",
        started_at: q.service_started_at,
        ended_at: nowIso,
        photo_url: null,
        comment: q.room_comment ?? null,
      } as any);
    if (histErr) console.error("[camareiras] falha ao gravar histórico", histErr);

    toast.success("Serviço finalizado — quarto liberado");
  }, [nomeAutomatico]);


  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase
        .from("room_housekeeping")
        .select("*")
        .order("room_number", { ascending: true });
      if (error) throw error;
      setQuartos((data ?? []) as RoomRow[]);
    } catch (err) {
      const msg = friendlyError(err, "Falha ao carregar quartos");
      console.error("[camareiras] fetch error", err);
      setErro(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const channel = supabase
      .channel("room_housekeeping_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_housekeeping" },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregar]);

  const sincronizar = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    const t = toast.loading("Sincronizando com Cloudbeds...");
    try {
      const { data, error } = await supabase.functions.invoke("consolidar-dados", { body: {} });
      if (error) throw error;
      if (data && (data as any).success === false) throw new Error((data as any).error);
      await carregar();
      toast.success("Mapa atualizado", { id: t });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao sincronizar", { id: t });
    } finally {
      setSyncing(false);
    }
  }, [carregar, syncing]);

  const resetarServicosTurno = useCallback(async () => {
    const senha = window.prompt("Digite a senha para resetar os serviços do turno:");
    if (senha === null) return;
    if (!senha.trim()) {
      toast.error("Senha obrigatória para resetar os serviços");
      return;
    }
    const { data: cfg, error: cfgErr } = await supabase
      .from("app_settings" as never)
      .select("value")
      .eq("key", "reset_turno_password")
      .maybeSingle();
    if (cfgErr) {
      toast.error("Falha ao validar senha");
      return;
    }
    const senhaCorreta = (cfg as { value?: string } | null)?.value ?? "Injoy2014";
    if (senha !== senhaCorreta) {
      toast.error("Senha incorreta");
      return;
    }
    const t = toast.loading("Resetando serviços do turno...");
    const { error } = await supabase
      .from("room_housekeeping")
      // biome-ignore lint/suspicious/noExplicitAny: colunas novas ainda não estão no types.ts gerado
      .update({
        service_status: "idle",
        assigned_camareira: null,
        service_started_at: null,
        service_ended_at: null,
        is_dnd: false,
        dnd_photo_url: null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("property", unidadeAtiva);
    if (error) {
      toast.error("Falha ao resetar serviços", { id: t });
      return;
    }
    toast.success("Serviços liberados — todos os quartos prontos para iniciar", { id: t });
    await carregar();
  }, [carregar, unidadeAtiva]);


  const filtrados = useMemo(() => {
    return quartos.filter((q) => {
      if (q.property !== unidadeAtiva) return false;
      if (filtro === "Limpo" && q.status !== "clean") return false;
      if (filtro === "Sujo" && q.status !== "dirty") return false;
      if (filtro === "Manutenção" && q.condition !== "maintenance") return false;
      const alvo = `${q.room_number} ${q.room_type ?? ""} ${q.guest_name ?? ""}`.toLowerCase();
      if (busca && !alvo.includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [quartos, unidadeAtiva, filtro, busca]);

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <div className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-sm">
        <div>
          <h1 className="text-xl font-bold">Camareiras</h1>
          <p className="text-xs text-slate-400">Mapa de tarefas diárias sincronizado ao Cloudbeds</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRecadoRecepcaoOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full font-bold text-xs sm:text-sm text-white bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-indigo-500/40 hover:brightness-110 active:scale-95 transition-all"
          >
            <MessageSquarePlus size={16} />
            <span className="hidden xs:inline sm:inline">Recado recepção</span>
          </button>
          <button
            onClick={sincronizar}
            disabled={syncing}
            className="p-2 bg-slate-800 rounded-lg disabled:opacity-60"
            aria-label="Sincronizar"
          >
            <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>


      <div className="p-4 bg-white border-b space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar quarto, tipo ou hóspede..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setExtraTasksOpen(true)}
            className="flex-1 min-w-[160px] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 transition-all"
          >
            <ListChecks size={16} />
            Tarefas Extras
          </button>
          <button
            onClick={() => setLaundryOpen(true)}
            className="flex-1 min-w-[160px] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-br from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white flex items-center justify-center gap-2 shadow-md shadow-sky-500/20 transition-all"
          >
            <Shirt size={16} />
            Lavanderia
          </button>
          <button
            onClick={() => setAlmoxarifadoOpen(true)}
            className="flex-1 min-w-[160px] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white flex items-center justify-center gap-2 shadow-md shadow-purple-500/20 transition-all"
          >
            <Package size={16} />
            Almoxarifado
          </button>
          <button
            onClick={resetarServicosTurno}
            className="px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 shadow-sm"
            title="Resetar serviços concluídos para 'Iniciar Serviço'"
          >
            <RefreshCw size={12} />
            Resetar Turno
          </button>
        </div>

      </div>

      <PeriodChecklistSection unidade={unidadeAtiva} camareiraName={nomeAutomatico} />

      <RecadosCamareirasSection unidade={unidadeAtiva} camareiraName={nomeAutomatico ?? ""} />

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">

        {loading && quartos.length === 0 ? (
          <div className="col-span-2">
            <LoadingState label="Sincronizando tarefas com a agenda do Cloudbeds..." />
          </div>
        ) : erro && quartos.length === 0 ? (
          <div className="col-span-2">
            <ErrorState
              title="Não foi possível carregar as tarefas"
              description={erro}
              onRetry={carregar}
              retrying={loading}
            />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="col-span-2">
            <EmptyState
              title={`Nenhum quarto encontrado em INJOY ${unidadeAtiva}`}
              description={
                busca || filtro !== "Todos"
                  ? "Ajuste os filtros ou a busca para ver mais quartos."
                  : "Toque em sincronizar para buscar tarefas do Cloudbeds."
              }
            />
          </div>
        ) : (
          filtrados.map((q) => {
            const bloqueado = q.condition === "maintenance";
            const motivoBloqueio =
              (q.room_comment && q.room_comment.trim()) ||
              "Quarto em manutenção / fora de operação";
            return (
            <div
              key={`${q.property}-${q.room_number}`}
              className={cn(
                "relative bg-white rounded-2xl p-5 shadow-sm space-y-4",
                bloqueado
                  ? "border-2 border-red-500 ring-2 ring-red-200 shadow-red-100"
                  : "border border-slate-100",
              )}
            >
              {bloqueado && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-3 -right-3 sm:-top-4 sm:-right-4 z-10"
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-600 border-4 border-white shadow-lg flex items-center justify-center animate-pulse">
                    <Ban size={28} strokeWidth={3} className="text-white" />
                  </div>
                </div>
              )}

              <div className="flex justify-between items-start gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">
                    Quarto APT {q.room_number}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">{q.room_type || "—"}</p>
                </div>
                <div className={cn("flex items-center gap-2", bloqueado && "pr-10 sm:pr-12")}>
                  <span
                    className={cn("w-3 h-3 rounded-full", corLegenda(q.color_code))}
                    title={`Estado Cloudbeds: ${q.color_code ?? "—"}`}
                  />
                  {(() => {
                    const tarefaExibida = formatTaskLabel(q.assigned_task);
                    return (
                      <span
                        className={cn(
                          "text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-wide border-2",
                          estiloTarefa(tarefaExibida),
                        )}
                      >
                        {tarefaExibida}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {bloqueado && (
                <div className="rounded-xl border-2 border-red-500 bg-red-50 p-3 flex items-start gap-3 shadow-inner">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
                    <Ban size={22} strokeWidth={3} className="text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-700">
                      Quarto Bloqueado
                    </p>
                    <p className="text-sm font-bold text-red-900 leading-snug break-words">
                      {motivoBloqueio}
                    </p>
                  </div>
                </div>
              )}

              <RecadosDoQuartoSection
                unidade={q.property}
                roomNumber={q.room_number}
                camareiraName={nomeAutomatico ?? ""}
              />

              {q.blink_troca && (
                <span className="w-full text-center inline-flex items-center justify-center gap-1 text-xs font-black bg-red-600 text-white py-2 rounded-xl animate-pulse tracking-widest border-2 border-white shadow-md">
                  ⚠️ TROCA NO CHECK-OUT! (ATENÇÃO)
                </span>
              )}


              <div className="border-t border-b border-dashed border-slate-200 py-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <User size={15} className="text-slate-400" />
                  <span>{q.guest_name || "Quarto Vazio"}</span>
                  {q.pax && q.pax > 0 ? (
                    <span className="text-[10px] font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {q.pax} pax
                    </span>
                  ) : null}
                </div>
                {q.arrival_time &&
                q.guest_name &&
                q.guest_name !== "Quarto Vazio" ? (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Clock size={13} className="text-slate-400" />
                    <span>Chegada:</span>
                    <span className="font-bold text-slate-800">{q.arrival_time}</span>
                  </div>
                ) : null}

                {(q.has_pending_payment || q.has_pending_docs) &&
                q.guest_name &&
                q.guest_name !== "Quarto Vazio" ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {q.has_pending_payment && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-red-50 text-red-700 px-2 py-1 rounded-md border border-red-200">
                        <DollarSign size={12} />
                        RECEBER NO BALCÃO
                        {q.pending_payment_amount && q.pending_payment_amount > 0 ? (
                          <span className="ml-1 bg-red-600 text-white px-1.5 py-0.5 rounded font-black tracking-wide">
                            {q.pending_payment_amount.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                          </span>
                        ) : null}
                      </span>
                    )}
                    {q.has_pending_docs && q.has_pending_payment && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-amber-50 text-amber-700 px-2 py-1 rounded-md border border-amber-200">
                        <FileText size={12} /> DOC PENDENTE
                      </span>
                    )}
                  </div>
                ) : null}
              </div>


              <div className="flex justify-between items-center text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="flex items-center gap-1 font-semibold">
                  {q.status === "clean" ? (
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  ) : (
                    <AlertTriangle size={16} className="text-amber-500" />
                  )}
                  Quarto {q.status === "clean" ? "Limpo" : "Sujo"}
                </span>
                <span className="flex items-center gap-1 font-semibold">
                  <Hammer
                    size={16}
                    className={q.condition === "maintenance" ? "text-red-500" : "text-slate-400"}
                  />
                  Condição: {q.condition === "maintenance" ? "Em Manutenção" : "Normal"}
                </span>
              </div>

              {q.service_status === "in_progress" && q.assigned_camareira && (
                <div className="flex items-center justify-center gap-2 bg-yellow-50 border-2 border-yellow-400 rounded-xl py-2 px-3">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider">Serviço em andamento —</span>
                  <span className="text-sm font-black text-yellow-900">
                    {q.assigned_camareira}
                  </span>
                </div>
              )}

              {q.service_status === "done" && q.assigned_camareira && (
                <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl py-2 px-3">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-800">
                    Concluído por {q.assigned_camareira}
                  </span>
                </div>
              )}

              {q.is_dnd ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-red-50 border-2 border-red-500 rounded-xl p-3">
                    {q.dnd_photo_url ? (
                      <img
                        src={q.dnd_photo_url}
                        alt="Placa Não Perturbe"
                        className="w-14 h-14 rounded-lg object-cover border border-red-200"
                      />
                    ) : null}
                    <div className="flex-1">
                      <p className="text-[11px] font-black text-red-700 uppercase tracking-wider">
                        🚫 Não Perturbe Ativado
                      </p>
                      <p className="text-xs text-red-600 mt-0.5">
                        Faxina bloqueada para este quarto hoje.
                      </p>
                    </div>
                  </div>
                  <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-200 text-slate-500 font-black text-sm uppercase tracking-wider cursor-not-allowed">
                    <Ban size={16} />
                    Serviço Indisponível
                  </div>
                </div>
              ) : (
                <>
                  {q.service_status === "done" ? (
                    <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-black text-sm shadow-sm uppercase tracking-wider">
                      <CheckCircle2 size={16} />
                      Serviço Feito
                    </div>
                  ) : q.service_status === "in_progress" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => finalizarServico(q)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-sm transition-colors"
                      >
                        <CheckCircle2 size={16} />
                        Finalizar Serviço
                      </button>
                      <button
                        onClick={() => setDndPara(q)}
                        className="px-3 py-3 rounded-xl bg-white border-2 border-red-500 text-red-600 hover:bg-red-50 font-black text-xs shadow-sm transition-colors flex items-center gap-1"
                        aria-label="Não Perturbe"
                      >
                        <Ban size={16} />
                        Não Perturbe
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (nomeAutomatico) {
                            iniciarServico(q, nomeAutomatico);
                          } else {
                            setSelecionarPara(q);
                          }
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition-colors"
                      >
                        <Play size={16} />
                        Iniciar Serviço
                      </button>
                      <button
                        onClick={() => setDndPara(q)}
                        className="px-3 py-3 rounded-xl bg-white border-2 border-red-500 text-red-600 hover:bg-red-50 font-black text-xs shadow-sm transition-colors flex items-center gap-1"
                        aria-label="Não Perturbe"
                      >
                        <Ban size={16} />
                        Não Perturbe
                      </button>
                    </div>
                  )}
                </>
              )}

              {q.property === "Ipanema" && !q.is_dnd && isCheckInTask(q.assigned_task) && (
                <button
                  onClick={() => setVistoriaPara(q)}
                  className="w-full py-2.5 rounded-xl font-bold text-sm border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-2"
                >
                  <ClipboardCheck size={16} /> 🔍 Vistoriar Quarto
                </button>
              )}

              <textarea
                value={comentarios[`${q.property}-${q.room_number}`] ?? q.room_comment ?? ""}
                onChange={(e) =>
                  setComentarios((prev) => ({
                    ...prev,
                    [`${q.property}-${q.room_number}`]: e.target.value,
                  }))
                }
                onBlur={(e) => salvarComentario(q, e.target.value)}
                placeholder="Adicionar comentário ou observação do quarto..."
                rows={2}
                className="w-full mt-1 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-400 outline-none p-3 resize-none text-slate-700"
              />
            </div>
            );
          })
        )}
      </div>

      {selecionarPara && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setSelecionarPara(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-black text-slate-800">Quem vai fazer o serviço?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quarto APT {selecionarPara.room_number} — INJOY {selecionarPara.property}
                </p>
              </div>
              <button
                onClick={() => setSelecionarPara(null)}
                className="p-2 rounded-lg hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-3 space-y-2">
              {funcionarios.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">
                  Nenhuma funcionária cadastrada.
                </p>
              ) : (
                funcionarios.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => iniciarServico(selecionarPara, f.nome)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      {f.nome.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-slate-800 text-sm">{f.nome}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {dndPara && (
        <DndModal
          open={!!dndPara}
          onClose={() => setDndPara(null)}
          unidade={dndPara.property}
          roomNumber={dndPara.room_number}
          camareiraName={dndPara.assigned_camareira ?? nomeAutomatico}
          taskName={dndPara.assigned_task}
          startedAt={dndPara.service_started_at}
          comment={
            comentarios[`${dndPara.property}-${dndPara.room_number}`] ??
            dndPara.room_comment
          }
        />
      )}

      {vistoriaPara && (
        <VistoriaModal
          open={!!vistoriaPara}
          onClose={() => setVistoriaPara(null)}
          onSuccess={() => carregar()}
          unidade={vistoriaPara.property}
          roomNumber={vistoriaPara.room_number}
        />
      )}

      <ExtraTasksModal
        open={extraTasksOpen}
        onClose={() => setExtraTasksOpen(false)}
        unidade={unidadeAtiva}
        camareiraName={nomeAutomatico ?? ""}
      />

      <LaundryModal
        open={laundryOpen}
        onClose={() => setLaundryOpen(false)}
        unidade={unidadeAtiva}
        camareiraName={nomeAutomatico ?? ""}
      />

      <RetiradaAlmoxarifadoModal
        open={almoxarifadoOpen}
        onClose={() => setAlmoxarifadoOpen(false)}
        unidade={unidadeAtiva}
        funcionarioName={nomeAutomatico ?? ""}
      />

      <RecadoRecepcaoModal
        open={recadoRecepcaoOpen}
        onClose={() => setRecadoRecepcaoOpen(false)}
        unidade={unidadeAtiva}
        autorNome={nomeAutomatico ?? ""}
      />
    </div>
  );
}
