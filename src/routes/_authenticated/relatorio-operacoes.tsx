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

async function abrirFoto(path: string | null) {
  if (!path) return;
  const janela = window.open("", "_blank");
  try {
    const url = await urlFotoTalao(path);
    if (janela) janela.location.href = url;
    else window.location.href = url;
  } catch (e) {
    janela?.close();
    toast.error(e instanceof Error ? e.message : "Não foi possível abrir a foto.");
  }
}

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
  const totSaldo = saldo.reduce((s, l) => s + l.saldo, 0);
  const totAberto = saldo.reduce((s, l) => s + l.emAberto, 0);
  const totPend = saldo.reduce((s, l) => s + Math.max(0, l.pendente), 0);
  const totFalta = faltas.reduce((s, f) => s + f.qtd, 0);
  const linhas = todas ? saldo : saldo.filter((l) => l.enviado || l.voltou);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi titulo="Na lavanderia agora" valor={totSaldo} sub={`peças de ${unidade}`} />
        <Kpi
          titulo="Em talões abertos"
          valor={totAberto}
          sub={`${abertos.length} talão(ões) lavando`}
        />
        <Kpi
          titulo="Pendente de talões devolvidos"
          valor={totPend}
          sub="deveriam ter voltado"
          tom={totPend > 0 ? "amber" : undefined}
        />
        <Kpi
          titulo="Faltas na entrega"
          valor={totFalta}
          sub={
            totFalta
              ? `${brl.format(faltas.reduce((s, f) => s + f.valor, 0))} anotados e não entregues`
              : "nenhuma"
          }
          tom={totFalta > 0 ? "red" : undefined}
        />
      </div>

      {alertas.length > 0 && (
        <div className="bg-white border border-amber-300 rounded-2xl overflow-hidden">
          <div className="bg-amber-500 text-white px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle size={14} /> Atenção ({alertas.length})
          </div>
          <ul className="divide-y divide-amber-100">
            {alertas.map((a, i) => (
              <li key={i} className="px-4 py-2.5 text-sm flex gap-2 items-start">
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 rounded-full shrink-0",
                    a.nivel === "alto" ? "bg-red-500" : "bg-amber-400",
                  )}
                />
                <span className="text-slate-700">{a.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
          <p className="text-xs font-black uppercase tracking-wider text-slate-600">
            Saldo por peça
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
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left p-3">Peça</th>
                  <th className="p-3 text-right bg-blue-50 text-blue-800">Na lavanderia</th>
                  <th className="p-3 text-right">Pendente</th>
                  <th className="p-3 text-right">Em talões abertos</th>
                  <th className="p-3 text-right">Lavanderia recebeu</th>
                  <th className="p-3 text-right">Voltou (contado)</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.peca.id} className="border-t border-slate-100">
                    <td className="p-3 font-semibold text-slate-800">{l.peca.nome}</td>
                    <td className="p-3 text-right font-black text-blue-800 bg-blue-50/50">
                      {l.saldo}
                    </td>
                    <td
                      className={cn(
                        "p-3 text-right font-bold",
                        l.pendente > 0
                          ? "text-red-600"
                          : l.pendente < 0
                            ? "text-emerald-700"
                            : "text-slate-400",
                      )}
                    >
                      {sinal(l.pendente)}
                    </td>
                    <td className="p-3 text-right text-slate-600">{l.emAberto}</td>
                    <td className="p-3 text-right text-slate-600">{l.enviado}</td>
                    <td className="p-3 text-right text-slate-600">{l.voltou}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-100 leading-relaxed">
          <b>Pendente</b> = na lavanderia − em talões abertos. Positivo: peças de talões já
          devolvidos que ainda não voltaram. Negativo: a lavanderia já devolveu peças de talões que
          ainda estão abertos (normal quando a roupa volta misturada).
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

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left p-3">Talão</th>
              <th className="text-left p-3">Coleta</th>
              <th className="p-3 text-right">Saída hotel</th>
              <th className="p-3 text-right">Ent. Lav.</th>
              <th className="p-3 text-right">Saída Lav.</th>
              <th className="p-3 text-right">Contado</th>
              <th className="p-3 text-right" title="Ent. Lav. − Saída hotel">
                Dif. coleta
              </th>
              <th className="p-3 text-right" title="Contado − Saída Lav.">
                Falta entrega
              </th>
              <th className="text-left p-3">Retorno</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-500">
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
        <td className="p-3 text-right">{r.saidaLav ?? "—"}</td>
        <td className="p-3 text-right font-bold">{r.guardado ?? "—"}</td>
        <td
          className={cn(
            "p-3 text-right font-bold",
            r.difColeta ? "text-amber-600" : "text-slate-400",
          )}
        >
          {sinal(r.difColeta)}
        </td>
        <td
          className={cn(
            "p-3 text-right font-bold",
            r.difEntrega && r.difEntrega < 0 ? "text-red-600" : "text-slate-400",
          )}
        >
          {sinal(r.difEntrega)}
        </td>
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
        <td className="p-3 text-slate-400">
          {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </td>
      </tr>
      {expandido && (
        <tr className="bg-slate-50">
          <td colSpan={10} className="p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
              <table className="w-full text-xs bg-white rounded-lg border border-slate-200">
                <thead className="text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="text-left p-2">Peça</th>
                    <th className="p-2 text-right">Saída hotel</th>
                    <th className="p-2 text-right">Ent. Lav.</th>
                    <th className="p-2 text-right">Saída Lav.</th>
                    <th className="p-2 text-right">Contado</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => {
                    const falta =
                      i.saida_lav !== null && i.guardado !== null && i.guardado < i.saida_lav;
                    const dif =
                      i.ent_lav !== null && i.saida_hotel > 0 && i.ent_lav !== i.saida_hotel;
                    return (
                      <tr key={i.peca_id} className="border-t border-slate-100">
                        <td className="p-2 font-semibold">
                          {nome.get(i.peca_id)?.nome ?? "Peça removida"}
                        </td>
                        <td className="p-2 text-right">{i.saida_hotel}</td>
                        <td className={cn("p-2 text-right", dif && "text-amber-600 font-bold")}>
                          {i.ent_lav ?? "—"}
                        </td>
                        <td className="p-2 text-right">{i.saida_lav ?? "—"}</td>
                        <td className={cn("p-2 text-right", falta && "text-red-600 font-black")}>
                          {i.guardado ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="space-y-2 text-xs" onClick={(e) => e.stopPropagation()}>
                <div className="flex gap-2">
                  <button
                    onClick={() => abrirFoto(t.coleta_foto)}
                    className="flex-1 inline-flex items-center justify-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-2 font-bold"
                  >
                    <Camera size={13} /> Foto coleta
                  </button>
                  <button
                    onClick={() => abrirFoto(t.retorno_foto)}
                    disabled={!t.retorno_foto}
                    className="flex-1 inline-flex items-center justify-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-2 font-bold disabled:opacity-40"
                  >
                    <Camera size={13} /> Foto retorno
                  </button>
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
      ? Math.round((valorNum - f.valorEsperado) * 100) / 100
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
        valorEsperado: f.valorEsperado,
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
          valorEsperado: f.valorEsperado,
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
          titulo="Talões no mês"
          valor={f.taloes.length}
          sub={`${f.taloesSemRetorno.length} sem retorno`}
          tom={f.taloesSemRetorno.length ? "amber" : undefined}
        />
        <Kpi
          titulo="Peças (lavanderia)"
          valor={f.totalPecasLavanderia}
          sub={`camareiras contaram ${f.totalPecasHotel}`}
        />
        <Kpi
          titulo="Valor esperado"
          valor={brl.format(f.valorEsperado)}
          sub="contagem × tabela de preços"
        />
        <Kpi
          titulo="Fatura − esperado"
          valor={diferenca === null ? "—" : brl.format(diferenca)}
          sub={
            valorNum === null
              ? "digite o valor da fatura"
              : diferenca! > 0
                ? "cobrando a mais"
                : diferenca! < 0
                  ? "cobrando a menos"
                  : "bateu"
          }
          tom={diferenca && diferenca > 0 ? "red" : undefined}
        />
      </div>

      {(f.taloesSemRetorno.length > 0 || f.numerosFaltando.length > 0 || faltas.length > 0) && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-sm space-y-1.5 text-amber-900">
          <p className="font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle size={14} /> Antes de aprovar
          </p>
          {f.taloesSemRetorno.length > 0 && (
            <p>
              Sem retorno lançado: {f.taloesSemRetorno.map((t) => `nº ${t.numero}`).join(", ")} —
              nestes a quantidade cobrada usa a contagem da camareira.
            </p>
          )}
          {f.numerosFaltando.length > 0 && (
            <p>Números pulados: {f.numerosFaltando.join(", ")}. Algum talão não foi lançado?</p>
          )}
          {faltas.length > 0 && (
            <p>
              Anotado pela lavanderia e não entregue:{" "}
              {faltas
                .map((x) => `${x.qtd} ${x.peca.nome} (talão ${x.taloes.join(", ")})`)
                .join("; ")}{" "}
              — <b>{brl.format(faltas.reduce((s, x) => s + x.valor, 0))}</b> pela tabela.
            </p>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left p-3">Coluna da fatura</th>
              <th className="p-3 text-right">Preço</th>
              <th className="p-3 text-right">Camareiras</th>
              <th className="p-3 text-right">Lavanderia</th>
              <th className="p-3 text-right">Valor esperado</th>
              <th className="p-3 text-center bg-blue-50 text-blue-800">Qtd na fatura</th>
              <th className="p-3 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {f.linhas.map((l) => (
              <tr key={l.grupo} className="border-t border-slate-100">
                <td className="p-3 font-semibold text-slate-800">{l.grupo}</td>
                <td className="p-3 text-right text-slate-500">{brl.format(l.preco)}</td>
                <td className="p-3 text-right">{l.qtdHotel}</td>
                <td className="p-3 text-right font-bold">{l.qtdLavanderia}</td>
                <td className="p-3 text-right">{brl.format(l.valorEsperado)}</td>
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
              <td className="p-3 text-right">{f.totalPecasLavanderia}</td>
              <td className="p-3 text-right">{brl.format(f.valorEsperado)}</td>
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
        <table className="w-full text-xs min-w-[560px]">
          <thead className="text-[10px] uppercase text-slate-500 bg-slate-50">
            <tr>
              <th className="text-left p-2">Data</th>
              <th className="text-left p-2">Talão</th>
              <th className="p-2 text-right">Saída hotel</th>
              <th className="p-2 text-right">Ent. Lav.</th>
              <th className="p-2 text-right">Contado</th>
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
                  <td className="p-2 text-right">
                    {r.guardado ?? <span className="text-amber-600 font-bold">sem retorno</span>}
                  </td>
                  <td className="p-2 text-center whitespace-nowrap">
                    <button
                      onClick={() => abrirFoto(t.coleta_foto)}
                      className="text-blue-700 font-bold underline mr-2"
                    >
                      coleta
                    </button>
                    {t.retorno_foto && (
                      <button
                        onClick={() => abrirFoto(t.retorno_foto)}
                        className="text-blue-700 font-bold underline"
                      >
                        retorno
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {f.taloes.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-slate-500">
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
    .filter((l) => l.qtdLavanderia || l.qtdFatura)
    .map(
      (l) =>
        `<tr><td>${esc(l.grupo)}</td><td>${brl.format(l.preco)}</td><td>${l.qtdHotel}</td><td>${l.qtdLavanderia}</td><td>${brl.format(
          l.valorEsperado,
        )}</td><td>${l.qtdFatura ?? "—"}</td><td>${l.difQtd === null ? "—" : sinal(l.difQtd)}</td></tr>`,
    )
    .join("");
  const taloes = f.taloes
    .map((t) => {
      const r = resumoTalao(t, todaySP());
      return `<tr><td>${dataBR(t.data_coleta)}</td><td>${esc(t.numero)}</td><td>${r.saida}</td><td>${r.entLav ?? "—"}</td><td>${
        r.saidaLav ?? "—"
      }</td><td>${r.guardado ?? "sem retorno"}</td></tr>`;
    })
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Lavanderia ${esc(unidade)} ${esc(nomeMes(mes))}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px;color:#111}h1{font-size:18px;margin:0}h2{font-size:14px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 6px;text-align:right}td:first-child,th:first-child{text-align:left}
th{background:#eee}.r{display:flex;gap:24px;margin-top:8px}.b{font-weight:bold}</style></head><body>
<h1>INJOY ${esc(unidade)} — Fechamento da lavanderia (Clean Soft)</h1><div>${esc(nomeMes(mes))} · gerado em ${dataBR(todaySP())}</div>
<div class="r"><div>Valor esperado: <span class="b">${brl.format(f.valorEsperado)}</span></div><div>Valor da fatura: <span class="b">${
    valorFatura === null ? "—" : brl.format(valorFatura)
  }</span></div><div>Diferença: <span class="b">${valorFatura === null ? "—" : brl.format(valorFatura - f.valorEsperado)}</span></div></div>
<h2>Por coluna da fatura</h2><table><tr><th>Coluna</th><th>Preço</th><th>Camareiras</th><th>Lavanderia</th><th>Valor esperado</th><th>Fatura</th><th>Dif.</th></tr>${linhas}</table>
${
  faltas.length
    ? `<h2>Anotado pela lavanderia e não entregue</h2><table><tr><th>Peça</th><th>Qtd</th><th>Valor</th><th>Talões</th></tr>${faltas
        .map(
          (x) =>
            `<tr><td>${esc(x.peca.nome)}</td><td>${x.qtd}</td><td>${brl.format(x.valor)}</td><td>${esc(x.taloes.join(", "))}</td></tr>`,
        )
        .join("")}</table>`
    : ""
}
${f.numerosFaltando.length ? `<p><b>Números pulados:</b> ${f.numerosFaltando.join(", ")}</p>` : ""}
<h2>Talões (${f.taloes.length})</h2><table><tr><th>Data</th><th>Talão</th><th>Saída hotel</th><th>Ent. Lav.</th><th>Saída Lav.</th><th>Contado</th></tr>${taloes}</table>
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
