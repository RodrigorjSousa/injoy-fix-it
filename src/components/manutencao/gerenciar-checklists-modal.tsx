import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Unidade } from "@/lib/store";

type LocationCategory = "Quarto" | "Área Comum";
const DISCIPLINES = [
  "Elétrica",
  "Ar condicionado",
  "Hidráulica",
  "Pintura",
  "Marcenaria",
  "Obra",
  "Geral",
] as const;
type Discipline = (typeof DISCIPLINES)[number];

interface TaskRow {
  id: string;
  task_name: string;
  category: LocationCategory;
  frequency_days: number;
  active: boolean;
  property: string | null;
  discipline: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const DISCIPLINE_COLORS: Record<string, string> = {
  "Elétrica": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Ar condicionado": "bg-sky-100 text-sky-800 border-sky-200",
  "Hidráulica": "bg-blue-100 text-blue-800 border-blue-200",
  "Pintura": "bg-pink-100 text-pink-800 border-pink-200",
  "Marcenaria": "bg-amber-100 text-amber-800 border-amber-200",
  "Obra": "bg-orange-100 text-orange-800 border-orange-200",
  "Geral": "bg-slate-100 text-slate-700 border-slate-200",
};

export function GerenciarChecklistsModal({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [unidade, setUnidade] = useState<Unidade>("Botafogo");
  const [nome, setNome] = useState("");
  const [freq, setFreq] = useState<string>("30");
  const [discipline, setDiscipline] = useState<Discipline>("Geral");
  const [locCategory, setLocCategory] = useState<LocationCategory>("Quarto");

  const tasksQ = useQuery({
    queryKey: ["preventive_tasks_all"],
    queryFn: async (): Promise<TaskRow[]> => {
      const { data, error } = await supabase
        .from("preventive_tasks" as never)
        .select("*")
        .eq("active", true)
        .order("category")
        .order("task_name");
      if (error) throw error;
      return (data as TaskRow[]) ?? [];
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    const rows = tasksQ.data ?? [];
    return rows.filter((t) => !t.property || t.property === unidade);
  }, [tasksQ.data, unidade]);

  const addMut = useMutation({
    mutationFn: async () => {
      const name = nome.trim();
      const days = Number(freq);
      if (!name) throw new Error("Informe o nome da tarefa");
      if (!Number.isFinite(days) || days < 1) throw new Error("Frequência inválida");
      const { error } = await supabase.from("preventive_tasks" as never).insert({
        task_name: name,
        frequency_days: days,
        category: locCategory,
        discipline,
        property: unidade,
        active: true,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa adicionada");
      setNome("");
      setFreq("30");
      qc.invalidateQueries({ queryKey: ["preventive_tasks_all"] });
      qc.invalidateQueries({ queryKey: ["preventive_tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("preventive_tasks" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa removida");
      qc.invalidateQueries({ queryKey: ["preventive_tasks_all"] });
      qc.invalidateQueries({ queryKey: ["preventive_tasks"] });
    },
    onError: (e: Error) => toast.error("Falha ao excluir: " + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <ListChecks className="h-5 w-5 text-teal-600" />
            Gerenciar Checklists de Manutenção
          </DialogTitle>
          <DialogDescription>
            Cadastre, edite e remova tarefas de manutenção preventiva por unidade.
          </DialogDescription>
        </DialogHeader>

        {/* Filtro Unidade */}
        <Tabs value={unidade} onValueChange={(v) => setUnidade(v as Unidade)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="Botafogo">Botafogo</TabsTrigger>
            <TabsTrigger value="Ipanema">Ipanema</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Formulário */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Nova tarefa em {unidade}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs text-slate-600">Nome da tarefa</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Limpeza de ralos"
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
            <div>
              <Label className="text-xs text-slate-600">Local</Label>
              <Select value={locCategory} onValueChange={(v) => setLocCategory(v as LocationCategory)}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Quarto">Quarto</SelectItem>
                  <SelectItem value="Área Comum">Área Comum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-slate-600">Categoria</Label>
              <Select value={discipline} onValueChange={(v) => setDiscipline(v as Discipline)}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => addMut.mutate()}
            disabled={addMut.isPending || !nome.trim()}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white"
          >
            {addMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Adicionar
          </Button>
        </div>

        {/* Lista */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700">
            Tarefas de {unidade} ({filtered.length})
          </h3>
          {tasksQ.isLoading && (
            <div className="text-center text-sm text-slate-500 py-6">Carregando...</div>
          )}
          {!tasksQ.isLoading && filtered.length === 0 && (
            <div className="text-center text-sm text-slate-500 py-6 rounded-xl border border-dashed border-slate-200">
              Nenhuma tarefa cadastrada.
            </div>
          )}
          {filtered.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{t.task_name}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {t.discipline && (
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] font-medium", DISCIPLINE_COLORS[t.discipline] ?? "")}
                    >
                      {t.discipline}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600">
                    {t.category}
                  </Badge>
                  <span className="text-[11px] text-slate-500">
                    a cada {t.frequency_days} dias
                  </span>
                  {!t.property && (
                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                      compartilhada
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(`Excluir "${t.task_name}"?`)) delMut.mutate(t.id);
                }}
                aria-label="Excluir"
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
