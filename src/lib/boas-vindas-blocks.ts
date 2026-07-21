// Catálogo de blocos exibidos na tela de Boas-Vindas para funcionários.
// A configuração é gerenciada em /gestao-boas-vindas (admin/gestor).

export type BoasVindasAudience = "camareira" | "recepcao" | "manutencao";

export type BoasVindasBlockId =
  | "passagem_turno"
  | "auditoria_funcionario"
  | "resumo_bonificacao"
  | "saudacao"
  | "taxa_ocupacao"
  | "clima"
  | "status_quartos"
  | "painel_controle_rapido";

export type BoasVindasBlockDef = {
  id: BoasVindasBlockId;
  label: string;
  description: string;
};

export const BOAS_VINDAS_BLOCKS: BoasVindasBlockDef[] = [
  {
    id: "passagem_turno",
    label: "Passagem de Turno",
    description: "Card com a nota deixada pelo turno anterior (aparece por 1h após o login).",
  },
  {
    id: "auditoria_funcionario",
    label: "Auditoria do Almoxarifado",
    description: "Card de auditoria pendente para o funcionário.",
  },
  {
    id: "resumo_bonificacao",
    label: "Resumo da Bonificação",
    description: "Resumo pessoal do funcionário na planilha de bonificação.",
  },
  {
    id: "saudacao",
    label: "Saudação e Nota do Hotel",
    description: "Cabeçalho de boas-vindas com nome e a nota do Cloudbeds/meta de bônus.",
  },
  {
    id: "taxa_ocupacao",
    label: "Taxa de Ocupação",
    description: "Barra com a taxa de ocupação da unidade hoje.",
  },
  {
    id: "clima",
    label: "Clima Local",
    description: "Painel com a temperatura e condição do tempo na unidade.",
  },
  {
    id: "status_quartos",
    label: "Status da Operação de Quartos",
    description: "Quatro cartões: prontos, em faxina, sujos e bloqueados.",
  },
  {
    id: "painel_controle_rapido",
    label: "Painel de Controle Rápido",
    description: "Indicadores operacionais rápidos no rodapé da tela.",
  },
];

export const AUDIENCE_LABEL: Record<BoasVindasAudience, string> = {
  camareira: "Camareiras",
  recepcao: "Recepção",
  manutencao: "Manutenção",
};

// Padrão inicial por público (usado quando ainda não existe registro no banco).
const DEFAULT_ORDER: BoasVindasBlockId[] = [
  "passagem_turno",
  "auditoria_funcionario",
  "resumo_bonificacao",
  "saudacao",
  "taxa_ocupacao",
  "clima",
  "status_quartos",
  "painel_controle_rapido",
];

export type BoasVindasConfigEntry = { id: BoasVindasBlockId; visible: boolean };

export function defaultConfig(): BoasVindasConfigEntry[] {
  return DEFAULT_ORDER.map((id) => ({ id, visible: true }));
}

// Reconcilia uma configuração salva com o catálogo atual:
// - remove ids que não existem mais
// - anexa novos blocos (visíveis por padrão) no fim
export function reconcileConfig(
  saved: unknown,
): BoasVindasConfigEntry[] {
  const catalog = new Set<BoasVindasBlockId>(BOAS_VINDAS_BLOCKS.map((b) => b.id));
  const arr = Array.isArray(saved) ? saved : [];
  const seen = new Set<BoasVindasBlockId>();
  const result: BoasVindasConfigEntry[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: string }).id as BoasVindasBlockId | undefined;
    if (!id || !catalog.has(id) || seen.has(id)) continue;
    const visible = (item as { visible?: boolean }).visible !== false;
    result.push({ id, visible });
    seen.add(id);
  }
  for (const id of DEFAULT_ORDER) {
    if (!seen.has(id)) result.push({ id, visible: true });
  }
  return result;
}
