// Situação de cada área das Tarefas Extras: última execução, quem fez e próxima data.
import { addCivilDays, civilDayDiff } from "@/lib/escala-engine";

export const PERIODO_PADRAO_DIAS = 7;

export type StatusTarefa = "atrasada" | "hoje" | "em_dia" | "nunca";

export interface AgendaManual {
  proxima_data: string; // YYYY-MM-DD
  definido_em: string; // ISO
}

export interface SituacaoTarefa {
  ultimaData: string | null; // YYYY-MM-DD (SP)
  ultimaEm: string | null; // ISO
  quem: string | null;
  diasDesde: number | null;
  periodo: number;
  proxima: string; // YYYY-MM-DD
  proximaManual: boolean;
  diasParaProxima: number; // negativo = atrasada
  status: StatusTarefa;
}

/** YYYY-MM-DD em São Paulo para um instante ISO. */
export function dataSP(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export function calcularSituacaoTarefa(params: {
  ultimaEm: string | null;
  quem: string | null;
  periodo: number | undefined;
  agenda: AgendaManual | null;
  hoje: string;
}): SituacaoTarefa {
  const periodo = params.periodo && params.periodo > 0 ? params.periodo : PERIODO_PADRAO_DIAS;
  const ultimaData = params.ultimaEm ? dataSP(params.ultimaEm) : null;
  // A data definida pelo gestor vale até alguém registrar a tarefa depois dela ter sido definida.
  const manualValida =
    !!params.agenda &&
    (!params.ultimaEm || new Date(params.agenda.definido_em).getTime() > new Date(params.ultimaEm).getTime());
  const proxima = manualValida
    ? params.agenda!.proxima_data
    : ultimaData
      ? addCivilDays(ultimaData, periodo)
      : params.hoje;
  const diasParaProxima = civilDayDiff(proxima, params.hoje);
  const status: StatusTarefa =
    !ultimaData && !manualValida
      ? "nunca"
      : diasParaProxima < 0
        ? "atrasada"
        : diasParaProxima === 0
          ? "hoje"
          : "em_dia";
  return {
    ultimaData,
    ultimaEm: params.ultimaEm,
    quem: params.quem,
    diasDesde: ultimaData ? civilDayDiff(params.hoje, ultimaData) : null,
    periodo,
    proxima,
    proximaManual: manualValida,
    diasParaProxima,
    status,
  };
}

/** dd/mm/aaaa */
export function dataBR(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
