import { Link } from "@tanstack/react-router";
import { AlarmClock, ArrowUpRight, CheckCircle2, Loader2, MapPin, User2 } from "lucide-react";
import { useMemo } from "react";
import { useChamados } from "@/lib/store";
import {
  chamadosAtrasados,
  PRAZO_DIAS,
  situacaoPrazo,
  textoAtrasoChamado,
} from "@/lib/chamado-prazo";
import { dataHoraBR } from "@/lib/chamado-tempo";
import { Secao } from "./comum";

/** Gestão: chamados que passaram do prazo de 3 dias sem serem concluídos. */
export function BlocoChamadosAtrasados() {
  const q = useChamados();
  const atrasados = useMemo(() => chamadosAtrasados(q.data ?? []), [q.data]);

  return (
    <Secao titulo={`Chamados fora do prazo (${PRAZO_DIAS} dias)`}>
      {q.isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando chamados…
        </div>
      ) : q.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Chamados: {(q.error as Error).message}
        </p>
      ) : !atrasados.length ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Todos os chamados abertos estão dentro do prazo.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-red-700">
              {atrasados.length} chamado(s) passaram de {PRAZO_DIAS} dias sem conclusão
            </p>
            <Link
              to="/painel"
              search={{ tipo: "atrasados" }}
              className="flex items-center gap-1 text-xs font-semibold text-primary"
            >
              Ver no Painel <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y overflow-hidden rounded-lg border border-red-200 bg-white">
            {atrasados.slice(0, 15).map((c) => {
              const s = situacaoPrazo(c);
              return (
                <Link
                  key={c.id}
                  to="/chamados/$id"
                  params={{ id: c.id }}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-red-50"
                >
                  <AlarmClock className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{c.descricao}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {c.unidade}
                      </span>
                      <span className="flex items-center gap-1">
                        <User2 className="h-3 w-3" />
                        {c.responsavelNome ?? "Sem responsável"}
                      </span>
                      <span>{c.status === "Em Andamento" ? "Fazendo" : "A fazer"}</span>
                      <span>Aberto em {dataHoraBR(c.criadoEm)}</span>
                    </p>
                    <p className="mt-0.5 text-xs font-bold text-red-700">{textoAtrasoChamado(s)}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              );
            })}
          </div>
          {atrasados.length > 15 && (
            <p className="text-xs text-slate-500">
              Mostrando os 15 mais antigos. Veja todos no Painel.
            </p>
          )}
        </div>
      )}
    </Secao>
  );
}
