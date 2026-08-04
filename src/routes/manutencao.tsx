import { createFileRoute } from "@tanstack/react-router";
import {
  Cog,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Calendar,
  Clock,
  Wrench,
  Pencil,
  Plus,
  Trash2,
  Settings2,
  Loader2,
  History,
  ImageIcon,
  LayoutDashboard,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUnidade } from "@/lib/unidade-context";
import { useMe, useChamados } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MediaCapture } from "@/components/media-capture";
import type { Midia } from "@/lib/store";
import { AreasComunsManager, useAreasComuns, useQuartos } from "@/components/manutencao/areas-comuns-manager";
import { InspectionImage } from "@/components/InspectionImage";

export const Route = createFileRoute("/manutencao")({
  head: () => ({
    meta: [
      { title: "Manutenção Preventiva — INJOY" },
      { name: "description", content: "Painel de manutenção preventiva do hotel." },
      { property: "og:title", content: "Manutenção Preventiva — INJOY" },
      { property: "og:description", content: "Painel de manutenção preventiva recorrente do InJoy Hotéis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManutencaoPage,
});

type TaskCategory = "Quarto" | "Área Comum";

interface PreventiveTask {
  id: string;
  category: TaskCategory;
  task_name: string;
  frequency_days: number;
  active: boolean;
}

interface PreventiveLog {
  id: string;
  property: string;
  category: string;
  location_name: string;
  task_id: string;
  technician_name: string;
  completed_at: string;
  next_due_date: string;
}

const QUARTOS_IPANEMA = ["01","02","103","104","205","206","307","308","309","410","411","412"];
const QUARTOS_BOTAFOGO = ["01","02","03","05","06","107","108","109","110","111","112","113","114","115","117","118","301","401","501"];

function usePreventiveTasks(property: string) {
  return useQuery({
    queryKey: ["preventive_tasks", property],
    queryFn: async (): Promise<PreventiveTask[]> => {
      const { data, error } = await supabase
        .from("preventive_tasks" as never)
        .select("*")
        .eq("property", property)
        .order("category")
        .order("task_name");
      if (error) throw error;
      return (data as PreventiveTask[]) ?? [];
    },
  });
}

function usePreventiveLogs(property: string) {
  return useQuery({
    queryKey: ["preventive_logs", property],
    queryFn: async (): Promise<PreventiveLog[]> => {
      const { data, error } = await supabase
        .from("preventive_logs" as never)
        .select("*")
        .eq("property", property)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data as PreventiveLog[]) ?? [];
    },
  });
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

interface LocationTaskStatus {
  task: PreventiveTask;
  lastLogId: string | null;
  lastCompletedAtIso: string | null;
  lastCompletedAt: Date | null;
  lastTechnician: string | null;
  nextDue: Date | null;
  daysToDue: number | null; // positive = due in X days; negative = overdue X days
}

function computeStatus(tasks: PreventiveTask[], logs: PreventiveLog[]): LocationTaskStatus[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return tasks.map((t) => {
    const rel = logs
      .filter((l) => l.task_id === t.id)
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
    if (rel.length === 0) {
      return {
        task: t,
        lastLogId: null,
        lastCompletedAtIso: null,
        lastCompletedAt: null,
        lastTechnician: null,
        nextDue: null,
        daysToDue: -9999,
      };
    }
    const last = rel[0];
    const lastAt = new Date(last.completed_at);
    const next = new Date(last.next_due_date + "T00:00:00");
    return {
      task: t,
      lastLogId: last.id,
      lastCompletedAtIso: last.completed_at,
      lastCompletedAt: lastAt,
      lastTechnician: last.technician_name,
      nextDue: next,
      daysToDue: daysBetween(next, today),
    };
  });
}

function fmtDateOnly(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toDateInputValue(iso?: string | null) {
  if (!iso) return "";
  return iso.split("T")[0] ?? "";
}

type LocationHealth = "atrasado" | "vence-breve" | "em-dia";
function locationHealth(status: LocationTaskStatus[]): LocationHealth {
  if (status.some((s) => (s.daysToDue ?? 0) < 0)) return "atrasado";
  if (status.some((s) => (s.daysToDue ?? 999) <= 5)) return "vence-breve";
  return "em-dia";
}

function usePreventiveRealtime(unidade: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`manutencao-preventiva-sync-${unidade}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "preventive_tasks" },
        () => {
          qc.invalidateQueries({ queryKey: ["preventive_tasks"] });
          qc.invalidateQueries({ queryKey: ["preventive_tasks_all"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "preventive_logs" },
        () => {
          qc.invalidateQueries({ queryKey: ["preventive_logs"] });
          qc.invalidateQueries({ queryKey: ["preventive_logs_all"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, unidade]);
}

function ManutencaoPage() {
  const { unidade } = useUnidade();
  const { data: me } = useMe();
  const tasksQ = usePreventiveTasks(unidade);
  const logsQ = usePreventiveLogs(unidade);
  const { data: chamados = [], isLoading: loadingChamados } = useChamados();

  const isAdmin = !!me && (me.isAdmin || me.isGestor);

  usePreventiveRealtime(unidade);

  const [tab, setTab] = useState<string>("painel");

  return (
    <div className="flex-1 flex flex-col w-full h-full p-4 md:p-8 items-start justify-start bg-slate-50 overflow-x-hidden">
      <div className="w-full flex flex-col gap-8 items-start justify-start">
        <div className="w-full flex flex-col items-start">
          <span className="text-sm font-medium text-teal-600 bg-teal-50 px-3 py-1 rounded-full">
            Manutenção preventiva • Recorrente
          </span>
          <h1 className="text-3xl font-bold mt-4">Manutenção</h1>
          <p className="text-muted-foreground mt-1">
            Agendamento recorrente por local — {unidade}
          </p>
        </div>

        <PainelPreventiva
          unidade={unidade}
          tasks={tasksQ.data ?? []}
          logs={logsQ.data ?? []}
          loading={tasksQ.isLoading || logsQ.isLoading}
          me={me}
        />

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList>
            <TabsTrigger value="painel">
              <Cog className="h-4 w-4 mr-1.5" /> Painel administrativo
            </TabsTrigger>
            <TabsTrigger value="historico">
              <History className="h-4 w-4 mr-1.5" /> Histórico
            </TabsTrigger>
            <TabsTrigger value="painel-chamados">
              <LayoutDashboard className="h-4 w-4 mr-1.5" /> Painel
            </TabsTrigger>
            <TabsTrigger value="admin">
              <Settings2 className="h-4 w-4 mr-1.5" /> Tarefas & Prazos
            </TabsTrigger>
          </TabsList>
          <TabsContent value="painel" className="mt-6" />
          <TabsContent value="historico" className="mt-6">
            <HistoricoPreventiva logs={logsQ.data ?? []} loading={logsQ.isLoading} setTab={setTab} />
          </TabsContent>
          <TabsContent value="painel-chamados" className="mt-6">
            <ChamadosHistoricoView chamados={chamados} loading={loadingChamados} />
          </TabsContent>
          <TabsContent value="admin" className="mt-6">
            <AdminTarefas
              tasks={tasksQ.data ?? []}
              unidade={unidade}
              readOnly={!isAdmin}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}



function PainelPreventiva({
  unidade,
  tasks,
  logs,
  loading,
  me,
}: {
  unidade: string;
  tasks: PreventiveTask[];
  logs: PreventiveLog[];
  loading: boolean;
  me: ReturnType<typeof useMe>["data"];
}) {
  const [selected, setSelected] = useState<{ category: TaskCategory; name: string } | null>(null);
  const [filter, setFilter] = useState<"todos" | "atrasado" | "vence-breve" | "em-dia">("todos");
  const [manageOpen, setManageOpen] = useState(false);
  const areasComuns = useAreasComuns(unidade);
  const isAdmin = !!me && (me.isAdmin || me.isGestor);

  const quartos = useQuartos(unidade);

  const locations = useMemo(() => {
    const roomLocs = quartos.map((n) => ({ category: "Quarto" as TaskCategory, name: `Quarto ${n}` }));
    const areaLocs = areasComuns.map((n) => ({ category: "Área Comum" as TaskCategory, name: n }));
    return [...roomLocs, ...areaLocs];
  }, [quartos, areasComuns]);

  const locationsWithStatus = useMemo(() => {
    return locations.map((loc) => {
      const catTasks = tasks.filter((t) => {
        if (!t.active || t.category !== loc.category) return false;
        if (loc.category !== "Área Comum") return true;
        const scope = (t as { discipline?: string | null }).discipline;
        return !scope || scope === loc.name;
      });
      const locLogs = logs.filter((l) => l.location_name === loc.name);
      const status = computeStatus(catTasks, locLogs);
      return { ...loc, status, health: locationHealth(status) };
    });
  }, [locations, tasks, logs]);

  const totals = useMemo(() => {
    const total = locationsWithStatus.length;
    const atrasados = locationsWithStatus.filter((l) => l.health === "atrasado").length;
    const emDia = locationsWithStatus.filter((l) => l.health === "em-dia").length;
    const venceBreve = locationsWithStatus.filter((l) => l.health === "vence-breve").length;
    return { total, atrasados, emDia, venceBreve };
  }, [locationsWithStatus]);

  const filtered = locationsWithStatus.filter((l) => filter === "todos" || l.health === filter);

  if (loading) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Carregando…</Card>;
  }

  return (
    <>
      <div className="w-full grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total"
          value={totals.total}
          tone="bg-primary/10 text-primary"
          border="border-2 border-primary/60"
          activeBorder="border-primary"
          active={filter === "todos"}
          onClick={() => setFilter("todos")}
        />
        <StatCard
          label="Em dia"
          value={totals.emDia}
          tone="bg-success/15 text-success"
          border="border-2 border-success/60"
          activeBorder="border-success"
          active={filter === "em-dia"}
          onClick={() => setFilter("em-dia")}
        />
        <StatCard
          label="Vence em breve"
          value={totals.venceBreve}
          tone="bg-amber-500/15 text-amber-600"
          border="border-2 border-amber-500/60"
          activeBorder="border-amber-500"
          active={filter === "vence-breve"}
          onClick={() => setFilter("vence-breve")}
        />
        <StatCard
          label="A fazer"
          value={totals.atrasados}
          tone="bg-destructive/15 text-destructive"
          border="border-2 border-destructive/60"
          activeBorder="border-destructive"
          active={filter === "atrasado"}
          onClick={() => setFilter("atrasado")}
          pulse={totals.atrasados > 0}
        />
      </div>

      <div className="w-full flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {filter === "todos" && `Todos os locais (${filtered.length})`}
          {filter === "em-dia" && `Em dia (${filtered.length})`}
          {filter === "vence-breve" && `Vence em breve (${filtered.length})`}
          {filter === "atrasado" && `A fazer / Atrasado (${filtered.length})`}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setManageOpen(true)}
            className="h-7 text-xs"
            disabled={!isAdmin}
            title={!isAdmin ? "Somente a gestão pode alterar" : undefined}
          >
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            Gerenciar todos os locais
          </Button>
          {filter !== "todos" && (
            <Button variant="ghost" size="sm" onClick={() => setFilter("todos")} className="h-7 text-xs">
              Limpar filtro
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum local neste filtro.
        </Card>
      )}



      <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filtered.map((loc) => {
          const lastLog = loc.status
            .map((s) => s.lastCompletedAt)
            .filter((d): d is Date => !!d)
            .sort((a, b) => b.getTime() - a.getTime())[0];
          const lastTech =
            loc.status.find((s) => s.lastCompletedAt && s.lastCompletedAt.getTime() === lastLog?.getTime())?.lastTechnician ?? "Cristiano";
          const pendentes = loc.status.filter((s) => (s.daysToDue ?? 0) < 0).length;
          const proxima = loc.status
            .map((s) => s.nextDue)
            .filter((d): d is Date => !!d)
            .sort((a, b) => a.getTime() - b.getTime())[0];
          const Icon = loc.category === "Quarto" ? MapPin : Wrench;
          const iconTone =
            loc.health === "em-dia"
              ? "bg-success/10 text-success"
              : loc.health === "vence-breve"
                ? "bg-amber-500/10 text-amber-600"
                : "bg-destructive/10 text-destructive";
          const statusTone =
            loc.health === "em-dia"
              ? "bg-success/10 text-success border-success/30"
              : loc.health === "vence-breve"
                ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                : "bg-destructive/15 text-destructive border-destructive/30";
          const StatusIcon = loc.health === "em-dia" ? CheckCircle2 : loc.health === "vence-breve" ? Clock : AlertTriangle;
          const statusLabel = loc.health === "em-dia" ? "EM DIA" : loc.health === "vence-breve" ? "VENCE EM BREVE" : "ATRASADO";
          return (
            <div
              key={loc.name}
              className="relative bg-card border rounded-xl p-5 flex flex-col gap-4 shadow-sm w-full"
            >
              {/* CABEÇALHO DO CARD - ESTRUTURA À PROVA DE FALHAS */}


              <div className="flex flex-row items-start justify-between w-full gap-2">
                
                {/* Bloco da Esquerda: Ícone + Textos */}
                <div className="flex flex-row items-start gap-3">
                  
                  {/* Ícone */}
                  <div className={cn("flex-shrink-0 p-2 rounded-lg mt-0.5", iconTone)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  
                  {/* Textos */}
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      {loc.category}
                    </span>

                    {/* Título sem truncate para impedir o erro do 'Q...' */}
                    <h3 className="text-lg font-bold text-slate-900 whitespace-nowrap mt-0.5 flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          "inline-block h-2.5 w-2.5 rounded-full ring-4 shrink-0",
                          loc.health === "em-dia" && "bg-success ring-success/20",
                          loc.health === "vence-breve" && "bg-amber-500 ring-amber-500/20",
                          loc.health === "atrasado" && "bg-destructive ring-destructive/20 animate-pulse",
                        )}
                      />
                      {loc.name}
                    </h3>

                    
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {unidade}
                    </span>
                  </div>

                </div>

                {/* Bloco da Direita: Badge */}
                <div className="flex-shrink-0">
                  <span className={cn("inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-[10px] font-bold border whitespace-nowrap", statusTone)}>
                    <StatusIcon className="w-3 h-3" />
                    {statusLabel}
                  </span>
                </div>

              </div>


              {/* 2. CORPO */}
              <div className="flex flex-col gap-2.5 text-sm text-muted-foreground mt-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Calendar className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                  <span className="truncate">
                    Última: {lastLog ? lastLog.toLocaleDateString("pt-BR") : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Wrench className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                  <span className="truncate">
                    Técnico:{" "}
                    <strong className="font-semibold text-foreground">{lastTech}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  {loc.health === "atrasado" ? (
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  ) : (
                    <Clock
                      className={cn(
                        "w-4 h-4 shrink-0",
                        loc.health === "vence-breve"
                          ? "text-amber-500"
                          : "text-muted-foreground/70",
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "truncate font-medium",
                      loc.health === "atrasado"
                        ? "text-destructive"
                        : loc.health === "vence-breve"
                          ? "text-amber-600"
                          : "text-foreground",
                    )}
                  >
                    Próxima: {proxima ? proxima.toLocaleDateString("pt-BR") : "Imediata"}{" "}
                    <span className="text-xs font-normal opacity-70">
                      ({pendentes} pend.)
                    </span>
                  </span>
                </div>
              </div>

              {/* 3. BOTÃO */}
              <Button
                variant={loc.health === "atrasado" ? "default" : "outline"}
                className="w-full mt-2"
                onClick={() => setSelected({ category: loc.category, name: loc.name })}
              >
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Abrir Checklist
              </Button>
            </div>
          );
        })}
      </div>

      <ChecklistModal
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        location={selected}
        property={unidade}
        tasks={tasks}
        logs={logs}
        defaultTechnician="Cristiano"
        canAdjustDates={!!me && (me.isAdmin || me.isGestor)}
      />
      <AreasComunsManager open={manageOpen} onOpenChange={setManageOpen} unidade={unidade} />
    </>
  );
}

function StatusBadge({ health }: { health: LocationHealth }) {
  if (health === "atrasado") {
    return (
      <Badge className="shrink-0 bg-destructive/15 text-destructive border-destructive/30 whitespace-nowrap" variant="outline">
        <AlertTriangle className="h-3 w-3 mr-1" /> ATRASADO
      </Badge>
    );
  }
  if (health === "vence-breve") {
    return (
      <Badge className="shrink-0 bg-amber-500/15 text-amber-600 border-amber-500/30 whitespace-nowrap" variant="outline">
        <Clock className="h-3 w-3 mr-1" /> VENCE EM BREVE
      </Badge>
    );
  }
  return (
    <Badge className="shrink-0 bg-success/10 text-success border-success/30 whitespace-nowrap" variant="outline">
      <CheckCircle2 className="h-3 w-3 mr-1" /> EM DIA
    </Badge>
  );
}

function StatCard({
  label,
  value,
  tone,
  border,
  activeBorder,
  active,
  onClick,
  pulse,
}: {
  label: string;
  value: number;
  tone: string;
  border?: string;
  activeBorder?: string;
  active?: boolean;
  onClick?: () => void;
  pulse?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left transition-all rounded-xl",
        "hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Card className={cn("p-4 h-full", border, active && activeBorder, active && "shadow-md")}>
        <div className={cn("inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold mb-2", tone)}>
          {label}
        </div>
        <div className={cn("text-3xl font-bold tracking-tight", pulse && "animate-pulse text-destructive")}>
          {value}
        </div>
      </Card>
    </button>
  );
}

function ChecklistModal({
  open,
  onOpenChange,
  location,
  property,
  tasks,
  logs,
  defaultTechnician,
  canAdjustDates,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  location: { category: TaskCategory; name: string } | null;
  property: string;
  tasks: PreventiveTask[];
  logs: PreventiveLog[];
  defaultTechnician: string;
  canAdjustDates: boolean;
}) {
  const qc = useQueryClient();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [tecnico, setTecnico] = useState(defaultTechnician || "Cristiano");
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
  const [taskMidias, setTaskMidias] = useState<Record<string, Midia[]>>({});
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<{
    logId: string;
    task: PreventiveTask;
    taskName: string;
    completedAt: string;
  } | null>(null);
  const [executionDate, setExecutionDate] = useState("");

  const catTasks = location
    ? tasks.filter((t) => {
        if (!t.active || t.category !== location.category) return false;
        if (location.category !== "Área Comum") return true;
        const scope = (t as { discipline?: string | null }).discipline;
        return !scope || scope === location.name;
      })
    : [];
  const locLogs = location ? logs.filter((l) => l.location_name === location.name) : [];
  const status = computeStatus(catTasks, locLogs);

  const marcados = Object.values(checked).filter(Boolean).length;

  const submit = useMutation({
    mutationFn: async () => {
      if (!location) throw new Error("Local não selecionado");
      const nowIso = new Date().toISOString();
      
      const selectedTasks = catTasks.filter((t) => checked[t.id]);
      if (selectedTasks.length === 0) throw new Error("Marque ao menos uma tarefa");
      if (!tecnico.trim()) throw new Error("Informe o técnico");

      // Validar que cada tarefa marcada possui pelo menos uma mídia
      for (const t of selectedTasks) {
        const midias = taskMidias[t.id] ?? [];
        if (midias.length === 0) {
          throw new Error(`A tarefa "${t.task_name}" exige pelo menos uma foto ou vídeo.`);
        }
      }

      const rows = selectedTasks.map((t) => {
        return {
          property,
          category: location.category,
          location_name: location.name,
          task_id: t.id,
          technician_name: tecnico.trim(),
          frequency_days: t.frequency_days,
          notes: (taskNotes[t.id] || "").trim() || null,
          midias: taskMidias[t.id] ?? [],
          completed_at: nowIso,
        };
      });

      const { error } = await supabase.from("preventive_logs" as never).insert(rows as never);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => {
      toast.success("Checklist salvo com sucesso!");
      qc.invalidateQueries({ queryKey: ["preventive_logs"] });
      qc.invalidateQueries({ queryKey: ["preventive_tasks"] });
      setChecked({});
      setTaskNotes({});
      setTaskMidias({});
      onOpenChange(false);
    },
    onError: (e: Error) => {
      if (e.message === "Marque ao menos uma tarefa" || e.message === "Informe o técnico") {
        toast.error(e.message);
      } else {
        toast.error("Erro ao salvar manutenção. Tente novamente.");
      }
    },

  });

  const adjustDate = useMutation({
    mutationFn: async () => {
      if (!editingDate) throw new Error("Selecione uma manutenção para ajustar.");
      if (!executionDate) throw new Error("Informe a data executada.");

      const { data: rows, error } = await supabase.rpc("adjust_preventive_log_date", {
        _log_id: editingDate.logId,
        _new_date: executionDate,
      });
      if (error) throw new Error(error.message);
      const updated = Array.isArray(rows) ? rows[0] : rows;
      if (!updated) throw new Error("Registro de manutenção não encontrado.");

      return updated as { id: string; next_due_date: string };
    },
    onSuccess: async (updated) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["preventive_logs"] }),
        qc.invalidateQueries({ queryKey: ["preventive_logs_all"] }),
      ]);
      toast.success(`Data ajustada. Próxima atividade recalculada para ${fmtDateOnly(updated.next_due_date)}.`);
      setEditingDate(null);
      setExecutionDate("");
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível ajustar a data da manutenção."),
  });

  function renderStatusLabel(s: LocationTaskStatus) {
    if (s.lastCompletedAt === null) {
      return <span className="text-destructive font-medium">Nunca executado</span>;
    }
    const d = s.daysToDue ?? 0;
    if (d < 0) return <span className="text-destructive font-medium">Vencido há {Math.abs(d)} dia(s)</span>;
    if (d <= 5) return <span className="text-amber-600 font-medium">Vence em {d} dia(s)</span>;
    return <span className="text-success font-medium">Vence em {d} dia(s)</span>;
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(42rem,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-teal-600" />
            Checklist de Manutenção
          </DialogTitle>
          <DialogDescription>
            {location?.name} - {property} · {new Date().toLocaleDateString("pt-BR")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Marque as tarefas concluídas hoje</span>
            <Badge variant="secondary">{marcados}/{catTasks.length} marcadas</Badge>
          </div>

          <div className="space-y-2 rounded-lg border bg-card/40 p-3">
            {status.map((s) => {
              const overdue = (s.daysToDue ?? 0) < 0;
              const soon = (s.daysToDue ?? 999) <= 5 && !overdue;
              return (
                <div
                  key={s.task.id}
                  className={cn(
                    "flex items-start gap-3 rounded-md p-2 hover:bg-muted/50 transition-colors border",
                    overdue && "border-destructive/40 bg-destructive/5",
                    soon && "border-amber-500/40 bg-amber-500/5",
                    !overdue && !soon && "border-transparent",
                  )}
                >
                  <Checkbox
                    id={`prev-${s.task.id}`}
                    checked={!!checked[s.task.id]}
                    onCheckedChange={(v) => setChecked((c) => ({ ...c, [s.task.id]: v === true }))}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`prev-${s.task.id}`} className="block cursor-pointer">
                      <div className="text-sm font-medium leading-tight">{s.task.task_name}</div>
                      <div className="text-xs mt-0.5 flex items-center gap-2">
                        {renderStatusLabel(s)}
                        <span className="text-muted-foreground">· a cada {s.task.frequency_days}d</span>
                      </div>
                    </label>
                    {s.lastCompletedAt && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Última: {s.lastCompletedAt.toLocaleDateString("pt-BR")} por {s.lastTechnician}
                      </div>
                    )}
                    {canAdjustDates && s.lastLogId && s.lastCompletedAt && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-8 text-xs"
                        onClick={() => {
                          setEditingDate({
                            logId: s.lastLogId!,
                            task: s.task,
                            taskName: s.task.task_name,
                            completedAt: s.lastCompletedAtIso ?? s.lastCompletedAt!.toISOString(),
                          });
                          setExecutionDate(toDateInputValue(s.lastCompletedAtIso ?? s.lastCompletedAt!.toISOString()));
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Ajustar data executada
                      </Button>
                    )}
                    {checked[s.task.id] && (
                      <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-2">
                        <Label htmlFor={`prev-notes-${s.task.id}`} className="text-xs">
                          Comentário (opcional)
                        </Label>
                        <Textarea
                          id={`prev-notes-${s.task.id}`}
                          value={taskNotes[s.task.id] ?? ""}
                          onChange={(e) =>
                            setTaskNotes((n) => ({ ...n, [s.task.id]: e.target.value }))
                          }
                          placeholder="Observação da execução"
                          rows={2}
                        />
                        <div className="space-y-1">
                          <Label className="text-xs">Fotos e vídeo (até 15s) *</Label>
                          <MediaCapture
                            midias={taskMidias[s.task.id] ?? []}
                            onAdd={(m) =>
                              setTaskMidias((mm) => ({
                                ...mm,
                                [s.task.id]: [...(mm[s.task.id] ?? []), m],
                              }))
                            }
                            onRemove={(url) =>
                              setTaskMidias((mm) => ({
                                ...mm,
                                [s.task.id]: (mm[s.task.id] ?? []).filter((x) => x.url !== url),
                              }))
                            }
                            uploading={uploadingTaskId === s.task.id}
                            setUploading={(v) => setUploadingTaskId(v ? s.task.id : null)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {status.length === 0 && (
              <div className="text-sm text-muted-foreground p-2">Nenhuma tarefa cadastrada para esta categoria.</div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prev-tec">Técnico responsável *</Label>
              <Input
                id="prev-tec"
                value={tecnico}
                onChange={(e) => setTecnico(e.target.value)}
                placeholder="Nome do técnico"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                {new Date().toLocaleDateString("pt-BR")}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || marcados === 0 || !tecnico.trim() || uploadingTaskId !== null}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Salvar Manutenção{marcados > 0 ? ` (${marcados})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog
      open={!!editingDate}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !adjustDate.isPending) {
          setEditingDate(null);
          setExecutionDate("");
        }
      }}
    >
      <DialogContent className="w-[min(28rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Ajustar data executada</DialogTitle>
          <DialogDescription>
            {editingDate
              ? `${location?.name ?? "Local"} — ${editingDate.taskName}. A próxima data será recalculada a partir da data informada.`
              : "Informe a data real da execução."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="maintenance-card-execution-date">Data real da execução</Label>
          <Input
            id="maintenance-card-execution-date"
            type="date"
            value={executionDate}
            onChange={(event) => setExecutionDate(event.target.value)}
            max="2999-12-31"
          />
          {editingDate?.task.frequency_days && (
            <p className="text-xs text-muted-foreground">
              Próxima atividade = data informada + {editingDate.task.frequency_days} dia(s).
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setEditingDate(null);
              setExecutionDate("");
            }}
            disabled={adjustDate.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => adjustDate.mutate()}
            disabled={!editingDate || !executionDate || adjustDate.isPending}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            {adjustDate.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Pencil className="h-4 w-4 mr-2" />
            )}
            Salvar data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function AdminTarefas({
  tasks,
  unidade,
  readOnly = false,
}: {
  tasks: PreventiveTask[];
  unidade: string;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PreventiveTask | null>(null);
  const [creating, setCreating] = useState(false);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("preventive_tasks" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa removida");
      qc.invalidateQueries({ queryKey: ["preventive_tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped: Record<TaskCategory, PreventiveTask[]> = {
    "Quarto": tasks.filter((t) => t.category === "Quarto"),
    "Área Comum": tasks.filter((t) => t.category === "Área Comum"),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Catálogo de tarefas</h2>
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? "Definido pela gestão — atualiza automaticamente."
              : "Ajuste frequências e adicione novas rotinas."}
          </p>
        </div>
        <Button
          onClick={() => setCreating(true)}
          disabled={readOnly}
          title={readOnly ? "Somente a gestão pode alterar" : undefined}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Nova tarefa
        </Button>
      </div>

      {(Object.keys(grouped) as TaskCategory[]).map((cat) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{cat}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {grouped[cat].map((t) => (
              <Card key={t.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.task_name}</div>
                  <div className="text-xs text-muted-foreground">A cada {t.frequency_days} dia(s) · {t.active ? "ativa" : "inativa"}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setEditing(t)} disabled={readOnly}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={readOnly}
                  onClick={() => {
                    if (confirm("Remover esta tarefa? O histórico associado também será removido."))
                      del.mutate(t.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </Card>
            ))}
            {grouped[cat].length === 0 && (
              <Card className="p-4 text-sm text-muted-foreground">Nenhuma tarefa em {cat}.</Card>
            )}
          </div>
        </div>
      ))}

      <TaskEditor
        open={!!editing || creating}
        unidade={unidade}
        task={editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setCreating(false);
          }
        }}
      />
    </div>
  );
}

function TaskEditor({
  open,
  task,
  unidade,
  onOpenChange,
}: {
  open: boolean;
  task: PreventiveTask | null;
  unidade: string;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(task?.task_name ?? "");
  const [category, setCategory] = useState<TaskCategory>(task?.category ?? "Quarto");
  const [freq, setFreq] = useState<number>(task?.frequency_days ?? 30);
  const [active, setActive] = useState<boolean>(task?.active ?? true);

  // reset when task changes
  useMemoResetTask(task, () => {
    setName(task?.task_name ?? "");
    setCategory(task?.category ?? "Quarto");
    setFreq(task?.frequency_days ?? 30);
    setActive(task?.active ?? true);
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome obrigatório");
      if (freq <= 0) throw new Error("Frequência deve ser positiva");
      const payload = {
        task_name: name.trim(),
        category,
        frequency_days: freq,
        active,
      };
      if (task) {
        const { error } = await supabase.from("preventive_tasks" as never).update(payload as never).eq("id", task.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("preventive_tasks" as never)
          .insert({ ...payload, property: unidade } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(task ? "Tarefa atualizada" : "Tarefa criada");
      qc.invalidateQueries({ queryKey: ["preventive_tasks"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(28rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Quarto">Quarto</SelectItem>
                <SelectItem value="Área Comum">Área Comum</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Frequência (dias)</Label>
            <Input
              type="number"
              min={1}
              value={freq}
              onChange={(e) => setFreq(parseInt(e.target.value) || 0)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
            Ativa
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// helper: reset form when target task changes
function useMemoResetTask(task: PreventiveTask | null, fn: () => void) {
  useEffect(() => {
    fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);
}

function HistoricoPreventiva({ logs, loading, setTab }: { logs: PreventiveLog[]; loading: boolean; setTab: (t: string) => void }) {
  if (loading) return <Card className="p-8 text-center">Carregando histórico...</Card>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Histórico de Manutenções</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="bg-orange-500 hover:bg-orange-600 text-white h-7 text-xs px-4"
            onClick={() => setTab("painel-chamados")}
          >
            Painel
          </Button>
          <Badge variant="secondary">{logs.length} registros</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {logs.map((log) => (
          <Card key={log.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded uppercase">
                  {log.category}
                </span>
                <span className="text-sm font-semibold text-slate-900">{log.location_name}</span>
              </div>
              <div className="text-sm font-medium">{log.task_id}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3 w-3" /> {new Date(log.completed_at).toLocaleDateString("pt-BR")}
                <span className="opacity-30">|</span>
                🛠️ {log.technician_name}
                <span className="opacity-30">|</span>
                📍 {log.property}
              </div>
            </div>

            {((log as any).midias?.length > 0) && (
              <div className="flex gap-2 overflow-x-auto py-1">
                {(log as any).midias.map((m: Midia, idx: number) => (
                  <div key={idx} className="relative h-12 w-12 rounded-md border overflow-hidden shrink-0">
                    <InspectionImage stored={m.url} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
        {logs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground bg-white rounded-xl border border-dashed">
            Nenhum registro de manutenção encontrado.
          </div>
        )}
      </div>
    </div>
  );
}

function ChamadosHistoricoView({ chamados, loading }: { chamados: any[]; loading: boolean }) {
  const concluidos = useMemo(() => {
    return chamados
      .filter((c) => c.status === "Concluído")
      .sort((a, b) => new Date(b.concluidoEm || b.criadoEm).getTime() - new Date(a.concluidoEm || a.criadoEm).getTime());
  }, [chamados]);

  if (loading) return <Card className="p-8 text-center">Carregando painel...</Card>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Chamados Finalizados (Painel)</h2>
        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
          {concluidos.length} concluídos
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {concluidos.map((c) => (
          <Card key={c.id} className="p-4 border-l-4 border-l-orange-500">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">{c.descricao}</span>
                <Badge variant="secondary" className="text-[10px]">{c.categoria}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground uppercase font-bold text-[9px]">Técnico</span>
                  <span className="font-medium flex items-center gap-1">
                    <User2 className="h-3 w-3" /> {c.responsavelNome || "—"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground uppercase font-bold text-[9px]">Finalizado em</span>
                  <span className="font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" /> 
                    {c.concluidoEm ? new Date(c.concluidoEm).toLocaleString("pt-BR") : "—"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground uppercase font-bold text-[9px]">Unidade</span>
                  <span className="font-medium flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {c.unidade}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground uppercase font-bold text-[9px]">Aberto por</span>
                  <span className="font-medium">{c.criadoPorNome || "—"}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {concluidos.length === 0 && (
          <div className="text-center py-12 text-muted-foreground bg-white rounded-xl border border-dashed">
            Nenhum chamado concluído no painel.
          </div>
        )}
      </div>
    </div>
  );
}

import { User2 } from "lucide-react";
