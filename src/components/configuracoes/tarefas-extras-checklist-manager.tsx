import { useEffect, useMemo, useState } from "react";
import { ClipboardList, ChevronDown, Plus, Trash2, Pencil, Save, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  CATEGORIES_BY_UNIDADE,
  loadItems,
  saveItems,
  type CategoryKey,
} from "@/components/camareiras/tarefas-extras-modal";

type Unidade = "Botafogo" | "Ipanema";

export function TarefasExtrasChecklistManager() {
  const [open, setOpen] = useState(false);
  const [unidade, setUnidade] = useState<Unidade>("Botafogo");
  const [active, setActive] = useState<CategoryKey | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [novo, setNovo] = useState("");

  const cats = useMemo(
    () => CATEGORIES.filter((c) => CATEGORIES_BY_UNIDADE[unidade].includes(c.key)),
    [unidade],
  );
  const activeCat = useMemo(
    () => CATEGORIES.find((c) => c.key === active) ?? null,
    [active],
  );

  useEffect(() => {
    setActive(null);
  }, [unidade]);

  useEffect(() => {
    if (!activeCat) return;
    setItems(loadItems(unidade, activeCat.key, activeCat.defaults));
    setEditingIdx(null);
    setNovo("");
  }, [activeCat, unidade]);

  const persist = (next: string[]) => {
    if (!activeCat) return;
    setItems(next);
    saveItems(unidade, activeCat.key, next);
  };

  const adicionar = () => {
    const v = novo.trim();
    if (!v) return;
    if (items.includes(v)) {
      toast.error("Item já existe");
      return;
    }
    persist([...items, v]);
    setNovo("");
    toast.success("Item adicionado");
  };

  const excluir = (i: number) => {
    if (items.length <= 1) {
      toast.error("Mantenha ao menos 1 item");
      return;
    }
    persist(items.filter((_, idx) => idx !== i));
    toast.success("Item removido");
  };

  const salvarEdicao = () => {
    if (editingIdx === null) return;
    const v = editValue.trim();
    if (!v) {
      toast.error("Nome vazio");
      return;
    }
    persist(items.map((t, i) => (i === editingIdx ? v : t)));
    setEditingIdx(null);
    toast.success("Item atualizado");
  };

  const restaurarPadrao = () => {
    if (!activeCat) return;
    if (!confirm("Restaurar itens padrão desta categoria?")) return;
    persist(activeCat.defaults);
    toast.success("Padrão restaurado");
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50"
        aria-expanded={open}
      >
        <div className="h-9 w-9 rounded-lg bg-fuchsia-600 text-white grid place-items-center shrink-0 shadow-sm">
          <ClipboardList size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-800">Check List das Tarefas Extras</p>
          <p className="text-[11px] text-slate-500">
            Adicione, edite ou remova itens dos checklists por área
          </p>
        </div>
        <ChevronDown
          size={18}
          className={cn("text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="p-4 border-t border-slate-100 space-y-4">
          {/* Seletor de unidade */}
          <div className="flex gap-2">
            {(["Botafogo", "Ipanema"] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUnidade(u)}
                className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all",
                  unidade === u
                    ? "bg-fuchsia-600 border-fuchsia-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300",
                )}
              >
                Injoy {u}
              </button>
            ))}
          </div>

          {/* Grid de categorias */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {cats.map((c) => {
              const Icon = c.icon;
              const isActive = active === c.key;
              const count = loadItems(unidade, c.key, c.defaults).length;
              return (
                <button
                  key={c.key}
                  onClick={() => setActive(isActive ? null : c.key)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl text-left text-white shadow transition-all bg-gradient-to-br",
                    c.gradient,
                    isActive ? "ring-4 ring-offset-2 ring-fuchsia-400" : "opacity-90 hover:opacity-100",
                  )}
                >
                  <div className="p-2 rounded-lg bg-white/20">
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black leading-tight truncate">{c.label}</p>
                    <p className="text-[11px] opacity-90">{count} {count === 1 ? "item" : "itens"}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Editor de itens */}
          {activeCat && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-slate-700 uppercase tracking-wider">
                  {activeCat.label}
                </p>
                <button
                  onClick={restaurarPadrao}
                  className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800"
                  title="Restaurar padrão"
                >
                  <RotateCcw size={12} /> Padrão
                </button>
              </div>

              <div className="space-y-2">
                {items.map((t, i) => {
                  const editing = editingIdx === i;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50"
                    >
                      <span className="text-[11px] font-bold text-slate-400 w-6 text-center">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {editing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") salvarEdicao();
                            if (e.key === "Escape") setEditingIdx(null);
                          }}
                          className="flex-1 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-md px-2 py-1 outline-none focus:border-fuchsia-500"
                        />
                      ) : (
                        <span className="flex-1 text-sm font-semibold text-slate-800">{t}</span>
                      )}
                      {editing ? (
                        <>
                          <button
                            onClick={salvarEdicao}
                            className="p-2 rounded-md text-emerald-600 hover:bg-emerald-50"
                            aria-label="Salvar"
                          >
                            <Save size={14} />
                          </button>
                          <button
                            onClick={() => setEditingIdx(null)}
                            className="p-2 rounded-md text-slate-400 hover:bg-slate-100"
                            aria-label="Cancelar"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingIdx(i);
                              setEditValue(t);
                            }}
                            className="p-2 rounded-md text-slate-500 hover:bg-slate-100"
                            aria-label="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => excluir(i)}
                            className="p-2 rounded-md text-red-500 hover:bg-red-50"
                            aria-label="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <input
                  value={novo}
                  onChange={(e) => setNovo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") adicionar();
                  }}
                  placeholder="Novo item do checklist..."
                  className="flex-1 text-sm bg-white border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-fuchsia-500"
                />
                <button
                  onClick={adicionar}
                  disabled={!novo.trim()}
                  className={cn(
                    "px-3 py-2 rounded-lg text-white font-bold text-sm flex items-center gap-1",
                    novo.trim() ? "bg-fuchsia-600 hover:bg-fuchsia-700" : "bg-slate-300 cursor-not-allowed",
                  )}
                >
                  <Plus size={14} /> Adicionar
                </button>
              </div>

              <p className="text-[11px] text-slate-400">
                Alterações são salvas neste dispositivo (localStorage).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
