import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Wrench,
  MapPin,
  ListChecks,
  Pencil,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GerenciarChecklistsModal } from "@/components/manutencao/gerenciar-checklists-modal";
import type { Unidade } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/historico-manutencao")({
  head: () => ({
    meta: [
      { title: "Histórico de Manutenção — INJOY" },
      {
        name: "description",
        content: "Histórico de manutenção preventiva, datas executadas e próximas atividades.",
      },
      { property: "og:title", content: "Histórico de Manutenção — INJOY" },
      {
        property: "og:description",
        content: "Acompanhe preventivas executadas, pendências e próximas manutenções do InJoy Hotéis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoricoManutencaoPage,
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
  task?: {
    task_name: string;
    category: string;
    frequency_days: number;
  } | null;
}

const QUARTOS_IPANEMA = [
  "01",
  "02",
  "103",
  "104",
  "205",
  "206",
  "307",
  "308",
  "309",
  "410",
  "411",
  "412",
];
const QUARTOS_BOTAFOGO = [
  "01",
  "02",
  "03",
  "05",
  "06",
  "107",
  "108",
  "109",
  "110",
  "111",
  "112",
  "113",
  "114",
  "115",
  "117",
  "118",
  "301",
  "401",
  "501",
];
const AREAS_COMUNS = ["Recepção", "Corredores", "Fachada", "Jardim de Inverno", "Pátio", "Cozinha"];

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtDateOnly(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toDateInputValue(iso?: string | null) {
  if (!iso) return "";
  return iso.split("T")[0] ?? "";
}

function HistoricoManutencaoPage() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [unidade, setUnidade] = useState<Unidade | "Todas">("Todas");
  const [mes, setMes] = useState<number>(now.getMonth());
  const [ano, setAno] = useState<number>(now.getFullYear());
  const [tab, setTab] = useState<"executados" | "pendentes">("executados");
  const [gerenciarOpen, setGerenciarOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<PreventiveLog | null>(null);
  const [executionDate, setExecutionDate] = useState("");

  const adjustDateMutation = useMutation({
    mutationFn: async ({ log, date }: { log: PreventiveLog; date: string }) => {
      if (!date) throw new Error("Informe a data executada.");

      const { data: rows, error } = await supabase.rpc("adjust_preventive_log_date", {
        _log_id: log.id,
        _new_date: date,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw new Error("Registro de manutenção não encontrado.");

      return row as Pick<PreventiveLog, "id" | "completed_at" | "next_due_date">;
    },
    onSuccess: async (updated) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["preventive_logs_all"] }),
        queryClient.invalidateQueries({ queryKey: ["preventive_logs"] }),
      ]);
      toast.success(
        `Data ajustada. Próxima atividade recalculada para ${fmtDateOnly(updated.next_due_date)}.`,
      );
      setEditingLog(null);
      setExecutionDate("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Não foi possível ajustar a data da manutenção.");
    },
  });

  const tasksQ = useQuery({
    queryKey: ["preventive_tasks"],
    queryFn: async (): Promise<PreventiveTask[]> => {
      const { data, error } = await supabase
        .from("preventive_tasks" as never)
        .select("*")
        .eq("active", true);
      if (error) throw error;
      return (data as PreventiveTask[]) ?? [];
    },
  });

  const logsQ = useQuery({
    queryKey: ["preventive_logs_all"],
    queryFn: async (): Promise<PreventiveLog[]> => {
      const { data, error } = await supabase
        .from("preventive_logs")
        .select(
          `
            id,
            property,
            category,
            location_name,
            technician_name,
            completed_at,
            next_due_date,
            task_id,
            task:preventive_tasks (
              task_name,
              category,
              frequency_days
            )
          `,
        )
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PreventiveLog[];
    },
  });

  const logs = logsQ.data ?? [];
  const tasks = tasksQ.data ?? [];

  const executados = useMemo(() => {
    return logs.filter((l) => {
      const d = new Date(l.completed_at);
      if (d.getMonth() !== mes || d.getFullYear() !== ano) return false;
      if (unidade !== "Todas" && l.property !== unidade) return false;
      return true;
    });
  }, [logs, mes, ano, unidade]);

  const pendentes = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);

    const properties: Unidade[] = unidade === "Todas" ? ["Botafogo", "Ipanema"] : [unidade];
    const rows: {
      property: Unidade;
      location: string;
      category: TaskCategory;
      task: PreventiveTask;
      nextDue: Date | null;
      lastTechnician: string | null;
      status: "atrasado" | "vence-breve";
      daysToDue: number | null;
    }[] = [];

    for (const prop of properties) {
      const quartos = prop === "Ipanema" ? QUARTOS_IPANEMA : QUARTOS_BOTAFOGO;
      const locations: { name: string; category: TaskCategory }[] = [
        ...quartos.map((n) => ({ name: `Quarto ${n}`, category: "Quarto" as TaskCategory })),
        ...AREAS_COMUNS.map((n) => ({ name: n, category: "Área Comum" as TaskCategory })),
      ];
      for (const loc of locations) {
        const catTasks = tasks.filter((t) => t.category === loc.category);
        for (const t of catTasks) {
          const rel = logs
            .filter(
              (l) => l.property === prop && l.location_name === loc.name && l.task_id === t.id,
            )
            .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1));
          const last = rel[0];
          let nextDue: Date | null = null;
          let daysToDue: number | null = null;
          if (last) {
            nextDue = new Date(last.next_due_date + "T00:00:00");
            daysToDue = Math.floor((nextDue.getTime() - today.getTime()) / 86400000);
          }
          const isOverdue = !last || (nextDue !== null && nextDue < today);
          const isSoon = nextDue !== null && nextDue >= today && nextDue <= in7;
          if (isOverdue || isSoon) {
            rows.push({
              property: prop,
              location: loc.name,
              category: loc.category,
              task: t,
              nextDue,
              lastTechnician: last?.technician_name ?? null,
              status: isOverdue ? "atrasado" : "vence-breve",
              daysToDue,
            });
          }
        }
      }
    }
    rows.sort((a, b) => {
      if (a.status !== b.status) return a.status === "atrasado" ? -1 : 1;
      const ad = a.nextDue?.getTime() ?? 0;
      const bd = b.nextDue?.getTime() ?? 0;
      return ad - bd;
    });
    return rows;
  }, [tasks, logs, unidade]);

  const anos = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, [now]);

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-50 pb-12">
      <div className="bg-teal-800 text-white p-5 shadow-md sticky top-0 z-10 flex items-center gap-3">
        <Link
          to="/gestao"
          className="p-2 bg-teal-900/60 rounded-lg active:bg-teal-900"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight">Histórico de Produção de Manutenção</h1>
          <p className="text-xs text-teal-200">Preventivas executadas e pendências</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setGerenciarOpen(true)}
          className="bg-white/10 text-white border-white/30 hover:bg-white hover:text-teal-800"
        >
          <ListChecks className="h-4 w-4 mr-1.5" />
          Editar Checklists
        </Button>
      </div>

      <GerenciarChecklistsModal open={gerenciarOpen} onOpenChange={setGerenciarOpen} />

      <Dialog
        open={!!editingLog}
        onOpenChange={(open) => {
          if (!open && !adjustDateMutation.isPending) {
            setEditingLog(null);
            setExecutionDate("");
          }
        }}
      >
        <DialogContent className="w-[min(28rem,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>Ajustar data executada</DialogTitle>
            <DialogDescription>
              {editingLog
                ? `${editingLog.property} · ${editingLog.location_name} — ${editingLog.task?.task_name ?? taskNameFor(editingLog.task_id, tasks) ?? editingLog.category}`
                : "Informe a data correta da execução."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="maintenance-execution-date">Data real da execução</Label>
            <Input
              id="maintenance-execution-date"
              type="date"
              value={executionDate}
              onChange={(event) => setExecutionDate(event.target.value)}
              max="2999-12-31"
            />
            {editingLog?.task?.frequency_days && (
              <p className="text-xs text-slate-500">
                A próxima atividade será recalculada automaticamente somando {editingLog.task.frequency_days} dia(s) a partir desta data.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingLog(null);
                setExecutionDate("");
              }}
              disabled={adjustDateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editingLog) adjustDateMutation.mutate({ log: editingLog, date: executionDate });
              }}
              disabled={!editingLog || !executionDate || adjustDateMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {adjustDateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4 mr-2" />
              )}
              Salvar data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="p-4 space-y-4">
        {/* Filtros */}
        <div className="grid grid-cols-3 gap-2">
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => (
                <SelectItem key={i} value={String(i)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anos.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={unidade} onValueChange={(v) => setUnidade(v as Unidade | "Todas")}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Unidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todas</SelectItem>
              <SelectItem value="Botafogo">Botafogo</SelectItem>
              <SelectItem value="Ipanema">Ipanema</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-white p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setTab("executados")}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              tab === "executados" ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50",
            )}
          >
            <CheckCircle2 className="h-4 w-4" /> Executados ({executados.length})
          </button>
          <button
            onClick={() => setTab("pendentes")}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              tab === "pendentes" ? "bg-amber-600 text-white" : "text-slate-600 hover:bg-slate-50",
            )}
          >
            <AlertTriangle className="h-4 w-4" /> A Fazer / Atrasados ({pendentes.length})
          </button>
        </div>

        {/* Lista */}
        {tab === "executados" ? (
          <div className="space-y-2">
            {logsQ.isLoading && (
              <div className="text-center text-sm text-slate-500 py-8">Carregando...</div>
            )}
            {!logsQ.isLoading && executados.length === 0 && (
              <div className="text-center text-sm text-slate-500 py-8 bg-white rounded-xl border border-slate-200">
                Nenhuma tarefa executada neste período.
              </div>
            )}
            {executados.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm"
              >
                <div className="h-9 w-9 rounded-full bg-emerald-100 grid place-items-center shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    <span className="text-teal-700">{log.property}</span> · {log.location_name} —{" "}
                    {log.task?.task_name ?? taskNameFor(log.task_id, tasks) ?? log.category}
                  </p>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Executado por{" "}
                    <span className="font-semibold text-slate-700">
                      {log.technician_name || "—"}
                    </span>{" "}
                    em{" "}
                    <span className="font-bold text-teal-700">
                      {log.completed_at
                        ? new Date(log.completed_at).toLocaleDateString("pt-BR", {
                            timeZone: "UTC",
                          })
                        : "Data não registada"}
                    </span>
                  </div>
                  {log.next_due_date && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Próxima: {fmtDateOnly(log.next_due_date)}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setEditingLog(log);
                    setExecutionDate(toDateInputValue(log.completed_at));
                  }}
                  className="ml-auto bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Ajustar Data
                </Button>

              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {(tasksQ.isLoading || logsQ.isLoading) && (
              <div className="text-center text-sm text-slate-500 py-8">Carregando...</div>
            )}
            {!tasksQ.isLoading && !logsQ.isLoading && pendentes.length === 0 && (
              <div className="text-center text-sm text-slate-500 py-8 bg-white rounded-xl border border-slate-200">
                Nenhuma pendência nos próximos 7 dias. 🎉
              </div>
            )}
            {pendentes.map((p, idx) => {
              const overdue = p.status === "atrasado";
              return (
                <div
                  key={`${p.property}-${p.location}-${p.task.id}-${idx}`}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border shadow-sm bg-white",
                    overdue ? "border-red-200" : "border-amber-200",
                  )}
                >
                  <div
                    className={cn(
                      "h-9 w-9 rounded-full grid place-items-center shrink-0",
                      overdue ? "bg-red-100" : "bg-amber-100",
                    )}
                  >
                    {overdue ? (
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    ) : (
                      <Clock className="h-5 w-5 text-amber-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      <span className="text-teal-700">{p.property}</span> · {p.location} —{" "}
                      {p.task.task_name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                      {p.category === "Quarto" ? (
                        <MapPin className="h-3 w-3" />
                      ) : (
                        <Wrench className="h-3 w-3" />
                      )}
                      Frequência a cada {p.task.frequency_days} dias
                      {p.lastTechnician && (
                        <>
                          {" "}
                          · último:{" "}
                          <span className="font-semibold text-slate-700">{p.lastTechnician}</span>
                        </>
                      )}
                    </p>
                    <p
                      className={cn(
                        "text-[11px] mt-0.5 font-semibold",
                        overdue ? "text-red-600" : "text-amber-600",
                      )}
                    >
                      {p.nextDue
                        ? overdue
                          ? `Atrasada há ${Math.abs(p.daysToDue ?? 0)} dia(s) · vencia em ${p.nextDue.toLocaleDateString("pt-BR")}`
                          : `Vence em ${p.daysToDue} dia(s) · ${p.nextDue.toLocaleDateString("pt-BR")}`
                        : "Nunca executada"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function taskNameFor(taskId: string, tasks: PreventiveTask[]) {
  return tasks.find((t) => t.id === taskId)?.task_name;
}

function taskFrequencyFor(taskId: string, tasks: PreventiveTask[]) {
  return tasks.find((t) => t.id === taskId)?.frequency_days;
}
