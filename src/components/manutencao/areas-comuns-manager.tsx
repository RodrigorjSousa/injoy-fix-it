import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Pencil, Check, X, Building2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

const AREAS_KEY = "manutencao_areas_comuns";

export const DEFAULT_AREAS_COMUNS = [
  "Recepção",
  "Corredores",
  "Fachada",
  "Jardim de Inverno",
  "Pátio",
  "Cozinha",
];

interface TaskRow {
  id: string;
  task_name: string;
  category: string;
  frequency_days: number;
  active: boolean;
}

async function fetchAreas(): Promise<string[]> {
  const { data, error } = await supabase
    .from("app_settings" as never)
    .select("value")
    .eq("key", AREAS_KEY)
    .maybeSingle();
  if (error) throw error;
  const row = data as { value: string } | null;
  if (!row?.value) return DEFAULT_AREAS_COMUNS;
  try {
    const arr = JSON.parse(row.value);
    if (Array.isArray(arr) && arr.every((v) => typeof v === "string") && arr.length > 0) {
      return arr;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_AREAS_COMUNS;
}

export function useAreasComuns() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["manutencao_areas_comuns"],
    queryFn: fetchAreas,
  });

  useEffect(() => {
    const ch = supabase
      .channel("manutencao-areas-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings", filter: `key=eq.${AREAS_KEY}` },
        () => {
          qc.invalidateQueries({ queryKey: ["manutencao_areas_comuns"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return q.data ?? DEFAULT_AREAS_COMUNS;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AreasComunsManager({ open, onOpenChange }: Props) {
  const qc = useQueryClient();

  const areasQ = useQuery({
    queryKey: ["manutencao_areas_comuns"],
    queryFn: fetchAreas,
    enabled: open,
  });
  const areas = areasQ.data ?? DEFAULT_AREAS_COMUNS;

  const tasksQ = useQuery({
    queryKey: ["preventive_tasks_area_comum"],
    queryFn: async (): Promise<TaskRow[]> => {
      const { data, error } = await supabase
        .from("preventive_tasks" as never)
        .select("*")
        .eq("category", "Área Comum")
        .order("task_name");
      if (error) throw error;
      return (data as TaskRow[]) ?? [];
    },
    enabled: open,
  });

  const saveAreas = useMutation({
    mutationFn: async (next: string[]) => {
      const clean = next.map((s) => s.trim()).filter(Boolean);
      const { error } = await supabase
        .from("app_settings" as never)
        .upsert({ key: AREAS_KEY, value: JSON.stringify(clean) } as never);
      if (error) throw error;
      return clean;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manutencao_areas_comuns"] });
      toast.success("Áreas atualizadas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newArea, setNewArea] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  const addArea = () => {
    const name = newArea.trim();
    if (!name) return;
    if (areas.some((a) => a.toLowerCase() === name.toLowerCase())) {
      toast.error("Já existe uma área com esse nome");
      return;
    }
    saveAreas.mutate([...areas, name]);
    setNewArea("");
  };

  const renameArea = (idx: number) => {
    const name = editVal.trim();
    if (!name) return;
    const next = areas.slice();
    next[idx] = name;
    saveAreas.mutate(next);
    setEditIdx(null);
    setEditVal("");
  };

  const removeArea = (idx: number) => {
    if (!confirm(`Remover a área "${areas[idx]}"?`)) return;
    const next = areas.filter((_, i) => i !== idx);
    saveAreas.mutate(next);
  };

  // Tasks (checklist items) ---------------------------------------------
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskFreq, setNewTaskFreq] = useState("30");

  const addTask = useMutation({
    mutationFn: async () => {
      const name = newTaskName.trim();
      const days = Number(newTaskFreq);
      if (!name) throw new Error("Informe o nome da tarefa");
      if (!Number.isFinite(days) || days < 1) throw new Error("Frequência inválida");
      const { error } = await supabase.from("preventive_tasks" as never).insert({
        task_name: name,
        frequency_days: days,
        category: "Área Comum",
        active: true,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item adicionado");
      setNewTaskName("");
      setNewTaskFreq("30");
      qc.invalidateQueries({ queryKey: ["preventive_tasks_area_comum"] });
      qc.invalidateQueries({ queryKey: ["preventive_tasks"] });
      qc.invalidateQueries({ queryKey: ["preventive_tasks_all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTask = useMutation({
    mutationFn: async (t: TaskRow) => {
      const { error } = await supabase
        .from("preventive_tasks" as never)
        .update({
          task_name: t.task_name,
          frequency_days: t.frequency_days,
          active: t.active,
        } as never)
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item atualizado");
      qc.invalidateQueries({ queryKey: ["preventive_tasks_area_comum"] });
      qc.invalidateQueries({ queryKey: ["preventive_tasks"] });
      qc.invalidateQueries({ queryKey: ["preventive_tasks_all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("preventive_tasks" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item removido");
      qc.invalidateQueries({ queryKey: ["preventive_tasks_area_comum"] });
      qc.invalidateQueries({ queryKey: ["preventive_tasks"] });
      qc.invalidateQueries({ queryKey: ["preventive_tasks_all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-teal-600" />
            Áreas Comuns — Manutenção
          </DialogTitle>
          <DialogDescription>
            Edite os cards das áreas comuns e os itens do checklist compartilhado.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="areas" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="areas">
              <Building2 className="h-4 w-4 mr-1.5" /> Áreas
            </TabsTrigger>
            <TabsTrigger value="itens">
              <ListChecks className="h-4 w-4 mr-1.5" /> Itens do checklist
            </TabsTrigger>
          </TabsList>

          {/* ÁREAS ---------------------------------------------------- */}
          <TabsContent value="areas" className="space-y-3 mt-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <Label className="text-xs text-slate-600">Nova área</Label>
              <div className="flex gap-2">
                <Input
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  placeholder="Ex.: Terraço"
                  className="bg-white"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addArea();
                    }
                  }}
                />
                <Button
                  onClick={addArea}
                  disabled={saveAreas.isPending || !newArea.trim()}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {areas.map((a, idx) => (
                <div
                  key={`${a}-${idx}`}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  {editIdx === idx ? (
                    <>
                      <Input
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        className="h-8"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            renameArea(idx);
                          }
                          if (e.key === "Escape") {
                            setEditIdx(null);
                            setEditVal("");
                          }
                        }}
                      />
                      <Button size="icon" variant="ghost" onClick={() => renameArea(idx)}>
                        <Check className="h-4 w-4 text-emerald-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditIdx(null);
                          setEditVal("");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium text-slate-800">{a}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditIdx(idx);
                          setEditVal(a);
                        }}
                        aria-label="Renomear"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeArea(idx)}
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {areas.length === 0 && (
                <div className="text-center text-sm text-slate-500 py-6 rounded-xl border border-dashed border-slate-200">
                  Nenhuma área cadastrada.
                </div>
              )}
            </div>
          </TabsContent>

          {/* ITENS ---------------------------------------------------- */}
          <TabsContent value="itens" className="space-y-3 mt-4">
            <p className="text-xs text-slate-500">
              Estes itens aparecem no checklist de todas as áreas comuns.
            </p>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <Label className="text-xs text-slate-600">Nome do item</Label>
                  <Input
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    placeholder="Ex.: Limpeza de ralos"
                    className="bg-white"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-600">Frequência (dias)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={newTaskFreq}
                    onChange={(e) => setNewTaskFreq(e.target.value)}
                    className="bg-white"
                  />
                </div>
              </div>
              <Button
                onClick={() => addTask.mutate()}
                disabled={addTask.isPending || !newTaskName.trim()}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
              >
                {addTask.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Adicionar item
              </Button>
            </div>

            <div className="space-y-2">
              {tasksQ.isLoading && (
                <div className="text-center text-sm text-slate-500 py-6">Carregando…</div>
              )}
              {!tasksQ.isLoading && tasks.length === 0 && (
                <div className="text-center text-sm text-slate-500 py-6 rounded-xl border border-dashed border-slate-200">
                  Nenhum item cadastrado.
                </div>
              )}
              {tasks.map((t) => (
                <TaskEditRow
                  key={t.id}
                  task={t}
                  onSave={(payload) => updateTask.mutate({ ...t, ...payload })}
                  onDelete={() => {
                    if (confirm(`Excluir "${t.task_name}"?`)) delTask.mutate(t.id);
                  }}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function TaskEditRow({
  task,
  onSave,
  onDelete,
}: {
  task: TaskRow;
  onSave: (payload: Partial<TaskRow>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(task.task_name);
  const [freq, setFreq] = useState(String(task.frequency_days));
  const [active, setActive] = useState(task.active);

  useEffect(() => {
    setName(task.task_name);
    setFreq(String(task.frequency_days));
    setActive(task.active);
  }, [task.id, task.task_name, task.frequency_days, task.active]);

  const dirty =
    name !== task.task_name ||
    Number(freq) !== task.frequency_days ||
    active !== task.active;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 flex-1 min-w-[10rem]"
      />
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={1}
          value={freq}
          onChange={(e) => setFreq(e.target.value)}
          className="h-8 w-20"
        />
        <span className="text-xs text-slate-500">dias</span>
      </div>
      <label className="flex items-center gap-1 text-xs text-slate-600">
        <Checkbox
          checked={active}
          onCheckedChange={(v) => setActive(v === true)}
        />
        Ativa
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={!dirty || !name.trim() || Number(freq) < 1}
        onClick={() =>
          onSave({
            task_name: name.trim(),
            frequency_days: Number(freq),
            active,
          })
        }
      >
        <Check className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Excluir">
        <Trash2 className="h-4 w-4 text-red-600" />
      </Button>
    </div>
  );
}
