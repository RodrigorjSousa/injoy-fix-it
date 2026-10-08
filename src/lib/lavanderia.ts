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

export type ResumoTalao = {
  saida: number;
  entLav: number | null;
  saidaLav: number | null;
  guardado: number | null;
  /** ent_lav − saida_hotel: diferença de contagem na coleta (hotel × lavanderia). */
  difColeta: number | null;
  /** Peças que a lavanderia anotou como devolvidas e não chegaram (soma por peça, negativa). */
  difEntrega: number | null;
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
      difEntrega: null,
      aberto,
      dias: diasEntre(t.data_coleta, hoje),
    };
  }
  const entLav = t.itens.reduce((s, i) => s + n(i.ent_lav), 0);
  const saidaLav = t.itens.reduce((s, i) => s + n(i.saida_lav), 0);
  const guardado = t.itens.reduce((s, i) => s + n(i.guardado), 0);
  return {
    saida,
    entLav,
    saidaLav,
    guardado,
    difColeta: entLav - saida,
    difEntrega: -t.itens.reduce((s, i) => s + Math.max(0, n(i.saida_lav) - n(i.guardado)), 0),
    aberto,
    dias: diasEntre(t.data_coleta, t.retorno_data!),
  };
}

export type LinhaSaldo = {
  peca: Peca;
  /** Total que a lavanderia recebeu (ent_lav; talões em aberto pela contagem do hotel). */
  enviado: number;
  /** Total que voltou e a camareira contou ao guardar. */
  voltou: number;
  /** Está na lavanderia agora. */
  saldo: number;
  /** Parte do saldo que está em talões ainda abertos (normal: roupa lavando). */
  emAberto: number;
  /** saldo − emAberto. Positivo = peças de talões já devolvidos que não voltaram. */
  pendente: number;
};

/** Saldo de peças de uma unidade (use só talões dessa unidade). */
export function calcularSaldo(taloes: Talao[], pecas: Peca[], inicio = INICIO_SALDO): LinhaSaldo[] {
  const mapa = new Map<string, { enviado: number; voltou: number; emAberto: number }>();
  const get = (id: string) => {
    let v = mapa.get(id);
    if (!v) mapa.set(id, (v = { enviado: 0, voltou: 0, emAberto: 0 }));
    return v;
  };
  for (const t of taloes) {
    if (t.data_coleta < inicio) continue;
    const aberto = talaoAberto(t);
    for (const it of t.itens) {
      const v = get(it.peca_id);
      v.enviado += recebidoLavanderia(t, it);
      if (aberto) v.emAberto += n(it.saida_hotel);
      else v.voltou += n(it.guardado);
    }
  }
  return [...pecas]
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
    .filter((p) => p.ativo || mapa.has(p.id))
    .map((peca) => {
      const v = mapa.get(peca.id) ?? { enviado: 0, voltou: 0, emAberto: 0 };
      const saldo = v.enviado - v.voltou;
      return { peca, ...v, saldo, pendente: saldo - v.emAberto };
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
  talaoId?: string;
  texto: string;
};

export function gerarAlertas(
  taloes: Talao[],
  saldo: LinhaSaldo[],
  pecas: Peca[],
  hoje: string,
): Alerta[] {
  const nome = new Map(pecas.map((p) => [p.id, p.nome]));
  const alertas: Alerta[] = [];
  const ordenados = [...taloes].sort((a, b) => a.data_coleta.localeCompare(b.data_coleta));
  for (const t of ordenados) {
    const r = resumoTalao(t, hoje);
    if (r.aberto && r.dias >= DIAS_ALERTA_ABERTO) {
      alertas.push({
        nivel: "alto",
        talaoId: t.id,
        texto: `Talão nº ${t.numero} saiu em ${dataBR(t.data_coleta)} (${r.saida} peças) e ainda não voltou — há ${r.dias} dias.`,
      });
    }
    if (!r.aberto) {
      const faltas = t.itens
        .filter((i) => n(i.guardado) < n(i.saida_lav))
        .map((i) => `${n(i.saida_lav) - n(i.guardado)} ${nome.get(i.peca_id) ?? "peça"}`);
      if (faltas.length)
        alertas.push({
          nivel: "alto",
          talaoId: t.id,
          texto: `Talão nº ${t.numero}: a lavanderia anotou mais do que chegou — faltou ${faltas.join(", ")}.`,
        });
      const difs = t.itens
        .filter((i) => n(i.saida_hotel) > 0 && n(i.ent_lav) !== n(i.saida_hotel))
        .map((i) => {
          const d = n(i.ent_lav) - n(i.saida_hotel);
          return `${nome.get(i.peca_id) ?? "peça"} ${d > 0 ? "+" : ""}${d}`;
        });
      if (difs.length)
        alertas.push({
          nivel: "medio",
          talaoId: t.id,
          texto: `Talão nº ${t.numero}: contagem da lavanderia diferente da camareira na coleta (${difs.join(", ")}).`,
        });
    }
  }
  const faltando = numerosFaltando(taloes.map((t) => t.numero));
  if (faltando.length)
    alertas.push({
      nivel: "medio",
      texto: `Talão(ões) pulado(s) na sequência: ${faltando.join(", ")}. Confira se a lavanderia levou roupa sem lançamento.`,
    });
  const pend = saldo.filter((l) => l.pendente > 0);
  if (pend.length)
    alertas.push({
      nivel: "alto",
      texto: `Peças de talões já devolvidos que não voltaram: ${pend.map((l) => `${l.pendente} ${l.peca.nome}`).join(", ")}.`,
    });
  return alertas;
}

/** Peças que a lavanderia anotou como devolvidas mas não chegaram (saida_lav − guardado), por peça. */
export function faltasNaEntrega(taloes: Talao[], pecas: Peca[]) {
  const porPeca = new Map(pecas.map((p) => [p.id, p]));
  const mapa = new Map<string, { peca: Peca; qtd: number; valor: number; taloes: string[] }>();
  for (const t of taloes) {
    if (talaoAberto(t)) continue;
    for (const i of t.itens) {
      const falta = n(i.saida_lav) - n(i.guardado);
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
  /** Contagem da lavanderia (ent_lav). Talões sem retorno entram pela contagem do hotel. */
  qtdLavanderia: number;
  valorEsperado: number;
  qtdFatura: number | null;
  valorFatura: number | null;
  difQtd: number | null;
};

export type Fechamento = {
  linhas: LinhaFechamento[];
  totalPecasHotel: number;
  totalPecasLavanderia: number;
  valorEsperado: number;
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
 * Fechamento do mês (pela data da coleta), agrupado como as colunas da fatura da Clean Soft.
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
  const grupos = new Map<string, LinhaFechamento & { ordem: number }>();
  const ordenadas = [...pecas].sort((a, b) => a.ordem - b.ordem);
  for (const p of ordenadas) {
    if (!grupos.has(p.grupo_fatura))
      grupos.set(p.grupo_fatura, {
        grupo: p.grupo_fatura,
        preco: Number(p.preco),
        ordem: p.ordem,
        qtdHotel: 0,
        qtdLavanderia: 0,
        valorEsperado: 0,
        qtdFatura: null,
        valorFatura: null,
        difQtd: null,
      });
  }
  for (const t of taloes) {
    for (const it of t.itens) {
      const p = porPeca.get(it.peca_id);
      if (!p) continue;
      const g = grupos.get(p.grupo_fatura)!;
      const lav = recebidoLavanderia(t, it);
      g.qtdHotel += n(it.saida_hotel);
      g.qtdLavanderia += lav;
      g.valorEsperado += lav * Number(p.preco);
    }
  }
  let algumaFatura = false;
  let valorFatura = 0;
  const linhas = [...grupos.values()]
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
        valorEsperado: centavos(g.valorEsperado),
        qtdFatura: tem ? qf : null,
        valorFatura: tem ? centavos(qf * g.preco) : null,
        difQtd: tem ? qf - g.qtdLavanderia : null,
      };
    });
  return {
    linhas,
    totalPecasHotel: linhas.reduce((s, l) => s + l.qtdHotel, 0),
    totalPecasLavanderia: linhas.reduce((s, l) => s + l.qtdLavanderia, 0),
    valorEsperado: centavos(linhas.reduce((s, l) => s + l.valorEsperado, 0)),
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

/** Valida as linhas do retorno antes de enviar: toda peça que saiu precisa das 3 contagens. */
export function validarRetorno(
  linhas: {
    peca_id: string;
    saida_hotel: number;
    ent_lav: string;
    saida_lav: string;
    guardado: string;
  }[],
  nomePeca: (id: string) => string,
): string | null {
  const vazio = (s: string) => s.trim() === "";
  const incompletas = linhas.filter(
    (l) =>
      (l.saida_hotel > 0 || !vazio(l.ent_lav) || !vazio(l.saida_lav) || !vazio(l.guardado)) &&
      (vazio(l.ent_lav) || vazio(l.saida_lav) || vazio(l.guardado)),
  );
  if (incompletas.length)
    return `Preencha as três contagens (use 0 quando não houver): ${incompletas
      .map((l) => nomePeca(l.peca_id))
      .join(", ")}.`;
  return null;
}
