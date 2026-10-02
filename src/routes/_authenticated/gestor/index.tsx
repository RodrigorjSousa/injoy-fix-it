import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Banknote,
  BarChart3,
  BedDouble,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileCheck2,
  GlassWater,
  Key,
  Package,
  Settings2,
  ShieldCheck,
  Shirt,
  Snowflake,
  Trophy,
  Users,
  Wrench,
} from "lucide-react";
import { FinanceiroAlertas } from "@/components/financeiro/financeiro-alertas";
import { EscalaHojeCard } from "@/components/escala/escala-hoje-card";

export const Route = createFileRoute("/_authenticated/gestor/")({
  head: () => ({
    meta: [
      { title: "Área do Gestor | INJOY Hotéis" },
      { name: "description", content: "Central de operação, equipe, históricos e relatórios do gestor INJOY Hotéis." },
      { property: "og:title", content: "Área do Gestor | INJOY Hotéis" },
      { property: "og:description", content: "Central exclusiva de gestão do INJOY Hotéis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GestorHub,
});

type HubPath =
  | "/gestao"
  | "/relatorio-operacoes"
  | "/preventiva"
  | "/almoxarifado"
  | "/estoque-geral"
  | "/frigobar"
  | "/check-in-digital"
  | "/gestao-boas-vindas"
  | "/configuracoes"
  | "/gestor/escala"
  | "/controle-ponto"
  | "/bonificacao"
  | "/historico-limpeza"
  | "/historico-manutencao"
  | "/historico-vistorias"
  | "/historico-caixa"
  | "/relatorios-turno";

type HubItem = { label: string; description: string; to: HubPath; icon: typeof BarChart3; tone: string };

const sections: { title: string; items: HubItem[] }[] = [
  {
    title: "Operação",
    items: [
      { label: "Painel de Gestão", description: "Indicadores e visão diária", to: "/gestao", icon: BarChart3, tone: "bg-blue-600" },
      { label: "Lavanderia", description: "Operações e conta corrente", to: "/relatorio-operacoes", icon: Shirt, tone: "bg-sky-600" },
      { label: "Preventiva AC", description: "Limpezas e vencimentos", to: "/preventiva", icon: Snowflake, tone: "bg-cyan-600" },
      { label: "Almoxarifado", description: "Estoque e movimentações", to: "/almoxarifado", icon: Package, tone: "bg-violet-600" },
      { label: "Estoque Geral", description: "Consulta consolidada", to: "/estoque-geral", icon: ClipboardList, tone: "bg-indigo-600" },
      { label: "Frigobar", description: "Produtos, vendas e reposição", to: "/frigobar", icon: GlassWater, tone: "bg-emerald-600" },
      { label: "Check-in Digital", description: "Fechaduras e acessos", to: "/check-in-digital", icon: Key, tone: "bg-teal-600" },
      { label: "Boas-vindas", description: "Organização da tela inicial", to: "/gestao-boas-vindas", icon: Settings2, tone: "bg-slate-700" },
    ],
  },
  {
    title: "Equipe",
    items: [
      { label: "Equipe", description: "Usuários e permissões", to: "/configuracoes", icon: Users, tone: "bg-blue-700" },
      { label: "Escala", description: "Escalas por setor e unidade", to: "/gestor/escala", icon: CalendarDays, tone: "bg-amber-600" },
      { label: "Controle de Ponto", description: "Registros da equipe", to: "/controle-ponto", icon: Clock, tone: "bg-orange-600" },
      { label: "Bonificação", description: "Avaliações e valores", to: "/bonificacao", icon: Trophy, tone: "bg-emerald-600" },
    ],
  },
  {
    title: "Históricos e Relatórios",
    items: [
      { label: "Limpeza", description: "Produção das camareiras", to: "/historico-limpeza", icon: BedDouble, tone: "bg-emerald-600" },
      { label: "Manutenção", description: "Execuções e pendências", to: "/historico-manutencao", icon: Wrench, tone: "bg-teal-700" },
      { label: "Vistorias", description: "Inspeções da recepção", to: "/historico-vistorias", icon: ClipboardCheck, tone: "bg-blue-600" },
      { label: "Caixa", description: "Entradas e gastos emergenciais", to: "/historico-caixa", icon: Banknote, tone: "bg-green-700" },
      { label: "Relatórios de Turno", description: "Passagens de serviço", to: "/relatorios-turno", icon: FileCheck2, tone: "bg-indigo-600" },
    ],
  },
];

function GestorHub() {
  return (
    <div className="space-y-8">
      <FinanceiroAlertas />
      <EscalaHojeCard />

      {sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-xs font-black uppercase text-slate-500">{section.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.to} to={item.to} className="flex min-h-24 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-400">
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white ${item.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.description}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-xs font-black uppercase text-slate-500">Financeiro</h2>
          <Link to="/gestor/financeiro" className="flex min-h-24 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-400">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-700 text-white"><Banknote className="h-5 w-5" /></div>
            <div className="flex-1"><p className="font-black text-slate-900">Financeiro</p><p className="text-xs text-slate-500">Despesas, receitas e fornecedores</p></div>
            <ArrowUpRight className="h-4 w-4 text-slate-400" />
          </Link>
        </div>
        <div className="space-y-3">
          <h2 className="text-xs font-black uppercase text-slate-500">Conformidade</h2>
          <div className="flex min-h-24 items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-100 p-4">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-slate-500 text-white"><ShieldCheck className="h-5 w-5" /></div>
            <div className="flex-1"><p className="font-black text-slate-700">Licenças e Vistorias Obrigatórias</p><p className="text-xs font-semibold text-slate-500">Em breve</p></div>
          </div>
        </div>
      </section>
    </div>
  );
}
