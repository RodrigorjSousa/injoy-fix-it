// Banco de horas e horas extras do ponto interno.
//
// Regras (definidas pelo gestor em 07/10/2026):
// * Dia de TRABALHO na escala: o que passar do previsto é extra 50%; o que
//   faltar é débito no banco. Tolerância da CLT (art. 58 §1º): variações de até
//   5 min na entrada e na saída, somando no máximo 10 min no dia, são ignoradas.
// * Trabalho em dia que NÃO é de trabalho na escala (folga, plantão extra, sem
//   escala): domingo ou feriado → tudo é extra 100%; outros dias (ex.: sábado da
//   manutenção) → tudo é extra 50%. Domingo/feriado que já é dia de trabalho na
//   escala (recepção, camareiras) não gera 100%.
// * Atestado e férias abonam o dia. Falta (escala "falta" ou dia passado sem
//   registro) vira débito das horas previstas.
// * Por pessoa, o gestor escolhe: "banco" (extras entram no banco, 1 hora por
//   1 hora) ou "pagamento" (extras são pagas; só os débitos vão para o banco).
// * Só funcionários fixos entram no banco; freelancers são pagos por plantão.
import type { PontoDiaRow } from "@/lib/ponto";

export type ModoBanco = "banco" | "pagamento";
export const MODO_LABEL: Record<ModoBanco, string> = {
  banco: "Banco de horas",
  pagamento: "Paga extra",
};

export const TOLERANCIA_MARCACAO_MIN = 5;
export const TOLERANCIA_DIA_MIN = 10;
/** Início padrão do banco para quem ainda não foi configurado. */
export const BANCO_INICIO_PADRAO = "2026-10-01";

export type ClasseDia =
  | "normal"
  | "folga_trabalhada"
  | "domingo_feriado"
  | "abonado"
  | "falta"
  | "incompleto"
  | "sem_registro";

export const CLASSE_LABEL: Record<ClasseDia, string> = {
  normal: "Dia normal",
  folga_trabalhada: "Folga trabalhada (50%)",
  domingo_feriado: "Domingo/feriado (100%)",
  abonado: "Abonado",
  falta: "Falta",
  incompleto: "Batidas incompletas",
  sem_registro: "Sem registro",
};

export type ResultadoDia = {
  classe: ClasseDia;
  trabalhado: number;
  previsto: number;
  extra50: number;
  extra100: number;
  debito: number;
  toleranciaAplicada: boolean;
  aviso: string | null;
};

export type DiaPonto = Pick<
  PontoDiaRow,
  | "data"
  | "status_escala"
  | "feriado"
  | "entrada_prevista"
  | "saida_prevista"
  | "entrada_real"
  | "saida_real"
  | "minutos_trabalhados"
  | "minutos_previstos"
  | "falta_sem_registro"
  | "sem_saida"
  | "almoco_sem_volta"
>;

/** Dia da semana (0 = domingo) de uma data YYYY-MM-DD, sem depender do fuso. */
export function diaDaSemana(data: string): number {
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

const minutosEntre = (a: string, b: string) =>
  Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000);

const vazio = (classe: ClasseDia, extra: Partial<ResultadoDia> = {}): ResultadoDia => ({
  classe,
  trabalhado: 0,
  previsto: 0,
  extra50: 0,
  extra100: 0,
  debito: 0,
  toleranciaAplicada: false,
  aviso: null,
  ...extra,
});

export function calcularDia(r: DiaPonto): ResultadoDia {
  const trabalhou = !!r.entrada_real;
  const previsto = Math.max(0, Math.round(r.minutos_previstos ?? 0));
  const domingoOuFeriado = r.feriado || diaDaSemana(r.data) === 0;

  if (!trabalhou) {
    if (r.status_escala === "atestado" || r.status_escala === "ferias")
      return vazio("abonado", { previsto });
    if (r.status_escala === "falta" || (r.status_escala === "trabalho" && r.falta_sem_registro))
      return vazio("falta", {
        previsto,
        debito: previsto,
        aviso: previsto ? null : "Falta sem horário previsto na escala",
      });
    return vazio("sem_registro", { previsto: r.status_escala === "trabalho" ? previsto : 0 });
  }

  if (r.sem_saida || r.almoco_sem_volta || r.minutos_trabalhados == null)
    return vazio("incompleto", {
      previsto,
      aviso: r.almoco_sem_volta ? "Falta a volta do almoço" : "Falta a saída",
    });

  const trabalhado = Math.max(0, Math.round(r.minutos_trabalhados));
  const diaDeTrabalho = r.status_escala === "trabalho" || r.status_escala === "falta";

  if (!diaDeTrabalho) {
    return domingoOuFeriado
      ? vazio("domingo_feriado", { trabalhado, extra100: trabalhado })
      : vazio("folga_trabalhada", { trabalhado, extra50: trabalhado });
  }

  let diff = trabalhado - previsto;
  let toleranciaAplicada = false;
  if (diff !== 0) {
    const dEnt =
      r.entrada_prevista && r.entrada_real
        ? minutosEntre(r.entrada_real, r.entrada_prevista)
        : null;
    const dSai =
      r.saida_prevista && r.saida_real ? minutosEntre(r.saida_real, r.saida_prevista) : null;
    const marcacoesOk =
      dEnt == null || dSai == null
        ? true
        : dEnt <= TOLERANCIA_MARCACAO_MIN &&
          dSai <= TOLERANCIA_MARCACAO_MIN &&
          dEnt + dSai <= TOLERANCIA_DIA_MIN;
    if (marcacoesOk && Math.abs(diff) <= TOLERANCIA_DIA_MIN) {
      diff = 0;
      toleranciaAplicada = true;
    }
  }
  return {
    classe: "normal",
    trabalhado,
    previsto,
    extra50: diff > 0 ? diff : 0,
    extra100: 0,
    debito: diff < 0 ? -diff : 0,
    toleranciaAplicada,
    aviso: null,
  };
}

/** Quanto o dia mexe no banco, conforme o modo da pessoa. */
export function movimentoBanco(r: ResultadoDia, modo: ModoBanco) {
  const credito = modo === "banco" ? r.extra50 + r.extra100 : 0;
  return { credito, debito: r.debito, saldo: credito - r.debito };
}

export type AjusteBanco = {
  id: string;
  colaborador_id: string;
  data: string;
  minutos: number;
  tipo: "saldo_inicial" | "folga_compensada" | "pagamento" | "correcao";
  motivo: string;
  created_at?: string;
};

export const AJUSTE_LABEL: Record<AjusteBanco["tipo"], string> = {
  saldo_inicial: "Saldo inicial",
  folga_compensada: "Folga compensada",
  pagamento: "Pagamento do saldo",
  correcao: "Correção",
};

export type ConfigBanco = { colaborador_id: string; modo: ModoBanco; inicio: string };

export type DiaCalculado = DiaPonto & { resultado: ResultadoDia };

export type ResumoPessoa = {
  colaborador_id: string;
  nome: string;
  setor: string;
  modo: ModoBanco;
  inicio: string;
  configurado: boolean;
  previsto: number;
  trabalhado: number;
  extra50: number;
  extra100: number;
  debito: number;
  ajustesPeriodo: number;
  saldoAnterior: number;
  saldoPeriodo: number;
  saldoFinal: number;
  diasIncompletos: number;
  faltas: number;
  dias: DiaCalculado[];
  ajustes: AjusteBanco[];
};

type LinhaResumo = DiaPonto & Pick<PontoDiaRow, "colaborador_id" | "nome" | "vinculo" | "setor">;

/**
 * Resume o período [inicio, fim] por pessoa fixa. `linhas` deve trazer os dias
 * desde o início do banco de cada pessoa (para o saldo anterior).
 */
export function resumirBanco(
  linhas: LinhaResumo[],
  ajustes: AjusteBanco[],
  configs: ConfigBanco[],
  periodo: { inicio: string; fim: string },
): ResumoPessoa[] {
  const cfgMap = new Map(configs.map((c) => [c.colaborador_id, c]));
  const pessoas = new Map<string, ResumoPessoa>();

  const obter = (l: { colaborador_id: string; nome: string; setor: string }) => {
    let p = pessoas.get(l.colaborador_id);
    if (!p) {
      const cfg = cfgMap.get(l.colaborador_id);
      p = {
        colaborador_id: l.colaborador_id,
        nome: l.nome,
        setor: l.setor,
        modo: cfg?.modo ?? "pagamento",
        inicio: cfg?.inicio ?? BANCO_INICIO_PADRAO,
        configurado: !!cfg,
        previsto: 0,
        trabalhado: 0,
        extra50: 0,
        extra100: 0,
        debito: 0,
        ajustesPeriodo: 0,
        saldoAnterior: 0,
        saldoPeriodo: 0,
        saldoFinal: 0,
        diasIncompletos: 0,
        faltas: 0,
        dias: [],
        ajustes: [],
      };
      pessoas.set(l.colaborador_id, p);
    }
    return p;
  };

  for (const l of linhas) {
    if (l.vinculo !== "fixo") continue;
    const p = obter(l);
    if (l.data < p.inicio || l.data > periodo.fim) continue;
    const res = calcularDia(l);
    const mov = movimentoBanco(res, p.modo);
    if (l.data < periodo.inicio) {
      p.saldoAnterior += mov.saldo;
      continue;
    }
    p.previsto += res.previsto;
    p.trabalhado += res.trabalhado;
    p.extra50 += res.extra50;
    p.extra100 += res.extra100;
    p.debito += res.debito;
    p.saldoPeriodo += mov.saldo;
    if (res.classe === "incompleto") p.diasIncompletos++;
    if (res.classe === "falta") p.faltas++;
    p.dias.push({ ...l, resultado: res });
  }

  for (const a of ajustes) {
    const p = pessoas.get(a.colaborador_id);
    if (!p || a.data < p.inicio || a.data > periodo.fim) continue;
    if (a.data < periodo.inicio) p.saldoAnterior += a.minutos;
    else {
      p.ajustesPeriodo += a.minutos;
      p.ajustes.push(a);
    }
  }

  for (const p of pessoas.values()) {
    p.saldoFinal = p.saldoAnterior + p.saldoPeriodo + p.ajustesPeriodo;
    p.dias.sort((a, b) => a.data.localeCompare(b.data));
    p.ajustes.sort((a, b) => a.data.localeCompare(b.data));
  }
  return [...pessoas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** "1h30" → 90; "-0:45" → -45; "2" → 120. Devolve null se não entender. */
export function lerHoras(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  const m = t.match(/^(-)?\s*(\d{1,4})\s*(?:[h:]\s*(\d{1,2})?\s*(?:min)?)?$/i);
  if (m) {
    const min = Number(m[2]) * 60 + Number(m[3] ?? 0);
    if (Number(m[3] ?? 0) >= 60) return null;
    return m[1] ? -min : min;
  }
  const dec = t.match(/^(-)?\s*(\d+(?:\.\d+)?)$/);
  if (dec) return Math.round(Number(dec[2]) * 60) * (dec[1] ? -1 : 1);
  return null;
}
