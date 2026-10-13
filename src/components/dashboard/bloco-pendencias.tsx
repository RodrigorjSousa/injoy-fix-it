import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";
import { FinanceiroAlertas } from "@/components/financeiro/financeiro-alertas";
import { usePendencias } from "@/lib/dashboard/dados";
import { cn } from "@/lib/utils";
import { Secao } from "./comum";

export function BlocoPendencias() {
  const q = usePendencias();
  const itens = q.data ?? [];
  const abertos = itens.filter((i) => i.qtd > 0);
  const comErro = itens.filter((i) => i.erro);
  return (
    <Secao titulo="Precisa de você hoje">
      <FinanceiroAlertas />
      {q.isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando pendências…
        </div>
      ) : q.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Pendências: {(q.error as Error).message}</p>
      ) : !abertos.length ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Nada esperando por você na operação.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {abertos.map((i) => (
            <Link
              key={i.chave}
              to={i.link}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
                i.chave === "chamados" || i.chave === "reforco"
                  ? "border-red-200 bg-red-50 hover:bg-red-100"
                  : "border-amber-200 bg-amber-50 hover:bg-amber-100",
              )}
            >
              <span className="grid h-9 min-w-9 place-items-center rounded-lg bg-white px-2 text-lg font-black text-slate-900 shadow-sm">{i.qtd}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">{i.rotulo}</p>
                {i.detalhe && <p className="text-xs text-slate-600">{i.detalhe}</p>}
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
            </Link>
          ))}
        </div>
      )}
      {comErro.length > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Não deu para conferir: {comErro.map((i) => `${i.rotulo} (${i.erro})`).join("; ")}
        </p>
      )}
    </Secao>
  );
}
