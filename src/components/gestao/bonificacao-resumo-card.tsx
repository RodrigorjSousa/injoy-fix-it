import { useState } from "react";
import { ChevronRight, Trophy } from "lucide-react";
import { BonificacaoVisualizacaoDialog, agruparAvaliacoes } from "@/components/gestao/bonificacao-visualizacao-dialog";
import { useRegistrosBonificacaoMes, formatBRL } from "@/lib/bonificacao";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function BonificacaoResumoCard({ unidade }: { unidade: Unidade }) {
  const { data: registros = [], isLoading } = useRegistrosBonificacaoMes(unidade);
  const recepcao = registros.filter((r) => r.setor !== "camareiras");
  const camareiras = registros.filter((r) => r.setor === "camareiras");
  const totalRecepcao = recepcao.reduce((s, r) => s + Number(r.valor_calculado), 0);
  const totalCamareiras = camareiras.reduce((s, r) => s + Number(r.valor_calculado), 0);
  const mesNome = MESES[new Date().getMonth()];
  // Cada avaliação gera 2 registros (Recepção + Camareiras): contamos avaliações.
  const qtd = agruparAvaliacoes(registros).length;
  const [aberto, setAberto] = useState(false);

  return (
    <>
    <button
      type="button"
      onClick={() => setAberto(true)}
      aria-label="Ver detalhes da bonificação do mês"
      className="block w-full rounded-2xl border bg-gradient-to-br from-emerald-50 to-white p-4 text-left shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
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
              {isLoading ? "Carregando..." : `${qtd} avaliação${qtd === 1 ? "" : "s"} · ${unidade} · toque para ver`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <div className="text-right text-xs">
          <p className={cn("font-black tabular-nums", totalRecepcao >= 0 ? "text-emerald-600" : "text-destructive")}>Recepção {formatBRL(totalRecepcao)}</p>
           <p className={cn("font-black tabular-nums", totalCamareiras >= 0 ? "text-emerald-600" : "text-destructive")}>Camareiras / Manutenção {formatBRL(totalCamareiras)}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </div>
    </button>
    <BonificacaoVisualizacaoDialog open={aberto} onOpenChange={setAberto} unidade={unidade} />
    </>
  );
}
