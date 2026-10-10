// Lavanderia — regras puras (sem banco) da conta corrente de peças.
//
// Cada talão (ROL) da Clean Soft tem 4 contagens por peça:
//   saida_hotel = camareira contou antes da coleta
//   ent_lav     = lavanderia contou ao receber (vem anotado no talão)
//   saida_lav   = lavanderia anotou que devolveu
//   guardado    = camareira contou ao guardar
// A roupa volta misturada entre talões, por isso o controle é pelo SALDO de cada
// peça, que passa de um mês para o outro a partir de INICIO_SALDO.

export const INICIO_SALDO = "2026-10-01";
export const DIAS_ALERTA_ABERTO = 3;
export const UNIDADES_LAV = ["Botafogo", "Ipanema"] as const;
export type UnidadeLav = (typeof UNIDADES_LAV)[number];

export type Peca = {
  id: string;
  nome: string;
  grupo_fatura: string;
  preco: number;
  ordem: number;
  ativo: boolean;
};

export type TalaoItem = {
  peca_id: string;
  saida_hotel: number;
  ent_lav: number | null;
  saida_lav: number | null;
  guardado: number | null;
};

export type Talao = {
  id: string;
  unidade: UnidadeLav;
  numero: string;
  data_coleta: string; // YYYY-MM-DD
  coleta_por_nome: string;
  coleta_foto: string;
  coleta_obs: string | null;
  coleta_em: string;
  retorno_data: string | null;
  retorno_por_nome: string | null;
  retorno_foto: string | null;
  retorno_obs: string | null;
  retorno_em: string | null;
  itens: TalaoItem[];
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function diasEntre(de: string, ate: string): number {
  const [y1, m1, d1] = de.split("-").map(Number);
  const [y2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export const dataBR = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function talaoAberto(t: Talao) {
  return !t.retorno_data;
}

/** Quanto a lavanderia reconhece ter recebido deste item (ent_lav; sem retorno ainda, a contagem do hotel). */
export function recebidoLavanderia(t: Talao, it: TalaoItem) {
  return talaoAberto(t) || it.ent_lav === null ? n(it.saida_hotel) : n(it.ent_lav);
}

/*
 * As três diferenças do talão (regra combinada com o Rodrigo em 10/10/2026):
 *   A) Saída Hotel × Entrada Lavanderia  → erro de contagem na coleta (vermelho: cobrar os envolvidos)
 *   B) Entrada Lav. × Saída Lav.         → RELAVE: ficou na lavanderia para lavar de novo e deve
 *                                          voltar em outro talão (saldo acompanhado por peça)
 *   C) Saída Lav. × Contado (hotel)      → BASE DO PAGAMENTO: paga o que saiu da lavanderia, mas se a
 *                                          camareira contou menos, paga o que ela contou (ex.: saiu 8,
 *                                          contou 7 → paga 7; desconta 1)
 */
export type DifItem = {
  peca_id: string;
  saidaHotel: number;
  entLav: number;
  saidaLav: number;
  contado: number;
  /** A) entLav − saidaHotel. Diferente de 0 = contagem da coleta não bateu. */
  difColeta: number;
  /** B) entLav − saidaLav. Positivo = ficou para relave; negativo = voltou relave de outro talão. */
  relave: number;
  /** C) saidaLav − contado, quando positivo: peças a descontar do pagamento. */
  desconto: number;
  /** Quantidade paga: o menor entre o que saiu da lavanderia e o que a camareira contou. */
  aPagar: number;
  /** Camareira contou mais do que a lavanderia anotou (não paga a mais; só informa). */
  contouAMais: number;
};

export function difItem(it: TalaoItem): DifItem {
  const saidaHotel = n(it.saida_hotel);
  const entLav = it.ent_lav === null ? saidaHotel : n(it.ent_lav);
  const contado = n(it.guardado);
  const saidaLav = it.saida_lav === null ? contado : n(it.saida_lav);
  return {
    peca_id: it.peca_id,
    saidaHotel,
    entLav,
    saidaLav,
    contado,
    difColeta: entLav - saidaHotel,
    relave: entLav - saidaLav,
    desconto: Math.max(0, saidaLav - contado),
    aPagar: Math.min(saidaLav, contado),
    contouAMais: Math.max(0, contado - saidaLav),
  };
}

export type ResumoTalao = {
  saida: number;
  entLav: number | null;
  saidaLav: number | null;
  guardado: number | null;
  /** A) soma de entLav − saidaHotel por peça. */
  difColeta: number | null;
  /** Quantas peças tiveram diferença na coleta (soma dos valores absolutos). */
  difColetaAbs: number | null;
  /** B) soma de entLav − saidaLav (relave deste talão). */
  relave: number | null;
  /** C) peças a descontar (soma por peça). */
  desconto: number | null;
  aPagar: number | null;
  aberto: boolean;
  dias: number;
};

export function resumoTalao(t: Talao, hoje: string): ResumoTalao {
  const aberto = talaoAberto(t);
  const saida = t.itens.reduce((s, i) => s + n(i.saida_hotel), 0);
  if (aberto) {
    return {
      saida,
      entLav: null,
      saidaLav: null,
      guardado: null,
      difColeta: null,
      difColetaAbs: null,
      relave: null,
      desconto: null,
      aPagar: null,
      aberto,
      dias: diasEntre(t.data_coleta, hoje),
    };
  }
  const d = t.itens.map(difItem);
  const soma = (f: (x: DifItem) => number) => d.reduce((s, x) => s + f(x), 0);
  return {
    saida,
    entLav: soma((x) => x.entLav),
    saidaLav: soma((x) => x.saidaLav),
    guardado: soma((x) => x.contado),
    difColeta: soma((x) => x.difColeta),
    difColetaAbs: soma((x) => Math.abs(x.difColeta)),
    relave: soma((x) => x.relave),
    desconto: soma((x) => x.desconto),
    aPagar: soma((x) => x.aPagar),
    aberto,
    dias: diasEntre(t.data_coleta, t.retorno_data!),
  };
}

export type LinhaSaldo = {
  peca: Peca;
  /** Peças em talões que ainda não voltaram (contagem do hotel). */
  emAberto: number;
  /** B) Relave acumulado: entrou na lavanderia e ainda não saiu (Σ entLav − saidaLav). */
  relavePendente: number;
  /** emAberto + relavePendente: o que está na lavanderia agora. */
  saldo: number;
  /** A) Σ entLav − saidaHotel (diferença de contagem na coleta). */
  difColeta: number;
  /** C) Σ peças descontadas (saiu da lavanderia e não chegou). */
  desconto: number;
  /** Σ peças pagas (base do pagamento). */
  aPagar: number;
};

/** Saldo de peças de uma unidade (use só talões dessa unidade). */
export function calcularSaldo(taloes: Talao[], pecas: Peca[], inicio = INICIO_SALDO): LinhaSaldo[] {
  type Acc = Omit<LinhaSaldo, "peca" | "saldo">;
  const mapa = new Map<string, Acc>();
  const get = (id: string) => {
    let v = mapa.get(id);
    if (!v)
      mapa.set(id, (v = { emAberto: 0, relavePendente: 0, difColeta: 0, desconto: 0, aPagar: 0 }));
    return v;
  };
  for (const t of taloes) {
    if (t.data_coleta < inicio) continue;
    const aberto = talaoAberto(t);
    for (const it of t.itens) {
      const v = get(it.peca_id);
      if (aberto) {
        v.emAberto += n(it.saida_hotel);
        continue;
      }
      const d = difItem(it);
      v.relavePendente += d.relave;
      v.difColeta += d.difColeta;
      v.desconto += d.desconto;
      v.aPagar += d.aPagar;
    }
  }
  return [...pecas]
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
    .filter((p) => p.ativo || mapa.has(p.id))
    .map((peca) => {
      const v = mapa.get(peca.id) ?? {
        emAberto: 0,
        relavePendente: 0,
        difColeta: 0,
        desconto: 0,
        aPagar: 0,
      };
      return { peca, ...v, saldo: v.emAberto + v.relavePendente };
    });
}

/** Números de talão pulados na sequência (ignora saltos grandes, que são outro bloco). */
export function numerosFaltando(numeros: string[], saltoMaximo = 30): number[] {
  const nums = [...new Set(numeros.map((x) => parseInt(x, 10)).filter(Number.isFinite))].sort(
    (a, b) => a - b,
  );
  const faltando: number[] = [];
  for (let i = 1; i < nums.length; i++) {
    const gap = nums[i] - nums[i - 1];
    if (gap > 1 && gap <= saltoMaximo) {
      for (let k = nums[i - 1] + 1; k < nums[i]; k++) faltando.push(k);
    }
  }
  return faltando;
}

export type Alerta = {
  nivel: "alto" | "medio";
  tipo: "coleta" | "relave" | "desconto" | "parado" | "sequencia";
  talaoId?: string;
  texto: string;
};

const fmtSinal = (v: number) => (v > 0 ? `+${v}` : String(v));

export function gerarAlertas(
  taloes: Talao[],
  saldo: LinhaSaldo[],
  pecas: Peca[],
  hoje: string,
): Alerta[] {
  const porId = new Map(pecas.map((p) => [p.id, p]));
  const nome = (id: string) => porId.get(id)?.nome ?? "peça";
  const alertas: Alerta[] = [];
  const ordenados = [...taloes].sort((a, b) => a.data_coleta.localeCompare(b.data_coleta));
  for (const t of ordenados) {
    const r = resumoTalao(t, hoje);
    if (r.aberto) {
      if (r.dias >= DIAS_ALERTA_ABERTO)
        alertas.push({
          nivel: "alto",
          tipo: "parado",
          talaoId: t.id,
          texto: `Talão nº ${t.numero} saiu em ${dataBR(t.data_coleta)} (${r.saida} peças) e ainda não voltou — há ${r.dias} dias.`,
        });
      continue;
    }
    const d = t.itens.map(difItem);
    const coleta = d.filter((x) => x.saidaHotel > 0 && x.difColeta !== 0);
    if (coleta.length)
      alertas.push({
        nivel: "alto",
        tipo: "coleta",
        talaoId: t.id,
        texto: `Talão nº ${t.numero}: SAÍDA DO HOTEL × ENTRADA DA LAVANDERIA não bateu (${coleta
          .map((x) => `${nome(x.peca_id)} ${fmtSinal(x.difColeta)}`)
          .join(", ")}). Cobrar atenção de quem contou.`,
      });
    const desc = d.filter((x) => x.desconto > 0);
    if (desc.length) {
      const valor = desc.reduce(
        (s, x) => s + x.desconto * Number(porId.get(x.peca_id)?.preco ?? 0),
        0,
      );
      alertas.push({
        nivel: "alto",
        tipo: "desconto",
        talaoId: t.id,
        texto: `Talão nº ${t.numero}: saiu da lavanderia mais do que chegou — descontar ${desc
          .map((x) => `${x.desconto} ${nome(x.peca_id)}`)
          .join(", ")} (${brl.format(centavos(valor))}).`,
      });
    }
    const rel = d.filter((x) => x.relave > 0);
    if (rel.length)
      alertas.push({
        nivel: "medio",
        tipo: "relave",
        talaoId: t.id,
        texto: `Talão nº ${t.numero}: ficou para relave ${rel
          .map((x) => `${x.relave} ${nome(x.peca_id)}`)
          .join(", ")} — deve voltar em outro talão.`,
      });
  }
  const faltando = numerosFaltando(taloes.map((t) => t.numero));
  if (faltando.length)
    alertas.push({
      nivel: "medio",
      tipo: "sequencia",
      texto: `Talão(ões) pulado(s) na sequência: ${faltando.join(", ")}. Confira se a lavanderia levou roupa sem lançamento.`,
    });
  const pend = saldo.filter((l) => l.relavePendente > 0);
  if (pend.length)
    alertas.push({
      nivel: "medio",
      tipo: "relave",
      texto: `Relave ainda na lavanderia: ${pend.map((l) => `${l.relavePendente} ${l.peca.nome}`).join(", ")}.`,
    });
  return alertas;
}

/** C) Peças a descontar (saiu da lavanderia e a camareira contou menos), por peça, com valor. */
export function faltasNaEntrega(taloes: Talao[], pecas: Peca[]) {
  const porPeca = new Map(pecas.map((p) => [p.id, p]));
  const mapa = new Map<string, { peca: Peca; qtd: number; valor: number; taloes: string[] }>();
  for (const t of taloes) {
    if (talaoAberto(t)) continue;
    for (const i of t.itens) {
      const falta = difItem(i).desconto;
      const p = porPeca.get(i.peca_id);
      if (falta <= 0 || !p) continue;
      const v = mapa.get(p.id) ?? { peca: p, qtd: 0, valor: 0, taloes: [] };
      v.qtd += falta;
      v.valor = centavos(v.valor + falta * Number(p.preco));
      v.taloes.push(t.numero);
      mapa.set(p.id, v);
    }
  }
  return [...mapa.values()].sort((a, b) => a.peca.ordem - b.peca.ordem);
}

// ------------------------------------------------------------------ fechamento
export type LinhaFechamento = {
  grupo: string;
  preco: number;
  /** Contagem das camareiras na coleta. */
  qtdHotel: number;
  /** Contagem da lavanderia na entrada. */
  qtdEntLav: number;
  /** O que a lavanderia anotou que devolveu (o que ela cobra). */
  qtdSaidaLav: number;
  /** O que as camareiras contaram ao guardar. */
  qtdContado: number;
  /** Base do pagamento: Σ por peça do menor entre Saída Lav. e Contado. */
  qtdPagar: number;
  /** Peças descontadas (Saída Lav. − Contado, quando faltou). */
  qtdDesconto: number;
  /** Relave do mês (Entrada Lav. − Saída Lav.). */
  qtdRelave: number;
  valorPagar: number;
  valorDesconto: number;
  qtdFatura: number | null;
  valorFatura: number | null;
  /** Fatura − Saída Lav.: a lavanderia cobrou diferente do que ela mesma anotou no talão. */
  difQtd: number | null;
};

export type Fechamento = {
  linhas: LinhaFechamento[];
  totalPecasHotel: number;
  totalSaidaLav: number;
  totalContado: number;
  totalPagar: number;
  totalDesconto: number;
  totalRelave: number;
  valorPagar: number;
  valorDesconto: number;
  valorFaturaCalculado: number | null;
  taloes: Talao[];
  taloesSemRetorno: Talao[];
  numerosFaltando: number[];
};

export function mesDe(data: string) {
  return data.slice(0, 7);
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Fechamento do mês (pela data da coleta, como na planilha da Clean Soft), agrupado como as
 * colunas da fatura. Paga-se só o que voltou: o menor entre a Saída Lav. e o Contado, por peça.
 * Talões sem retorno ainda não entram no pagamento.
 * `qtdFatura`: quantidades digitadas pelo gestor a partir da fatura, por grupo.
 */
export function calcularFechamento(
  taloesUnidade: Talao[],
  pecas: Peca[],
  mes: string, // YYYY-MM
  qtdFatura: Record<string, number | null | undefined> = {},
): Fechamento {
  const taloes = taloesUnidade
    .filter((t) => mesDe(t.data_coleta) === mes)
    .sort((a, b) => a.data_coleta.localeCompare(b.data_coleta) || a.numero.localeCompare(b.numero));
  const porPeca = new Map(pecas.map((p) => [p.id, p]));
  type G = LinhaFechamento & { ordem: number };
  const grupos = new Map<string, G>();
  const ordenadas = [...pecas].sort((a, b) => a.ordem - b.ordem);
  for (const p of ordenadas) {
    if (!grupos.has(p.grupo_fatura))
      grupos.set(p.grupo_fatura, {
        grupo: p.grupo_fatura,
        preco: Number(p.preco),
        ordem: p.ordem,
        qtdHotel: 0,
        qtdEntLav: 0,
        qtdSaidaLav: 0,
        qtdContado: 0,
        qtdPagar: 0,
        qtdDesconto: 0,
        qtdRelave: 0,
        valorPagar: 0,
        valorDesconto: 0,
        qtdFatura: null,
        valorFatura: null,
        difQtd: null,
      });
  }
  for (const t of taloes) {
    const aberto = talaoAberto(t);
    for (const it of t.itens) {
      const p = porPeca.get(it.peca_id);
      if (!p) continue;
      const g = grupos.get(p.grupo_fatura)!;
      g.qtdHotel += n(it.saida_hotel);
      if (aberto) continue;
      const d = difItem(it);
      const preco = Number(p.preco);
      g.qtdEntLav += d.entLav;
      g.qtdSaidaLav += d.saidaLav;
      g.qtdContado += d.contado;
      g.qtdPagar += d.aPagar;
      g.qtdDesconto += d.desconto;
      g.qtdRelave += d.relave;
      g.valorPagar += d.aPagar * preco;
      g.valorDesconto += d.desconto * preco;
    }
  }
  let algumaFatura = false;
  let valorFatura = 0;
  const linhas: LinhaFechamento[] = [...grupos.values()]
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ ordem: _o, ...g }) => {
      const qf = qtdFatura[g.grupo];
      const tem = typeof qf === "number" && Number.isFinite(qf);
      if (tem) {
        algumaFatura = true;
        valorFatura += qf * g.preco;
      }
      return {
        ...g,
        valorPagar: centavos(g.valorPagar),
        valorDesconto: centavos(g.valorDesconto),
        qtdFatura: tem ? qf : null,
        valorFatura: tem ? centavos(qf * g.preco) : null,
        difQtd: tem ? qf - g.qtdSaidaLav : null,
      };
    });
  const soma = (f: (l: LinhaFechamento) => number) => linhas.reduce((s, l) => s + f(l), 0);
  return {
    linhas,
    totalPecasHotel: soma((l) => l.qtdHotel),
    totalSaidaLav: soma((l) => l.qtdSaidaLav),
    totalContado: soma((l) => l.qtdContado),
    totalPagar: soma((l) => l.qtdPagar),
    totalDesconto: soma((l) => l.qtdDesconto),
    totalRelave: soma((l) => l.qtdRelave),
    valorPagar: centavos(soma((l) => l.valorPagar)),
    valorDesconto: centavos(soma((l) => l.valorDesconto)),
    valorFaturaCalculado: algumaFatura ? centavos(valorFatura) : null,
    taloes,
    taloesSemRetorno: taloes.filter(talaoAberto),
    numerosFaltando: numerosFaltando(taloes.map((t) => t.numero)),
  };
}

/** Lista de meses (YYYY-MM) desde o início do saldo até o mês de `hoje`, do mais recente ao mais antigo. */
export function mesesDesdeInicio(hoje: string, inicio = INICIO_SALDO): string[] {
  const out: string[] = [];
  let [y, m] = inicio.slice(0, 7).split("-").map(Number);
  const [yf, mf] = hoje.slice(0, 7).split("-").map(Number);
  while (y < yf || (y === yf && m <= mf)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out.reverse();
}

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
export function nomeMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

export type LinhaRetornoForm = {
  peca_id: string;
  saida_hotel: number;
  ent_lav: string;
  saida_lav: string;
  guardado: string;
};

const vazio = (s: string) => s.trim() === "";
const inteiro = (s: string) => (vazio(s) ? null : parseInt(s, 10));

/**
 * Regras do retorno (o talão nem sempre vem com tudo preenchido):
 *  - Ent. Lav. em branco  = a lavanderia não anotou diferença: vale a Saída Hotel.
 *  - Saída Lav. em branco = a lavanderia não anotou diferença: vale o Contei.
 *  - Contei em branco     = 0, mas só é aceito se a Saída Lav. também estiver em branco/0
 *    (se a lavanderia anotou que devolveu, a camareira precisa contar).
 */
export function linhaIncompleta(l: LinhaRetornoForm) {
  return (inteiro(l.saida_lav) ?? 0) > 0 && vazio(l.guardado);
}

/** Mensagem do que falta, ou null se dá para registrar. */
export function validarRetorno(
  linhas: LinhaRetornoForm[],
  nomePeca: (id: string) => string,
): string | null {
  const incompletas = linhas.filter(linhaIncompleta);
  if (incompletas.length)
    return `Falta a sua contagem (coluna "Contei") de: ${incompletas
      .map((l) => nomePeca(l.peca_id))
      .join(", ")}.`;
  const algo = linhas.some(
    (l) => (inteiro(l.guardado) ?? 0) > 0 || (inteiro(l.saida_lav) ?? 0) > 0,
  );
  if (!algo) return 'Digite na coluna "Contei" quantas peças voltaram.';
  return null;
}

/** Converte o formulário no que o banco grava, aplicando as regras acima. */
export function normalizarRetorno(linhas: LinhaRetornoForm[]) {
  return linhas
    .filter(
      (l) => l.saida_hotel > 0 || !vazio(l.ent_lav) || !vazio(l.saida_lav) || !vazio(l.guardado),
    )
    .map((l) => ({
      peca_id: l.peca_id,
      ent_lav: inteiro(l.ent_lav) ?? l.saida_hotel,
      saida_lav: inteiro(l.saida_lav) ?? inteiro(l.guardado) ?? 0,
      guardado: inteiro(l.guardado) ?? 0,
    }));
}

/** Texto sem acento e em minúsculas, para a busca ("lencol" acha "Lençol"). */
export function semAcento(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Busca de peças pelo nome: ignora acento e maiúsculas; todas as palavras digitadas
 * precisam aparecer. Quem começa com o termo vem primeiro ("fro" → Fronha).
 */
export function filtrarPecas<T extends { nome: string; ordem: number }>(
  pecas: T[],
  termo: string,
): T[] {
  const t = semAcento(termo);
  if (!t) return [...pecas].sort((a, b) => a.ordem - b.ordem);
  const palavras = t.split(/\s+/);
  return pecas
    .map((p) => ({ p, nome: semAcento(p.nome) }))
    .filter(({ nome }) => palavras.every((w) => nome.includes(w)))
    .sort((a, b) => {
      const ia = a.nome.startsWith(t)
        ? 0
        : a.nome.split(/[^a-z0-9]+/).some((w) => w.startsWith(palavras[0]))
          ? 1
          : 2;
      const ib = b.nome.startsWith(t)
        ? 0
        : b.nome.split(/[^a-z0-9]+/).some((w) => w.startsWith(palavras[0]))
          ? 1
          : 2;
      return ia - ib || a.p.ordem - b.p.ordem;
    })
    .map(({ p }) => p);
}
