import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Heart,
  Loader2,
  Plus,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { agruparAvaliacoes } from "@/components/gestao/bonificacao-visualizacao-dialog";
import { formatBRL, useConfigBonificacao, type RegistroBonificacao } from "@/lib/bonificacao";
import {
  avaliarMetaSetores,
  CONFIG_PADRAO,
  SETOR_META,
  useFuncionariosLista,
  type MetaConfig,
  type MetaPessoa,
} from "@/lib/bonus-meta";
import { limitesDoMes, mesAnterior, resumirPagamento } from "@/lib/bonificacao-pagamento";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Elogio = {
  id: string;
  data: string;
  unidade: "Botafogo" | "Ipanema";
  funcionario_id: string;
  avaliacao_ref: string | null;
  nome_hospede: string | null;
  comentario: string | null;
};

const mesBR = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
const dataBR = (d: string) => d.split("-").reverse().join("/");
const erro = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));

/** Gestor: resumo do que pagar no mês (meta do setor + elogios diretos), com os elogios a marcar. */
export function BonificacaoPagamento() {
  const qc = useQueryClient();
  const [mes, setMes] = useState(mesAnterior(todaySP()));
  const { inicio, fim } = limitesDoMes(mes);
  const { data: cfgBonif } = useConfigBonificacao();
  const { data: funcionarios = [] } = useFuncionariosLista();
  const valorElogio = Number(cfgBonif?.valor_elogio ?? 20);

  const q = useQuery({
    queryKey: ["bonificacao_pagamento", mes],
    queryFn: async () => {
      const [sit, regs, elog] = await Promise.all([
        db.rpc("bonus_meta_situacao", { _mes: inicio }),
        supabase.from("registros_bonificacao").select("*").gte("data", inicio).lte("data", fim),
        db.from("bonus_elogios").select("*").gte("data", inicio).lte("data", fim).order("data"),
      ]);
      if (sit.error) throw new Error(sit.error.message);
      if (regs.error) throw new Error(regs.error.message);
      const semTabela = !!elog.error && /bonus_elogios/.test(String(elog.error.message));
      if (elog.error && !semTabela) throw new Error(elog.error.message);
      const r = sit.data as { config: Partial<MetaConfig>; pessoas: MetaPessoa[] };
      const cfg: MetaConfig = {
        ativo: r.config?.ativo ?? CONFIG_PADRAO.ativo,
        valor_por_pessoa: Number(r.config?.valor_por_pessoa ?? CONFIG_PADRAO.valor_por_pessoa),
        nota_minima: Number(r.config?.nota_minima ?? CONFIG_PADRAO.nota_minima),
        tolerancia_minutos: Number(
          r.config?.tolerancia_minutos ?? CONFIG_PADRAO.tolerancia_minutos,
        ),
        max_atrasos: Number(r.config?.max_atrasos ?? CONFIG_PADRAO.max_atrasos),
      };
      return {
        cfg,
        pessoas: (r.pessoas ?? []).map((p) => ({
          ...p,
          atrasos: Number(p.atrasos),
          faltas: Number(p.faltas),
        })),
        registros: (regs.data ?? []) as RegistroBonificacao[],
        elogios: (elog.data ?? []) as Elogio[],
        semTabela,
      };
    },
  });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["bonificacao_pagamento", mes] });

  const nomes = useMemo(
    () => Object.fromEntries(funcionarios.map((f) => [f.id, f.nome])),
    [funcionarios],
  );
  const resumo = useMemo(
    () =>
      q.data
        ? resumirPagamento({
            pessoas: q.data.pessoas,
            registros: q.data.registros,
            cfg: q.data.cfg,
            valorElogio,
            elogios: q.data.elogios,
            nomes,
          })
        : null,
    [q.data, valorElogio, nomes],
  );
  const avaliacoes = useMemo(() => agruparAvaliacoes(q.data?.registros ?? []), [q.data]);
  const comElogio = avaliacoes.filter((a) => a.recepcao?.teve_elogio || a.camareiras?.teve_elogio);
  const avulsos = (q.data?.elogios ?? []).filter((e) => !e.avaliacao_ref);
  // Quem pode ser marcado: participantes da meta primeiro, depois o resto do cadastro.
  const pessoasEscolha = useMemo(() => {
    const part = (q.data?.pessoas ?? [])
      .filter((p) => p.ativo)
      .map((p) => ({ id: p.funcionario_id, nome: p.nome }));
    const ids = new Set(part.map((p) => p.id));
    return [...part, ...funcionarios.filter((f) => !ids.has(f.id))];
  }, [q.data, funcionarios]);

  const [recalculando, setRecalculando] = useState(false);
  const recalcular = async () => {
    setRecalculando(true);
    try {
      const { data, error } = await db.rpc("bonus_meta_apurar", { _mes: inicio });
      if (error) throw new Error(error.message);
      toast.success(
        `Atrasos e faltas de ${mesBR(mes)} conferidos de novo (${data ?? 0} ocorrência(s)).`,
      );
      void recarregar();
    } catch (e) {
      erro(e);
    } finally {
      setRecalculando(false);
    }
  };

  const marcar = async (input: Omit<Elogio, "id">) => {
    const { error } = await db.from("bonus_elogios").insert(input);
    if (error)
      return erro(
        new Error(
          /duplicate|unique/i.test(error.message)
            ? "Essa pessoa já está marcada nesta avaliação."
            : error.message,
        ),
      );
    void recarregar();
  };
  const desmarcar = async (id: string) => {
    const { data, error } = await db.from("bonus_elogios").delete().eq("id", id).select("id");
    if (error) return erro(new Error(error.message));
    if (!data?.length) return erro(new Error("Não foi possível remover (sem permissão)."));
    void recarregar();
  };

  const titulo = `Bonificação a pagar · ${mesBR(mes)}`;
  const linhasExport = () =>
    (resumo?.linhas ?? []).map((l) => [
      l.nome,
      l.setor ? SETOR_META[l.setor].rotulo : "—",
      l.unidade,
      String(l.atrasos),
      String(l.faltas),
      l.perdeu ? `Perdeu: ${l.motivo}` : l.metaAtingida ? "Meta batida" : "Meta não batida",
      formatBRL(l.valorMeta),
      `${l.qtdElogios} × ${formatBRL(valorElogio)}`,
      formatBRL(l.valorElogios),
      formatBRL(l.total),
    ]);
  const cabecalho = [
    "Pessoa",
    "Setor",
    "Unidade",
    "Atrasos",
    "Faltas",
    "Situação",
    "Meta",
    "Elogios",
    "Valor elogios",
    "Total",
  ];
  const pdf = () => {
    if (!resumo) return;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(titulo, 14, 16);
    doc.setFontSize(9);
    doc.text(
      `Meta: Geral e nota do setor >= ${q.data?.cfg.nota_minima.toFixed(1)} = ${formatBRL(q.data?.cfg.valor_por_pessoa ?? 0)} por pessoa · Elogio direto = ${formatBRL(valorElogio)} · Perde tudo com mais de ${q.data?.cfg.max_atrasos} atrasos ou falta sem justificativa.`,
      14,
      22,
    );
    autoTable(doc, {
      startY: 27,
      styles: { fontSize: 8 },
      head: [cabecalho],
      body: linhasExport(),
      foot: [
        [
          "TOTAL",
          "",
          "",
          "",
          "",
          "",
          formatBRL(resumo.totalMeta),
          "",
          formatBRL(resumo.totalElogios),
          formatBRL(resumo.total),
        ],
      ],
    });
    doc.save(`bonificacao-pagamento-${mes}.pdf`);
  };
  const csv = () => {
    if (!resumo) return;
    const linhas = [
      cabecalho,
      ...linhasExport(),
      [
        "TOTAL",
        "",
        "",
        "",
        "",
        "",
        formatBRL(resumo.totalMeta),
        "",
        formatBRL(resumo.totalElogios),
        formatBRL(resumo.total),
      ],
    ];
    const txt =
      "﻿" +
      linhas.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bonificacao-pagamento-${mes}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Mês</Label>
          <Input
            type="month"
            value={mes}
            onChange={(e) => e.target.value && setMes(e.target.value)}
            className="w-44"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={recalcular}
          disabled={recalculando}
          title="Confere de novo atrasos e faltas do mês com a Escala e o ponto"
        >
          {recalculando ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-4 w-4" />
          )}
          Conferir atrasos do mês
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={csv} disabled={!resumo}>
            <FileSpreadsheet className="mr-1 h-4 w-4" />
            Planilha
          </Button>
          <Button variant="outline" size="sm" onClick={pdf} disabled={!resumo}>
            <Download className="mr-1 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {q.isLoading && (
        <div className="grid place-items-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {q.error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {(q.error as Error).message}
        </p>
      )}
      {q.data?.semTabela && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Para marcar os elogios, aplique a migração <strong>0091_bonus_elogios</strong> no Lovable.
          A meta já aparece abaixo.
        </p>
      )}

      {resumo && q.data && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["Botafogo", "Ipanema"] as const).map((u) => {
              const m = resumo.medias[u];
              const s = avaliarMetaSetores(m, q.data.cfg.nota_minima);
              const n = (v: number | null) => (v == null ? "—" : v.toFixed(1));
              return (
                <div key={u} className="rounded-lg border p-3 text-sm">
                  <p className="font-bold">
                    {u} · {m.avaliacoes} avaliação(ões)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Geral {n(m.geral)} · Funcionário {n(m.funcionarios)} · Limpeza {n(m.limpeza)}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {(["recepcao", "camareiras"] as const).map((k) => (
                      <p
                        key={k}
                        className={cn(
                          "flex items-center gap-1 text-xs font-semibold",
                          s[k].atingida ? "text-emerald-700" : "text-rose-700",
                        )}
                      >
                        {s[k].atingida ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {SETOR_META[k].rotulo} ({SETOR_META[k].nota}):{" "}
                        {s[k].atingida ? "meta batida" : "meta não batida"}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Meta em grupo</p>
              <p className="text-xl font-black">{formatBRL(resumo.totalMeta)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Elogios diretos</p>
              <p className="text-xl font-black">{formatBRL(resumo.totalElogios)}</p>
            </div>
            <div className="rounded-lg border-2 border-emerald-400 bg-emerald-50 p-3">
              <p className="text-xs text-muted-foreground">Total a pagar</p>
              <p className="text-xl font-black text-emerald-700">{formatBRL(resumo.total)}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Pessoa</th>
                  <th className="p-2 text-center">Atrasos / Faltas</th>
                  <th className="p-2 text-right">Meta</th>
                  <th className="p-2 text-right">Elogios</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumo.linhas.map((l) => (
                  <tr key={l.funcionarioId} className={cn("border-t", l.perdeu && "bg-rose-50")}>
                    <td className="p-2">
                      <p className="font-semibold">{l.nome}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {l.setor ? SETOR_META[l.setor].rotulo : "Fora da meta"} · {l.unidade}
                      </p>
                      {l.perdeu && (
                        <p className="text-[11px] font-semibold text-rose-700">
                          Perdeu no mês: {l.motivo}
                        </p>
                      )}
                    </td>
                    <td className={cn("p-2 text-center", l.perdeu && "font-bold text-rose-700")}>
                      {l.participante ? `${l.atrasos} / ${l.faltas}` : "—"}
                    </td>
                    <td className="p-2 text-right">{formatBRL(l.valorMeta)}</td>
                    <td className="p-2 text-right">
                      {formatBRL(l.valorElogios)}
                      {l.qtdElogios > 0 && (
                        <span className="block text-[11px] text-muted-foreground">
                          {l.qtdElogios} × {formatBRL(valorElogio)}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-right font-black">{formatBRL(l.total)}</td>
                  </tr>
                ))}
                {!resumo.linhas.length && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      Ninguém na meta neste mês.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Atrasos e faltas contam só os sem justificativa (justifique em Meta equipe). Quem passa
            de {q.data.cfg.max_atrasos} atrasos ou tem falta sem justificativa perde a meta e os
            elogios do mês.
          </p>

          {!q.data.semTabela && (
            <section className="space-y-3 rounded-lg border p-3">
              <h3 className="flex items-center gap-1.5 font-bold">
                <Heart className="h-4 w-4 text-rose-500" />
                Elogios diretos de {mesBR(mes)} ({formatBRL(valorElogio)} cada)
              </h3>
              <p className="text-xs text-muted-foreground">
                Marque quem foi elogiado pelo nome em cada avaliação com elogio. Se o hóspede
                elogiou duas pessoas, marque as duas.
              </p>
              <ul className="space-y-2">
                {comElogio.map((a) => {
                  const ref = a.base.avaliacao_id ?? a.base.id;
                  const marcados = q.data.elogios.filter((e) => e.avaliacao_ref === ref);
                  const obs = [a.recepcao?.observacao, a.camareiras?.observacao]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={ref} className="rounded-md border p-2 text-sm">
                      <p className="font-semibold">
                        {dataBR(a.base.data)} · {a.base.unidade} · {a.base.nome_hospede}
                      </p>
                      {obs && <p className="text-xs italic text-muted-foreground">"{obs}"</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {marcados.map((e) => (
                          <span
                            key={e.id}
                            className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800"
                          >
                            {nomes[e.funcionario_id] ?? "—"}
                            <button
                              type="button"
                              onClick={() => desmarcar(e.id)}
                              aria-label="Remover"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        <Select
                          value=""
                          onValueChange={(id) =>
                            marcar({
                              data: a.base.data,
                              unidade: a.base.unidade as "Botafogo" | "Ipanema",
                              funcionario_id: id,
                              avaliacao_ref: ref,
                              nome_hospede: a.base.nome_hospede,
                              comentario: obs || null,
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-48 text-xs">
                            <SelectValue placeholder="+ Quem foi elogiado" />
                          </SelectTrigger>
                          <SelectContent>
                            {pessoasEscolha
                              .filter((p) => !marcados.some((m) => m.funcionario_id === p.id))
                              .map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.nome}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </li>
                  );
                })}
                {!comElogio.length && (
                  <li className="text-sm text-muted-foreground">
                    Nenhuma avaliação marcada com elogio neste mês.
                  </li>
                )}
              </ul>
              <ElogioAvulso mes={mes} pessoas={pessoasEscolha} onAdd={(e) => marcar(e)} />
              {avulsos.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {avulsos.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1"
                    >
                      <span className="flex-1">
                        {dataBR(e.data)} · {e.unidade} ·{" "}
                        <strong>{nomes[e.funcionario_id] ?? "—"}</strong>
                        {e.comentario ? ` · "${e.comentario}"` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => desmarcar(e.id)}
                        className="text-muted-foreground hover:text-rose-600"
                        aria-label="Remover"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Elogio que não veio de uma avaliação lançada (ex.: comentário no Booking ou no Google). */
function ElogioAvulso({
  mes,
  pessoas,
  onAdd,
}: {
  mes: string;
  pessoas: { id: string; nome: string }[];
  onAdd: (e: Omit<Elogio, "id">) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(`${mes}-01`);
  const [unidade, setUnidade] = useState<"Botafogo" | "Ipanema">("Botafogo");
  const [pessoa, setPessoa] = useState("");
  const [comentario, setComentario] = useState("");
  if (!aberto)
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setData(`${mes}-01`);
          setAberto(true);
        }}
      >
        <Plus className="mr-1 h-4 w-4" />
        Elogio avulso (Booking, Google…)
      </Button>
    );
  return (
    <div className="grid gap-2 rounded-md border bg-muted/30 p-2 sm:grid-cols-4">
      <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
      <Select value={unidade} onValueChange={(v) => setUnidade(v as "Botafogo" | "Ipanema")}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Botafogo">Botafogo</SelectItem>
          <SelectItem value="Ipanema">Ipanema</SelectItem>
        </SelectContent>
      </Select>
      <Select value={pessoa} onValueChange={setPessoa}>
        <SelectTrigger className="sm:col-span-2">
          <SelectValue placeholder="Quem foi elogiado" />
        </SelectTrigger>
        <SelectContent>
          {pessoas.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="sm:col-span-3"
        placeholder="Comentário (ex.: Julia foi ótima no atendimento)"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
      />
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={!pessoa || !data.startsWith(mes)}
          title={!data.startsWith(mes) ? "A data precisa ser do mês escolhido" : undefined}
          onClick={() => {
            onAdd({
              data,
              unidade,
              funcionario_id: pessoa,
              avaliacao_ref: null,
              nome_hospede: null,
              comentario: comentario.trim() || null,
            });
            setPessoa("");
            setComentario("");
            setAberto(false);
          }}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
