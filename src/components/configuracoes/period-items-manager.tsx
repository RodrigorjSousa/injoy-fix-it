import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Unidade = "Botafogo" | "Ipanema";
type PeriodKey = "manha" | "tarde" | "noite";

type Row = {
  id: string;
  property: Unidade;
  period: PeriodKey;
  item_name: string;
};

const UNIDADES: Unidade[] = ["Botafogo", "Ipanema"];
const PERIODOS: { key: PeriodKey; label: string }[] = [
  { key: "manha", label: "🌅 Manhã" },
  { key: "tarde", label: "☀️ Tarde" },
  { key: "noite", label: "🌙 Noite" },
];

export function PeriodItemsManager() {
  const [unidade, setUnidade] = useState<Unidade>("Botafogo");
  const [period, setPeriod] = useState<PeriodKey>("manha");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [novo, setNovo] = useState("");
  const [addingBusy, setAddingBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("period_items_directory" as never)
      .select("*")
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      toast.error("Falha ao carregar tarefas: " + error.message);
      return;
    }
    setRows((data as unknown as Row[]) ?? []);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const channel = supabase
      .channel("period_items_directory_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "period_items_directory" },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregar]);

  const filtered = useMemo(
    () => rows.filter((r) => r.property === unidade && r.period === period),
    [rows, unidade, period],
  );

  const adicionar = async () => {
    const nome = novo.trim();
    if (!nome) {
      toast.error("Informe o nome da tarefa");
      return;
    }
    setAddingBusy(true);
    const { error } = await supabase
      .from("period_items_directory" as never)
      .insert({ property: unidade, period, item_name: nome } as never);
    setAddingBusy(false);
    if (error) {
      toast.error("Falha ao adicionar: " + error.message);
      return;
    }
    setNovo("");
    toast.success("Tarefa adicionada");
  };

  const excluir = async (row: Row) => {
    if (!confirm(`Excluir a tarefa "${row.item_name}"?`)) return;
    setDeletingId(row.id);
    const { error } = await supabase
      .from("period_items_directory" as never)
      .delete()
      .eq("id", row.id);
    setDeletingId(null);
    if (error) {
      toast.error("Falha ao excluir: " + error.message);
      return;
    }
    toast.success("Tarefa removida");
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-lg">Checklists de Turno</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Gerencie as tarefas exibidas para as camareiras nos cards de Manhã, Tarde e Noite.
        Alterações refletem no aplicativo em tempo real.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Unidade
          </label>
          <div className="grid grid-cols-2 gap-2">
            {UNIDADES.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnidade(u)}
                className={`rounded-lg border p-2.5 text-sm transition-colors ${
                  unidade === u
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "bg-background hover:border-primary/40"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Período
          </label>
          <div className="grid grid-cols-3 gap-2">
            {PERIODOS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`rounded-lg border p-2.5 text-sm transition-colors ${
                  period === p.key
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "bg-background hover:border-primary/40"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") adicionar();
          }}
          placeholder="Nova tarefa (ex.: Regar plantas)"
          className="flex-1"
        />
        <Button onClick={adicionar} disabled={addingBusy || !novo.trim()}>
          {addingBusy ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-1" />
          )}
          Adicionar
        </Button>
      </div>

      <div className="space-y-2">
        {loading && (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma tarefa cadastrada para este período.
          </p>
        )}
        {filtered.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
          >
            <span className="text-sm">{row.item_name}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => excluir(row)}
              disabled={deletingId === row.id}
              aria-label={`Excluir ${row.item_name}`}
            >
              {deletingId === row.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 text-destructive" />
              )}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
