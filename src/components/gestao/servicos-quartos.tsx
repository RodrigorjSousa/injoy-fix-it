// Quantidade de serviços das camareiras por tipo (hoje, ao vivo) e previsão de 2 dias pelo Cloudbeds.
// Cores iguais às da tela das Camareiras.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatTaskLabel, type TaskLabel } from "@/lib/task-labels";
import { usePrevisaoCarga, useRecalcularPrevisao, type ForecastRow } from "@/lib/previsao-carga";
import { addCivilDays } from "@/lib/escala-engine";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Unidade = "Botafogo" | "Ipanema";

export const SERVICOS: { key: TaskLabel; label: string; cor: string; regra: string }[] = [
  { key: "GERAL", label: "Geral", cor: "bg-sky-400", regra: "Hóspede sai e ninguém entra no dia" },
  { key: "GERAL - CHECK-IN", label: "Geral check-in", cor: "bg-red-600", regra: "Hóspede sai e outro entra no mesmo dia" },
  { key: "REVISÃO CHECK IN", label: "Revisão check-in", cor: "bg-orange-500", regra: "Antes do hóspede chegar" },
  { key: "ARRUMAÇÃO", label: "Arrumação", cor: "bg-blue-600", regra: "Diária com hóspede no quarto" },
  { key: "TROCA + ARRUMAÇÃO", label: "Arrumação + troca", cor: "bg-gradient-to-br from-purple-600 to-blue-600", regra: "A cada 3 dias de hospedagem" },
  { key: "VERIFICAÇÃO", label: "Verificação", cor: "bg-emerald-600", regra: "Quarto limpo e vazio" },
];

export type ContagemServicos = Record<TaskLabel, number>;
const zerado = (): ContagemServicos => ({
  GERAL: 0, "GERAL - CHECK-IN": 0, "REVISÃO CHECK IN": 0, ARRUMAÇÃO: 0, "TROCA + ARRUMAÇÃO": 0, VERIFICAÇÃO: 0,
});

type QuartoServico = {
  room_number: string;
  assigned_task: string | null;
  condition: string | null;
  room_type?: string | null;
  status?: string | null;
  service_status?: string | null;
  assigned_camareira?: string | null;
  guest_name?: string | null;
  arrival_time?: string | null;
  is_dnd?: boolean | null;
};

/** Conta os serviços de hoje (quartos em manutenção ficam de fora). */
export function contarServicosHoje(quartos: QuartoServico[]) {
  const contagem = zerado();
  const quartosPorServico: Record<string, string[]> = {};
  for (const q of quartos) {
    if (q.condition === "maintenance") continue;
    const t = formatTaskLabel(q.assigned_task);
    contagem[t] += 1;
    (quartosPorServico[t] ??= []).push(q.room_number);
  }
  return { contagem, quartosPorServico };
}

/**
 * Previsão de um dia a partir do cálculo do Cloudbeds (tabela previsao_carga).
 * Revisão vem dos detalhes; verificação = quartos da unidade sem nenhum outro serviço.
 */
export function contarServicosPrevistos(row: Pick<ForecastRow, "qtd_geral" | "qtd_geral_checkin" | "qtd_arrumacao" | "qtd_troca_arrumacao" | "detalhes">, totalQuartos: number): ContagemServicos {
  const detalhes = Array.isArray(row.detalhes) ? (row.detalhes as { tarefa?: string }[]) : [];
  const revisao = detalhes.filter((d) => formatTaskLabel(d.tarefa) === "REVISÃO CHECK IN").length;
  const comServico = row.qtd_geral + row.qtd_geral_checkin + row.qtd_arrumacao + row.qtd_troca_arrumacao + revisao;
  return {
    GERAL: row.qtd_geral,
    "GERAL - CHECK-IN": row.qtd_geral_checkin,
    "REVISÃO CHECK IN": revisao,
    ARRUMAÇÃO: row.qtd_arrumacao,
    "TROCA + ARRUMAÇÃO": row.qtd_troca_arrumacao,
    VERIFICAÇÃO: Math.max(0, totalQuartos - comServico),
  };
}

export function useQuartosServico(unidade: Unidade) {
  const qc = useQueryClient();
  const key = ["servicos-quartos", unidade];
  useEffect(() => {
    const ch = supabase
      .channel(`servicos-quartos-${unidade}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_housekeeping", filter: `property=eq.${unidade}` }, () =>
        void qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade, qc]);
  return useQuery({
    queryKey: key,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<QuartoServico[]> => {
      const { data, error } = await supabase
        .from("room_housekeeping")
        .select("room_number, assigned_task, condition, room_type, status, service_status, assigned_camareira, guest_name, arrival_time, is_dnd")
        .eq("property", unidade)
        .order("room_number");
      if (error) throw new Error(error.message);
      return (data ?? []) as QuartoServico[];
    },
  });
}

export function Bloco({ s, valor, quartos, dark, pequeno, onClick }: { s: (typeof SERVICOS)[number]; valor: number; quartos?: string[]; dark?: boolean; pequeno?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick, "aria-label": `Ver quartos: ${s.label}` } : {})}
      title={`${s.key}: ${s.regra}${quartos?.length ? `\nQuartos: ${quartos.join(", ")}` : ""}`}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left",
        dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white",
        valor === 0 && "opacity-60",
        onClick && "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400",
        onClick && (dark ? "hover:border-white/30 hover:bg-white/10" : "hover:border-slate-400"),
      )}
    >
      <div className={cn("grid shrink-0 place-items-center rounded-xl font-black text-white shadow", s.cor, pequeno ? "h-9 w-9 text-base" : "h-11 w-11 text-xl")}>
        {valor}
      </div>
      <div className="min-w-0">
        <p className={cn("text-[11px] font-black uppercase leading-tight", dark ? "text-slate-200" : "text-slate-800")}>{s.label}</p>
        {quartos?.length ? (
          <p className={cn("truncate text-[10px] font-semibold", dark ? "text-slate-400" : "text-slate-500")}>{quartos.join(" · ")}</p>
        ) : (
          <p className={cn("text-[10px] font-semibold", dark ? "text-slate-500" : "text-slate-400")}>{s.regra}</p>
        )}
      </div>
    </Tag>
  );
}

/** Serviços de hoje por tipo (ao vivo). */
export function ServicosHojeGrid({ unidade, dark, titulo }: { unidade: Unidade; dark?: boolean; titulo?: string }) {
  const q = useQuartosServico(unidade);
  const { contagem, quartosPorServico } = useMemo(() => contarServicosHoje(q.data ?? []), [q.data]);
  const [aberto, setAberto] = useState<TaskLabel | null>(null);
  const servicoAberto = SERVICOS.find((x) => x.key === aberto);
  const quartosAbertos = useMemo(
    () => (q.data ?? []).filter((r) => r.condition !== "maintenance" && formatTaskLabel(r.assigned_task) === aberto),
    [q.data, aberto],
  );
  const total = SERVICOS.reduce((s, x) => s + (x.key === "VERIFICAÇÃO" ? 0 : contagem[x.key]), 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className={cn("text-[11px] font-black uppercase tracking-wider", dark ? "text-slate-300" : "text-slate-600")}>
          {titulo ?? "Serviços de hoje"} · {unidade}
        </p>
        <span className={cn("text-[10px] font-bold", dark ? "text-slate-400" : "text-slate-500")}>
          {q.isLoading ? "carregando…" : `${total} serviços de limpeza`}
        </span>
      </div>
      {q.error ? (
        <p className="text-xs text-red-500">Não foi possível carregar os serviços: {(q.error as Error).message}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {SERVICOS.map((s) => (
            <Bloco key={s.key} s={s} valor={contagem[s.key]} quartos={quartosPorServico[s.key]} dark={dark} onClick={() => setAberto(s.key)} />
          ))}
        </div>
      )}
      <Dialog open={aberto !== null} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {servicoAberto && <span className={cn("inline-block h-4 w-4 rounded", servicoAberto.cor)} />}
              {servicoAberto?.label ?? "Serviço"}
            </DialogTitle>
            <DialogDescription>
              INJOY {unidade} · {quartosAbertos.length} {quartosAbertos.length === 1 ? "quarto" : "quartos"}
              {servicoAberto ? ` · ${servicoAberto.regra}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 max-h-[60vh] overflow-y-auto px-1">
            {quartosAbertos.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Nenhum quarto com este serviço agora.</p>
            ) : (
              <ul className="space-y-2">
                {quartosAbertos.map((r) => (
                  <li key={r.room_number} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-lg text-sm font-black text-white", servicoAberto?.cor)}>
                      {r.room_number}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-slate-900">Quarto {r.room_number}</p>
                        {r.room_type && <span className="rounded border bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{r.room_type}</span>}
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", situacao(r).cls)}>{situacao(r).txt}</span>
                        {r.is_dnd && <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold text-fuchsia-700">Não perturbe</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                        {r.assigned_camareira ? <span>Camareira: {r.assigned_camareira}</span> : <span className="text-slate-400">Sem camareira</span>}
                        {r.guest_name && <span className="truncate">Hóspede: {r.guest_name}</span>}
                        {r.arrival_time && <span>Chegada {String(r.arrival_time).slice(0, 5)}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function situacao(r: QuartoServico): { txt: string; cls: string } {
  if (r.service_status === "done" || r.status === "clean") return { txt: "Pronto", cls: "bg-emerald-100 text-emerald-700" };
  if (r.service_status === "in_progress" || r.status === "cleaning") return { txt: "Em faxina", cls: "bg-amber-100 text-amber-700" };
  return { txt: "A fazer", cls: "bg-red-100 text-red-700" };
}

const TOM = {
  verde: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amarelo: "border-amber-200 bg-amber-50 text-amber-800",
  vermelho: "border-red-200 bg-red-50 text-red-800",
} as const;

function dataCurta(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/** Previsão dos próximos 2 dias (Cloudbeds) com os mesmos 6 serviços, para decidir freelancer. */
export function PrevisaoServicos2Dias({ unidade }: { unidade: Unidade }) {
  const previsao = usePrevisaoCarga();
  const quartos = useQuartosServico(unidade);
  const recalcular = useRecalcularPrevisao();
  const [hoje] = useState(todaySP());
  const dias = [addCivilDays(hoje, 1), addCivilDays(hoje, 2)];
  const totalQuartos = (quartos.data ?? []).filter((q) => q.condition !== "maintenance").length;
  const linhas = dias.map((d) => (previsao.data ?? []).find((r) => r.unidade === unidade && r.data === d) ?? null);
  const calculadoEm = linhas.find(Boolean)?.calculado_em;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-600">
          <CalendarClock className="h-4 w-4 text-amber-600" /> Previsão 2 dias (Cloudbeds) · {unidade}
        </p>
        <div className="flex items-center gap-2">
          {calculadoEm && (
            <span className="text-[10px] text-slate-500">
              atualizada {new Date(calculadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            disabled={recalcular.isPending}
            onClick={() =>
              recalcular.mutate([unidade], {
                onSuccess: () => toast.success("Previsão atualizada com o Cloudbeds"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar a previsão"),
              })
            }
            className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", recalcular.isPending && "animate-spin")} /> Atualizar
          </button>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {dias.map((d, i) => {
          const row = linhas[i];
          if (!row)
            return (
              <div key={d} className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
                {dataCurta(d)}: previsão ainda não calculada. Clique em Atualizar.
              </div>
            );
          const c = contarServicosPrevistos(row, totalQuartos);
          return (
            <div key={d} className={cn("space-y-3 rounded-2xl border p-3", TOM[row.nivel])}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="capitalize">{i === 0 ? "Amanhã" : "Depois de amanhã"} · {dataCurta(d)}</strong>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black uppercase">
                  {row.nivel} · carga {Math.round(Number(row.ocupacao_carga_pct))}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SERVICOS.map((s) => (
                  <Bloco key={s.key} s={s} valor={c[s.key]} pequeno />
                ))}
              </div>
              <p className="text-xs font-semibold">
                {row.qtd_checkins} chegadas · {row.qtd_checkouts} saídas · {row.camareiras_escaladas} camareira(s) na escala
                {row.freelancers_escalados > 0 ? ` + ${row.freelancers_escalados} freelancer(s)` : ""}
              </p>
              {row.freelancers_escalados > 0 ? (
                <p className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Reforço já escalado
                </p>
              ) : row.nivel !== "verde" ? (
                <p className="flex items-center gap-1 text-xs font-bold">
                  <AlertTriangle className="h-4 w-4" /> Considere chamar freelancer para este dia.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
