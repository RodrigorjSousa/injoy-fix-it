// Recado do Gestor: para quem vai cada recado (setores, todos ou pessoas escolhidas).
// A lista de destinatários é resolvida no envio e gravada em `recados_gestor.destinatarios`
// (migração 0087). Recados antigos, sem lista, valem pelo setor.

export type SetorRecado = "camareiras" | "recepcao" | "manutencao" | "ar_condicionado";
export type AlvoRecado = "setor" | "todos" | "pessoas";

export const SETORES_RECADO: SetorRecado[] = [
  "camareiras",
  "recepcao",
  "manutencao",
  "ar_condicionado",
];
export const SETOR_RECADO_LABEL: Record<SetorRecado, string> = {
  camareiras: "Camareiras",
  recepcao: "Recepção",
  manutencao: "Manutenção",
  ar_condicionado: "Ar condicionado",
};

/** Categorias técnicas que contam como Manutenção (tudo menos Camareira). */
const CATEGORIAS_MANUTENCAO = [
  "Ar condicionado",
  "Elétrica",
  "Automação",
  "Hidráulica",
  "Alvenaria",
  "Pintura",
  "Marcenaria",
];

export type PessoaEquipe = {
  userId: string | null;
  nome: string;
  roles: string[];
  categorias: string[];
  /** Telas liberadas no cadastro (null = vale o papel). */
  telas: string[] | null;
};

/** Setores de uma pessoa — mesma regra do menu para Camareiras e Recepção; técnicos pelas categorias. */
export function setoresDaPessoa(
  p: Pick<PessoaEquipe, "roles" | "categorias" | "telas">,
): Set<SetorRecado> {
  const s = new Set<SetorRecado>();
  const telas = Array.isArray(p.telas) ? p.telas : null;
  const cat = p.categorias ?? [];
  if (
    telas
      ? telas.includes("camareiras")
      : p.roles.includes("camareira") || cat.includes("Camareira")
  )
    s.add("camareiras");
  if (telas ? telas.includes("recepcao") : p.roles.includes("recepcao")) s.add("recepcao");
  if (cat.some((c) => CATEGORIAS_MANUTENCAO.includes(c))) s.add("manutencao");
  if (cat.includes("Ar condicionado")) s.add("ar_condicionado");
  return s;
}

/** Quem recebe: todos com login (menos gestor/admin), os setores marcados ou as pessoas escolhidas. */
export function resolverDestinatarios(
  alvo: AlvoRecado,
  opcoes: { setores?: SetorRecado[]; pessoas?: string[] },
  equipe: PessoaEquipe[],
): PessoaEquipe[] {
  const comLogin = equipe.filter((p) => !!p.userId);
  const unicos = new Map<string, PessoaEquipe>();
  for (const p of comLogin) {
    const gestor = p.roles.includes("gestor") || p.roles.includes("admin");
    let entra = false;
    if (alvo === "todos") entra = !gestor;
    else if (alvo === "pessoas") entra = (opcoes.pessoas ?? []).includes(p.userId as string);
    else {
      const meus = setoresDaPessoa(p);
      entra = !gestor && (opcoes.setores ?? []).some((s) => meus.has(s));
    }
    if (entra && !unicos.has(p.userId as string)) unicos.set(p.userId as string, p);
  }
  return [...unicos.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export type RecadoDestino = {
  alvo?: AlvoRecado | null;
  setor?: string | null;
  setores?: string[] | null;
  destinatarios?: string[] | null;
};

/** O recado é para esta pessoa? Com lista gravada vale a lista; recados antigos valem pelo setor. */
export function recadoEhPara(
  r: RecadoDestino,
  userId: string,
  meusSetores: Set<SetorRecado>,
): boolean {
  if (Array.isArray(r.destinatarios) && r.destinatarios.length)
    return r.destinatarios.includes(userId);
  if (r.alvo === "todos") return true;
  if (r.alvo === "pessoas") return false;
  const setores = r.setores?.length ? r.setores : r.setor ? [r.setor] : [];
  return setores.some((s) => meusSetores.has(s as SetorRecado));
}

/** "Camareiras e Recepção", "Todos os funcionários", "Flavio, Maria e +2". */
export function textoDestino(r: RecadoDestino & { destinatarios_nomes?: string[] | null }): string {
  if (r.alvo === "todos") return "Todos os funcionários";
  if (r.alvo === "pessoas") {
    const n = r.destinatarios_nomes ?? [];
    if (!n.length) return "Pessoas escolhidas";
    return n.length <= 3 ? juntarNomes(n) : `${n.slice(0, 2).join(", ")} e +${n.length - 2}`;
  }
  const setores = (r.setores?.length ? r.setores : r.setor ? [r.setor] : []) as SetorRecado[];
  return juntarNomes(setores.map((s) => SETOR_RECADO_LABEL[s] ?? s));
}

function juntarNomes(n: string[]): string {
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`;
}
