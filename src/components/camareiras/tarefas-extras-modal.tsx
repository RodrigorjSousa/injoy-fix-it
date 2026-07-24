import { useEffect, useMemo, useState } from "react";
import {
  X,
  ChefHat,
  Trees,
  DoorOpen,
  Building2,
  WashingMachine,
  ChevronLeft,
  CheckCircle2,
  Pencil,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  unidade: "Botafogo" | "Ipanema";
  camareiraName: string;
}

type CategoryKey =
  | "cozinha"
  | "patio"
  | "salas_terreo"
  | "sala_401"
  | "area_servico";

interface Category {
  key: CategoryKey;
  label: string;
  icon: typeof ChefHat;
  gradient: string;
  ring: string;
  accent: string;
  defaults: string[];
}

const CATEGORIES: Category[] = [
  {
    key: "cozinha",
    label: "Geral Cozinha",
    icon: ChefHat,
    gradient: "from-rose-500 to-red-600",
    ring: "ring-rose-300",
    accent: "bg-rose-500",
    defaults: [
      "Lavar louça e talheres",
      "Higienizar bancadas e pias",
      "Limpar fogão e cooktop",
      "Limpar interior do micro-ondas",
      "Limpar geladeira externamente",
      "Repor produtos de café e chá",
      "Recolher e trocar o lixo",
      "Varrer e passar pano no chão",
      "Limpar mesa e cadeiras",
      "Organizar armários e utensílios",
    ],
  },
  {
    key: "patio",
    label: "Geral Pátio",
    icon: Trees,
    gradient: "from-emerald-500 to-green-600",
    ring: "ring-emerald-300",
    accent: "bg-emerald-500",
    defaults: [
      "Varrer todo o pátio",
      "Recolher folhas e sujeira",
      "Limpar mesas e cadeiras externas",
      "Regar as plantas",
      "Trocar lixo externo",
      "Limpar piscina/deck (se houver)",
      "Higienizar corrimãos e grades",
      "Passar pano no piso do pátio",
      "Verificar iluminação externa",
      "Organizar itens de decoração",
    ],
  },
  {
    key: "salas_terreo",
    label: "Geral Salas Térreo",
    icon: DoorOpen,
    gradient: "from-sky-500 to-blue-600",
    ring: "ring-sky-300",
    accent: "bg-sky-500",
    defaults: [
      "Aspirar sofás e poltronas",
      "Tirar pó de móveis e prateleiras",
      "Limpar mesas de centro",
      "Higienizar maçanetas e interruptores",
      "Limpar espelhos e vidros",
      "Varrer e passar pano no piso",
      "Trocar lixo das salas",
      "Organizar revistas e almofadas",
      "Verificar lâmpadas e tomadas",
      "Passar aromatizador de ambiente",
    ],
  },
  {
    key: "sala_401",
    label: "Geral Sala 401",
    icon: Building2,
    gradient: "from-violet-500 to-purple-600",
    ring: "ring-violet-300",
    accent: "bg-violet-500",
    defaults: [
      "Tirar pó de todas as superfícies",
      "Aspirar tapetes e estofados",
      "Limpar janelas e vidros",
      "Higienizar maçanetas e interruptores",
      "Limpar mesa e cadeiras",
      "Varrer e passar pano no piso",
      "Recolher e trocar o lixo",
      "Higienizar banheiro da sala",
      "Repor materiais de higiene",
      "Verificar ar-condicionado e iluminação",
    ],
  },
  {
    key: "area_servico",
    label: "Geral Área de Serviço",
    icon: WashingMachine,
    gradient: "from-amber-500 to-orange-600",
    ring: "ring-amber-300",
    accent: "bg-amber-500",
    defaults: [
      "Limpar tanque e pia",
      "Higienizar máquina de lavar",
      "Limpar varal e área de secagem",
      "Organizar produtos de limpeza",
      "Recolher e trocar o lixo",
      "Varrer e passar pano no piso",
      "Higienizar prateleiras",
      "Verificar ralos e escoamento",
      "Conferir estoque de produtos",
      "Limpar janelas e batentes",
    ],
  },
];

const storageKey = (unidade: string, cat: CategoryKey) =>
  `injoy:tarefas-extras:${unidade}:${cat}`;

function loadItems(unidade: string, cat: CategoryKey, defaults: string[]): string[] {
  try {
    const raw = localStorage.getItem(storageKey(unidade, cat));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 10) return parsed;
    }
  } catch {
    // ignore
  }
  return defaults;
}

function saveItems(unidade: string, cat: CategoryKey, items: string[]) {
  try {
    localStorage.setItem(storageKey(unidade, cat), JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function TarefasExtrasModal({ open, onClose, unidade, camareiraName }: Props) {
  const [active, setActive] = useState<CategoryKey | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [salvando, setSalvando] = useState(false);

  const activeCat = useMemo(
    () => CATEGORIES.find((c) => c.key === active) ?? null,
    [active],
  );

  useEffect(() => {
    if (!open) {
      setActive(null);
      setEditingIdx(null);
    }
  }, [open]);

  useEffect(() => {
    if (!activeCat) return;
    const loaded = loadItems(unidade, activeCat.key, activeCat.defaults);
    setItems(loaded);
    setChecked(new Array(10).fill(false));
    setEditingIdx(null);
  }, [activeCat, unidade]);

  if (!open) return null;

  const toggle = (i: number) =>
    setChecked((s) => s.map((v, idx) => (idx === i ? !v : v)));

  const commitEdit = () => {
    if (editingIdx === null || !activeCat) return;
    const next = items.map((v, i) => (i === editingIdx ? editValue.trim() || v : v));
    setItems(next);
    saveItems(unidade, activeCat.key, next);
    setEditingIdx(null);
  };

  const salvar = async () => {
    if (!activeCat) return;
    const selecionadas = items.filter((_, i) => checked[i]);
    if (selecionadas.length === 0) {
      toast.error("Marque ao menos 1 tarefa");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: tabela não tipada
        .from("extra_tasks_logs" as any)
        .insert({
          property: unidade,
          camareira_name: camareiraName || "—",
          completed_tasks: selecionadas.map((t) => `[${activeCat.label}] ${t}`),
        });
      if (error) throw error;
      toast.success(`${selecionadas.length} tarefa(s) registrada(s)`);
      setActive(null);
    } catch (err) {
      console.error("[tarefas-extras] erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col overflow-hidden bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            {active && (
              <button
                onClick={() => setActive(null)}
                className="p-2 rounded-lg hover:bg-white/10 text-white"
                aria-label="Voltar"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <div>
              <p className="text-[11px] font-bold text-fuchsia-100 uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={12} /> INJOY {unidade}
              </p>
              <h3 className="text-lg font-black text-white leading-tight">
                {activeCat ? activeCat.label : "Tarefas Extras"}
              </h3>
              <p className="text-xs text-fuchsia-100/80">
                {activeCat
                  ? `${camareiraName || "—"} · toque no lápis para editar`
                  : "Escolha uma área para começar"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 bg-slate-50">
          {!activeCat ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    onClick={() => setActive(c.key)}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl p-4 text-left text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.99] ring-2 ring-white/40",
                      "bg-gradient-to-br",
                      c.gradient,
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
                        <Icon size={26} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-90">
                          Checklist
                        </p>
                        <p className="text-base font-black leading-tight">
                          {c.label}
                        </p>
                        <p className="text-[11px] opacity-90">10 itens editáveis</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((t, i) => {
                const on = checked[i];
                const editing = editingIdx === i;
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border transition-all bg-white",
                      on
                        ? "border-emerald-500 ring-2 ring-emerald-200"
                        : "border-slate-200",
                    )}
                  >
                    <button
                      onClick={() => toggle(i)}
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center border-2 transition-all shrink-0",
                        on
                          ? "bg-emerald-500 border-emerald-500"
                          : "border-slate-300 hover:border-slate-400",
                      )}
                      aria-label="Marcar tarefa"
                    >
                      {on && <CheckCircle2 size={18} className="text-white" />}
                    </button>

                    {editing ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") setEditingIdx(null);
                        }}
                        className="flex-1 text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-md px-2 py-1 outline-none focus:border-purple-500"
                      />
                    ) : (
                      <button
                        onClick={() => toggle(i)}
                        className="flex-1 text-left text-sm font-semibold text-slate-800"
                      >
                        <span className="text-xs text-slate-400 mr-2">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {t}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setEditingIdx(i);
                        setEditValue(t);
                      }}
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeCat && (
          <div className="p-4 border-t border-white/10 bg-white">
            <button
              onClick={salvar}
              disabled={salvando}
              className={cn(
                "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 text-white shadow-lg",
                `bg-gradient-to-r ${activeCat.gradient}`,
                salvando ? "opacity-70 cursor-not-allowed" : "hover:brightness-110",
              )}
            >
              {salvando ? <Loader2 size={16} className="animate-spin" /> : null}
              Salvar Tarefas ({checked.filter(Boolean).length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
