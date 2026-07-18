import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ClipboardCheck, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Row = {
  id: string;
  item_name: string;
  sort_order: number;
};

export function VistoriaChecklistManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [novo, setNovo] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vistoria_checklist_items" as never)
      .select("id, item_name, sort_order")
      .order("sort_order", { ascending: true });
    setLoading(false);
    if (error) {
      toast.error("Falha ao carregar itens: " + error.message);
      return;
    }
    setRows((data as unknown as Row[]) ?? []);
  }, []);

  useEffect(() => {
    carregar();
    const channel = supabase
      .channel("vistoria_checklist_items_admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vistoria_checklist_items" },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregar]);

  const adicionar = async () => {
    const nome = novo.trim();
    if (!nome) {
      toast.error("Informe o texto do item");
      return;
    }
    setBusy(true);
    const nextOrder = (rows[rows.length - 1]?.sort_order ?? 0) + 10;
    const { error } = await supabase
      .from("vistoria_checklist_items" as never)
      .insert({ item_name: nome, sort_order: nextOrder } as never);
    setBusy(false);
    if (error) {
      toast.error("Falha ao adicionar: " + error.message);
      return;
    }
    setNovo("");
    toast.success("Item adicionado");
  };

  const excluir = async (row: Row) => {
    if (!confirm(`Excluir o item "${row.item_name}"?`)) return;
    const { error } = await supabase
      .from("vistoria_checklist_items" as never)
      .delete()
      .eq("id", row.id);
    if (error) {
      toast.error("Falha ao excluir: " + error.message);
      return;
    }
    toast.success("Item removido");
  };

  const salvarEdicao = async () => {
    if (!editing) return;
    const value = editing.value.trim();
    if (!value) {
      toast.error("O item não pode ficar vazio");
      return;
    }
    const { error } = await supabase
      .from("vistoria_checklist_items" as never)
      .update({ item_name: value } as never)
      .eq("id", editing.id);
    if (error) {
      toast.error("Falha ao salvar: " + error.message);
      return;
    }
    setEditing(null);
    toast.success("Item atualizado");
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-lg">Checklist de Vistoria da Recepção</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Itens obrigatórios que a recepção precisa marcar ao vistoriar um quarto.
        Alterações refletem em tempo real no aplicativo.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") adicionar();
          }}
          placeholder="Novo item (ex.: Frigobar limpo e abastecido)"
          className="flex-1"
        />
        <Button onClick={adicionar} disabled={busy || !novo.trim()}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
          Adicionar
        </Button>
      </div>

      <div className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum item cadastrado. Adicione ao menos um item.
          </p>
        )}
        {rows.map((row) => {
          const isEditing = editing?.id === row.id;
          return (
            <div
              key={row.id}
              className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
            >
              {isEditing ? (
                <>
                  <Input
                    autoFocus
                    value={editing!.value}
                    onChange={(e) => setEditing({ id: row.id, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") salvarEdicao();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="flex-1"
                  />
                  <Button variant="ghost" size="icon" onClick={salvarEdicao} aria-label="Salvar">
                    <Check className="h-4 w-4 text-emerald-600" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(null)} aria-label="Cancelar">
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm flex-1">{row.item_name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing({ id: row.id, value: row.item_name })}
                    aria-label={`Editar ${row.item_name}`}
                  >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => excluir(row)}
                    aria-label={`Excluir ${row.item_name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
