import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Loader2, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useChamados,
  useFuncionarios,
  useAtualizarChamado,
  type Unidade,
  type Status,
  type Chamado,
} from "@/lib/store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES: Status[] = ["Aberto", "Em Andamento", "Concluído"];

const statusClasses: Record<Status, string> = {
  Aberto: "text-blue-600",
  "Em Andamento": "text-amber-600",
  "Concluído": "text-emerald-600",
};

const statusBadge: Record<Status, string> = {
  Aberto: "bg-red-100 text-red-700 border-red-200",
  "Em Andamento": "bg-amber-100 text-amber-700 border-amber-200",
  "Concluído": "bg-emerald-100 text-emerald-700 border-emerald-200",
};

type Draft = { status?: Status; responsavelId?: string | null };

const NAO_ATRIBUIDO = "__none__";

export function ChamadosManutencaoAtivos({ unidade }: { unidade: Unidade }) {
  const { data: chamados = [], isLoading } = useChamados();
  const { data: funcionarios = [] } = useFuncionarios();
  const atualizar = useAtualizarChamado();

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const chamadosUnidade = useMemo(
    () => chamados.filter((c) => c.unidade === unidade),
    [chamados, unidade],
  );
  const ativos = chamadosUnidade.filter((c) => c.status !== "Concluído").length;

  const merged = (c: Chamado): Chamado => ({ ...c, ...drafts[c.id] });
  const hasChanges = (c: Chamado) => {
    const d = drafts[c.id];
    if (!d) return false;
    return (
      (d.status !== undefined && d.status !== c.status) ||
      (d.responsavelId !== undefined && d.responsavelId !== c.responsavelId)
    );
  };

  const updateDraft = (id: string, patch: Draft) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const salvar = async (c: Chamado) => {
    setSavingId(c.id);
    try {
      await atualizar.mutateAsync({ id: c.id, patch: drafts[c.id] ?? {} });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      toast.success("Chamado atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar chamado");
    } finally {
      setSavingId(null);
    }
  };

  const nomePor = (id: string | null) =>
    funcionarios.find((f) => f.id === id)?.nome ?? "Não atribuído";

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex justify-between items-center gap-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
          Chamados de Manutenção Ativos
        </h3>
        <div className="flex items-center gap-2">
          <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-md font-bold">
            {ativos} Ativos
          </span>
          <Link
            to="/painel"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Painel <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Carregando chamados...
          </div>
        )}

        {!isLoading && chamadosUnidade.length === 0 && (
          <div className="text-center text-xs text-slate-500 py-6">
            Nenhum chamado registrado em INJOY {unidade}.
          </div>
        )}

        {chamadosUnidade.map((base) => {
          const c = merged(base);
          const dirty = hasChanges(base);
          const saving = savingId === base.id;
          return (
            <div
              key={base.id}
              className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2"
            >
              <div className="flex flex-wrap justify-between items-start gap-2">
                <Link
                  to="/chamados/$id"
                  params={{ id: base.id }}
                  className="font-black text-slate-800 text-sm hover:underline flex-1 min-w-0 truncate"
                >
                  {c.descricao}
                </Link>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-md font-bold border text-[11px]",
                    statusBadge[c.status],
                  )}
                >
                  {c.status}
                </span>
              </div>

              <div className="flex flex-wrap justify-between items-center gap-2 text-slate-600">
                <p>
                  Categoria:{" "}
                  <span className="font-semibold text-slate-800">{c.categoria}</span>
                </p>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Status:</span>
                  <Select
                    value={c.status}
                    onValueChange={(v) => updateDraft(base.id, { status: v as Status })}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-6 w-auto min-w-[128px] px-2 py-0 rounded-md font-semibold text-xs bg-white border-slate-200",
                        statusClasses[c.status],
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-1.5 border-t border-slate-200 flex flex-wrap justify-between items-center gap-2">
                <span className="text-slate-400">Responsável Técnico:</span>
                <div className="flex items-center gap-2">
                  <Select
                    value={c.responsavelId ?? NAO_ATRIBUIDO}
                    onValueChange={(v) =>
                      updateDraft(base.id, {
                        responsavelId: v === NAO_ATRIBUIDO ? null : v,
                      })
                    }
                  >
                    <SelectTrigger
                      className={cn(
                        "h-6 w-auto min-w-[160px] px-2 py-0 rounded font-bold text-xs border",
                        c.responsavelId
                          ? "bg-blue-100 text-blue-800 border-blue-200"
                          : "bg-slate-200 text-slate-700 border-slate-300",
                      )}
                    >
                      <SelectValue>{nomePor(c.responsavelId)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NAO_ATRIBUIDO} className="text-xs">
                        Não atribuído
                      </SelectItem>
                      {funcionarios.map((f) => (
                        <SelectItem key={f.id} value={f.id} className="text-xs">
                          🛠️ {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {(dirty || saving) && (
                    <button
                      onClick={() => salvar(base)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                      aria-label="Salvar alterações"
                    >
                      {saving ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Check size={12} />
                      )}
                      Salvar
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
