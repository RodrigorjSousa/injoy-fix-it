import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Shirt,
  ListChecks,
  TrendingDown,
  FileDown,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  Filter,
  ClipboardList,
  Sunrise,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUnidade } from "@/lib/unidade-context";
import { useMe } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import injoyLogo from "@/assets/injoy-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/relatorio-operacoes")({
  component: RelatorioOperacoes,
});

type LaundryItem = {
  item: string;
  enviado: number;
  retornado: number;
  diferenca: number;
  em_falta: number;
};

type LaundryLog = {
  id: string;
  camareira_name: string;
  property: string;
  items_data: LaundryItem[];
  created_at: string;
};

type ExtraTaskLog = {
  id: string;
  camareira_name: string;
  property: string;
  completed_tasks: string[];
  created_at: string;
};

type PeriodChecklistLog = {
  id: string;
  camareira_name: string;
  property: string;
  period: "manha" | "tarde" | "noite";
  completed_items: string[];
  created_at: string;
};

type DirRow = { id: string; name: string };

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function formatData(dt: string) {
  const d = new Date(dt);
  return d.toLocaleDateString("pt-BR");
}
function formatHora(dt: string) {
  const d = new Date(dt);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function monthKey(dt: string) {
  const d = new Date(dt);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MESES[parseInt(m, 10)]} de ${y}`;
}

function RelatorioOperacoes() {
  const { unidade } = useUnidade();
  const { data: me } = useMe();
  const qc = useQueryClient();

  const isAdmin = !!me && (me.isAdmin || me.isGestor);

  const [camareiraFiltro, setCamareiraFiltro] = useState<string>("__all");
  const [pdfRange, setPdfRange] = useState<"semana" | "mes" | "ano">("mes");
  const [pdfLoading, setPdfLoading] = useState(false);

  // ---- Dados ---------------------------------------------------------------
  const { data: laundry = [], isLoading: loadingLaundry } = useQuery({
    queryKey: ["laundry_logs", unidade],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laundry_logs" as never)
        .select("*")
        .eq("property", unidade)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as LaundryLog[]) ?? [];
    },
  });

  const { data: extras = [], isLoading: loadingExtras } = useQuery({
    queryKey: ["extra_tasks_logs", unidade],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extra_tasks_logs" as never)
        .select("*")
        .eq("property", unidade)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as ExtraTaskLog[]) ?? [];
    },
  });

  // Checklists de período foram movidos para "Histórico de Produção de Limpeza"

  const { data: laundryDir = [] } = useQuery({
    queryKey: ["laundry_items_directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laundry_items_directory" as never)
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data as unknown as DirRow[]) ?? [];
    },
  });

  const { data: extraDir = [] } = useQuery({
    queryKey: ["extra_tasks_directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extra_tasks_directory" as never)
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data as unknown as DirRow[]) ?? [];
    },
  });

  // Lista de camareiras (nomes distintos vindos dos logs)
  const camareiras = useMemo(() => {
    const set = new Set<string>();
    laundry.forEach((l) => l.camareira_name && set.add(l.camareira_name));
    extras.forEach((l) => l.camareira_name && set.add(l.camareira_name));
    return Array.from(set).sort();
  }, [laundry, extras]);

  const laundryFiltrado = useMemo(
    () =>
      camareiraFiltro === "__all"
        ? laundry
        : laundry.filter((l) => l.camareira_name === camareiraFiltro),
    [laundry, camareiraFiltro],
  );
  const extrasFiltrado = useMemo(
    () =>
      camareiraFiltro === "__all"
        ? extras
        : extras.filter((l) => l.camareira_name === camareiraFiltro),
    [extras, camareiraFiltro],
  );
  const checklistsFiltrado = useMemo(
    () =>
      camareiraFiltro === "__all"
        ? checklists
        : checklists.filter((l) => l.camareira_name === camareiraFiltro),
    [checklists, camareiraFiltro],
  );

  // ---- KPIs (últimos 365 dias) --------------------------------------------
  const kpis = useMemo(() => {
    const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    let totalPecas = 0;
    let totalPerdas = 0;
    laundryFiltrado.forEach((log) => {
      if (new Date(log.created_at).getTime() < cutoff) return;
      (log.items_data ?? []).forEach((it) => {
        totalPecas += Number(it.enviado) || 0;
        totalPerdas += Number(it.em_falta) || 0;
      });
    });
    const totalExtras = extrasFiltrado.filter(
      (e) => new Date(e.created_at).getTime() >= cutoff,
    ).length;
    return { totalPecas, totalPerdas, totalExtras };
  }, [laundryFiltrado, extrasFiltrado]);

  // ---- Registros unificados agrupados por mês -----------------------------
  type Registro =
    | { tipo: "lavanderia"; log: LaundryLog }
    | { tipo: "tarefa"; log: ExtraTaskLog }
    | { tipo: "checklist"; log: PeriodChecklistLog };

  const registrosPorMes = useMemo(() => {
    const map = new Map<string, Registro[]>();
    laundryFiltrado.forEach((log) => {
      const k = monthKey(log.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({ tipo: "lavanderia", log });
    });
    extrasFiltrado.forEach((log) => {
      const k = monthKey(log.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({ tipo: "tarefa", log });
    });
    checklistsFiltrado.forEach((log) => {
      const k = monthKey(log.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({ tipo: "checklist", log });
    });
    const keys = Array.from(map.keys()).sort().reverse();
    return keys.map((k) => ({
      key: k,
      label: monthLabel(k),
      registros: map
        .get(k)!
        .sort(
          (a, b) =>
            new Date(b.log.created_at).getTime() -
            new Date(a.log.created_at).getTime(),
        ),
    }));
  }, [laundryFiltrado, extrasFiltrado, checklistsFiltrado]);

  // ---- PDF Export ---------------------------------------------------------
  const exportPDF = async () => {
    setPdfLoading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const now = Date.now();
      const days = pdfRange === "semana" ? 7 : pdfRange === "mes" ? 30 : 365;
      const cutoff = now - days * 24 * 60 * 60 * 1000;

      const laundryPer = laundryFiltrado.filter(
        (l) => new Date(l.created_at).getTime() >= cutoff,
      );
      const extrasPer = extrasFiltrado.filter(
        (l) => new Date(l.created_at).getTime() >= cutoff,
      );

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      try {
        doc.addImage(injoyLogo.url, "PNG", 40, 30, 40, 40);
      } catch {
        // ignore
      }
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("INJOY HOTÉIS", 90, 50);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Relatório de Operações · INJOY ${unidade}`,
        90,
        65,
      );
      doc.text(
        `Período: ${pdfRange === "semana" ? "Últimos 7 dias" : pdfRange === "mes" ? "Últimos 30 dias" : "Últimos 12 meses"}`,
        90,
        78,
      );
      doc.text(
        `Emitido em ${new Date().toLocaleString("pt-BR")}${camareiraFiltro !== "__all" ? " · Camareira: " + camareiraFiltro : ""}`,
        90,
        91,
      );
      doc.setDrawColor(200);
      doc.line(40, 105, pageWidth - 40, 105);

      // Produção por funcionário
      const producao = new Map<
        string,
        { pecas: number; perdas: number; extras: number }
      >();
      laundryPer.forEach((l) => {
        const row = producao.get(l.camareira_name) ?? {
          pecas: 0,
          perdas: 0,
          extras: 0,
        };
        (l.items_data ?? []).forEach((it) => {
          row.pecas += Number(it.enviado) || 0;
          row.perdas += Number(it.em_falta) || 0;
        });
        producao.set(l.camareira_name, row);
      });
      extrasPer.forEach((e) => {
        const row = producao.get(e.camareira_name) ?? {
          pecas: 0,
          perdas: 0,
          extras: 0,
        };
        row.extras += 1;
        producao.set(e.camareira_name, row);
      });

      autoTable(doc, {
        startY: 120,
        head: [["Funcionário", "Peças Enviadas", "Peças em Falta", "Tarefas Extras"]],
        body: Array.from(producao.entries()).map(([nome, v]) => [
          nome,
          v.pecas,
          v.perdas,
          v.extras,
        ]),
        headStyles: { fillColor: [15, 42, 82] },
        theme: "striped",
        styles: { fontSize: 9 },
      });

      // Consolidado lavanderia
      const consolidado = new Map<
        string,
        { enviado: number; retornado: number; em_falta: number }
      >();
      laundryPer.forEach((l) => {
        (l.items_data ?? []).forEach((it) => {
          const row = consolidado.get(it.item) ?? {
            enviado: 0,
            retornado: 0,
            em_falta: 0,
          };
          row.enviado += Number(it.enviado) || 0;
          row.retornado += Number(it.retornado) || 0;
          row.em_falta += Number(it.em_falta) || 0;
          consolidado.set(it.item, row);
        });
      });

      const finalY1 =
        (doc as unknown as { lastAutoTable?: { finalY: number } })
          .lastAutoTable?.finalY ?? 200;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Consolidado de Lavanderia", 40, finalY1 + 30);

      autoTable(doc, {
        startY: finalY1 + 40,
        head: [["Item", "Enviado", "Retornado", "Em Falta"]],
        body: Array.from(consolidado.entries()).map(([nome, v]) => [
          nome,
          v.enviado,
          v.retornado,
          v.em_falta,
        ]),
        headStyles: { fillColor: [15, 42, 82] },
        theme: "striped",
        styles: { fontSize: 9 },
      });

      // Tarefas extras
      const finalY2 =
        (doc as unknown as { lastAutoTable?: { finalY: number } })
          .lastAutoTable?.finalY ?? 400;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Tarefas Extras Concluídas", 40, finalY2 + 30);

      autoTable(doc, {
        startY: finalY2 + 40,
        head: [["Data", "Hora", "Funcionário", "Tarefas"]],
        body: extrasPer.map((e) => [
          formatData(e.created_at),
          formatHora(e.created_at),
          e.camareira_name,
          (e.completed_tasks ?? []).join(", "),
        ]),
        headStyles: { fillColor: [15, 42, 82] },
        theme: "striped",
        styles: { fontSize: 9, cellWidth: "wrap" },
        columnStyles: { 3: { cellWidth: 260 } },
      });

      doc.save(
        `relatorio-operacoes-${unidade}-${pdfRange}-${new Date().toISOString().slice(0, 10)}.pdf`,
      );
      toast.success("PDF gerado");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao gerar PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-slate-500">
        Acesso restrito a administradores.
      </div>
    );
  }

  // ---- Item Manager helpers ----------------------------------------------
  const invalidateDir = (table: "laundry" | "extras") => {
    qc.invalidateQueries({
      queryKey: [table === "laundry" ? "laundry_items_directory" : "extra_tasks_directory"],
    });
  };

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-[calc(100vh-4rem)] bg-slate-50 pb-16">
      <div className="bg-blue-950 text-white p-5 shadow-md">
        <h1 className="text-xl font-black tracking-tight">
          Relatório de Operações & Lavanderia
        </h1>
        <p className="text-xs text-blue-300">
          INJOY {unidade} · Auditoria completa de tarefas e enxoval
        </p>
      </div>

      <div className="p-4 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <Shirt size={16} />
              <p className="text-[11px] font-bold uppercase tracking-wider">
                Peças Enviadas (12 meses)
              </p>
            </div>
            <p className="text-4xl font-black text-blue-700 mt-2">
              {kpis.totalPecas.toLocaleString("pt-BR")}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Acumulado dos últimos 365 dias
            </p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <TrendingDown size={16} />
              <p className="text-[11px] font-bold uppercase tracking-wider">
                Peças em Falta
              </p>
            </div>
            <p className="text-4xl font-black text-red-600 mt-2">
              {kpis.totalPerdas.toLocaleString("pt-BR")}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Prejuízo acumulado (12 meses)
            </p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <ListChecks size={16} />
              <p className="text-[11px] font-bold uppercase tracking-wider">
                Tarefas Extras
              </p>
            </div>
            <p className="text-4xl font-black text-emerald-600 mt-2">
              {kpis.totalExtras.toLocaleString("pt-BR")}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Registros nos últimos 365 dias
            </p>
          </div>
        </div>

        {/* Filtros + Export */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Filter size={12} /> Camareira
            </label>
            <Select value={camareiraFiltro} onValueChange={setCamareiraFiltro}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas</SelectItem>
                {camareiras.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-48">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Intervalo PDF
            </label>
            <Select
              value={pdfRange}
              onValueChange={(v) => setPdfRange(v as typeof pdfRange)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semana">Semanal (7d)</SelectItem>
                <SelectItem value="mes">Mensal (30d)</SelectItem>
                <SelectItem value="ano">Anual (12m)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <button
            onClick={exportPDF}
            disabled={pdfLoading}
            className="inline-flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow-sm disabled:opacity-60"
          >
            {pdfLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileDown size={16} />
            )}
            Exportar PDF
          </button>
        </div>

        <Tabs defaultValue="registros" className="w-full">
          <TabsList className="grid grid-cols-3 max-w-xl">
            <TabsTrigger value="registros">
              <ClipboardList size={14} className="mr-1" /> Registros
            </TabsTrigger>
            <TabsTrigger value="conta">
              <TrendingDown size={14} className="mr-1" /> Conta Corrente
            </TabsTrigger>
            <TabsTrigger value="itens">
              <Pencil size={14} className="mr-1" /> Gerenciar Itens
            </TabsTrigger>
          </TabsList>

          <TabsContent value="conta" className="mt-4">
            <LaundryDebtPanel unidade={unidade} />
          </TabsContent>

          {/* Registros por mês */}
          <TabsContent value="registros" className="mt-4">
            {loadingLaundry || loadingExtras || loadingChecklists ? (
              <div className="p-8 text-center text-slate-500">
                <Loader2 className="animate-spin inline mr-2" size={16} />
                Carregando registros…
              </div>
            ) : registrosPorMes.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                Nenhum registro encontrado.
              </div>
            ) : (
              <Accordion
                type="multiple"
                defaultValue={[registrosPorMes[0]?.key]}
                className="space-y-2"
              >
                {registrosPorMes.map((mes) => (
                  <AccordionItem
                    key={mes.key}
                    value={mes.key}
                    className="bg-white border border-slate-200 rounded-2xl px-4"
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <span className="font-black text-slate-800">
                          {mes.label}
                        </span>
                        <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {mes.registros.length} registros
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="divide-y divide-slate-100">
                        {mes.registros.map((r) => (
                          <RegistroRow key={r.log.id} r={r} />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>

          {/* Itens */}
          <TabsContent value="itens" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ItemManager
                title="Itens de Lavanderia"
                icon={<Shirt size={16} />}
                accent="sky"
                rows={laundryDir}
                onChanged={() => invalidateDir("laundry")}
                table="laundry_items_directory"
              />
              <ItemManager
                title="Tarefas Extras"
                icon={<ListChecks size={16} />}
                accent="emerald"
                rows={extraDir}
                onChanged={() => invalidateDir("extras")}
                table="extra_tasks_directory"
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const PERIOD_LABEL: Record<"manha" | "tarde" | "noite", string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

function RegistroRow({
  r,
}: {
  r:
    | { tipo: "lavanderia"; log: LaundryLog }
    | { tipo: "tarefa"; log: ExtraTaskLog }
    | { tipo: "checklist"; log: PeriodChecklistLog };
}) {
  const [open, setOpen] = useState(false);
  const log = r.log;
  const badge =
    r.tipo === "lavanderia"
      ? { bg: "bg-sky-500", label: "Lavanderia", text: "text-sky-600", icon: <Shirt size={14} /> }
      : r.tipo === "tarefa"
        ? { bg: "bg-emerald-500", label: "Tarefa Extra", text: "text-emerald-600", icon: <ListChecks size={14} /> }
        : { bg: "bg-amber-500", label: `Checklist ${PERIOD_LABEL[r.log.period]}`, text: "text-amber-600", icon: <Sunrise size={14} /> };
  return (
    <div className="py-3">
      <button
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center gap-3 text-left"
      >
        <div
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0",
            badge.bg,
          )}
        >
          {badge.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">
            {log.camareira_name || "—"}
          </p>
          <p className="text-[11px] text-slate-500">
            {formatData(log.created_at)} · {formatHora(log.created_at)} ·{" "}
            <span className={cn("font-semibold", badge.text)}>
              {badge.label}
            </span>
          </p>
        </div>
        <span className="text-[11px] font-bold text-slate-400">
          {open ? "Fechar" : "Ver"}
        </span>
      </button>
      {open && (
        <div className="mt-3 ml-11 text-xs">
          {r.tipo === "lavanderia" ? (
            <table className="w-full">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase tracking-wider">
                  <th className="text-left py-1">Item</th>
                  <th className="text-right py-1">Env.</th>
                  <th className="text-right py-1">Ret.</th>
                  <th className="text-right py-1">Falta</th>
                </tr>
              </thead>
              <tbody>
                {(r.log.items_data ?? []).map((it, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1 text-slate-700">{it.item}</td>
                    <td className="py-1 text-right">{it.enviado}</td>
                    <td className="py-1 text-right">{it.retornado}</td>
                    <td
                      className={cn(
                        "py-1 text-right font-bold",
                        it.em_falta > 0 ? "text-red-600" : "text-slate-400",
                      )}
                    >
                      {it.em_falta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : r.tipo === "tarefa" ? (
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              {(r.log.completed_tasks ?? []).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : (
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              {(r.log.completed_items ?? []).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ItemManager({
  title,
  icon,
  accent,
  rows,
  onChanged,
  table,
}: {
  title: string;
  icon: React.ReactNode;
  accent: "sky" | "emerald";
  rows: DirRow[];
  onChanged: () => void;
  table: "laundry_items_directory" | "extra_tasks_directory";
}) {
  const [novo, setNovo] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const adicionar = async () => {
    const name = novo.trim();
    if (!name) return;
    setSaving(true);
    const { error } = await supabase
      .from(table as never)
      .insert({ name } as never);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNovo("");
    toast.success("Item adicionado");
    onChanged();
  };

  const salvarEdicao = async (id: string) => {
    const name = editValue.trim();
    if (!name) return;
    const { error } = await supabase
      .from(table as never)
      .update({ name } as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditing(null);
    toast.success("Item atualizado");
    onChanged();
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este item?")) return;
    const { error } = await supabase
      .from(table as never)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Item removido");
    onChanged();
  };

  const badge = accent === "sky" ? "bg-sky-500" : "bg-emerald-500";
  const btn = accent === "sky" ? "bg-sky-600 hover:bg-sky-700" : "bg-emerald-600 hover:bg-emerald-700";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("h-8 w-8 rounded-lg text-white grid place-items-center", badge)}>
          {icon}
        </div>
        <h3 className="text-sm font-black text-slate-800">{title}</h3>
        <span className="ml-auto text-[11px] text-slate-500 font-semibold">
          {rows.length} itens
        </span>
      </div>
      <div className="flex gap-2 mb-3">
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && adicionar()}
          placeholder="Novo item…"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={adicionar}
          disabled={saving || !novo.trim()}
          className={cn(
            "text-white font-bold rounded-lg px-3 text-sm inline-flex items-center gap-1 disabled:opacity-50",
            btn,
          )}
        >
          <Plus size={14} /> Add
        </button>
      </div>
      <div className="space-y-1 max-h-[420px] overflow-y-auto">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 group"
          >
            {editing === row.id ? (
              <>
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && salvarEdicao(row.id)}
                  className="flex-1 border border-blue-500 rounded-md px-2 py-1 text-sm"
                />
                <button
                  onClick={() => salvarEdicao(row.id)}
                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-md"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-slate-700 truncate">
                  {row.name}
                </span>
                <button
                  onClick={() => {
                    setEditing(row.id);
                    setEditValue(row.name);
                  }}
                  className="p-1.5 text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Editar"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => excluir(row.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Excluir"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-center text-xs text-slate-400 py-6">
            Nenhum item cadastrado.
          </p>
        )}
      </div>
    </div>
  );
}

/* -------------------- CONTA CORRENTE DA LAVANDERIA -------------------- */

type DebtRow = {
  id: string;
  property: string;
  batch_id: string | null;
  item_name: string;
  quantity_missing: number;
  status: "pending" | "resolved";
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
};

function LaundryDebtPanel({ unidade }: { unidade: string }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: debts = [], isLoading } = useQuery({
    queryKey: ["laundry_debt", unidade],
    queryFn: async (): Promise<DebtRow[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("laundry_debt" as any)
        .select("id, property, batch_id, item_name, quantity_missing, status, resolved_at, resolved_by, created_at")
        .eq("property", unidade)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as DebtRow[]) ?? [];
    },
  });

  const { data: batchesComNota = [] } = useQuery({
    queryKey: ["laundry_batches_notes", unidade],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("laundry_batches" as any)
        .select("batch_id, status, sent_by, sent_at, notes")
        .eq("property", unidade)
        .not("notes", "is", null)
        .order("sent_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as unknown as {
        batch_id: string;
        status: string;
        sent_by: string;
        sent_at: string;
        notes: string;
      }[]) ?? [];
    },
  });


  const pendentes = debts.filter((d) => d.status === "pending");
  const resolvidos = debts.filter((d) => d.status === "resolved");
  const totalPecas = pendentes.reduce((s, d) => s + d.quantity_missing, 0);

  const consolidado = useMemo(() => {
    const m = new Map<string, number>();
    pendentes.forEach((d) => m.set(d.item_name, (m.get(d.item_name) ?? 0) + d.quantity_missing));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [pendentes]);

  const darBaixa = async (row: DebtRow) => {
    try {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("laundry_debt" as any)
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: me?.funcionario?.nome ?? me?.email ?? "admin",
        })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(`Baixa registrada: ${row.item_name}`);
      qc.invalidateQueries({ queryKey: ["laundry_debt", unidade] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao dar baixa");
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Loader2 className="animate-spin inline mr-2" size={16} /> Carregando conta corrente…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-red-50 border-2 border-red-200 p-5 rounded-2xl">
          <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">
            Peças em Aberto
          </p>
          <p className="text-4xl font-black text-red-700 mt-2">{totalPecas}</p>
          <p className="text-[11px] text-red-600 mt-1">
            Lavanderia deve ao hotel · {unidade}
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Registros Pendentes
          </p>
          <p className="text-4xl font-black text-slate-800 mt-2">{pendentes.length}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Já Resolvidos
          </p>
          <p className="text-4xl font-black text-emerald-600 mt-2">{resolvidos.length}</p>
        </div>
      </div>

      {batchesComNota.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl overflow-hidden">
          <div className="bg-amber-500 text-white px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-2">
            ⚠️ Lotes com observação (avarias / manchas / instruções)
          </div>
          <div className="divide-y divide-amber-200">
            {batchesComNota.map((b) => (
              <div key={b.batch_id} className="p-3 flex items-start gap-3">
                <div className="shrink-0">
                  <p className="text-xs font-black text-sky-700 font-mono">{b.batch_id}</p>
                  <p className="text-[10px] text-slate-500">
                    {formatData(b.sent_at)} · {b.sent_by}
                  </p>
                  <span
                    className={cn(
                      "inline-block mt-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                      b.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : b.status === "partial"
                          ? "bg-amber-200 text-amber-800"
                          : "bg-sky-100 text-sky-700",
                    )}
                  >
                    {b.status === "completed"
                      ? "Concluído"
                      : b.status === "partial"
                        ? "Parcial"
                        : "Em trânsito"}
                  </span>
                </div>
                <p className="text-sm text-amber-900 flex-1 leading-snug">{b.notes}</p>
              </div>
            ))}
          </div>
        </div>
      )}



      {consolidado.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Consolidado por item
          </p>
          <div className="flex flex-wrap gap-2">
            {consolidado.map(([item, qty]) => (
              <span
                key={item}
                className="text-xs font-bold bg-red-100 text-red-700 border border-red-200 rounded-lg px-3 py-1.5"
              >
                {item}: <span className="font-black">{qty}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-red-200 rounded-2xl overflow-hidden">
        <div className="bg-red-600 text-white px-4 py-2 text-xs font-black uppercase tracking-wider">
          Saldo Devedor Atual
        </div>
        {pendentes.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            Nenhuma peça em aberto 🎉 A lavanderia está em dia.
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-red-50 border-b border-red-100">
                <tr className="text-[10px] uppercase tracking-wider text-red-700">
                  <th className="text-left p-3 font-bold">Item</th>
                  <th className="p-3 font-bold w-24 text-center">Qtd</th>
                  <th className="p-3 font-bold">Lote</th>
                  <th className="p-3 font-bold">Data</th>
                  <th className="p-3 font-bold w-40">Ação</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((d, i) => (
                  <tr
                    key={d.id}
                    className={cn(
                      "border-b border-slate-100",
                      i % 2 === 0 ? "bg-white" : "bg-slate-50/50",
                    )}
                  >
                    <td className="p-3 font-bold text-slate-800">{d.item_name}</td>
                    <td className="p-3 text-center">
                      <span className="inline-block bg-red-500 text-white font-black rounded-md px-2 py-1 text-xs">
                        -{d.quantity_missing}
                      </span>
                    </td>
                    <td className="p-3 text-xs font-mono text-sky-700">{d.batch_id ?? "—"}</td>
                    <td className="p-3 text-xs text-slate-500">
                      {formatData(d.created_at)}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => darBaixa(d)}
                        className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg"
                      >
                        <Check size={12} /> Dar Baixa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resolvidos.length > 0 && (
        <details className="bg-white border border-slate-200 rounded-2xl">
          <summary className="cursor-pointer px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-600">
            Histórico de baixas ({resolvidos.length})
          </summary>
          <div className="overflow-auto border-t border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left p-3 font-bold">Item</th>
                  <th className="p-3 font-bold w-24 text-center">Qtd</th>
                  <th className="p-3 font-bold">Lote</th>
                  <th className="p-3 font-bold">Baixado em</th>
                  <th className="p-3 font-bold">Por</th>
                </tr>
              </thead>
              <tbody>
                {resolvidos.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100">
                    <td className="p-3 text-slate-700">{d.item_name}</td>
                    <td className="p-3 text-center text-slate-600 font-bold">
                      {d.quantity_missing}
                    </td>
                    <td className="p-3 text-xs font-mono text-slate-500">
                      {d.batch_id ?? "—"}
                    </td>
                    <td className="p-3 text-xs text-slate-500">
                      {d.resolved_at ? formatData(d.resolved_at) : "—"}
                    </td>
                    <td className="p-3 text-xs text-slate-500">{d.resolved_by ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}


