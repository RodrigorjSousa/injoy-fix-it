import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Pencil, Check, X, Building2, ListChecks, DoorClosed } from "lucide-react";
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
const QUARTOS_KEY_PREFIX = "manutencao_quartos_";

export const DEFAULT_AREAS_COMUNS = [
  "Recepção",
  "Corredores",
  "Fachada",
  "Jardim de Inverno",
  "Pátio",
  "Cozinha",
];

export const DEFAULT_QUARTOS_IPANEMA = [
  "01","02","103","104","205","206","307","308","309","410","411","412",
];
export const DEFAULT_QUARTOS_BOTAFOGO = [
  "01","02","03","05","06","107","108","109","110","111","112","113","114","115","117","118","301","401","501",
];

type TaskCategory = "Quarto" | "Área Comum";

interface TaskRow {
  id: string;
  task_name: string;
  category: string;
  frequency_days: number;
  active: boolean;
  discipline?: string | null;
}

function defaultsFor(unidade: string): string[] {
  return unidade === "Ipanema" ? DEFAULT_QUARTOS_IPANEMA : DEFAULT_QUARTOS_BOTAFOGO;
}

function quartosKey(unidade: string) {
  return `${QUARTOS_KEY_PREFIX}${unidade.toLowerCase()}`;
}

async function fetchListSetting(key: string, fallback: string[]): Promise<string[]> {
  const { data, error } = await supabase
    .from("app_settings" as never)
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  const row = data as { value: string } | null;
  if (!row?.value) return fallback;
  try {
    const arr = JSON.parse(row.value);
    if (Array.isArray(arr) && arr.every((v) => typeof v === "string") && arr.length > 0) {
      return arr;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

const fetchAreas = () => fetchListSetting(AREAS_KEY, DEFAULT_AREAS_COMUNS);

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

export function useQuartos(unidade: string) {
  const qc = useQueryClient();
  const key = quartosKey(unidade);
  const q = useQuery({
    queryKey: ["manutencao_quartos", unidade],
    queryFn: () => fetchListSetting(key, defaultsFor(unidade)),
  });

  useEffect(() => {
    const ch = supabase
      .channel(`manutencao-quartos-sync-${unidade}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings", filter: `key=eq.${key}` },
        () => {
          qc.invalidateQueries({ queryKey: ["manutencao_quartos", unidade] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, unidade, key]);

  return q.data ?? defaultsFor(unidade);
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unidade: string;
}

export function AreasComunsManager({ open, onOpenChange, unidade }: Props) {
  const qc = useQueryClient();

  const areasQ = useQuery({
    queryKey: ["manutencao_areas_comuns"],
    queryFn: fetchAreas,
    enabled: open,
  });
  const areas = areasQ.data ?? DEFAULT_AREAS_COMUNS;

  const quartosQ = useQuery({
    queryKey: ["manutencao_quartos", unidade],
    queryFn: () => fetchListSetting(quartosKey(unidade), defaultsFor(unidade)),
    enabled: open,
  });
  const quartos = quartosQ.data ?? defaultsFor(unidade);

  const tasksQ = useQuery({
    queryKey: ["preventive_tasks_all"],
    queryFn: async (): Promise<TaskRow[]> => {
      const { data, error } = await supabase
        .from("preventive_tasks" as never)
        .select("*")
        .order("category")
        .order("task_name");
      if (error) throw error;
      return (data as TaskRow[]) ?? [];
    },
    enabled: open,
  });

  const saveList = useMutation({
    mutationFn: async ({ key, next }: { key: string; next: string[] }) => {
      const clean = next.map((s) => s.trim()).filter(Boolean);
      const { error } = await supabase
        .from("app_settings" as never)
        .upsert({ key, value: JSON.stringify(clean) } as never);
      if (error) throw error;
      return { key, clean };
    },
    onSuccess: ({ key }) => {
      if (key === AREAS_KEY) {
        qc.invalidateQueries({ queryKey: ["manutencao_areas_comuns"] });
      } else {
        qc.invalidateQueries({ queryKey: ["manutencao_quartos"] });
      }
      toast.success("Lista atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-teal-600" />
            Gerenciar todos os locais — Manutenção
          </DialogTitle>
          <DialogDescription>
            Edite quartos, áreas comuns e os itens do checklist de cada categoria — {unidade}.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="quartos" className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="quartos">
              <DoorClosed className="h-4 w-4 mr-1.5" /> Quartos
            </TabsTrigger>
            <TabsTrigger value="areas">
              <Building2 className="h-4 w-4 mr-1.5" /> Áreas
            </TabsTrigger>
            <TabsTrigger value="itens-quarto">
              <ListChecks className="h-4 w-4 mr-1.5" /> Itens · Quarto
            </TabsTrigger>
            <TabsTrigger value="itens-area">
              <ListChecks className="h-4 w-4 mr-1.5" /> Itens · Área
            </TabsTrigger>
          </TabsList>

          {/* QUARTOS */}
          <TabsContent value="quartos" className="space-y-3 mt-4">
            <p className="text-xs text-slate-500">
              Quartos exibidos como cards de manutenção na unidade {unidade}.
            </p>
            <LocaisEditor
              items={quartos}
              placeholder="Ex.: 601"
              pending={saveList.isPending}
              onSave={(next) => saveList.mutate({ key: quartosKey(unidade), next })}
            />
          </TabsContent>

          {/* ÁREAS */}
          <TabsContent value="areas" className="space-y-3 mt-4">
            <p className="text-xs text-slate-500">
              Áreas comuns compartilhadas entre todas as unidades.
            </p>
            <LocaisEditor
              items={areas}
              placeholder="Ex.: Terraço"
              pending={saveList.isPending}
              onSave={(next) => saveList.mutate({ key: AREAS_KEY, next })}
            />
          </TabsContent>

          {/* ITENS QUARTO */}
          <TabsContent value="itens-quarto" className="mt-4">
            <ItensChecklist
              category="Quarto"
              tasks={(tasksQ.data ?? []).filter((t) => t.category === "Quarto")}
              loading={tasksQ.isLoading}
            />
          </TabsContent>

          {/* ITENS ÁREA */}
          <TabsContent value="itens-area" className="mt-4">
            <ItensChecklist
              category="Área Comum"
              tasks={(tasksQ.data ?? []).filter((t) => t.category === "Área Comum")}
              loading={tasksQ.isLoading}
              areas={areas}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------- Sub-components --------------------- */

function LocaisEditor({
  items,
  placeholder,
  pending,
  onSave,
}: {
  items: string[];
  placeholder: string;
  pending: boolean;
  onSave: (next: string[]) => void;
}) {
  const [novo, setNovo] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  const add = () => {
    const name = novo.trim();
    if (!name) return;
    if (items.some((a) => a.toLowerCase() === name.toLowerCase())) {
      toast.error("Já existe um item com esse nome");
      return;
    }
    onSave([...items, name]);
    setNovo("");
  };

  const rename = (idx: number) => {
    const name = editVal.trim();
    if (!name) return;
    const next = items.slice();
    next[idx] = name;
    onSave(next);
    setEditIdx(null);
    setEditVal("");
  };

  const remove = (idx: number) => {
    if (!confirm(`Remover "${items[idx]}"?`)) return;
    onSave(items.filter((_, i) => i !== idx));
  };

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
        <Label className="text-xs text-slate-600">Novo item</Label>
        <div className="flex gap-2">
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder={placeholder}
            className="bg-white"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button
            onClick={add}
            disabled={pending || !novo.trim()}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((a, idx) => (
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
                      rename(idx);
                    }
                    if (e.key === "Escape") {
                      setEditIdx(null);
                      setEditVal("");
                    }
                  }}
                />
                <Button size="icon" variant="ghost" onClick={() => rename(idx)}>
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
                  onClick={() => remove(idx)}
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-center text-sm text-slate-500 py-6 rounded-xl border border-dashed border-slate-200">
            Nenhum item cadastrado.
          </div>
        )}
      </div>
    </>
  );
}

function ItensChecklist({
  category,
  tasks,
  loading,
  areas,
}: {
  category: TaskCategory;
  tasks: TaskRow[];
  loading: boolean;
  areas?: string[];
}) {
  const qc = useQueryClient();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["preventive_tasks"] });
    qc.invalidateQueries({ queryKey: ["preventive_tasks_all"] });
    qc.invalidateQueries({ queryKey: ["preventive_tasks_area_comum"] });
  };

  const addTask = useMutation({
    mutationFn: async (p: { name: string; days: number; discipline: string | null }) => {
      if (!p.name.trim()) throw new Error("Informe o nome da tarefa");
      if (!Number.isFinite(p.days) || p.days < 1) throw new Error("Frequência inválida");
      const { error } = await supabase.from("preventive_tasks" as never).insert({
        task_name: p.name.trim(),
        frequency_days: p.days,
        category,
        active: true,
        discipline: p.discipline,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item adicionado");
      invalidateAll();
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
      invalidateAll();
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
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sharedTasks = useMemo(
    () => tasks.filter((t) => !t.discipline),
    [tasks],
  );

  const renderList = (list: TaskRow[]) => (
    <div className="space-y-2">
      {list.length === 0 && (
        <div className="text-center text-sm text-slate-500 py-6 rounded-xl border border-dashed border-slate-200">
          Nenhum item cadastrado.
        </div>
      )}
      {list.map((t) => (
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
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {category === "Quarto"
          ? "Estes itens aparecem no checklist de todos os quartos."
          : "O bloco abaixo aplica itens a TODAS as áreas comuns. Use os cards por área para itens específicos."}
      </p>

      <AddItemForm
        pending={addTask.isPending}
        onAdd={(name, days) => addTask.mutate({ name, days, discipline: null })}
      />

      {loading && (
        <div className="text-center text-sm text-slate-500 py-6">Carregando…</div>
      )}

      {!loading && renderList(sharedTasks)}

      {category === "Área Comum" && areas && areas.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-medium text-slate-600 mb-2">
            Itens específicos por área
          </p>
          <Accordion type="multiple" className="space-y-2">
            {areas.map((area) => {
              const areaTasks = tasks.filter((t) => t.discipline === area);
              return (
                <AccordionItem
                  key={area}
                  value={area}
                  className="rounded-xl border border-slate-200 bg-white px-3"
                >
                  <AccordionTrigger className="text-sm font-semibold text-slate-800 hover:no-underline">
                    <span className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-teal-600" />
                      {area}
                      <span className="text-xs font-normal text-slate-500">
                        ({areaTasks.length})
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3 space-y-3">
                    <AddItemForm
                      pending={addTask.isPending}
                      onAdd={(name, days) =>
                        addTask.mutate({ name, days, discipline: area })
                      }
                    />
                    {renderList(areaTasks)}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}
    </div>
  );
}

function AddItemForm({
  pending,
  onAdd,
}: {
  pending: boolean;
  onAdd: (name: string, days: number) => void;
}) {
  const [name, setName] = useState("");
  const [freq, setFreq] = useState("30");
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2">
          <Label className="text-xs text-slate-600">Nome do item</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Verificar ar-condicionado"
            className="bg-white"
          />
        </div>
        <div>
          <Label className="text-xs text-slate-600">Frequência (dias)</Label>
          <Input
            type="number"
            min={1}
            value={freq}
            onChange={(e) => setFreq(e.target.value)}
            className="bg-white"
          />
        </div>
      </div>
      <Button
        onClick={() => {
          const days = Number(freq);
          if (!name.trim() || !Number.isFinite(days) || days < 1) return;
          onAdd(name, days);
          setName("");
          setFreq("30");
        }}
        disabled={pending || !name.trim()}
        className="w-full bg-teal-600 hover:bg-teal-700 text-white"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        Adicionar item
      </Button>
    </div>
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
