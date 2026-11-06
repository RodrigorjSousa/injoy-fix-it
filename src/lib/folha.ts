// Folha de pagamento do mês (Financeiro › Folha): regras puras, sem acesso ao banco.
//
// Fixos (CLT):
//  - Valor base = salário do cadastro da folha. Valor da hora = salário ÷ divisor (220 h para 44 h/semana).
//  - Horas vêm do ponto do app (ponto_dia), só para quem está no modo "pagar na folha"; quem está no
//    banco de horas acumula as extras no banco e aqui elas aparecem só como informação.
//      HE 100%  = trabalho em domingo ou feriado que era folga na escala.
//      HE 50% sábado/folga = trabalho em dia de folga que não é domingo/feriado (ex.: sábado da manutenção 5x2).
//      HE 50% antes/depois do horário = minutos além da jornada prevista num dia normal de trabalho.
//      Adicional noturno = 20% da hora sobre as horas noturnas reduzidas (22h–5h, hora de 52min30s).
//      DSR sobre extras e noturno (Súmula 172 TST): variável ÷ dias úteis × domingos e feriados do mês.
//  - VT = dias com trabalho na escala × VT por dia; VR = valor do mês (mesmas regras do quadro de benefícios).
//  - Bonificações vêm de Bonificação › Pagamento: grupo = meta do setor; individual = elogios.
//  - Plantões extras da escala com valor combinado (fixo cobrindo folga) são pagos como plantão e
//    não viram hora extra de novo.
// Freelancers:
//  - Por plantão: preço da tabela pelas horas do plantão (8 h = R$ 150, 12 h = R$ 200, editável);
//    plantão com horas fora da tabela usa o valor combinado na escala.
//  - Valor cheio: valor fixo do mês para quem é chamado muitas vezes.
//  - Não recebem VT, VR nem bonificação, a não ser que o gestor marque (no cadastro ou só no mês).
// Todo valor calculado pode ser trocado à mão no mês (fica guardado em `valores` do ajuste).
import type { ClasseDia, ModoBanco } from "@/lib/ponto-banco";

export const VR_PADRAO = 385;
export const VT_DIA_PADRAO = 18.8;
export const DIVISOR_PADRAO = 220;
/** Dias de referência para o VR proporcional de freelancer (VR do mês ÷ 22 × dias). */
export const DIAS_REFERENCIA_VR = 22;

export type Vinculo = "fixo" | "freelance";
export type Setor = "manutencao" | "recepcao" | "camareiras";

export type FaixaFreela = { rotulo: string; horas: number; valor: number };

export type FolhaConfig = {
  tabela_freela: FaixaFreela[];
  divisor_padrao: number;
  dsr_extras: boolean;
  descontar_debitos: boolean;
  dia_pagamento: number;
};

export const CONFIG_FOLHA_PADRAO: FolhaConfig = {
  tabela_freela: [
    { rotulo: "Plantão 8 h", horas: 8, valor: 150 },
    { rotulo: "Plantão 12 h", horas: 12, valor: 200 },
  ],
  divisor_padrao: DIVISOR_PADRAO,
  dsr_extras: true,
  descontar_debitos: false,
  dia_pagamento: 5,
};

/** Cadastro da pessoa na folha (vale para todos os meses). null = padrão do vínculo. */
export type FolhaPessoaCfg = {
  colaborador_id: string;
  salario_base: number | null;
  divisor: number | null;
  freela_modo: "plantao" | "mensal";
  freela_valor_mensal: number | null;
  recebe_vt: boolean | null;
  recebe_vr: boolean | null;
  recebe_bonus: boolean | null;
};

/** Itens da folha. Os valores calculados podem ser trocados à mão no mês. */
export const CAMPOS = [
  "base",
  "plantoes",
  "vt",
  "vr",
  "bonusInd",
  "bonusGrupo",
  "he100",
  "he50Folga",
  "he50Horario",
  "noturno",
  "dsr",
  "descontoFaltas",
] as const;
export type Campo = (typeof CAMPOS)[number];

export const CAMPO_LABEL: Record<Campo, string> = {
  base: "Valor base",
  plantoes: "Plantões",
  vt: "Vale transporte",
  vr: "Vale refeição",
  bonusInd: "Bonificação individual",
  bonusGrupo: "Bonificação de grupo",
  he100: "Hora extra 100% (domingo/feriado)",
  he50Folga: "Hora extra 50% (sábado/folga)",
  he50Horario: "Hora extra 50% (antes/depois do horário)",
  noturno: "Adicional noturno (20%)",
  dsr: "DSR sobre extras e noturno",
  descontoFaltas: "Desconto de faltas e atrasos",
};

/** Rótulos curtos para a tabela. */
export const CAMPO_CURTO: Record<Campo, string> = {
  base: "Base",
  plantoes: "Plantões",
  vt: "VT",
  vr: "VR",
  bonusInd: "Bônus ind.",
  bonusGrupo: "Bônus grupo",
  he100: "HE 100%",
  he50Folga: "HE 50% sáb.",
  he50Horario: "HE 50% horário",
  noturno: "Noturno",
  dsr: "DSR",
  descontoFaltas: "Faltas/atrasos",
};

/** Horas que o gestor pode digitar no mês (o valor em R$ é calculado). */
export const CAMPOS_HORA = ["he100", "he50Folga", "he50Horario", "noturno"] as const;
export type CampoHora = (typeof CAMPOS_HORA)[number];
/** Chave em `valores` com os minutos digitados (noturno = minutos reais entre 22h e 5h). */
export const chaveMin = (c: CampoHora) => `min_${c}` as const;
export type ChaveMin = ReturnType<typeof chaveMin>;

/** Ajuste do mês para a pessoa. */
export type FolhaAjuste = {
  colaborador_id: string;
  valores: Partial<Record<Campo | ChaveMin, number>>;
  pagar_vt: boolean | null;
  pagar_vr: boolean | null;
  pagar_bonus: boolean | null;
  outros_proventos: number;
  outros_descontos: number;
  observacao: string | null;
};

export type ColaboradorFolha = {
  id: string;
  funcionario_id: string | null;
  nome: string;
  setor: Setor;
  unidade: "Botafogo" | "Ipanema" | "Ambas";
  vinculo: Vinculo;
  ativo: boolean;
  vale_alimentacao: number | null;
  vale_transporte_dia: number | null;
};

export type DiaEscalaFolha = {
  id: string;
  colaborador_id: string;
  unidade: "Botafogo" | "Ipanema";
  data: string;
  status: "trabalho" | "folga" | "falta" | "atestado" | "ferias" | "extra";
  horas_contratadas: number | null;
  valor_combinado: number | null;
  hora_entrada?: string | null;
  hora_saida?: string | null;
};

/** Dia do ponto já calculado (ponto-banco.calcularDia). Minutos. */
export type DiaPontoFolha = {
  data: string;
  classe: ClasseDia;
  extra50: number;
  extra100: number;
  debito: number;
  /** Minutos reais entre 22h e 5h. */
  noturno?: number;
  noturnoReduzido: number;
  /** Teve batida de entrada no dia. */
  trabalhou?: boolean;
};

export type PontoPessoaFolha = {
  colaborador_id: string;
  modo: ModoBanco;
  /** Início do banco de horas da pessoa (para trocar o modo sem mexer na data). */
  inicio?: string;
  dias: DiaPontoFolha[];
};

export type BonusPessoa = {
  funcionario_id: string;
  grupo: number;
  individual: number;
  perdeu: boolean;
  motivo: string | null;
};

export type PlantaoFolha = {
  id: string;
  data: string;
  unidade: "Botafogo" | "Ipanema";
  horas: number | null;
  valorCombinado: number | null;
  valor: number;
  /** De onde veio o preço. */
  fonte: "tabela" | "combinado" | "mensal" | "sem_preco";
  rotulo: string;
};

export type LinhaFolha = {
  colaborador: ColaboradorFolha;
  cfg: FolhaPessoaCfg;
  ajuste: FolhaAjuste | null;
  modo: ModoBanco | null;
  pontoInicio: string | null;
  /** Valores calculados (antes da troca à mão). */
  calculado: Record<Campo, number>;
  /** Valores finais (com o que o gestor trocou). */
  valores: Record<Campo, number>;
  trocados: Campo[];
  /** Minutos/dias que explicam cada item. */
  horas: {
    he100: number;
    he50Folga: number;
    he50Horario: number;
    noturnoReduzido: number;
    /** Minutos reais entre 22h e 5h (o que o gestor digita). */
    noturno: number;
    debito: number;
    /** Extras que ficaram no banco de horas (modo banco). */
    noBanco: number;
  };
  /** Horas calculadas pelo ponto/escala, antes do que o gestor digitou. */
  horasCalculadas: Record<CampoHora, number>;
  /** Horas que o gestor digitou no mês. */
  horasDigitadas: CampoHora[];
  /** Dias "extra" na escala do fixo: viram hora extra (do ponto, ou pela escala sem batida). */
  extrasFixo: {
    id: string;
    data: string;
    minutos: number;
    fonte: "ponto" | "escala";
    cem: boolean;
    /** Valor de diária que estava na escala (vai a zero ao lançar, para não pagar em dobro). */
    valorCombinado: number | null;
  }[];
  diasVT: number;
  vtPorUnidade: Record<string, number>;
  valorHora: number;
  divisor: number;
  plantoes: PlantaoFolha[];
  pagaVT: boolean;
  pagaVR: boolean;
  pagaBonus: boolean;
  bonusMotivo: string | null;
  outrosProventos: number;
  outrosDescontos: number;
  proventos: number;
  descontos: number;
  total: number;
  avisos: string[];
};

export type ResumoFolha = {
  linhas: LinhaFolha[];
  diasUteis: number;
  diasDescanso: number;
  totais: {
    fixos: number;
    freelancers: number;
    geral: number;
    qtdFixos: number;
    qtdFreelancers: number;
  };
};

export const arred = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const num = (v: unknown, padrao = 0) => {
  const n = Number(v);
  return v == null || v === "" || !Number.isFinite(n) ? padrao : n;
};

export function limitesMesFolha(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(fim).padStart(2, "0")}`, dias: fim };
}

/** Dias úteis e de descanso (domingos + feriados fora do domingo) do mês, para o DSR. */
export function diasDoMes(mes: string, feriados: string[]) {
  const { dias } = limitesMesFolha(mes);
  const [y, m] = mes.split("-").map(Number);
  const fer = new Set(feriados.filter((f) => f.startsWith(mes)).map((f) => f.slice(0, 10)));
  let descanso = 0;
  for (let d = 1; d <= dias; d++) {
    const iso = `${mes}-${String(d).padStart(2, "0")}`;
    const dom = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
    if (dom || fer.has(iso)) descanso++;
  }
  return { uteis: dias - descanso, descanso };
}

/** Preço do plantão pela tabela (horas iguais); null quando a duração não está na tabela. */
export function precoTabela(tabela: FaixaFreela[], horas: number | null): FaixaFreela | null {
  if (horas == null || !Number.isFinite(Number(horas))) return null;
  return tabela.find((f) => Math.abs(Number(f.horas) - Number(horas)) < 0.01) ?? null;
}

/** Divide o total em N partes em centavos; a última leva a diferença do arredondamento. */
export function dividirValor(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cent = Math.round(total * 100);
  const base = Math.floor(cent / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? cent - base * (n - 1) : base) / 100);
}

const diaSemana = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

/** Minutos de um dia da escala: horas contratadas ou saída − entrada (passando da meia-noite). */
export function minutosEscala(
  d: Pick<DiaEscalaFolha, "horas_contratadas" | "hora_entrada" | "hora_saida">,
) {
  if (d.horas_contratadas != null && Number(d.horas_contratadas) > 0)
    return Math.round(Number(d.horas_contratadas) * 60);
  const a = /^(\d{1,2}):(\d{2})/.exec(d.hora_entrada ?? "");
  const b = /^(\d{1,2}):(\d{2})/.exec(d.hora_saida ?? "");
  if (!a || !b) return 0;
  let min = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
  if (min <= 0) min += 24 * 60;
  return min;
}

export const cfgPadraoPessoa = (colaborador_id: string): FolhaPessoaCfg => ({
  colaborador_id,
  salario_base: null,
  divisor: null,
  freela_modo: "plantao",
  freela_valor_mensal: null,
  recebe_vt: null,
  recebe_vr: null,
  recebe_bonus: null,
});

export function calcularFolha(input: {
  mes: string;
  config: FolhaConfig;
  colaboradores: ColaboradorFolha[];
  pessoas: FolhaPessoaCfg[];
  ajustes: FolhaAjuste[];
  dias: DiaEscalaFolha[];
  ponto: PontoPessoaFolha[];
  bonus: BonusPessoa[];
  feriados: string[];
  /** Mostrar também freelancers sem plantão no mês. */
  incluirSemMovimento?: boolean;
}): ResumoFolha {
  const { mes, config } = input;
  const { inicio, fim } = limitesMesFolha(mes);
  const { uteis, descanso } = diasDoMes(mes, input.feriados);
  const cfgMap = new Map(input.pessoas.map((p) => [p.colaborador_id, p]));
  const ajMap = new Map(input.ajustes.map((a) => [a.colaborador_id, a]));
  const pontoMap = new Map(input.ponto.map((p) => [p.colaborador_id, p]));
  const bonusMap = new Map(input.bonus.map((b) => [b.funcionario_id, b]));
  const fer = new Set(input.feriados.map((f) => f.slice(0, 10)));
  const diasMes = input.dias.filter((d) => d.data >= inicio && d.data <= fim);
  const diasPorPessoa = new Map<string, DiaEscalaFolha[]>();
  for (const d of diasMes) {
    const l = diasPorPessoa.get(d.colaborador_id) ?? [];
    l.push(d);
    diasPorPessoa.set(d.colaborador_id, l);
  }

  const linhas: LinhaFolha[] = [];
  for (const c of input.colaboradores) {
    const dias = (diasPorPessoa.get(c.id) ?? []).sort((a, b) => a.data.localeCompare(b.data));
    const extras = dias.filter((d) => d.status === "extra");
    const fixo = c.vinculo === "fixo";
    if (fixo && !c.ativo && !dias.length) continue;
    if (!fixo && !extras.length && !(input.incluirSemMovimento && c.ativo)) continue;

    const cfg = cfgMap.get(c.id) ?? cfgPadraoPessoa(c.id);
    const aj = ajMap.get(c.id) ?? null;
    const avisos: string[] = [];

    // ---- Dias para o VT (trabalho ou extra; vários turnos no mesmo dia contam uma vez).
    const porUnidade = new Map<string, Set<string>>();
    const diasTrab = new Set<string>();
    for (const d of dias) {
      if (d.status !== "trabalho" && d.status !== "extra") continue;
      diasTrab.add(d.data);
      const s = porUnidade.get(d.unidade) ?? new Set<string>();
      s.add(d.data);
      porUnidade.set(d.unidade, s);
    }
    const vtPorUnidade = Object.fromEntries([...porUnidade].map(([u, s]) => [u, s.size]));

    // ---- Plantões.
    const plantoes: PlantaoFolha[] = [];
    if (fixo) {
      // Fixo escalado como "extra" é hora extra (logo abaixo), não plantão de freelancer.
    } else if (cfg.freela_modo === "mensal") {
      const partes = dividirValor(num(cfg.freela_valor_mensal), extras.length);
      extras.forEach((d, i) =>
        plantoes.push({
          id: d.id,
          data: d.data,
          unidade: d.unidade,
          horas: d.horas_contratadas,
          valorCombinado: d.valor_combinado,
          valor: partes[i] ?? 0,
          fonte: "mensal",
          rotulo: "Valor cheio do mês",
        }),
      );
      if (!(num(cfg.freela_valor_mensal) > 0)) avisos.push("Valor cheio do mês não informado.");
    } else {
      for (const d of extras) {
        const faixa = precoTabela(config.tabela_freela, d.horas_contratadas);
        const comb = d.valor_combinado != null ? Number(d.valor_combinado) : null;
        plantoes.push({
          id: d.id,
          data: d.data,
          unidade: d.unidade,
          horas: d.horas_contratadas,
          valorCombinado: comb,
          valor: arred(faixa ? faixa.valor : (comb ?? 0)),
          fonte: faixa ? "tabela" : comb != null ? "combinado" : "sem_preco",
          rotulo: faixa?.rotulo ?? (comb != null ? "Valor combinado" : "Sem preço"),
        });
      }
      const fora = plantoes.filter((p) => p.fonte !== "tabela").length;
      if (fora)
        avisos.push(
          `${fora} plantão(ões) com horas fora da tabela${plantoes.some((p) => p.fonte === "sem_preco") ? " e sem valor" : ""}.`,
        );
    }
    // ---- Ponto (só fixos).
    const ponto = fixo ? pontoMap.get(c.id) : undefined;
    const modo = fixo ? (ponto?.modo ?? "pagamento") : null;
    const h = {
      he100: 0,
      he50Folga: 0,
      he50Horario: 0,
      noturnoReduzido: 0,
      noturno: 0,
      debito: 0,
      noBanco: 0,
    };
    const comBatida = new Set<string>();
    for (const d of ponto?.dias ?? []) {
      if (d.data < inicio || d.data > fim) continue;
      if (d.trabalhou ?? d.extra50 + d.extra100 + d.noturnoReduzido > 0) comBatida.add(d.data);
      h.noturnoReduzido += d.noturnoReduzido;
      h.noturno += d.noturno ?? Math.round((d.noturnoReduzido * 52.5) / 60);
      h.debito += d.debito;
      // Domingo/feriado de folga = 100%. Dia de folga comum (ex.: sábado do 5x2) = 50%.
      const cem =
        d.classe === "domingo_feriado" || (d.classe === "folga_trabalhada" && fer.has(d.data));
      if (cem) h.he100 += d.extra100 + (d.classe === "folga_trabalhada" ? d.extra50 : 0);
      else if (d.classe === "folga_trabalhada") h.he50Folga += d.extra50;
      else h.he50Horario += d.extra50;
    }
    // Dias "extra" do fixo na escala: com batida já entraram pelo ponto; sem batida, pelas horas da escala.
    const extrasFixo: LinhaFolha["extrasFixo"] = [];
    if (fixo)
      for (const d of extras) {
        const cem = fer.has(d.data) || diaSemana(d.data) === 0;
        if (comBatida.has(d.data)) {
          const pd = ponto?.dias.find((x) => x.data === d.data);
          extrasFixo.push({
            id: d.id,
            data: d.data,
            minutos: (pd?.extra100 ?? 0) + (pd?.extra50 ?? 0),
            fonte: "ponto",
            cem,
            valorCombinado: d.valor_combinado,
          });
          continue;
        }
        const min = minutosEscala(d);
        extrasFixo.push({
          id: d.id,
          data: d.data,
          minutos: min,
          fonte: "escala",
          cem,
          valorCombinado: d.valor_combinado,
        });
        if (cem) h.he100 += min;
        else h.he50Folga += min;
      }
    const semBatida = extrasFixo.filter((e) => e.fonte === "escala");
    if (semBatida.length)
      avisos.push(
        `${semBatida.length} dia(s) extra sem batida no ponto: horas pela escala${semBatida.some((e) => !e.minutos) ? " (sem horário na escala — digite as horas)" : ""}.`,
      );
    const horasCalculadas: Record<CampoHora, number> = {
      he100: h.he100,
      he50Folga: h.he50Folga,
      he50Horario: h.he50Horario,
      noturno: h.noturno,
    };
    // Horas digitadas pelo gestor no mês substituem as calculadas.
    const horasDigitadas: CampoHora[] = [];
    if (fixo)
      for (const k of CAMPOS_HORA) {
        const v = aj?.valores?.[chaveMin(k)];
        if (v == null || !Number.isFinite(Number(v))) continue;
        const m = Math.max(0, Math.round(Number(v)));
        horasDigitadas.push(k);
        if (k === "noturno") {
          h.noturno = m;
          h.noturnoReduzido = Math.round((m * 60) / 52.5);
        } else h[k] = m;
      }
    if (modo === "banco") {
      h.noBanco = h.he100 + h.he50Folga + h.he50Horario;
      h.he100 = h.he50Folga = h.he50Horario = 0;
      h.debito = 0; // débito também vai para o banco
    }

    const divisor = num(cfg.divisor, 0) > 0 ? Number(cfg.divisor) : config.divisor_padrao;
    const base = fixo ? num(cfg.salario_base) : 0;
    const valorHora = fixo && divisor > 0 ? base / divisor : 0;
    if (fixo && !(base > 0)) avisos.push("Salário base não cadastrado.");

    const pagaVT = aj?.pagar_vt ?? cfg.recebe_vt ?? fixo;
    const pagaVR = aj?.pagar_vr ?? cfg.recebe_vr ?? fixo;
    const pagaBonus = aj?.pagar_bonus ?? cfg.recebe_bonus ?? fixo;
    const vtDia = c.vale_transporte_dia != null ? Number(c.vale_transporte_dia) : VT_DIA_PADRAO;
    const vrMes = c.vale_alimentacao != null ? Number(c.vale_alimentacao) : VR_PADRAO;
    const vr = !pagaVR
      ? 0
      : fixo
        ? vrMes
        : Math.min(vrMes, (vrMes / DIAS_REFERENCIA_VR) * diasTrab.size);

    const b = c.funcionario_id ? bonusMap.get(c.funcionario_id) : undefined;
    const bonusMotivo = b?.perdeu ? b.motivo : null;

    const hora = (min: number, fator: number) => (min / 60) * valorHora * fator;
    const he100 = hora(h.he100, 2);
    const he50Folga = hora(h.he50Folga, 1.5);
    const he50Horario = hora(h.he50Horario, 1.5);
    const noturno = hora(h.noturnoReduzido, 0.2);
    const variavel = he100 + he50Folga + he50Horario + noturno;
    const dsr = config.dsr_extras && uteis > 0 ? (variavel / uteis) * descanso : 0;

    const calculado: Record<Campo, number> = {
      base: arred(base),
      plantoes: arred(plantoes.reduce((s, p) => s + p.valor, 0)),
      vt: pagaVT ? arred(diasTrab.size * vtDia) : 0,
      vr: arred(vr),
      bonusInd: pagaBonus ? arred(b?.individual ?? 0) : 0,
      bonusGrupo: pagaBonus ? arred(b?.grupo ?? 0) : 0,
      he100: arred(he100),
      he50Folga: arred(he50Folga),
      he50Horario: arred(he50Horario),
      noturno: arred(noturno),
      dsr: arred(dsr),
      descontoFaltas: config.descontar_debitos ? arred(hora(h.debito, 1)) : 0,
    };
    const valores = { ...calculado };
    const trocados: Campo[] = [];
    for (const campo of CAMPOS) {
      const v = aj?.valores?.[campo];
      if (v == null || !Number.isFinite(Number(v))) continue;
      // Item desligado no mês (VT/VR/bônus) não volta pela troca à mão.
      if ((campo === "vt" && !pagaVT) || (campo === "vr" && !pagaVR)) continue;
      if ((campo === "bonusInd" || campo === "bonusGrupo") && !pagaBonus) continue;
      valores[campo] = arred(Math.max(0, Number(v)));
      if (valores[campo] !== calculado[campo]) trocados.push(campo);
    }
    const outrosProventos = arred(Math.max(0, num(aj?.outros_proventos)));
    const outrosDescontos = arred(Math.max(0, num(aj?.outros_descontos)));
    const proventos = arred(
      CAMPOS.filter((k) => k !== "descontoFaltas").reduce((s, k) => s + valores[k], 0) +
        outrosProventos,
    );
    const descontos = arred(valores.descontoFaltas + outrosDescontos);
    if (descontos > 0 && descontos > proventos - valores.plantoes - valores.vt - valores.vr)
      avisos.push(
        fixo
          ? "Os descontos passam do salário e extras: o que passar não é lançado no Financeiro."
          : "Desconto maior que os extras do freelancer: o que passar não é lançado (ajuste o valor dos plantões).",
      );

    linhas.push({
      colaborador: c,
      cfg,
      ajuste: aj,
      modo,
      pontoInicio: ponto?.inicio ?? null,
      horasCalculadas,
      horasDigitadas,
      extrasFixo,
      calculado,
      valores,
      trocados,
      horas: h,
      diasVT: diasTrab.size,
      vtPorUnidade,
      valorHora: arred(valorHora),
      divisor,
      plantoes,
      pagaVT,
      pagaVR,
      pagaBonus,
      bonusMotivo,
      outrosProventos,
      outrosDescontos,
      proventos,
      descontos,
      total: arred(proventos - descontos),
      avisos,
    });
  }
  linhas.sort(
    (a, b) =>
      (a.colaborador.vinculo === b.colaborador.vinculo
        ? 0
        : a.colaborador.vinculo === "fixo"
          ? -1
          : 1) ||
      a.colaborador.setor.localeCompare(b.colaborador.setor) ||
      a.colaborador.nome.localeCompare(b.colaborador.nome),
  );
  const fixos = linhas.filter((l) => l.colaborador.vinculo === "fixo");
  const freelas = linhas.filter((l) => l.colaborador.vinculo === "freelance");
  const soma = (ls: LinhaFolha[]) => arred(ls.reduce((s, l) => s + l.total, 0));
  return {
    linhas,
    diasUteis: uteis,
    diasDescanso: descanso,
    totais: {
      fixos: soma(fixos),
      freelancers: soma(freelas),
      geral: soma(linhas),
      qtdFixos: fixos.length,
      qtdFreelancers: freelas.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Lançamento no Financeiro

export type ItemLancamentoFolha = {
  colaborador_id: string;
  unidade: "Botafogo" | "Ipanema" | "Ambas";
  valor: number;
  descricao: string;
};
export type ItemBeneficioFolha = {
  colaborador_id: string;
  tipo: "va" | "vt";
  unidade: string;
  valor: number;
  descricao: string;
};
export type PlantaoPreco = { id: string; valor: number };

const brl = (n: number) => n.toFixed(2).replace(".", ",");

/**
 * O que vai para o Financeiro:
 *  - Plantões: o preço vai para o plantão na escala (valor combinado), e a sincronização da escala
 *    atualiza o lançamento "Freelancers (diárias)" da pessoa — nada é lançado em dobro.
 *  - VT e VR: pelo lançamento de benefícios da escala (mesma chave; substitui o que já existia).
 *  - O restante (base, extras, noturno, DSR, bônus, outros − descontos): um lançamento por pessoa
 *    na categoria Salários.
 */
export function montarLancamentoFolha(resumo: ResumoFolha, mesLabel: string) {
  const itens: ItemLancamentoFolha[] = [];
  const beneficios: ItemBeneficioFolha[] = [];
  const plantoes: PlantaoPreco[] = [];
  for (const l of resumo.linhas) {
    const c = l.colaborador;
    const fixo = c.vinculo === "fixo";
    if (fixo) {
      // Dia "extra" do fixo é pago como hora extra: zera a diária da escala (e o lançamento de
      // Freelancers (diárias) dela é cancelado no banco).
      for (const e of l.extrasFixo)
        if (e.valorCombinado != null && Number(e.valorCombinado) > 0)
          plantoes.push({ id: e.id, valor: 0 });
    } else {
      // Preço final de cada plantão; se o total foi trocado à mão, reparte a troca nos plantões.
      const calc = l.plantoes.map((p) => p.valor);
      const somaCalc = calc.reduce((s, v) => s + v, 0);
      const alvo = l.valores.plantoes;
      let precos = calc;
      if (l.plantoes.length && Math.abs(alvo - somaCalc) >= 0.01)
        precos =
          somaCalc > 0
            ? (() => {
                const cent = Math.round(alvo * 100);
                const partes = calc.map((v) => Math.floor((v / somaCalc) * cent));
                partes[partes.length - 1] += cent - partes.reduce((s, v) => s + v, 0);
                return partes.map((v) => v / 100);
              })()
            : dividirValor(alvo, l.plantoes.length);
      l.plantoes.forEach((p, i) => plantoes.push({ id: p.id, valor: arred(precos[i] ?? 0) }));
    }
    if (l.valores.vr > 0)
      beneficios.push({
        colaborador_id: c.id,
        tipo: "va",
        unidade: c.unidade,
        valor: l.valores.vr,
        descricao: `Vale refeição ${mesLabel} — ${c.nome}`,
      });
    if (l.valores.vt > 0) {
      const totalDias = Object.values(l.vtPorUnidade).reduce((s, v) => s + v, 0);
      const unidades = Object.entries(l.vtPorUnidade).filter(([, d]) => d > 0);
      if (!unidades.length)
        beneficios.push({
          colaborador_id: c.id,
          tipo: "vt",
          unidade: c.unidade,
          valor: l.valores.vt,
          descricao: `Vale transporte ${mesLabel} — ${c.nome}`,
        });
      else {
        const cent = Math.round(l.valores.vt * 100);
        let usado = 0;
        unidades.forEach(([u, d], i) => {
          const v = i === unidades.length - 1 ? cent - usado : Math.round((cent * d) / totalDias);
          usado += v;
          if (v > 0)
            beneficios.push({
              colaborador_id: c.id,
              tipo: "vt",
              unidade: u,
              valor: v / 100,
              descricao: `Vale transporte ${mesLabel} — ${c.nome}: ${d} dia${d > 1 ? "s" : ""}`,
            });
        });
      }
    }
    const resto = arred(l.total - l.valores.plantoes - l.valores.vt - l.valores.vr);
    if (resto > 0) {
      const partes = (
        [
          ["base", "base"],
          ["he100", "HE 100%"],
          ["he50Folga", "HE 50% sáb."],
          ["he50Horario", "HE 50% horário"],
          ["noturno", "noturno"],
          ["dsr", "DSR"],
          ["bonusInd", "bônus ind."],
          ["bonusGrupo", "bônus grupo"],
        ] as [Campo, string][]
      )
        .filter(([k]) => l.valores[k] > 0)
        .map(([k, r]) => `${r} ${brl(l.valores[k])}`);
      if (l.outrosProventos > 0) partes.push(`outros ${brl(l.outrosProventos)}`);
      if (l.descontos > 0) partes.push(`− descontos ${brl(l.descontos)}`);
      itens.push({
        colaborador_id: c.id,
        unidade: c.unidade,
        valor: resto,
        descricao:
          `${fixo ? "Salário" : "Extras da folha"} ${mesLabel} — ${c.nome}${partes.length ? ` (${partes.join(" + ")})` : ""}`.slice(
            0,
            500,
          ),
      });
    }
  }
  return { itens, beneficios, plantoes };
}

/** Planilha da folha (CSV com ; e vírgula decimal). */
export function csvFolha(resumo: ResumoFolha): string {
  const h = (m: number) => (m / 60).toFixed(2).replace(".", ",");
  const v = (n: number) => n.toFixed(2).replace(".", ",");
  const linhas: string[][] = [
    [
      "Pessoa",
      "Vínculo",
      "Setor",
      "Unidade",
      ...CAMPOS.map((c) => CAMPO_LABEL[c]),
      "Outros proventos",
      "Outros descontos",
      "Total",
      "HE 100% (h)",
      "HE 50% sábado/folga (h)",
      "HE 50% horário (h)",
      "Noturno (h reduzidas)",
      "Extras no banco (h)",
      "Dias de VT",
      "Plantões",
      "Observação",
    ],
    ...resumo.linhas.map((l) => [
      l.colaborador.nome,
      l.colaborador.vinculo === "fixo" ? "Fixo" : "Freelancer",
      l.colaborador.setor,
      l.colaborador.unidade,
      ...CAMPOS.map((c) => v(l.valores[c])),
      v(l.outrosProventos),
      v(l.outrosDescontos),
      v(l.total),
      h(l.horas.he100),
      h(l.horas.he50Folga),
      h(l.horas.he50Horario),
      h(l.horas.noturnoReduzido),
      h(l.horas.noBanco),
      String(l.diasVT),
      String(l.plantoes.length),
      l.ajuste?.observacao ?? "",
    ]),
  ];
  return linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
}
