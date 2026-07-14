import { useEffect, useState } from "react";
import { Loader2, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const TAREFAS_FALLBACK = [
  "Fazer café",
  "Limpar banheiro comum",
  "Limpar o chão da área comum",
  "Varrer a frente do hotel",
  "Trocar lixo da área comum",
];

interface Props {
  open: boolean;
  onClose: () => void;
  unidade: "Botafogo" | "Ipanema";
  camareiraName: string;
}

export function ExtraTasksModal({ open, onClose, unidade, camareiraName }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);
  const [tarefas, setTarefas] = useState<string[]>(TAREFAS_FALLBACK);

  useEffect(() => {
    if (!open) return;
    setChecked({});
    (async () => {
      const { data, error } = await supabase
        .from("extra_tasks_directory" as never)
        .select("name")
        .order("name");
      if (!error && Array.isArray(data) && data.length > 0) {
        setTarefas((data as { name: string }[]).map((d) => d.name));
      }
    })();
  }, [open]);

  if (!open) return null;

  const toggle = (t: string) => setChecked((s) => ({ ...s, [t]: !s[t] }));
  const selecionadas = tarefas.filter((t: string) => checked[t]);
  const canSubmit = selecionadas.length > 0 && !salvando;

  const salvar = async () => {
    if (!canSubmit) return;
    setSalvando(true);
    try {
      const { error } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: tabela nova ainda não está no types.ts gerado
        .from("extra_tasks_logs" as any)
        .insert({
          property: unidade,
          camareira_name: camareiraName || "—",
          completed_tasks: selecionadas,
        });
      if (error) throw error;
      toast.success(`${selecionadas.length} tarefa(s) registrada(s)`);
      onClose();
    } catch (err) {
      console.error("[extra-tasks] erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao salvar tarefas");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              ✨ Tarefas Extras
            </p>
            <h3 className="text-base font-black text-white">Checklist do Turno</h3>
            <p className="text-xs text-slate-400">INJOY {unidade} · {camareiraName || "—"}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-2 overflow-y-auto flex-1">
          {tarefas.map((t: string) => {
            const on = !!checked[t];
            return (
              <button
                key={t}
                onClick={() => toggle(t)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                  on
                    ? "bg-emerald-500/10 border-emerald-500 text-white"
                    : "bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600",
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-md flex items-center justify-center border-2 transition-all shrink-0",
                    on ? "bg-emerald-500 border-emerald-500" : "border-slate-600",
                  )}
                >
                  {on && <CheckCircle2 size={16} className="text-white" />}
                </div>
                <span className="text-sm font-semibold">{t}</span>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={salvar}
            disabled={!canSubmit}
            className={cn(
              "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2",
              canSubmit
                ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                : "bg-slate-800 text-slate-500 cursor-not-allowed",
            )}
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : null}
            Salvar Tarefas ({selecionadas.length})
          </button>
        </div>
      </div>
    </div>
  );
}
