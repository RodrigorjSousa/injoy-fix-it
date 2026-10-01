import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Construction } from "lucide-react";

export const Route = createFileRoute("/_authenticated/gestor/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro | Área do Gestor — INJOY Hotéis" },
      { name: "description", content: "Área financeira exclusiva dos gestores do INJOY Hotéis." },
      { property: "og:title", content: "Financeiro | Área do Gestor — INJOY Hotéis" },
      { property: "og:description", content: "Área financeira exclusiva dos gestores do INJOY Hotéis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceiroPage,
});

function FinanceiroPage() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
          <Banknote className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-2xl font-black text-slate-900">Financeiro</h2>
        <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
          <Construction className="h-4 w-4" /> Em construção
        </p>
      </div>
    </div>
  );
}
