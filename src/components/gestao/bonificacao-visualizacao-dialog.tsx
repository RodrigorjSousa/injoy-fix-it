import { useMemo } from "react";
import { Eye, ListChecks, Target, Trophy } from "lucide-react";
import { SETOR_META, SITUACAO_INFO, avaliarMetaSetores, useMetaSituacao, type SetorMeta } from "@/lib/bonus-meta";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  calcularMediasBonificacao,
  formatBRL,
  nivelNota,
  useRegistrosBonificacaoMes,
  type NivelNota,
  type RegistroBonificacao,
} from "@/lib/bonificacao";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const COR_NOTA: Record<NivelNota, string> = {
  verde: "bg-emerald-100 text-emerald-800 border-emerald-300",
  amarelo: "bg-amber-100 text-amber-800 border-amber-300",
  vermelho: "bg-rose-100 text-rose-800 border-rose-300",
  sem: "bg-slate-100 text-slate-500 border-slate-300",
};

function Nota({ titulo, nota }: { titulo: string; nota: number | null }) {
  return (
    <div className={cn("rounded-lg border p-2 text-center", COR_NOTA[nivelNota(nota)])}>
      <div className="text-[10px] font-bold uppercase tracking-wide">{titulo}</div>
      <div className="text-xl font-black tabular-nums">{nota == null ? "—" : nota.toFixed(1)}</div>
    </div>
  );
}

function Valor({ v }: { v: number }) {
  return (
    <span className={cn("font-mono text-xs font-bold", v >= 0 ? "text-emerald-700" : "text-rose-600")}>
      {formatBRL(v)}
    </span>
  );
}

/** Agrupa os dois registros (Recepção + Camareiras) de cada avaliação. */
export function agruparAvaliacoes(registros: RegistroBonificacao[]) {
  const grupos = new Map<string, { recepcao?: RegistroBonificacao; camareiras?: RegistroBonificacao }>();
  for (const r of registros) {
    const chave = r.avaliacao_id ?? r.id;
    const g = grupos.get(chave) ?? {};
    if (r.setor === "camareiras") g.camareiras = r;
    else g.recepcao = r;
    grupos.set(chave, g);
  }
  return Array.from(grupos.values())
    .map((g) => ({ ...g, base: (g.recepcao ?? g.camareiras)! }))
    .sort((a, b) => b.base.data.localeCompare(a.base.data) || b.base.created_at.localeCompare(a.base.created_at));
}

/** Bonificação do mês somente para consulta (sem lançar, editar ou excluir). */
export function BonificacaoVisualizacaoDialog({
  open,
  onOpenChange,
  unidade,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unidade: Unidade;
}) {
  const { data: registros = [], isLoading, isError } = useRegistrosBonificacaoMes(unidade);
  const avaliacoes = useMemo(() => agruparAvaliacoes(registros), [registros]);
  const medias = calcularMediasBonificacao(registros);
  const totalRecepcao = registros.filter((r) => r.setor !== "camareiras").reduce((s, r) => s + Number(r.valor_calculado), 0);
  const { data: meta } = useMetaSituacao();
  const cfgMeta = meta?.config;
  const setoresMeta = cfgMeta ? avaliarMetaSetores(medias, cfgMeta.nota_minima) : null;
  const totalCamareiras = registros.filter((r) => r.setor === "camareiras").reduce((s, r) => s + Number(r.valor_calculado), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-emerald-500" />
            Bonificação · {MESES[new Date().getMonth()]} · {unidade}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> Somente visualização
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border bg-emerald-50/60 p-3">
            <div className="text-[11px] font-bold uppercase text-muted-foreground">Recepção</div>
            <div className={cn("text-lg font-black", totalRecepcao >= 0 ? "text-emerald-700" : "text-rose-600")}>{formatBRL(totalRecepcao)}</div>
          </div>
          <div className="rounded-lg border bg-emerald-50/60 p-3">
            <div className="text-[11px] font-bold uppercase text-muted-foreground">Camareiras / Manutenção</div>
            <div className={cn("text-lg font-black", totalCamareiras >= 0 ? "text-emerald-700" : "text-rose-600")}>{formatBRL(totalCamareiras)}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Nota titulo="Geral" nota={medias.geral} />
          <Nota titulo="Funcionário" nota={medias.funcionarios} />
          <Nota titulo="Limpeza" nota={medias.limpeza} />
        </div>

        {cfgMeta?.ativo && setoresMeta && (
          <section className="space-y-2 rounded-lg border-2 border-emerald-300 bg-emerald-50/60 p-3">
            <h3 className="flex items-center gap-1.5 text-sm font-black text-emerald-900">
              <Target className="h-4 w-4" /> Meta individual por setor: +{formatBRL(cfgMeta.valor_por_pessoa)} por pessoa
            </h3>
            <ul className="space-y-1 text-sm">
              {(Object.keys(SETOR_META) as SetorMeta[]).map((s) => {
                const r = setoresMeta[s];
                return (
                  <li key={s} className={cn("flex flex-wrap justify-between gap-2 rounded-md px-2 py-1", r.atingida ? "bg-emerald-100 text-emerald-900" : "bg-white")}>
                    <span>
                      <strong>{SETOR_META[s].rotulo}</strong> · nota {SETOR_META[s].nota}: {r.nota == null ? "—" : r.nota.toFixed(1)}
                    </span>
                    <strong>{r.atingida ? "Meta batida!" : `Falta chegar a ${cfgMeta.nota_minima.toFixed(1)}`}</strong>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="space-y-2 rounded-lg border p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-black">
            <ListChecks className="h-4 w-4" /> Regras das bonificações
          </h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              <strong>Meta individual:</strong> cada setor depende só da sua nota do mês, em{" "}
              {(cfgMeta?.nota_minima ?? 9).toFixed(1)} ou mais. <strong>Recepção</strong> → nota Funcionário;{" "}
              <strong>Camareiras e Manutenção</strong> → nota Limpeza. Quem bater ganha +{formatBRL(cfgMeta?.valor_por_pessoa ?? 100)}. A
              nota Geral não conta.
            </li>
            <li>
              <strong>Atrasos:</strong> no máximo {cfgMeta?.max_atrasos ?? 3} no mês. Conta como atraso chegar mais de{" "}
              {cfgMeta?.tolerancia_minutos ?? 10} minutos depois do horário da escala.
            </li>
            <li>
              <strong>Faltas:</strong> nenhuma falta sem justificativa.
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            As regras 2 e 3 valem para as duas bonificações: a meta da equipe e a bonificação por avaliações. Quem
            passar de {cfgMeta?.max_atrasos ?? 3} atrasos ou tiver falta sem justificativa perde as duas naquele mês.
          </p>
          {meta && meta.pessoas.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-xs font-bold uppercase text-muted-foreground">
                {meta.gestor ? "Situação da equipe" : "Sua situação"}
              </div>
              <ul className="space-y-1">
                {meta.pessoas.filter((p) => p.ativo).map((p) => (
                  <li key={p.funcionario_id} className={cn("flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs", SITUACAO_INFO[p.situacao].classe)}>
                    <span className="font-semibold">{p.nome} <span className="font-normal opacity-75">· {SETOR_META[p.setor]?.rotulo ?? "—"}</span></span>
                    <span>
                      {p.atrasos} atraso{p.atrasos === 1 ? "" : "s"} · {p.faltas} falta{p.faltas === 1 ? "" : "s"} · {SITUACAO_INFO[p.situacao].rotulo}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Avaliações do mês ({avaliacoes.length})
          </h3>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {isError && <p className="text-sm text-destructive">Não foi possível carregar as avaliações.</p>}
          {!isLoading && !avaliacoes.length && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma avaliação registrada neste mês.
            </div>
          )}
          <ul className="space-y-2">
            {avaliacoes.map(({ base, recepcao, camareiras }) => (
              <li key={base.avaliacao_id ?? base.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold">{base.nome_hospede}</span>
                    {base.teve_elogio && <span className="ml-1" title="Teve elogio">⭐</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(base.data + "T00:00:00").toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="outline">Geral {Number(base.nota_geral)}</Badge>
                  {recepcao && <Badge variant="outline">Funcionários {Number(recepcao.nota_funcionarios)}</Badge>}
                  {camareiras && <Badge variant="outline">Limpeza {Number(camareiras.nota_limpeza)}</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {recepcao && (
                    <span>Recepção: <Valor v={Number(recepcao.valor_calculado)} /></span>
                  )}
                  {camareiras && (
                    <span>Camareiras: <Valor v={Number(camareiras.valor_calculado)} /></span>
                  )}
                </div>
                {(recepcao?.observacao || camareiras?.observacao) && (
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {recepcao?.observacao && <div>Recepção: {recepcao.observacao}</div>}
                    {camareiras?.observacao && <div>Limpeza: {camareiras.observacao}</div>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
