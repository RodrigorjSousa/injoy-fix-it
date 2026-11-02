// Bonificação › Pagamento: quanto pagar a cada pessoa num mês.
//  - Meta do setor (grupo): +valor_por_pessoa quando Geral e a nota do setor do mês ficam na nota mínima
//    ou acima (Recepção → Geral + Funcionário; Camareiras/Manutenção → Geral + Limpeza), na unidade da pessoa.
//  - Elogio direto (individual): +valor_elogio por elogio com o nome da pessoa.
//  - Quem passou do máximo de atrasos ou teve falta sem justificativa no mês não recebe nada.
import {
  avaliarMetaSetores,
  type MetaConfig,
  type MetaPessoa,
  type SetorMeta,
} from "@/lib/bonus-meta";
import {
  calcularMediasBonificacao,
  type MediasBonificacao,
  type RegistroBonificacao,
} from "@/lib/bonificacao";

export type ElogioPessoa = { funcionario_id: string };

export type LinhaPagamento = {
  funcionarioId: string;
  nome: string;
  participante: boolean;
  setor: SetorMeta | null;
  unidade: string;
  atrasos: number;
  faltas: number;
  perdeu: boolean;
  motivo: string | null;
  metaAtingida: boolean;
  valorMeta: number;
  qtdElogios: number;
  valorElogios: number;
  total: number;
};

export type ResumoPagamento = {
  linhas: LinhaPagamento[];
  medias: Record<"Botafogo" | "Ipanema" | "Ambas", MediasBonificacao>;
  totalMeta: number;
  totalElogios: number;
  total: number;
};

const arred = (n: number) => Math.round(n * 100) / 100;

export function resumirPagamento(args: {
  pessoas: MetaPessoa[];
  registros: RegistroBonificacao[];
  cfg: MetaConfig;
  valorElogio: number;
  elogios: ElogioPessoa[];
  /** Nomes de quem foi elogiado e não está na meta (ex.: funcionário fora da lista). */
  nomes?: Record<string, string>;
}): ResumoPagamento {
  const { pessoas, registros, cfg, valorElogio, elogios, nomes = {} } = args;
  const medias = {
    Botafogo: calcularMediasBonificacao(registros.filter((r) => r.unidade === "Botafogo")),
    Ipanema: calcularMediasBonificacao(registros.filter((r) => r.unidade === "Ipanema")),
    Ambas: calcularMediasBonificacao(registros),
  };
  const qtdElogios = new Map<string, number>();
  for (const e of elogios)
    qtdElogios.set(e.funcionario_id, (qtdElogios.get(e.funcionario_id) ?? 0) + 1);

  const linhas: LinhaPagamento[] = [];
  const vistos = new Set<string>();
  for (const p of pessoas) {
    if (!p.ativo && !qtdElogios.get(p.funcionario_id)) continue;
    vistos.add(p.funcionario_id);
    const unidade = p.unidade === "Botafogo" || p.unidade === "Ipanema" ? p.unidade : "Ambas";
    const setores = avaliarMetaSetores(medias[unidade], cfg.nota_minima);
    const atingida = p.ativo && cfg.ativo && setores[p.setor].atingida;
    const perdeu = p.faltas > 0 || p.atrasos > cfg.max_atrasos;
    const motivo = perdeu
      ? [
          p.atrasos > cfg.max_atrasos ? `${p.atrasos} atrasos (máx. ${cfg.max_atrasos})` : null,
          p.faltas > 0 ? `${p.faltas} falta(s) sem justificativa` : null,
        ]
          .filter(Boolean)
          .join(" e ")
      : null;
    const n = qtdElogios.get(p.funcionario_id) ?? 0;
    const valorMeta = !perdeu && atingida ? cfg.valor_por_pessoa : 0;
    const valorElogios = perdeu ? 0 : arred(n * valorElogio);
    linhas.push({
      funcionarioId: p.funcionario_id,
      nome: p.nome,
      participante: p.ativo,
      setor: p.setor,
      unidade: p.unidade,
      atrasos: p.atrasos,
      faltas: p.faltas,
      perdeu,
      motivo,
      metaAtingida: atingida,
      valorMeta,
      qtdElogios: n,
      valorElogios,
      total: arred(valorMeta + valorElogios),
    });
  }
  // Elogiado que não está na meta (sem controle de atrasos aqui): recebe só os elogios.
  for (const [id, n] of qtdElogios) {
    if (vistos.has(id)) continue;
    linhas.push({
      funcionarioId: id,
      nome: nomes[id] ?? "—",
      participante: false,
      setor: null,
      unidade: "—",
      atrasos: 0,
      faltas: 0,
      perdeu: false,
      motivo: null,
      metaAtingida: false,
      valorMeta: 0,
      qtdElogios: n,
      valorElogios: arred(n * valorElogio),
      total: arred(n * valorElogio),
    });
  }
  linhas.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
  const totalMeta = arred(linhas.reduce((s, l) => s + l.valorMeta, 0));
  const totalElogios = arred(linhas.reduce((s, l) => s + l.valorElogios, 0));
  return { linhas, medias, totalMeta, totalElogios, total: arred(totalMeta + totalElogios) };
}

/** "2026-10" → { inicio: "2026-10-01", fim: "2026-10-31" }. */
export function limitesDoMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(fim).padStart(2, "0")}` };
}

/** Mês anterior ao de hoje (o fechamento normalmente é do mês passado). */
export function mesAnterior(hoje: string): string {
  const [y, m] = hoje.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
