import { Trophy } from "lucide-react";
import { useRegistrosBonificacaoMes, formatBRL } from "@/lib/bonificacao";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function BonificacaoResumoCard({ unidade }: { unidade: Unidade }) {
  const { data: registros = [], isLoading } = useRegistrosBonificacaoMes(unidade);
  const total = registros.reduce((s, r) => s + Number(r.valor_calculado), 0);
  const mesNome = MESES[new Date().getMonth()];

  return (
    <div className="rounded-2xl border bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-emerald-100 grid place-items-center">
            <Trophy className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Bonificação · {mesNome}
            </p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Carregando..." : `${registros.length} avaliação${registros.length === 1 ? "" : "s"} · ${unidade}`}
            </p>
          </div>
        </div>
        <p
          className={cn(
            "text-2xl font-black tabular-nums",
            total >= 0 ? "text-emerald-600" : "text-red-600",
          )}
        >
          {formatBRL(total)}
        </p>
      </div>
    </div>
  );
}
