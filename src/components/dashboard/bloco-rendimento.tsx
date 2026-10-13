import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
  fimMes,
  inicioMes,
  mesesAtras,
  useNoitesVendidas,
  useReclamacoes,
  useSincronizacoes,
  useSincronizarRendimento,
  UNIDADES_DASH,
} from "@/lib/dashboard/dados";
import {
  QUARTOS_UNIDADE,
  reclamacoesPorQuarto,
  resumoRendimento,
  type IndicadorQuarto,
  type ResumoRendimento,
  type UnidadeDash,
} from "@/lib/dashboard/rendimento";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { brl, brl0, CabecalhoUnidade, Cartao, dataCurta, diaCurto, Erros, horaCurta, Kpi, num, pct, Secao } from "./comum";

type Periodo = "mes" | "anterior" | "3m" | "12m";
const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: "mes", rotulo: "Este mês" },
  { id: "anterior", rotulo: "Mês passado" },
  { id: "3m", rotulo: "3 meses" },
  { id: "12m", rotulo: "12 meses" },
];
const VELHO_MS = 6 * 60 * 60 * 1000; // atualiza sozinho o mês atual se a última busca passou de 6 h

function mesesDoPeriodo(p: Periodo, mesAtual: string): string[] {
  if (p === "mes") return [mesAtual];
  if (p === "anterior") return [mesesAtras(mesAtual, 1)];
  const n = p === "3m" ? 3 : 12;
  return Array.from({ length: n }, (_, i) => mesesAtras(mesAtual, n - 1 - i));
}

export function BlocoRendimento() {
  const hoje = todaySP();
  const mesAtual = hoje.slice(0, 7);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const meses = mesesDoPeriodo(periodo, mesAtual);
  const de = inicioMes(meses[0]);
  const fim = fimMes(meses[meses.length - 1]);
  const ate = fim > hoje ? hoje : fim; // indicadores até hoje; o resto do mês aparece como "já reservado"

  const noitesQ = useNoitesVendidas(de, fim);
  const reclamQ = useReclamacoes(de, ate);
  const syncQ = useSincronizacoes();
  const sync = useSincronizarRendimento();
  const [progresso, setProgresso] = useState<string | null>(null);

  const atualizar = (lista: string[], silencioso = false) => {
    setProgresso(`0 de ${lista.length * 2}`);
    sync.mutate(
      { meses: lista, aoProgredir: (f, t) => setProgresso(`${f} de ${t}`) },
      {
        onSuccess: ({ resultados, falhas }) => {
          if (falhas.length) toast.error(`Cloudbeds: ${falhas.length} busca(s) falharam`, { description: falhas.join("\n") });
          else if (!silencioso) toast.success(`Rendimento atualizado (${resultados.reduce((s, r) => s + r.noites, 0)} noites)`);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar"),
        onSettled: () => setProgresso(null),
      },
    );
  };

  // Mês atual: busca sozinho uma vez se estiver sem dado ou velho.
  const autoFeito = useRef(false);
  useEffect(() => {
    if (autoFeito.current || !syncQ.data || sync.isPending) return;
    const doMes = syncQ.data.filter((s) => s.mes.slice(0, 7) === mesAtual);
    const velho =
      doMes.length < UNIDADES_DASH.length || doMes.some((s) => Date.now() - new Date(s.sincronizado_em).getTime() > VELHO_MS);
    autoFeito.current = true;
    if (velho) atualizar([mesAtual], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncQ.data]);

  const faltando = useMemo(() => {
    const tem = new Set((syncQ.data ?? []).map((s) => `${s.unidade}|${s.mes.slice(0, 7)}`));
    return meses.filter((m) => UNIDADES_DASH.some((u) => !tem.has(`${u}|${m}`)));
  }, [syncQ.data, meses]);
  const ultima = (syncQ.data ?? []).map((s) => s.sincronizado_em).sort().at(-1);
  const avisosSync = (syncQ.data ?? []).filter((s) => meses.includes(s.mes.slice(0, 7)) && s.avisos);

  const porUnidade = useMemo(() => {
    const noites = noitesQ.data ?? [];
    return Object.fromEntries(
      UNIDADES_DASH.map((u) => {
        const daUnidade = noites.filter((n) => n.unidade === u);
        const resumo = resumoRendimento(daUnidade, { de, ate, quartos: QUARTOS_UNIDADE[u] });
        const futuras = daUnidade.filter((n) => n.data > ate);
        const reclamacoes = reclamQ.data ? reclamacoesPorQuarto(reclamQ.data, u) : [];
        return [u, { resumo, futuras: { noites: futuras.length, receita: futuras.reduce((s, n) => s + n.valor, 0) }, reclamacoes }];
      }),
    ) as Record<UnidadeDash, { resumo: ResumoRendimento; futuras: { noites: number; receita: number }; reclamacoes: ReturnType<typeof reclamacoesPorQuarto> }>;
  }, [noitesQ.data, reclamQ.data, de, ate]);

  const rotuloPeriodo = `${dataCurta(de).slice(0, 5)} a ${dataCurta(ate).slice(0, 5)}`;

  return (
    <Secao
      titulo="Rendimento por unidade"
      acao={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold",
                  periodo === p.id ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => atualizar(meses)}
            disabled={sync.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-60"
          >
            {sync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {sync.isPending ? `Buscando no Cloudbeds ${progresso ?? ""}` : "Atualizar com o Cloudbeds"}
          </button>
        </div>
      }
    >
      <p className="text-[11px] text-slate-500">
        Período {rotuloPeriodo} · reservas do Cloudbeds (sem canceladas e no-show) · última busca {horaCurta(ultima)}
      </p>

      {syncQ.error && <Erros lista={[`Rendimento: ${(syncQ.error as Error).message}. A migração 0054 já foi aplicada?`]} />}
      {!syncQ.error && faltando.length > 0 && !sync.isPending && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Ainda não buscado no Cloudbeds: {faltando.map((m) => `${m.slice(5)}/${m.slice(2, 4)}`).join(", ")}.
          </span>
          <button type="button" onClick={() => atualizar(faltando)} className="font-bold underline">
            Buscar agora
          </button>
        </div>
      )}
      {noitesQ.error && <Erros lista={[`Noites vendidas: ${(noitesQ.error as Error).message}`]} />}
      {reclamQ.data?.erros.length ? <Erros lista={reclamQ.data.erros} /> : null}

      <ComparativoTopo dados={porUnidade} />

      <div className="grid gap-3 md:grid-cols-2">
        {UNIDADES_DASH.map((u) => (
          <CartaoUnidade
            key={u}
            unidade={u}
            carregando={noitesQ.isLoading}
            {...porUnidade[u]}
            mostrarFuturo={fim > hoje}
          />
        ))}
      </div>

      {avisosSync.length > 0 && (
        <details className="text-[11px] text-slate-500">
          <summary className="cursor-pointer">Observações da busca no Cloudbeds ({avisosSync.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {avisosSync.map((s) => (
              <li key={`${s.unidade}${s.mes}`}>
                {s.unidade} {s.mes.slice(5, 7)}/{s.mes.slice(0, 4)}: {s.avisos}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Secao>
  );
}

/** Uma linha para comparar as duas unidades de relance. */
function ComparativoTopo({ dados }: { dados: Record<UnidadeDash, { resumo: ResumoRendimento }> }) {
  const linhas: { rotulo: string; v: (r: ResumoRendimento) => number; f: (n: number) => string }[] = [
    { rotulo: "Receita", v: (r) => r.receita, f: (n) => brl0.format(n) },
    { rotulo: "Ocupação", v: (r) => r.ocupacao, f: (n) => pct(n) },
    { rotulo: "Diária média", v: (r) => r.diariaMedia, f: (n) => brl0.format(n) },
    { rotulo: "RevPAR", v: (r) => r.revpar, f: (n) => brl0.format(n) },
  ];
  const b = dados.Botafogo.resumo;
  const i = dados.Ipanema.resumo;
  if (!b.noites && !i.noites) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {linhas.map((l) => {
        const vb = l.v(b);
        const vi = l.v(i);
        const total = vb + vi || 1;
        return (
          <div key={l.rotulo} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-slate-500">{l.rotulo}</p>
            <div className="mt-1 flex justify-between text-xs font-black">
              <span className="text-blue-700">{l.f(vb)}</span>
              <span className="text-teal-700">{l.f(vi)}</span>
            </div>
            <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="bg-blue-700" style={{ width: `${(vb / total) * 100}%` }} />
              <div className="bg-teal-700" style={{ width: `${(vi / total) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CartaoUnidade({
  unidade,
  carregando,
  resumo: r,
  futuras,
  reclamacoes,
  mostrarFuturo,
}: {
  unidade: UnidadeDash;
  carregando: boolean;
  resumo: ResumoRendimento;
  futuras: { noites: number; receita: number };
  reclamacoes: ReturnType<typeof reclamacoesPorQuarto>;
  mostrarFuturo: boolean;
}) {
  const cor = unidade === "Botafogo" ? "#1d4ed8" : "#0f766e";
  if (carregando)
    return (
      <Cartao>
        <CabecalhoUnidade unidade={unidade} />
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      </Cartao>
    );
  const maxSemana = Math.max(...r.porDiaSemana.map((d) => d.ocupacao));
  return (
    <Cartao>
      <CabecalhoUnidade unidade={unidade} extra={<span className="text-[11px] text-slate-500">{r.quartos} quartos · {r.dias} dias</span>} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Kpi rotulo="Receita" valor={brl0.format(r.receita)} sub={`${r.noites} noites vendidas`} />
        <Kpi rotulo="Ocupação" valor={pct(r.ocupacao)} />
        <Kpi rotulo="Diária média" valor={brl.format(r.diariaMedia)} sub={`RevPAR ${brl.format(r.revpar)}`} />
        <Kpi rotulo="Reservas" valor={r.reservas} sub={`estadia média ${num(r.estadiaMedia)} noite(s)`} />
        <Kpi rotulo="Valor médio por reserva" valor={brl0.format(r.ticketMedio)} />
        <Kpi
          rotulo="Diária que mais fecha"
          valor={r.faixaMaisVendida ? `${brl0.format(r.faixaMaisVendida.de)}–${brl0.format(r.faixaMaisVendida.ate)}` : "—"}
          sub={r.faixaMaisVendida ? `${pct(r.faixaMaisVendida.parte)} das noites` : undefined}
        />
      </div>
      {mostrarFuturo && futuras.noites > 0 && (
        <p className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-900">
          Já reservado para o resto do período: <b>{brl0.format(futuras.receita)}</b> em {futuras.noites} noite(s).
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <ListaQuartos titulo="Mais alugados" itens={r.maisAlugados} />
        <ListaQuartos titulo="Menos alugados" itens={r.menosAlugados} />
      </div>

      <div>
        <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">Mais reclamações e problemas</p>
        {!reclamacoes.length ? (
          <p className="text-xs text-slate-500">Nenhum registro no período.</p>
        ) : (
          <ul className="space-y-1">
            {reclamacoes.slice(0, 3).map((q) => (
              <li key={q.quarto} className="flex items-center justify-between rounded-md bg-red-50 px-2 py-1 text-xs">
                <span className="font-black text-slate-900">Quarto {q.quarto}</span>
                <span className="text-red-800">
                  {q.total} · {[q.avaliacoesRuins && `${q.avaliacoesRuins} aval. ruim`, q.chamados && `${q.chamados} chamado(s)`, q.vistorias && `${q.vistorias} vistoria(s)`]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ListaDias titulo="Dias de alta" itens={r.diasAlta.slice(0, 3)} tom="bom" />
        <ListaDias titulo="Dias de baixa" itens={r.diasBaixa.slice(0, 3)} tom="ruim" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-500">Ocupação por dia da semana</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.porDiaSemana.map((d) => ({ dia: diaCurto(d.dia), ocupacao: Math.round(d.ocupacao * 100), diaria: d.diariaMedia }))}>
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  formatter={(v: number, k: string) => (k === "ocupacao" ? [`${v}%`, "Ocupação"] : [brl.format(v), "Diária"])}
                  cursor={{ fill: "#f1f5f9" }}
                />
                <Bar dataKey="ocupacao" radius={[3, 3, 0, 0]}>
                  {r.porDiaSemana.map((d) => (
                    <Cell key={d.dia} fill={cor} fillOpacity={maxSemana && d.ocupacao === maxSemana ? 1 : 0.45} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-500">Noites por faixa de diária</p>
          {r.faixas.length ? (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.faixas.map((f) => ({ faixa: `${f.de}`, noites: f.noites, de: f.de, ate: f.ate }))}>
                  <XAxis dataKey="faixa" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v: number) => [`${v} noite(s)`, "Vendidas"]}
                    labelFormatter={(_l, p) => {
                      const x = p?.[0]?.payload as { de: number; ate: number } | undefined;
                      return x ? `${brl0.format(x.de)} a ${brl0.format(x.ate)}` : "";
                    }}
                    cursor={{ fill: "#f1f5f9" }}
                  />
                  <Bar dataKey="noites" radius={[3, 3, 0, 0]}>
                    {r.faixas.map((f) => (
                      <Cell key={f.de} fill={cor} fillOpacity={r.faixaMaisVendida?.de === f.de ? 1 : 0.45} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Sem noites com valor no período.</p>
          )}
        </div>
      </div>

      {r.canais.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">Por canal</p>
          <table className="w-full text-xs">
            <tbody>
              {r.canais.slice(0, 4).map((c) => (
                <tr key={c.origem} className="border-t border-slate-100">
                  <td className="py-1 font-semibold text-slate-800">{c.origem}</td>
                  <td className="py-1 text-right text-slate-600">{c.noites} noites</td>
                  <td className="py-1 text-right text-slate-600">{brl0.format(c.diariaMedia)}/noite</td>
                  <td className="py-1 text-right font-bold text-slate-900">{brl0.format(c.receita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(r.noitesSemValor > 0 || r.noitesSemQuarto > 0) && (
        <p className="text-[11px] text-amber-800">
          {r.noitesSemValor > 0 && `${r.noitesSemValor} noite(s) sem valor no Cloudbeds. `}
          {r.noitesSemQuarto > 0 && `${r.noitesSemQuarto} noite(s) ainda sem quarto atribuído (contam na receita e ocupação, não por quarto).`}
        </p>
      )}
    </Cartao>
  );
}

function ListaQuartos({ titulo, itens }: { titulo: string; itens: IndicadorQuarto[] }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">{titulo}</p>
      <ul className="space-y-1">
        {itens.map((q) => (
          <li key={q.quarto} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-xs">
            <span className="font-black text-slate-900">{q.quarto}</span>
            <span className="text-slate-600">
              {q.noites} noites · {pct(q.ocupacao)} · {brl0.format(q.receita)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListaDias({ titulo, itens, tom }: { titulo: string; itens: ResumoRendimento["diasAlta"]; tom: "bom" | "ruim" }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">{titulo}</p>
      <ul className="space-y-1">
        {itens.map((d) => (
          <li
            key={d.data}
            className={cn("flex items-center justify-between rounded-md px-2 py-1 text-xs", tom === "bom" ? "bg-emerald-50" : "bg-amber-50")}
          >
            <span className="font-semibold text-slate-900">{dataCurta(d.data)}</span>
            <span className="text-slate-600">
              {pct(d.ocupacao)} · {brl0.format(d.receita)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
