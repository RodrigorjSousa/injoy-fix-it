import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  RefreshCcw,
  Download,
  Printer,
  Loader2,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Inbox,
  Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/relatorios-turno")({
  head: () => ({
    meta: [
      { title: "Relatórios de Turno — INJOY" },
      { name: "description", content: "Histórico das passagens de turno da recepção." },
    ],
  }),
  component: RelatoriosTurnoPage,
});

type Row = {
  id: string;
  unidade: string;
  funcionario_saida: string;
  funcionario_entrada: string;
  caixa_status: string;
  caixa_obs: string | null;
  estoque_status: string;
  estoque_obs: string | null;
  gastos_detalhes: string | null;
  maquina_bebidas: string | null;
  observacoes: string | null;
  created_at: string;
};

type Periodo = "diario" | "mensal" | "anual" | "todos";

function startOfPeriodo(p: Periodo): Date | null {
  const now = new Date();
  if (p === "diario") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "mensal") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === "anual") return new Date(now.getFullYear(), 0, 1);
  return null;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function baixarCSV(rows: Row[], periodo: Periodo, unidade: string) {
  const header = [
    "Data/Hora",
    "Unidade",
    "Saída",
    "Entrada",
    "Caixa",
    "Obs. Caixa",
    "Estoque",
    "Obs. Estoque",
    "Gastos",
    "Máquina de Bebidas",
    "Observações",
  ];
  const linhas = rows.map((r) => [
    new Date(r.created_at).toLocaleString("pt-BR"),
    r.unidade,
    r.funcionario_saida,
    r.funcionario_entrada,
    r.caixa_status,
    r.caixa_obs ?? "",
    r.estoque_status,
    r.estoque_obs ?? "",
    r.gastos_detalhes ?? "",
    r.maquina_bebidas ?? "",
    r.observacoes ?? "",
  ]);
  const csv = [header, ...linhas].map((row) => row.map(csvEscape).join(";")).join("\n");
  // BOM p/ Excel abrir com acentos corretos
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `relatorios-turno_${unidade}_${periodo}_${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function RelatoriosTurnoPage() {
  const [unidade, setUnidade] = useState<Unidade>("Botafogo");
  const [periodo, setPeriodo] = useState<Periodo>("diario");
  const [busca, setBusca] = useState("");

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["trocas_turno", unidade, periodo],
    queryFn: async () => {
      let q = supabase
        .from("trocas_turno" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      q = q.eq("unidade", unidade);
      const inicio = startOfPeriodo(periodo);
      if (inicio) q = q.gte("created_at", inicio.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
    refetchInterval: 30000,
  });

  const filtradas = useMemo(() => {
    const s = busca.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [
        r.funcionario_saida,
        r.funcionario_entrada,
        r.observacoes,
        r.gastos_detalhes,
        r.maquina_bebidas,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [rows, busca]);

  const totais = useMemo(() => {
    const divergCaixa = filtradas.filter((r) => r.caixa_status === "divergente").length;
    const divergEstoque = filtradas.filter((r) => r.estoque_status === "divergente").length;
    return { total: filtradas.length, divergCaixa, divergEstoque };
  }, [filtradas]);

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-50 font-sans antialiased pb-16">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <header className="bg-blue-950 text-white p-5 shadow-md sticky top-0 z-10 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link
            to="/gestao"
            className="p-2 rounded-lg bg-blue-900/60 text-blue-100 hover:bg-blue-900"
            aria-label="Voltar"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-lg font-black tracking-tight">Relatórios de Turno</h1>
            <p className="text-[11px] text-blue-300">
              Passagens de serviço da recepção · histórico auditável
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 bg-blue-900/60 rounded-lg text-blue-100 disabled:opacity-60"
          aria-label="Atualizar"
        >
          <RefreshCcw size={18} className={isFetching ? "animate-spin" : ""} />
        </button>
      </header>

      <div className="p-4 space-y-4">
        {/* Filtros */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3 no-print">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
              Unidade:
            </span>
            {(["Todas", "Botafogo", "Ipanema"] as const).map((u) => {
              const active = unidade === u;
              return (
                <button
                  key={u}
                  onClick={() => setUnidade(u)}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border",
                    active
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-blue-300",
                  )}
                >
                  {u !== "Todas" && <Building2 size={12} />}
                  {u === "Todas" ? "Todas" : `INJOY ${u}`}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
              Período:
            </span>
            {([
              { k: "diario", l: "Diário" },
              { k: "mensal", l: "Mensal" },
              { k: "anual", l: "Anual" },
              { k: "todos", l: "Todos" },
            ] as const).map((p) => {
              const active = periodo === p.k;
              return (
                <button
                  key={p.k}
                  onClick={() => setPeriodo(p.k)}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border",
                    active
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400",
                  )}
                >
                  <Calendar size={12} />
                  {p.l}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou texto…"
              className="flex-1 min-w-[200px] border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() =>
                baixarCSV(
                  filtradas,
                  periodo,
                  unidade === "Todas" ? "todas" : unidade.toLowerCase(),
                )
              }
              disabled={filtradas.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download size={14} />
              Exportar CSV / Excel
            </button>
            <button
              onClick={() => window.print()}
              disabled={filtradas.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-50"
            >
              <Printer size={14} />
              Imprimir / PDF
            </button>
          </div>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Registros" value={totais.total} tone="blue" />
          <Kpi
            label="Divergências Caixa"
            value={totais.divergCaixa}
            tone={totais.divergCaixa > 0 ? "red" : "emerald"}
          />
          <Kpi
            label="Divergências Estoque"
            value={totais.divergEstoque}
            tone={totais.divergEstoque > 0 ? "red" : "emerald"}
          />
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
            <Loader2 className="animate-spin inline mr-2" size={16} />
            Carregando…
          </div>
        ) : filtradas.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
            <Inbox className="mx-auto mb-2" size={30} />
            <p className="text-sm">Nenhum relatório neste filtro.</p>
          </div>
        ) : (
          <div className="space-y-3" id="print-area">
            <div className="hidden print:block mb-4">
              <h2 className="text-lg font-black text-slate-900">
                Relatórios de Troca de Turno · {unidade === "Todas" ? "Todas as unidades" : `INJOY ${unidade}`}
              </h2>
              <p className="text-xs text-slate-600">
                Período: {periodo} · Gerado em {new Date().toLocaleString("pt-BR")}
              </p>
            </div>
            {filtradas.map((r) => (
              <article
                key={r.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2 print:shadow-none print:border-slate-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </p>
                    <p className="text-sm font-black text-slate-800">
                      <span className="text-blue-700">{r.funcionario_saida}</span> →{" "}
                      <span className="text-emerald-700">{r.funcionario_entrada}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700">
                      <Building2 size={10} />
                      INJOY {r.unidade}
                    </span>
                    <StatusPill kind="Caixa" status={r.caixa_status} />
                    <StatusPill kind="Estoque" status={r.estoque_status} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {r.caixa_obs && (
                    <Info titulo="Obs. Caixa" valor={r.caixa_obs} />
                  )}
                  {r.estoque_obs && (
                    <Info titulo="Obs. Estoque" valor={r.estoque_obs} />
                  )}
                  {r.gastos_detalhes && (
                    <Info titulo="💸 Gastos" valor={r.gastos_detalhes} />
                  )}
                  {r.maquina_bebidas && (
                    <Info titulo="🥤 Máq. Bebidas" valor={r.maquina_bebidas} />
                  )}
                </div>

                {r.observacoes && (
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                      📝 Atividades / Observações
                    </p>
                    {r.observacoes}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "emerald" | "red";
}) {
  const cls =
    tone === "blue"
      ? "text-blue-700"
      : tone === "emerald"
        ? "text-emerald-700"
        : "text-red-700";
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
        {label}
      </p>
      <p className={cn("text-2xl font-black mt-1", cls)}>{value}</p>
    </div>
  );
}

function StatusPill({ kind, status }: { kind: string; status: string }) {
  const ok = status === "batendo";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
        ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700",
      )}
    >
      {ok ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
      {kind}: {status}
    </span>
  );
}

function Info({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
        {titulo}
      </p>
      <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{valor}</p>
    </div>
  );
}
