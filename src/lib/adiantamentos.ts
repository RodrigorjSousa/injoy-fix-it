// Financeiro › Adiantamentos: dinheiro adiantado a funcionários e freelancers.
// O adiantamento não é despesa: fica "em aberto" até ser descontado quando o gestor paga
// o salário / os plantões da pessoa (RPC `fin_pagar_com_adiantamentos`, migração 0086).
import { supabase } from "@/integrations/supabase/client";

export type StatusAdiantamento = "aberto" | "descontado" | "devolvido" | "cancelado";

export type Adiantamento = {
  id: string;
  funcionario_id: string | null;
  pessoa_nome: string;
  unidade: "Botafogo" | "Ipanema" | "Ambas";
  valor: number;
  data_adiantamento: string;
  forma_pagamento: string;
  status: StatusAdiantamento;
  descontado_lancamento_id: string | null;
  descontado_em: string | null;
  observacoes: string | null;
  anexo_path: string | null;
  created_at: string;
  /** Parcelas: registros do mesmo adiantamento dividido (null = sem parcelas). */
  grupo_id?: string | null;
  parcela?: number;
  parcelas?: number;
  /** 1º dia do mês a partir do qual a parcela pode ser descontada (null = já pode). */
  descontar_a_partir?: string | null;
};

export const STATUS_ADIANTAMENTO: Record<StatusAdiantamento, string> = {
  aberto: "A descontar",
  descontado: "Descontado",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
};

export const normNome = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const arred = (n: number) => Math.round(n * 100) / 100;

export type Pessoa = { funcionarioId: string | null; nome: string };

/** Mesma pessoa? Pelo cadastro quando os dois têm; senão pelo nome (freelancer / plantões da Escala). */
export function mesmaPessoa(a: Pessoa, b: Pessoa): boolean {
  if (a.funcionarioId && b.funcionarioId) return a.funcionarioId === b.funcionarioId;
  const na = normNome(a.nome);
  return !!na && na === normNome(b.nome);
}

/** Pessoa de um lançamento do Financeiro (funcionário vinculado ou nome do freelancer). */
export function pessoaDoLancamento(
  l: { funcionario_id: string | null; freelancer_nome: string | null },
  funcionarios: { id: string; nome: string }[],
): Pessoa | null {
  const nome =
    (l.funcionario_id ? funcionarios.find((f) => f.id === l.funcionario_id)?.nome : null) ??
    l.freelancer_nome ??
    "";
  if (!nome.trim() && !l.funcionario_id) return null;
  return { funcionarioId: l.funcionario_id, nome: nome.trim() };
}

/** Adiantamentos em aberto da pessoa, do mais antigo para o mais novo. */
export function abertosDaPessoa(pessoa: Pessoa | null, lista: Adiantamento[]): Adiantamento[] {
  if (!pessoa) return [];
  return lista
    .filter(
      (a) =>
        a.status === "aberto" &&
        mesmaPessoa(pessoa, { funcionarioId: a.funcionario_id, nome: a.pessoa_nome }),
    )
    .sort(
      (a, b) =>
        a.data_adiantamento.localeCompare(b.data_adiantamento) ||
        a.created_at.localeCompare(b.created_at),
    );
}

/** A parcela já pode ser descontada num pagamento da competência `mes` (YYYY-MM)? */
export const liberadoNoMes = (a: Pick<Adiantamento, "descontar_a_partir">, mes: string) =>
  !a.descontar_a_partir || a.descontar_a_partir.slice(0, 7) <= mes.slice(0, 7);

/** Separa os abertos entre os que já podem ser descontados no mês e as parcelas futuras. */
export function separarPorMes(lista: Adiantamento[], mes: string) {
  return {
    agora: lista.filter((a) => liberadoNoMes(a, mes)),
    futuros: lista.filter((a) => !liberadoNoMes(a, mes)),
  };
}

/** Divide o total em N parcelas em centavos; a última leva a diferença do arredondamento. */
export function dividirParcelas(total: number, n: number): number[] {
  const cent = Math.round(total * 100);
  const base = Math.floor(cent / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? cent - base * (n - 1) : base) / 100);
}

/** "2026-11" + 3 → ["2026-11", "2026-12", "2027-01"]. */
export function mesesSeguidos(inicio: string, n: number): string[] {
  const [y, m] = inicio.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export const mesBR = (mes: string | null | undefined) =>
  mes ? `${mes.slice(5, 7)}/${mes.slice(0, 4)}` : "";

export const somaAdiantamentos = (lista: Pick<Adiantamento, "valor">[]) =>
  arred(lista.reduce((s, a) => s + Number(a.valor), 0));

/** Quanto é descontado de um pagamento e quanto ainda sai em dinheiro (igual à RPC do banco). */
export function calcularDesconto(
  valorLancamento: number,
  selecionados: Pick<Adiantamento, "valor">[],
) {
  const total = somaAdiantamentos(selecionados);
  const descontado = arred(Math.min(total, valorLancamento));
  return {
    descontado,
    liquido: arred(valorLancamento - descontado),
    sobra: arred(total - descontado),
  };
}

export async function carregarAdiantamentos(): Promise<Adiantamento[]> {
  const { data, error } = await supabase
    .from("fin_adiantamentos" as never)
    .select("*")
    .order("data_adiantamento", { ascending: false });
  if (error) {
    // Migração 0086 ainda não aplicada: a tela funciona sem adiantamentos.
    if (
      /fin_adiantamentos/.test(error.message) &&
      /does not exist|schema cache/i.test(error.message)
    )
      return [];
    throw error;
  }
  return ((data ?? []) as unknown as Adiantamento[]).map((a) => ({ ...a, valor: Number(a.valor) }));
}

// ---------- valor por extenso (recibo) ----------
const UNI = [
  "",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZ = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const CEN = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CEN[c]);
  if (r) {
    if (r < 20) partes.push(UNI[r]);
    else partes.push([DEZ[Math.floor(r / 10)], UNI[r % 10]].filter(Boolean).join(" e "));
  }
  return partes.join(" e ");
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (milhoes) partes.push(milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`);
  if (milhares) partes.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
  if (resto) partes.push(ate999(resto));
  if (partes.length === 1) return partes[0];
  // "mil e quinhentos", "dois mil e cem", "mil duzentos e trinta"
  const ultimo = partes.pop() as string;
  const usaE = resto > 0 && (resto < 100 || resto % 100 === 0);
  return `${partes.join(" ")}${usaE ? " e " : " "}${ultimo}`;
}

/** 1250.5 → "mil duzentos e cinquenta reais e cinquenta centavos". */
export function valorPorExtenso(valor: number): string {
  const centavosTotal = Math.round(Math.abs(valor) * 100);
  const reais = Math.floor(centavosTotal / 100);
  const cent = centavosTotal % 100;
  const partes: string[] = [];
  if (reais) {
    const milhaoRedondo = reais % 1_000_000 === 0 && reais >= 1_000_000;
    partes.push(
      `${inteiroPorExtenso(reais)}${milhaoRedondo ? " de" : ""} ${reais === 1 ? "real" : "reais"}`,
    );
  }
  if (cent) partes.push(`${ate999(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero reais";
}
