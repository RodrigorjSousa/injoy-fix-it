// Catálogo de telas do aplicativo, derivado automaticamente dos arquivos
// em `src/routes/_authenticated/`. Ao adicionar uma nova rota lá, ela
// aparece automaticamente na tela EQUIPE > "Telas disponíveis" para o
// gestor liberar por funcionário, sem precisar mexer no código.

import {
  BarChart3,
  BedDouble,
  ClipboardList,
  Cog,
  ConciergeBell,
  GlassWater,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  Package,
  PlusCircle,
  Snowflake,
  Trophy,
  Wrench,
} from "lucide-react";

type IconType = typeof PlusCircle;

// Arquivos que NÃO representam abas navegáveis
const EXCLUDE = new Set([
  "route",
  "index",
  "boas-vindas",
  "configuracoes",
]);

// Rótulos amigáveis (fallback: gera a partir do slug)
const LABELS: Record<string, string> = {
  servicos: "Serviços",
  manutencao: "Manutenção",
  recepcao: "Recepção",
  camareiras: "Camareiras",
  preventiva: "Preventiva AC",
  painel: "Painel",
  almoxarifado: "Almoxarifado",
  "estoque-geral": "Estoque Geral",
  frigobar: "Frigobar",
  bonificacao: "Bonificação",
  chat: "Chat",
  dashboard: "Dashboard",
  gestao: "Gestão",
  escala: "Escala",
  "controle-ponto": "Controle de Ponto",
  vistoria: "Vistoria",
  "historico-limpeza": "Histórico de Limpeza",
  "historico-manutencao": "Histórico de Manutenção",
  "historico-vistorias": "Histórico de Vistorias",
  "relatorio-operacoes": "Relatório de Operações",
  "relatorios-turno": "Relatórios de Turno",
};

// Ícones por slug (fallback: LayoutGrid)
const ICONS: Record<string, IconType> = {
  servicos: Wrench,
  manutencao: Cog,
  recepcao: ConciergeBell,
  camareiras: BedDouble,
  preventiva: Snowflake,
  painel: LayoutGrid,
  almoxarifado: Package,
  "estoque-geral": Package,
  frigobar: GlassWater,
  bonificacao: Trophy,
  chat: MessageSquare,
  dashboard: LayoutDashboard,
  gestao: BarChart3,
  escala: ClipboardList,
  "controle-ponto": ClipboardList,
  vistoria: ClipboardList,
  "historico-limpeza": ClipboardList,
  "historico-manutencao": ClipboardList,
  "historico-vistorias": ClipboardList,
  "relatorio-operacoes": ClipboardList,
  "relatorios-turno": ClipboardList,
};

function humanize(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Descobre todas as rotas autenticadas em tempo de build.
// eager:false garante que apenas os caminhos sejam avaliados.
const modules = import.meta.glob("/src/routes/_authenticated/*.tsx");

export type Tela = {
  key: string; // slug (ex.: "almoxarifado")
  path: string; // rota (ex.: "/almoxarifado")
  label: string;
  icon: IconType;
};

export const TELAS_CATALOG: Tela[] = Object.keys(modules)
  .map((p) => {
    const m = p.match(/\/([^/]+)\.tsx$/);
    return m ? m[1] : "";
  })
  .filter((slug) => slug && !EXCLUDE.has(slug) && !slug.includes("$") && !slug.includes("."))
  .sort((a, b) => (LABELS[a] ?? humanize(a)).localeCompare(LABELS[b] ?? humanize(b), "pt-BR"))
  .map((slug) => ({
    key: slug,
    path: `/${slug}`,
    label: LABELS[slug] ?? humanize(slug),
    icon: ICONS[slug] ?? LayoutGrid,
  }));

export const TELA_BY_KEY: Record<string, Tela> = Object.fromEntries(
  TELAS_CATALOG.map((t) => [t.key, t]),
);
