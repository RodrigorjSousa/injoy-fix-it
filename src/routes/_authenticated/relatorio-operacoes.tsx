import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileDown,
  Loader2,
  Plus,
  Save,
  Scale,
  Shirt,
  Tags,
  Trash2,
  Undo2,
  Pencil,
  PackageCheck,
  Send,
} from "lucide-react";
import { useUnidade } from "@/lib/unidade-context";
import { cn } from "@/lib/utils";
import { todaySP } from "@/lib/tz";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireGestor } from "@/lib/require-gestor";
import {
  LaundryModal,
  useLavanderiaBase,
  type EdicaoLavanderia,
} from "@/components/camareiras/laundry-modal";
import {
  brl,
  calcularFechamento,
  calcularSaldo,
  dataBR,
  faltasNaEntrega,
  difItem,
  gerarAlertas,
  INICIO_SALDO,
  mesDe,
  mesesDesdeInicio,
  nomeMes,
  resumoTalao,
  type Fechamento,
  type Peca,
  type Talao,
  type UnidadeLav,
} from "@/lib/lavanderia";
import {
  aprovarFatura,
  buscarFatura,
  buscarTaloes,
  desfazerRetorno,
  excluirTalao,
  salvarFatura,
  salvarPeca,
  urlFotoTalao,
} from "@/lib/lavanderia-api";

export const Route = createFileRoute("/_authenticated/relatorio-operacoes")({
  beforeLoad: () => requireGestor(),
  component: LavanderiaGestor,
});

const sinal = (v: number | null) => (v === null ? "—" : v > 0 ? `+${v}` : String(v));

function LavanderiaGestor() {
  const { unidade: unidadeCtx, setUnidade, unidades } = useUnidade();
  const unidade = unidadeCtx as UnidadeLav;
  const qc = useQueryClient();
  const hoje = todaySP();
  const { pecas: pecasQ } = useLavanderiaBase();
  const pecas = pecasQ.data ?? [];
  const taloesQ = useQuery({
    queryKey: ["lav_taloes", unidade],
    queryFn: () => buscarTaloes(unidade),
  });
  const taloes = taloesQ.data ?? [];
  const [modal, setModal] = useState<{
    inicial?: "coleta" | "retorno";
    editar?: EdicaoLavanderia;
  } | null>(null);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["lav_taloes", unidade] });
    qc.invalidateQueries({ queryKey: ["lav_taloes_abertos", unidade] });
  };

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-50 pb-16">
      <div className="bg-blue-950 text-white p-5 shadow-md flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
            <Shirt size={20} /> Lavanderia
          </h1>
          <p className="text-xs text-blue-300">
            Conta corrente de peças com a Clean Soft · saldo desde {dataBR(INICIO_SALDO)}
          </p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-blue-800">
          {unidades.map((u) => (
            <button
              key={u}
              onClick={() => setUnidade(u)}
              className={cn(
                "px-3 py-1.5 text-xs font-black uppercase",
                u === unidade ? "bg-white text-blue-950" : "text-blue-200 hover:bg-blue-900",
              )}
            >
              {u}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModal({ inicial: "coleta" })}
            className="inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white font-bold px-3 py-2 rounded-lg text-xs"
          >
            <Send size={14} /> Lançar coleta
          </button>
          <button
            onClick={() => setModal({ inicial: "retorno" })}
            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-3 py-2 rounded-lg text-xs"
          >
            <PackageCheck size={14} /> Registrar retorno
          </button>
        </div>
      </div>

      <div className="p-4">
        {pecasQ.error || taloesQ.error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            <b>Erro ao carregar:</b> {(pecasQ.error ?? taloesQ.error)?.message}
          </div>
        ) : pecasQ.isLoading || taloesQ.isLoading ? (
          <div className="p-10 text-center text-slate-500">
            <Loader2 className="animate-spin inline mr-2" size={16} /> Carregando…
          </div>
        ) : (
          <Tabs defaultValue="saldo" className="w-full">
            <TabsList className="flex flex-wrap h-auto w-fit max-w-full justify-start">
              <TabsTrigger value="saldo">
                <Scale size={14} className="mr-1" /> Saldo
              </TabsTrigger>
              <TabsTrigger value="taloes">
                <ClipboardList size={14} className="mr-1" /> Talões
              </TabsTrigger>
              <TabsTrigger value="fechamento">
                <CheckCircle2 size={14} className="mr-1" /> Fechamento do mês
              </TabsTrigger>
              <TabsTrigger value="pecas">
                <Tags size={14} className="mr-1" /> Peças e preços
              </TabsTrigger>
            </TabsList>
            <TabsContent value="saldo" className="mt-4">
              <SaldoTab taloes={taloes} pecas={pecas} hoje={hoje} unidade={unidade} />
            </TabsContent>
            <TabsContent value="taloes" className="mt-4">
              <TaloesTab
                taloes={taloes}
                pecas={pecas}
                hoje={hoje}
                onEditar={(e) => setModal({ editar: e })}
                onChanged={recarregar}
              />
            </TabsContent>
            <TabsContent value="fechamento" className="mt-4">
              <FechamentoTab taloes={taloes} pecas={pecas} hoje={hoje} unidade={unidade} />
            </TabsContent>
            <TabsContent value="pecas" className="mt-4">
              <PecasTab
                pecas={pecas}
                onChanged={() => qc.invalidateQueries({ queryKey: ["lav_pecas"] })}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <LaundryModal
        open={!!modal}
        onClose={() => setModal(null)}
        unidade={unidade}
        inicial={modal?.inicial}
        editar={modal?.editar ?? null}
        onSaved={recarregar}
      />
    </div>
  );
}

/* ====================================================================== SALDO */

function Kpi({
  titulo,
  valor,
  sub,
  tom,
}: {
  titulo: string;
  valor: string | number;
  sub?: string;
  tom?: "red" | "amber" | "blue";
}) {
  return (
    <div
      className={cn(
        "p-4 rounded-2xl border shadow-sm",
        tom === "red"
          ? "bg-red-50 border-red-200"
          : tom === "amber"
            ? "bg-amber-50 border-amber-200"
            : "bg-white border-slate-200",
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{titulo}</p>
      <p
        className={cn(
          "text-3xl font-black mt-1",
          tom === "red" ? "text-red-700" : tom === "amber" ? "text-amber-700" : "text-blue-800",
        )}
      >
        {valor}
      </p>
      {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

/** Legenda das três diferenças do talão, usada em Saldo, Talões e Fechamento. */
function LegendaDiferencas() {
  return (
    <div className="grid gap-2 sm:grid-cols-3 text-[11px] leading-snug">
      <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-red-800">
        <b>A · Saída hotel × Entrada lavanderia</b>
        <br />
        Contagem da coleta não bateu. Cobrar atenção de quem contou.
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-800">
        <b>B · Entrada × Saída da lavanderia = RELAVE</b>
        <br />
        Positivo: ficou para lavar de novo. Fiscalize se volta em outro talão (negativo).
      </div>
      <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-red-800">
        <b>C · Saída lavanderia × Contado (base do pagamento)</b>
        <br />
        Paga o que saiu da lavanderia; se a camareira contou menos, paga o contado e desconta.
      </div>
    </div>
  );
}

/** Célula de diferença: A e C em vermelho, B (relave) em âmbar. */
function CelDif({
  v,
  tipo,
  className,
}: {
  v: number | null;
  tipo: "A" | "B" | "C";
  className?: string;
}) {
  const vazio = v === null || v === 0;
  const cor = vazio
    ? "text-slate-300"
    : tipo === "B"
      ? "text-amber-700 bg-amber-50"
      : "text-red-700 bg-red-50";
  const txt = v === null ? "—" : tipo === "C" ? (v ? `−${v}` : "0") : sinal(v);
  return <td className={cn("p-2 text-right font-black", cor, className)}>{txt}</td>;
}

function SaldoTab({
  taloes,
  pecas,
  hoje,
  unidade,
}: {
  taloes: Talao[];
  pecas: Peca[];
  hoje: string;
  unidade: UnidadeLav;
}) {
  const [todas, setTodas] = useState(false);
  const saldo = useMemo(() => calcularSaldo(taloes, pecas), [taloes, pecas]);
  const alertas = useMemo(
    () => gerarAlertas(taloes, saldo, pecas, hoje),
    [taloes, saldo, pecas, hoje],
  );
  const faltas = useMemo(() => faltasNaEntrega(taloes, pecas), [taloes, pecas]);
  const abertos = taloes.filter((t) => !t.retorno_data);
  const tot = (f: (l: (typeof saldo)[number]) => number) => saldo.reduce((s, l) => s + f(l), 0);
  const totSaldo = tot((l) => l.saldo);
  const totAberto = tot((l) => l.emAberto);
  const totRelave = tot((l) => Math.max(0, l.relavePendente));
  const totColeta = tot((l) => Math.abs(l.difColeta));
  const totDesc = faltas.reduce((s, f) => s + f.qtd, 0);
  const linhas = todas
    ? saldo
    : saldo.filter((l) => l.emAberto || l.relavePendente || l.difColeta || l.desconto || l.aPagar);
  const ordemAlerta = { coleta: 0, desconto: 1, parado: 2, relave: 3, sequencia: 4 } as const;
  const alertasOrd = [...alertas].sort((a, b) => ordemAlerta[a.tipo] - ordemAlerta[b.tipo]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi
          titulo="Na lavanderia agora"
          valor={totSaldo}
          sub={`${totAberto} em ${abertos.length} talão(ões) abertos`}
        />
        <Kpi
          titulo="A · Hotel × lavanderia"
          valor={totColeta}
          sub="peças com contagem diferente na coleta"
          tom={totColeta ? "red" : undefined}
        />
        <Kpi
          titulo="B · Relave pendente"
          valor={totRelave}
          sub="ficaram para relave e ainda não voltaram"
          tom={totRelave ? "amber" : undefined}
        />
        <Kpi
          titulo="C · Descontos"
          valor={totDesc}
          sub={
            totDesc
              ? `${brl.format(faltas.reduce((s, f) => s + f.valor, 0))} a descontar do pagamento`
              : "nenhum"
          }
          tom={totDesc ? "red" : undefined}
        />
        <Kpi titulo="Peças a pagar" valor={tot((l) => l.aPagar)} sub="desde 01/10 (base C)" />
      </div>

      <LegendaDiferencas />

      {alertasOrd.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle size={14} /> Atenção ({alertasOrd.length})
          </div>
          <ul className="divide-y divide-slate-100">
            {alertasOrd.map((a, i) => (
              <li
                key={i}
                className={cn(
                  "px-4 py-2.5 text-sm flex gap-2 items-start",
                  a.tipo === "coleta" || a.tipo === "desconto"
                    ? "bg-red-50 text-red-800 font-semibold"
                    : a.tipo === "relave"
                      ? "bg-amber-50 text-amber-900"
                      : "text-slate-700",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 rounded-full shrink-0",
                    a.tipo === "relave" || a.nivel === "medio" ? "bg-amber-400" : "bg-red-500",
                  )}
                />
                <span>{a.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
          <p className="text-xs font-black uppercase tracking-wider text-slate-600">
            Saldo por peça (desde {dataBR(INICIO_SALDO)})
          </p>
          <label className="text-xs text-slate-500 flex items-center gap-1.5">
            <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />{" "}
            mostrar todas
          </label>
        </div>
        {linhas.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            Nenhum talão lançado desde {dataBR(INICIO_SALDO)} em {unidade}. Use “Lançar coleta”.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left p-3">Peça</th>
                  <th className="p-3 text-right bg-blue-50 text-blue-800">Na lavanderia</th>
                  <th className="p-3 text-right">Em talões abertos</th>
                  <th className="p-3 text-right text-amber-700">B · Relave pendente</th>
                  <th className="p-3 text-right text-red-700">A · Hotel × Lav.</th>
                  <th className="p-3 text-right text-red-700">C · Descontos</th>
                  <th className="p-3 text-right">Pagas</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.peca.id} className="border-t border-slate-100">
                    <td className="p-3 font-semibold text-slate-800">{l.peca.nome}</td>
                    <td className="p-3 text-right font-black text-blue-800 bg-blue-50/50">
                      {l.saldo}
                    </td>
                    <td className="p-3 text-right text-slate-600">{l.emAberto}</td>
                    <CelDif v={l.relavePendente} tipo="B" className="p-3" />
                    <CelDif v={l.difColeta} tipo="A" className="p-3" />
                    <CelDif v={l.desconto} tipo="C" className="p-3" />
                    <td className="p-3 text-right text-slate-600">{l.aPagar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-100 leading-relaxed">
          <b>Na lavanderia</b> = peças de talões abertos + relave pendente. Relave negativo: voltou
          mais do que ficou (relave de um talão devolvido em outro).
        </p>
      </div>
    </div>
  );
}

/* ===================================================================== TALÕES */

function TaloesTab({
  taloes,
  pecas,
  hoje,
  onEditar,
  onChanged,
}: {
  taloes: Talao[];
  pecas: Peca[];
  hoje: string;
  onEditar: (e: EdicaoLavanderia) => void;
  onChanged: () => void;
}) {
  const meses = mesesDesdeInicio(hoje);
  const [mes, setMes] = useState(meses[0]);
  const [filtro, setFiltro] = useState<"todos" | "abertos" | "retornados">("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const lista = taloes
    .filter((t) => mesDe(t.data_coleta) === mes)
    .filter((t) =>
      filtro === "abertos" ? !t.retorno_data : filtro === "retornados" ? !!t.retorno_data : true,
    )
    .sort((a, b) => b.data_coleta.localeCompare(a.data_coleta) || b.numero.localeCompare(a.numero));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          {meses.map((m) => (
            <option key={m} value={m}>
              {nomeMes(m)}
            </option>
          ))}
        </select>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as typeof filtro)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="todos">Todos</option>
          <option value="abertos">Aguardando retorno</option>
          <option value="retornados">Já voltaram</option>
        </select>
        <span className="text-xs text-slate-500">{lista.length} talão(ões)</span>
      </div>
      <LegendaDiferencas />

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left p-3">Talão</th>
              <th className="text-left p-3">Coleta</th>
              <th className="p-3 text-right">Saída hotel</th>
              <th className="p-3 text-right">Ent. Lav.</th>
              <th className="p-3 text-right text-red-700" title="Entrada lavanderia − Saída hotel">
                A · Hotel×Lav
              </th>
              <th className="p-3 text-right">Saída Lav.</th>
              <th className="p-3 text-right text-amber-700" title="Entrada − Saída da lavanderia">
                B · Relave
              </th>
              <th className="p-3 text-right">Contado</th>
              <th className="p-3 text-right text-red-700" title="Saída lavanderia − Contado">
                C · Desconto
              </th>
              <th className="p-3 text-right">A pagar</th>
              <th className="text-left p-3">Retorno</th>
              <th className="p-3 text-center">Fotos</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={14} className="p-6 text-center text-slate-500">
                  Nenhum talão em {nomeMes(mes)}.
                </td>
              </tr>
            )}
            {lista.map((t) => {
              const r = resumoTalao(t, hoje);
              const expandido = aberto === t.id;
              return (
                <TalaoLinha
                  key={t.id}
                  talao={t}
                  r={r}
                  pecas={pecas}
                  expandido={expandido}
                  onToggle={() => setAberto(expandido ? null : t.id)}
                  onEditar={onEditar}
                  onChanged={onChanged}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TalaoLinha({
  talao: t,
  r,
  pecas,
  expandido,
  onToggle,
  onEditar,
  onChanged,
}: {
  talao: Talao;
  r: ReturnType<typeof resumoTalao>;
  pecas: Peca[];
  expandido: boolean;
  onToggle: () => void;
  onEditar: (e: EdicaoLavanderia) => void;
  onChanged: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const nome = new Map(pecas.map((p) => [p.id, p]));
  const itens = [...t.itens].sort(
    (a, b) => (nome.get(a.peca_id)?.ordem ?? 0) - (nome.get(b.peca_id)?.ordem ?? 0),
  );

  const acao = async (fn: () => Promise<void>, ok: string) => {
    setOcupado(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <tr
        className={cn(
          "border-t border-slate-100 cursor-pointer hover:bg-slate-50",
          expandido && "bg-slate-50",
        )}
        onClick={onToggle}
      >
        <td className="p-3 font-black text-sky-800">Nº {t.numero}</td>
        <td className="p-3 text-xs text-slate-600">
          {dataBR(t.data_coleta)}
          <br />
          <span className="text-slate-400">{t.coleta_por_nome}</span>
        </td>
        <td className="p-3 text-right font-bold">{r.saida}</td>
        <td className="p-3 text-right">{r.entLav ?? "—"}</td>
        <CelDif v={r.difColeta} tipo="A" className="p-3" />
        <td className="p-3 text-right">{r.saidaLav ?? "—"}</td>
        <CelDif v={r.relave} tipo="B" className="p-3" />
        <td className="p-3 text-right font-bold">{r.guardado ?? "—"}</td>
        <CelDif v={r.desconto} tipo="C" className="p-3" />
        <td className="p-3 text-right font-black text-emerald-700">{r.aPagar ?? "—"}</td>
        <td className="p-3 text-xs">
          {r.aberto ? (
            <span
              className={cn(
                "font-bold px-2 py-0.5 rounded",
                r.dias >= 3 ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-700",
              )}
            >
              Lavando · {r.dias}d
            </span>
          ) : (
            <span className="text-slate-600">
              {dataBR(t.retorno_data)} · {r.dias}d
              <br />
              <span className="text-slate-400">{t.retorno_por_nome}</span>
            </span>
          )}
        </td>
        <td className="p-3 text-center">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700">
            <Camera size={14} /> {[t.coleta_foto, t.retorno_foto].filter(Boolean).length}
          </span>
        </td>
        <td className="p-3 text-slate-400">
          {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </td>
      </tr>
      {expandido && (
        <tr className="bg-slate-50">
          <td colSpan={14} className="p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
              <table className="w-full text-xs bg-white rounded-lg border border-slate-200 self-start">
                <thead className="text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="text-left p-2">Peça</th>
                    <th className="p-2 text-right">Saída hotel</th>
                    <th className="p-2 text-right">Ent. Lav.</th>
                    <th className="p-2 text-right text-red-700">A</th>
                    <th className="p-2 text-right">Saída Lav.</th>
                    <th className="p-2 text-right text-amber-700">B relave</th>
                    <th className="p-2 text-right">Contado</th>
                    <th className="p-2 text-right text-red-700">C desc.</th>
                    <th className="p-2 text-right">Pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => {
                    const d = t.retorno_data ? difItem(i) : null;
                    return (
                      <tr key={i.peca_id} className="border-t border-slate-100">
                        <td className="p-2 font-semibold">
                          {nome.get(i.peca_id)?.nome ?? "Peça removida"}
                        </td>
                        <td className="p-2 text-right">{i.saida_hotel}</td>
                        <td className="p-2 text-right">{d ? d.entLav : "—"}</td>
                        <CelDif v={d ? d.difColeta : null} tipo="A" />
                        <td className="p-2 text-right">{d ? d.saidaLav : "—"}</td>
                        <CelDif v={d ? d.relave : null} tipo="B" />
                        <td className="p-2 text-right font-bold">{d ? d.contado : "—"}</td>
                        <CelDif v={d ? d.desconto : null} tipo="C" />
                        <td className="p-2 text-right font-black text-emerald-700">
                          {d ? d.aPagar : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="space-y-2 text-xs" onClick={(e) => e.stopPropagation()}>
                <div className="grid grid-cols-2 gap-2">
                  <FotoMiniatura path={t.coleta_foto} titulo={`Talão nº ${t.numero} · coleta`} />
                  <FotoMiniatura path={t.retorno_foto} titulo={`Talão nº ${t.numero} · retorno`} />
                </div>
                {t.coleta_obs && (
                  <p className="bg-amber-50 border border-amber-200 rounded p-2">
                    Coleta: {t.coleta_obs}
                  </p>
                )}
                {t.retorno_obs && (
                  <p className="bg-amber-50 border border-amber-200 rounded p-2">
                    Retorno: {t.retorno_obs}
                  </p>
                )}
                <button
                  onClick={() => onEditar({ tipo: "coleta", talao: t })}
                  className="w-full inline-flex items-center justify-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-2 font-bold"
                >
                  <Pencil size={13} /> Corrigir coleta
                </button>
                <button
                  onClick={() => onEditar({ tipo: "retorno", talao: t })}
                  className="w-full inline-flex items-center justify-center gap-1 bg-emerald-600 text-white rounded-lg px-2 py-2 font-bold"
                >
                  <PackageCheck size={13} />{" "}
                  {t.retorno_data ? "Corrigir retorno" : "Registrar retorno"}
                </button>
                {t.retorno_data && (
                  <button
                    disabled={ocupado}
                    onClick={() => {
                      if (
                        !confirm(
                          `Desfazer o retorno do talão nº ${t.numero}? A foto do retorno será apagada.`,
                        )
                      )
                        return;
                      acao(() => desfazerRetorno(t.id), "Retorno desfeito");
                    }}
                    className="w-full inline-flex items-center justify-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-2 font-bold disabled:opacity-50"
                  >
                    <Undo2 size={13} /> Desfazer retorno
                  </button>
                )}
                <button
                  disabled={ocupado}
                  onClick={() => {
                    if (
                      !confirm(`Excluir o talão nº ${t.numero} e as fotos? Não dá para desfazer.`)
                    )
                      return;
                    acao(() => excluirTalao(t.id), "Talão excluído");
                  }}
                  className="w-full inline-flex items-center justify-center gap-1 bg-white border border-red-200 text-red-600 rounded-lg px-2 py-2 font-bold disabled:opacity-50"
                >
                  <Trash2 size={13} /> Excluir talão
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ================================================================= FECHAMENTO */

function FechamentoTab({
  taloes,
  pecas,
  hoje,
  unidade,
}: {
  taloes: Talao[];
  pecas: Peca[];
  hoje: string;
  unidade: UnidadeLav;
}) {
  const meses = mesesDesdeInicio(hoje);
  const [mes, setMes] = useState(meses[0]);
  const qc = useQueryClient();
  const faturaQ = useQuery({
    queryKey: ["lav_fatura", unidade, mes],
    queryFn: () => buscarFatura(unidade, mes),
  });
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const f = faturaQ.data;
    const m: Record<string, string> = {};
    Object.entries(f?.qtd_fatura ?? {}).forEach(([k, v]) => (m[k] = String(v)));
    setQtd(m);
    setValor(f?.valor_fatura != null ? String(f.valor_fatura).replace(".", ",") : "");
    setObs(f?.obs ?? "");
  }, [faturaQ.data]);

  const qtdNum = useMemo(() => {
    const m: Record<string, number> = {};
    Object.entries(qtd).forEach(([k, v]) => {
      if (v.trim() !== "") m[k] = parseInt(v, 10);
    });
    return m;
  }, [qtd]);
  const f = useMemo(
    () => calcularFechamento(taloes, pecas, mes, qtdNum),
    [taloes, pecas, mes, qtdNum],
  );
  const faltas = useMemo(() => faltasNaEntrega(f.taloes, pecas), [f.taloes, pecas]);
  const valorNum = valor.trim() === "" ? null : Number(valor.replace(/\./g, "").replace(",", "."));
  const aprovada = faturaQ.data?.status === "aprovada";
  const diferenca =
    valorNum !== null && Number.isFinite(valorNum)
      ? Math.round((valorNum - f.valorPagar) * 100) / 100
      : null;

  const salvar = async () => {
    if (valorNum !== null && !Number.isFinite(valorNum))
      return toast.error("Valor da fatura inválido.");
    setSalvando(true);
    try {
      await salvarFatura({
        unidade,
        mes,
        qtdFatura: qtdNum,
        valorFatura: valorNum,
        valorEsperado: f.valorPagar,
        obs: obs.trim() || null,
      });
      toast.success("Fechamento salvo");
      qc.invalidateQueries({ queryKey: ["lav_fatura", unidade, mes] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };
  const aprovar = async (sim: boolean) => {
    setSalvando(true);
    try {
      let id = faturaQ.data?.id;
      if (sim)
        id = await salvarFatura({
          unidade,
          mes,
          qtdFatura: qtdNum,
          valorFatura: valorNum,
          valorEsperado: f.valorPagar,
          obs: obs.trim() || null,
        });
      if (!id) throw new Error("Salve o fechamento antes.");
      await aprovarFatura(id, sim);
      toast.success(sim ? "Pagamento aprovado" : "Fechamento reaberto");
      qc.invalidateQueries({ queryKey: ["lav_fatura", unidade, mes] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          {meses.map((m) => (
            <option key={m} value={m}>
              {nomeMes(m)}
            </option>
          ))}
        </select>
        {aprovada && (
          <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-1 rounded">
            ✓ Aprovado por {faturaQ.data?.aprovado_por_nome} em{" "}
            {dataBR(faturaQ.data?.aprovado_em ?? null)}
          </span>
        )}
        <button
          onClick={() => imprimirFechamento(f, unidade, mes, valorNum, faltas)}
          className="ml-auto inline-flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold px-3 py-2 rounded-lg text-xs"
        >
          <FileDown size={14} /> Imprimir / PDF
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          titulo="Valor a pagar"
          valor={brl.format(f.valorPagar)}
          sub={`${f.totalPagar} peças · saída da lavanderia limitada ao contado`}
        />
        <Kpi
          titulo="C · Descontos"
          valor={brl.format(f.valorDesconto)}
          sub={`${f.totalDesconto} peça(s) saíram da lavanderia e não chegaram`}
          tom={f.totalDesconto ? "red" : undefined}
        />
        <Kpi
          titulo="Fatura − a pagar"
          valor={diferenca === null ? "—" : brl.format(diferenca)}
          sub={
            valorNum === null
              ? "digite o valor da fatura"
              : diferenca! > 0
                ? "descontar da fatura"
                : diferenca! < 0
                  ? "fatura abaixo do calculado"
                  : "bateu"
          }
          tom={diferenca && diferenca > 0 ? "red" : undefined}
        />
        <Kpi
          titulo="Talões no mês"
          valor={f.taloes.length}
          sub={`${f.taloesSemRetorno.length} sem retorno (ainda não entram no pagamento)`}
          tom={f.taloesSemRetorno.length ? "amber" : undefined}
        />
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 leading-relaxed">
        <b>Regra do pagamento:</b> vale o que <b>saiu da lavanderia</b> (Saída Lav.). Se a camareira
        contou menos ao guardar, paga-se o que ela contou e a diferença é descontada (ex.: saiu 8,
        contou 7 → paga 7). Relave (B) não é pago agora: entra quando voltar em outro talão.
      </div>

      {(f.taloesSemRetorno.length > 0 || f.numerosFaltando.length > 0 || faltas.length > 0) && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-sm space-y-1.5 text-amber-900">
          <p className="font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle size={14} /> Antes de aprovar
          </p>
          {f.taloesSemRetorno.length > 0 && (
            <p>
              Sem retorno lançado: {f.taloesSemRetorno.map((t) => `nº ${t.numero}`).join(", ")} —
              ainda não entram no valor a pagar.
            </p>
          )}
          {f.numerosFaltando.length > 0 && (
            <p>Números pulados: {f.numerosFaltando.join(", ")}. Algum talão não foi lançado?</p>
          )}
          {faltas.length > 0 && (
            <p className="text-red-800">
              <b>Descontar</b> (saiu da lavanderia e não chegou):{" "}
              {faltas
                .map((x) => `${x.qtd} ${x.peca.nome} (talão ${x.taloes.join(", ")})`)
                .join("; ")}{" "}
              — <b>{brl.format(faltas.reduce((s, x) => s + x.valor, 0))}</b>.
            </p>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left p-3">Coluna da fatura</th>
              <th className="p-3 text-right">Preço</th>
              <th className="p-3 text-right">Saída hotel</th>
              <th className="p-3 text-right">Ent. Lav.</th>
              <th className="p-3 text-right">Saída Lav.</th>
              <th className="p-3 text-right text-amber-700">B · Relave</th>
              <th className="p-3 text-right">Contado</th>
              <th className="p-3 text-right text-red-700">C · Desconto</th>
              <th className="p-3 text-right bg-emerald-50 text-emerald-800">A pagar</th>
              <th className="p-3 text-center bg-blue-50 text-blue-800">Qtd na fatura</th>
              <th className="p-3 text-right" title="Fatura − Saída Lav.">
                Fatura × Saída Lav.
              </th>
            </tr>
          </thead>
          <tbody>
            {f.linhas.map((l) => (
              <tr key={l.grupo} className="border-t border-slate-100">
                <td className="p-3 font-semibold text-slate-800">{l.grupo}</td>
                <td className="p-3 text-right text-slate-500">{brl.format(l.preco)}</td>
                <td className="p-3 text-right">{l.qtdHotel}</td>
                <td className="p-3 text-right">{l.qtdEntLav}</td>
                <td className="p-3 text-right font-bold">{l.qtdSaidaLav}</td>
                <CelDif v={l.qtdRelave} tipo="B" className="p-3" />
                <td className="p-3 text-right font-bold">{l.qtdContado}</td>
                <CelDif v={l.qtdDesconto} tipo="C" className="p-3" />
                <td className="p-3 text-right bg-emerald-50/60">
                  <span className="font-black text-emerald-800">{l.qtdPagar}</span>
                  <br />
                  <span className="text-[11px] text-emerald-700">{brl.format(l.valorPagar)}</span>
                </td>
                <td className="p-2 bg-blue-50/50">
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={aprovada}
                    value={qtd[l.grupo] ?? ""}
                    onChange={(e) =>
                      setQtd((s) => ({
                        ...s,
                        [l.grupo]: e.target.value.replace(/[^0-9]/g, "").slice(0, 5),
                      }))
                    }
                    placeholder="—"
                    className="w-20 mx-auto block border border-slate-300 rounded-md px-2 py-1 text-center font-bold disabled:bg-slate-100"
                  />
                </td>
                <td
                  className={cn(
                    "p-3 text-right font-black",
                    l.difQtd === null || l.difQtd === 0
                      ? "text-slate-400"
                      : l.difQtd > 0
                        ? "text-red-600"
                        : "text-emerald-700",
                  )}
                >
                  {l.difQtd === null
                    ? "—"
                    : `${sinal(l.difQtd)} (${brl.format(l.difQtd * l.preco)})`}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-black">
              <td className="p-3">Total</td>
              <td />
              <td className="p-3 text-right">{f.totalPecasHotel}</td>
              <td className="p-3 text-right">{f.linhas.reduce((s, l) => s + l.qtdEntLav, 0)}</td>
              <td className="p-3 text-right">{f.totalSaidaLav}</td>
              <CelDif v={f.totalRelave} tipo="B" className="p-3" />
              <td className="p-3 text-right">{f.totalContado}</td>
              <CelDif v={f.totalDesconto} tipo="C" className="p-3" />
              <td className="p-3 text-right bg-emerald-50 text-emerald-800">
                {f.totalPagar}
                <br />
                <span className="text-[11px]">{brl.format(f.valorPagar)}</span>
              </td>
              <td className="p-3 text-center text-blue-800">
                {f.valorFaturaCalculado === null ? "—" : brl.format(f.valorFaturaCalculado)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto] items-end">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Valor total da fatura (R$)
          </span>
          <input
            value={valor}
            disabled={aprovada}
            onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ""))}
            placeholder="4.560,31"
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 font-bold disabled:bg-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Observação
          </span>
          <input
            value={obs}
            disabled={aprovada}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: descontar 2 toalhas do talão 20371"
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 disabled:bg-slate-100"
          />
        </label>
        <div className="flex gap-2">
          {!aprovada && (
            <button
              onClick={salvar}
              disabled={salvando}
              className="inline-flex items-center gap-1.5 bg-white border border-slate-300 font-bold px-3 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              <Save size={14} /> Salvar
            </button>
          )}
          <button
            onClick={() => aprovar(!aprovada)}
            disabled={salvando}
            className={cn(
              "inline-flex items-center gap-1.5 font-bold px-3 py-2 rounded-lg text-sm text-white disabled:opacity-50",
              aprovada ? "bg-slate-500" : "bg-emerald-600 hover:bg-emerald-700",
            )}
          >
            {salvando ? (
              <Loader2 size={14} className="animate-spin" />
            ) : aprovada ? (
              <Undo2 size={14} />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {aprovada ? "Reabrir" : "Aprovar pagamento"}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <p className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-600 border-b border-slate-100">
          Talões de {nomeMes(mes)} (pela data da coleta)
        </p>
        <table className="w-full text-xs min-w-[760px]">
          <thead className="text-[10px] uppercase text-slate-500 bg-slate-50">
            <tr>
              <th className="text-left p-2">Data</th>
              <th className="text-left p-2">Talão</th>
              <th className="p-2 text-right">Saída hotel</th>
              <th className="p-2 text-right">Ent. Lav.</th>
              <th className="p-2 text-right text-red-700">A</th>
              <th className="p-2 text-right">Saída Lav.</th>
              <th className="p-2 text-right text-amber-700">B relave</th>
              <th className="p-2 text-right">Contado</th>
              <th className="p-2 text-right text-red-700">C desc.</th>
              <th className="p-2 text-right">Pagar</th>
              <th className="p-2">Fotos</th>
            </tr>
          </thead>
          <tbody>
            {f.taloes.map((t) => {
              const r = resumoTalao(t, hoje);
              return (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="p-2">{dataBR(t.data_coleta)}</td>
                  <td className="p-2 font-black text-sky-800">{t.numero}</td>
                  <td className="p-2 text-right">{r.saida}</td>
                  <td className="p-2 text-right">{r.entLav ?? "—"}</td>
                  <CelDif v={r.difColeta} tipo="A" />
                  <td className="p-2 text-right">{r.saidaLav ?? "—"}</td>
                  <CelDif v={r.relave} tipo="B" />
                  <td className="p-2 text-right">
                    {r.guardado ?? <span className="text-amber-600 font-bold">sem retorno</span>}
                  </td>
                  <CelDif v={r.desconto} tipo="C" />
                  <td className="p-2 text-right font-black text-emerald-700">{r.aPagar ?? "—"}</td>
                  <td className="p-2 text-center whitespace-nowrap">
                    <BotaoFoto path={t.coleta_foto} titulo={`Talão nº ${t.numero} · coleta`}>
                      coleta
                    </BotaoFoto>
                    {t.retorno_foto && (
                      <BotaoFoto path={t.retorno_foto} titulo={`Talão nº ${t.numero} · retorno`}>
                        retorno
                      </BotaoFoto>
                    )}
                  </td>
                </tr>
              );
            })}
            {f.taloes.length === 0 && (
              <tr>
                <td colSpan={11} className="p-4 text-center text-slate-500">
                  Nenhum talão neste mês.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function imprimirFechamento(
  f: Fechamento,
  unidade: UnidadeLav,
  mes: string,
  valorFatura: number | null,
  faltas: ReturnType<typeof faltasNaEntrega>,
) {
  const linhas = f.linhas
    .filter((l) => l.qtdHotel || l.qtdSaidaLav || l.qtdFatura)
    .map(
      (l) =>
        `<tr><td>${esc(l.grupo)}</td><td>${brl.format(l.preco)}</td><td>${l.qtdHotel}</td><td>${l.qtdEntLav}</td><td>${l.qtdSaidaLav}</td><td>${sinal(
          l.qtdRelave,
        )}</td><td>${l.qtdContado}</td><td class="v">${l.qtdDesconto ? "−" + l.qtdDesconto : "0"}</td><td><b>${l.qtdPagar}</b></td><td><b>${brl.format(
          l.valorPagar,
        )}</b></td><td>${l.qtdFatura ?? "—"}</td></tr>`,
    )
    .join("");
  const taloes = f.taloes
    .map((t) => {
      const r = resumoTalao(t, todaySP());
      return `<tr><td>${dataBR(t.data_coleta)}</td><td>${esc(t.numero)}</td><td>${r.saida}</td><td>${r.entLav ?? "—"}</td><td class="v">${
        r.difColeta ? sinal(r.difColeta) : ""
      }</td><td>${r.saidaLav ?? "—"}</td><td>${r.relave ? sinal(r.relave) : ""}</td><td>${r.guardado ?? "sem retorno"}</td><td class="v">${
        r.desconto ? "−" + r.desconto : ""
      }</td><td><b>${r.aPagar ?? "—"}</b></td></tr>`;
    })
    .join("");
  const dif = valorFatura === null ? null : Math.round((valorFatura - f.valorPagar) * 100) / 100;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Lavanderia ${esc(unidade)} ${esc(nomeMes(mes))}</title>
<style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#111}h1{font-size:17px;margin:0}h2{font-size:13px;margin:16px 0 6px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:3px 5px;text-align:right}td:first-child,th:first-child{text-align:left}
th{background:#eee}.r{display:flex;gap:22px;margin-top:8px;font-size:13px}.b{font-weight:bold}.v{color:#b91c1c;font-weight:bold}.n{margin-top:6px;color:#333}</style></head><body>
<h1>INJOY ${esc(unidade)} — Fechamento da lavanderia (Clean Soft)</h1><div>${esc(nomeMes(mes))} · gerado em ${dataBR(todaySP())}</div>
<div class="r"><div>Valor a pagar: <span class="b">${brl.format(f.valorPagar)}</span></div><div>Descontos: <span class="b v">${brl.format(
    f.valorDesconto,
  )}</span></div><div>Fatura: <span class="b">${valorFatura === null ? "—" : brl.format(valorFatura)}</span></div><div>Fatura − a pagar: <span class="b">${
    dif === null ? "—" : brl.format(dif)
  }</span></div></div>
<div class="n">Regra: paga-se o que saiu da lavanderia; se a camareira contou menos, paga-se o contado. Relave (B) entra quando voltar.</div>
<h2>Por coluna da fatura</h2><table><tr><th>Coluna</th><th>Preço</th><th>Saída hotel</th><th>Ent. Lav.</th><th>Saída Lav.</th><th>B relave</th><th>Contado</th><th>C desconto</th><th>Qtd a pagar</th><th>Valor a pagar</th><th>Fatura</th></tr>${linhas}</table>
${
  faltas.length
    ? `<h2>Descontar (saiu da lavanderia e não chegou)</h2><table><tr><th>Peça</th><th>Qtd</th><th>Valor</th><th>Talões</th></tr>${faltas
        .map(
          (x) =>
            `<tr><td>${esc(x.peca.nome)}</td><td>${x.qtd}</td><td>${brl.format(x.valor)}</td><td>${esc(x.taloes.join(", "))}</td></tr>`,
        )
        .join("")}</table>`
    : ""
}
${f.numerosFaltando.length ? `<p><b>Números pulados:</b> ${f.numerosFaltando.join(", ")}</p>` : ""}
<h2>Talões (${f.taloes.length})</h2><table><tr><th>Data</th><th>Talão</th><th>Saída hotel</th><th>Ent. Lav.</th><th>A</th><th>Saída Lav.</th><th>B relave</th><th>Contado</th><th>C desc.</th><th>Pagar</th></tr>${taloes}</table>
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return toast.error("Libere as janelas pop-up para imprimir.");
  w.document.write(html);
  w.document.close();
}

/* ===================================================================== PEÇAS */

function PecasTab({ pecas, onChanged }: { pecas: Peca[]; onChanged: () => void }) {
  const grupos = [...new Set(pecas.map((p) => p.grupo_fatura))];
  return (
    <div className="space-y-3 max-w-4xl">
      <p className="text-xs text-slate-500">
        Preços da tabela da Clean Soft. Peças no mesmo <b>grupo da fatura</b> somam na mesma coluna
        do fechamento. Desative em vez de excluir peças que já foram usadas.
      </p>
      <datalist id="lav-grupos">
        {grupos.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="p-2 w-16">Ordem</th>
              <th className="text-left p-2">Peça</th>
              <th className="text-left p-2">Grupo da fatura</th>
              <th className="p-2 w-28">Preço (R$)</th>
              <th className="p-2 w-16">Ativa</th>
              <th className="p-2 w-24" />
            </tr>
          </thead>
          <tbody>
            {pecas.map((p) => (
              <PecaLinha key={p.id} peca={p} onChanged={onChanged} />
            ))}
            <PecaLinha
              key="nova"
              peca={{
                nome: "",
                grupo_fatura: "",
                preco: 0,
                ordem: (pecas.at(-1)?.ordem ?? 0) + 10,
                ativo: true,
              }}
              onChanged={onChanged}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PecaLinha({
  peca,
  onChanged,
}: {
  peca: Omit<Peca, "id"> & { id?: string };
  onChanged: () => void;
}) {
  const [v, setV] = useState({
    ...peca,
    preco: String(peca.preco).replace(".", ","),
    ordem: String(peca.ordem),
  });
  const [salvando, setSalvando] = useState(false);
  const mudou =
    v.nome !== peca.nome ||
    v.grupo_fatura !== peca.grupo_fatura ||
    v.preco !== String(peca.preco).replace(".", ",") ||
    v.ordem !== String(peca.ordem) ||
    v.ativo !== peca.ativo;
  const salvar = async () => {
    const preco = Number(v.preco.replace(",", "."));
    if (!Number.isFinite(preco) || preco < 0) return toast.error("Preço inválido.");
    setSalvando(true);
    try {
      await salvarPeca({
        id: peca.id,
        nome: v.nome,
        grupo_fatura: v.grupo_fatura,
        preco,
        ordem: parseInt(v.ordem, 10) || 0,
        ativo: v.ativo,
      });
      toast.success(peca.id ? "Peça atualizada" : "Peça incluída");
      if (!peca.id) setV({ ...v, nome: "", grupo_fatura: "" });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };
  const cell = "w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm";
  return (
    <tr
      className={cn(
        "border-t border-slate-100",
        !peca.id && "bg-blue-50/40",
        !v.ativo && "opacity-60",
      )}
    >
      <td className="p-2">
        <input
          value={v.ordem}
          onChange={(e) => setV({ ...v, ordem: e.target.value.replace(/[^0-9]/g, "") })}
          className={cell}
        />
      </td>
      <td className="p-2">
        <input
          value={v.nome}
          placeholder={peca.id ? "" : "Nova peça…"}
          onChange={(e) => setV({ ...v, nome: e.target.value })}
          className={cell}
        />
      </td>
      <td className="p-2">
        <input
          list="lav-grupos"
          value={v.grupo_fatura}
          onChange={(e) => setV({ ...v, grupo_fatura: e.target.value })}
          className={cell}
        />
      </td>
      <td className="p-2">
        <input
          value={v.preco}
          onChange={(e) => setV({ ...v, preco: e.target.value.replace(/[^0-9,.]/g, "") })}
          className={cn(cell, "text-right")}
        />
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          checked={v.ativo}
          onChange={(e) => setV({ ...v, ativo: e.target.checked })}
        />
      </td>
      <td className="p-2">
        <button
          onClick={salvar}
          disabled={!mudou || salvando || !v.nome.trim()}
          className="w-full inline-flex items-center justify-center gap-1 bg-blue-700 text-white text-xs font-bold rounded-md px-2 py-1.5 disabled:opacity-30"
        >
          {salvando ? (
            <Loader2 size={12} className="animate-spin" />
          ) : peca.id ? (
            <Save size={12} />
          ) : (
            <Plus size={12} />
          )}
          {peca.id ? "Salvar" : "Incluir"}
        </button>
      </td>
    </tr>
  );
}

/* ====================================================================== FOTOS */

function useUrlFoto(path: string | null) {
  return useQuery({
    queryKey: ["lav_foto", path],
    queryFn: () => urlFotoTalao(path!),
    enabled: !!path,
    staleTime: 8 * 60_000, // a URL assinada vale 10 min
    retry: 1,
  });
}

function VisualizadorFoto({
  path,
  titulo,
  onClose,
}: {
  path: string;
  titulo: string;
  onClose: () => void;
}) {
  const url = useUrlFoto(path);
  return (
    <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col" onClick={onClose}>
      <div
        className="flex items-center justify-between gap-2 p-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-bold text-sm">{titulo}</p>
        <div className="flex items-center gap-2">
          {url.data && (
            <a
              href={url.data}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold bg-white/15 hover:bg-white/25 rounded-lg px-3 py-1.5"
            >
              Abrir em nova aba
            </a>
          )}
          <button
            onClick={onClose}
            className="text-xs font-bold bg-white text-slate-900 rounded-lg px-3 py-1.5"
          >
            Fechar
          </button>
        </div>
      </div>
      <div
        className="flex-1 overflow-auto flex items-start justify-center p-3"
        onClick={(e) => e.stopPropagation()}
      >
        {url.isLoading ? (
          <p className="text-white/80 text-sm mt-10">
            <Loader2 className="animate-spin inline mr-2" size={16} /> Carregando foto…
          </p>
        ) : url.error ? (
          <p className="text-red-200 text-sm mt-10 max-w-md text-center">
            Não foi possível abrir a foto: {url.error.message}
          </p>
        ) : (
          <img src={url.data} alt={titulo} className="max-w-full h-auto rounded-lg shadow-2xl" />
        )}
      </div>
    </div>
  );
}

/** Miniatura da foto do talão; toque para ampliar dentro do app (sem janela nova). */
function FotoMiniatura({ path, titulo }: { path: string | null; titulo: string }) {
  const [aberta, setAberta] = useState(false);
  const url = useUrlFoto(path);
  const rotulo = titulo.split(" · ")[1] ?? "foto";
  if (!path)
    return (
      <div className="h-32 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center text-[11px] text-slate-400 text-center px-2">
        Sem foto de {rotulo}
      </div>
    );
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="relative h-32 rounded-lg border border-slate-200 bg-white overflow-hidden group"
        title={`Ver foto · ${titulo}`}
      >
        {url.data ? (
          <img
            src={url.data}
            alt={titulo}
            className="h-full w-full object-cover group-hover:opacity-90"
          />
        ) : url.error ? (
          <span className="text-[11px] text-red-600 p-2 block">Erro: {url.error.message}</span>
        ) : (
          <Loader2 className="animate-spin text-slate-400 mx-auto" size={16} />
        )}
        <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] font-bold uppercase py-1">
          <Camera size={10} className="inline mr-1" />
          {rotulo} · ampliar
        </span>
      </button>
      {aberta && <VisualizadorFoto path={path} titulo={titulo} onClose={() => setAberta(false)} />}
    </>
  );
}

function BotaoFoto({
  path,
  titulo,
  children,
}: {
  path: string;
  titulo: string;
  children: React.ReactNode;
}) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button onClick={() => setAberta(true)} className="text-blue-700 font-bold underline mr-2">
        {children}
      </button>
      {aberta && <VisualizadorFoto path={path} titulo={titulo} onClose={() => setAberta(false)} />}
    </>
  );
}
