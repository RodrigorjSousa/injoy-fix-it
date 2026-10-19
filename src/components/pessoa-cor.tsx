import { useState } from "react";
import { toast } from "sonner";
import { PALETA_CORES, corDoTexto, useCorDe, useCoresEquipe, useSalvarCorColaborador, type RefPessoa } from "@/lib/cores-equipe";
import { cn } from "@/lib/utils";

const iniciais = (nome?: string | null) => (nome ?? "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

/** Bolinha com as iniciais, na cor de identidade da pessoa. */
export function AvatarCor({ nome, className, ...ref }: RefPessoa & { className?: string }) {
  const cor = useCorDe()({ ...ref, nome });
  return <span title={nome ?? undefined} className={cn("inline-grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold", !cor && "bg-slate-200 text-slate-600", className)} style={cor ? { backgroundColor: cor, color: corDoTexto(cor) } : undefined}>{iniciais(nome)}</span>;
}

/** Nome da pessoa com a bolinha na cor dela. */
export function NomeCor({ nome, className, semAvatar, ...ref }: RefPessoa & { className?: string; semAvatar?: boolean }) {
  const cor = useCorDe()({ ...ref, nome });
  return <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>{!semAvatar && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: cor ?? "#cbd5e1" }} />}<span className="truncate">{nome}</span></span>;
}

/** Gestor escolhe a cor da pessoa (paleta, cor livre ou volta para a automática). */
export function SeletorCor({ colaboradorId, nome }: { colaboradorId: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const { data } = useCoresEquipe();
  const salvar = useSalvarCorColaborador();
  const atual = data?.find((c) => c.colaborador_id === colaboradorId);
  const escolher = (cor: string | null) => salvar.mutate({ id: colaboradorId, cor }, { onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar a cor. A migração 0073 já foi aplicada?") });
  return <div className="mt-1">
    <button type="button" onClick={() => setAberto((v) => !v)} className="inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted" aria-label={`Cor de ${nome}`}>
      <span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ backgroundColor: atual?.cor ?? "#cbd5e1" }} />Cor{atual && !atual.cor_propria ? " (automática)" : ""}
    </button>
    {aberto && <div className="mt-1 rounded-md border bg-background p-2">
      <div className="grid grid-cols-8 gap-1">{PALETA_CORES.map((c) => <button key={c} type="button" onClick={() => escolher(c)} aria-label={c} className={cn("h-5 w-5 rounded-full ring-1 ring-black/10", atual?.cor === c && "ring-2 ring-foreground")} style={{ backgroundColor: c }} />)}</div>
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <input type="color" value={atual?.cor ?? "#2563eb"} onChange={(e) => escolher(e.target.value)} className="h-6 w-8 cursor-pointer rounded border" aria-label="Cor livre" />
        <button type="button" className="underline" onClick={() => escolher(null)}>Voltar para a automática</button>
      </div>
    </div>}
  </div>;
}
