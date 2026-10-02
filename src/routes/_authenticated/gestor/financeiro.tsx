import { createFileRoute } from "@tanstack/react-router";
import { FinanceiroPage } from "@/components/financeiro/financeiro-page";

export const Route = createFileRoute("/_authenticated/gestor/financeiro")({
  head: () => ({ meta: [
    { title: "Financeiro | Área do Gestor — INJOY Hotéis" },
    { name: "description", content: "Gestão de despesas, receitas, fornecedores e custos do INJOY Hotéis." },
    { property: "og:title", content: "Financeiro | Área do Gestor — INJOY Hotéis" },
    { property: "og:description", content: "Gestão financeira exclusiva dos gestores do INJOY Hotéis." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ]}),
  component: FinanceiroPage,
});
