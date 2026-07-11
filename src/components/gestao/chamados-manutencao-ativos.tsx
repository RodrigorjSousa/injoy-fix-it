import { useMemo, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Unidade } from "@/lib/store";
import { getTipoQuarto, padQuarto } from "@/lib/tipos-quarto";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Urgencia = "Urgente" | "Normal" | "Leve" | "Baixa";
export type StatusChamado =
  | "Aberto"
  | "Em Atendimento"
  | "Resolvido"
  | "Cancelado";

export interface ChamadoManut {
  id: number;
  property: Unidade;
  quarto: string;
  categoria: string;
  urgencia: Urgencia;
  tecnico: string;
  status: StatusChamado;
}

const TECNICOS = [
  "Rodrigo Sousa",
  "Técnico Geral",
  "Marceneiro Terceirizado",
  "Eletricista Plantão",
  "Encanador Externo",
  "Não Atribuído",
];

const URGENCIAS: Urgencia[] = ["Urgente", "Normal", "Leve", "Baixa"];
const STATUSES: StatusChamado[] = [
  "Aberto",
  "Em Atendimento",
  "Resolvido",
  "Cancelado",
];

const INITIAL: ChamadoManut[] = [
  { id: 101, property: "Botafogo", quarto: "01", categoria: "Elétrica", urgencia: "Urgente", tecnico: "Rodrigo Sousa", status: "Aberto" },
  { id: 102, property: "Botafogo", quarto: "02", categoria: "Ar Condicionado", urgencia: "Urgente", tecnico: "Rodrigo Sousa", status: "Em Atendimento" },
  { id: 103, property: "Botafogo", quarto: "107", categoria: "Hidráulica", urgencia: "Normal", tecnico: "Técnico Geral", status: "Aberto" },
  { id: 104, property: "Botafogo", quarto: "301", categoria: "Mobiliário", urgencia: "Leve", tecnico: "Marceneiro Terceirizado", status: "Resolvido" },
  { id: 201, property: "Ipanema", quarto: "410", categoria: "Ar Condicionado", urgencia: "Urgente", tecnico: "Rodrigo Sousa", status: "Aberto" },
  { id: 202, property: "Ipanema", quarto: "205", categoria: "Elétrica", urgencia: "Normal", tecnico: "Técnico Geral", status: "Em Atendimento" },
  { id: 203, property: "Ipanema", quarto: "308", categoria: "Hidráulica", urgencia: "Leve", tecnico: "Técnico Geral", status: "Resolvido" },
];

const urgenciaClasses: Record<Urgencia, string> = {
  Urgente: "bg-red-100 text-red-700 border-red-200",
  Normal: "bg-slate-200 text-slate-700 border-slate-300",
  Leve: "bg-amber-100 text-amber-700 border-amber-200",
  Baixa: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const statusClasses: Record<StatusChamado, string> = {
  Aberto: "text-blue-600",
  "Em Atendimento": "text-amber-600",
  Resolvido: "text-emerald-600",
  Cancelado: "text-slate-500 line-through",
};

export function ChamadosManutencaoAtivos({ unidade }: { unidade: Unidade }) {
  const [chamados, setChamados] = useState<ChamadoManut[]>(INITIAL);
  // Pending drafts keyed by chamado id
  const [drafts, setDrafts] = useState<
    Record<number, Partial<Pick<ChamadoManut, "status" | "tecnico" | "urgencia">>>
  >({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const chamadosUnidade = useMemo(
    () => chamados.filter((c) => c.property === unidade),
    [chamados, unidade],
  );
  const ativos = chamadosUnidade.filter(
    (c) => c.status !== "Resolvido" && c.status !== "Cancelado",
  ).length;

  const merged = (c: ChamadoManut): ChamadoManut => ({ ...c, ...drafts[c.id] });
  const hasChanges = (c: ChamadoManut) => {
    const d = drafts[c.id];
    if (!d) return false;
    return (
      (d.status !== undefined && d.status !== c.status) ||
      (d.tecnico !== undefined && d.tecnico !== c.tecnico) ||
      (d.urgencia !== undefined && d.urgencia !== c.urgencia)
    );
  };

  const updateDraft = <K extends keyof ChamadoManut>(
    id: number,
    field: K,
    value: ChamadoManut[K],
  ) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const salvar = async (c: ChamadoManut) => {
    setSavingId(c.id);
    await new Promise((r) => setTimeout(r, 500));
    setChamados((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, ...drafts[c.id] } : x)),
    );
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });
    setSavingId(null);
    toast.success(`Chamado do quarto ${padQuarto(c.quarto)} atualizado`);
  };

  const adicionarChamado = () => {
    const id = Date.now();
    setChamados((prev) => [
      ...prev,
      {
        id,
        property: unidade,
        quarto: "000",
        categoria: "Geral",
        urgencia: "Normal",
        tecnico: "Não Atribuído",
        status: "Aberto",
      },
    ]);
    toast("Novo chamado adicionado", { description: "Ajuste os campos e salve." });
  };

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
          <button
            onClick={adicionarChamado}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            aria-label="Adicionar chamado"
          >
            <Plus size={12} /> Novo
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {chamadosUnidade.length === 0 && (
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
              <div className="flex flex-wrap justify-between items-center gap-2">
                <span className="font-black text-slate-800 text-sm">
                  Quarto {padQuarto(c.quarto)} - {getTipoQuarto(c.property, c.quarto)}
                </span>

                <Select
                  value={c.urgencia}
                  onValueChange={(v) => updateDraft(base.id, "urgencia", v as Urgencia)}
                >
                  <SelectTrigger
                    className={cn(
                      "h-6 w-auto min-w-[92px] px-2 py-0 rounded-md font-bold text-xs border",
                      urgenciaClasses[c.urgencia],
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {URGENCIAS.map((u) => (
                      <SelectItem key={u} value={u} className="text-xs">
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    onValueChange={(v) =>
                      updateDraft(base.id, "status", v as StatusChamado)
                    }
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
                    value={c.tecnico}
                    onValueChange={(v) => updateDraft(base.id, "tecnico", v)}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-6 w-auto min-w-[160px] px-2 py-0 rounded font-bold text-xs border",
                        c.tecnico === "Rodrigo Sousa"
                          ? "bg-blue-100 text-blue-800 border-blue-200"
                          : "bg-slate-200 text-slate-700 border-slate-300",
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TECNICOS.map((t) => (
                        <SelectItem key={t} value={t} className="text-xs">
                          🛠️ {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {(dirty || saving) && (
                    <button
                      onClick={() => salvar(base)}
                      disabled={saving}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-colors",
                        "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60",
                      )}
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
