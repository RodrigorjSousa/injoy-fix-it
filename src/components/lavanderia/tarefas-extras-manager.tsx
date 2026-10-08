import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ListChecks, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type DirRow = { id: string; name: string };

/** Catálogo das tarefas extras das camareiras (antes ficava na tela de lavanderia). */
export function TarefasExtrasManager() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["extra_tasks_directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extra_tasks_directory" as never)
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data as unknown as DirRow[]) ?? [];
    },
  });
  return (
    <ItemManager
      title="Tarefas Extras"
      icon={<ListChecks size={16} />}
      accent="emerald"
      rows={rows}
      onChanged={() => qc.invalidateQueries({ queryKey: ["extra_tasks_directory"] })}
      table="extra_tasks_directory"
    />
  );
}

function ItemManager({
  title,
  icon,
  accent,
  rows,
  onChanged,
  table,
}: {
  title: string;
  icon: React.ReactNode;
  accent: "sky" | "emerald";
  rows: DirRow[];
  onChanged: () => void;
  table: "extra_tasks_directory";
}) {
  const [novo, setNovo] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const adicionar = async () => {
    const name = novo.trim();
    if (!name) return;
    setSaving(true);
    const { error } = await supabase.from(table as never).insert({ name } as never);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNovo("");
    toast.success("Item adicionado");
    onChanged();
  };

  const salvarEdicao = async (id: string) => {
    const name = editValue.trim();
    if (!name) return;
    const { error } = await supabase
      .from(table as never)
      .update({ name } as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditing(null);
    toast.success("Item atualizado");
    onChanged();
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este item?")) return;
    const { error } = await supabase
      .from(table as never)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Item removido");
    onChanged();
  };

  const badge = accent === "sky" ? "bg-sky-500" : "bg-emerald-500";
  const btn =
    accent === "sky" ? "bg-sky-600 hover:bg-sky-700" : "bg-emerald-600 hover:bg-emerald-700";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("h-8 w-8 rounded-lg text-white grid place-items-center", badge)}>
          {icon}
        </div>
        <h3 className="text-sm font-black text-slate-800">{title}</h3>
        <span className="ml-auto text-[11px] text-slate-500 font-semibold">
          {rows.length} itens
        </span>
      </div>
      <div className="flex gap-2 mb-3">
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && adicionar()}
          placeholder="Novo item…"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={adicionar}
          disabled={saving || !novo.trim()}
          className={cn(
            "text-white font-bold rounded-lg px-3 text-sm inline-flex items-center gap-1 disabled:opacity-50",
            btn,
          )}
        >
          <Plus size={14} /> Add
        </button>
      </div>
      <div className="space-y-1 max-h-[420px] overflow-y-auto">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 group"
          >
            {editing === row.id ? (
              <>
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && salvarEdicao(row.id)}
                  className="flex-1 border border-blue-500 rounded-md px-2 py-1 text-sm"
                />
                <button
                  onClick={() => salvarEdicao(row.id)}
                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-md"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-slate-700 truncate">{row.name}</span>
                <button
                  onClick={() => {
                    setEditing(row.id);
                    setEditValue(row.name);
                  }}
                  className="p-1.5 text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Editar"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => excluir(row.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Excluir"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-center text-xs text-slate-400 py-6">Nenhum item cadastrado.</p>
        )}
      </div>
    </div>
  );
}
