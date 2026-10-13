import { EscalaHojeCard } from "@/components/escala/escala-hoje-card";
import { PrevisaoCargaCard } from "@/components/gestao/previsao-carga-card";
import { useQuartosHoje, UNIDADES_DASH } from "@/lib/dashboard/dados";
import { resumoOperacao } from "@/lib/dashboard/operacao";
import { brl, CabecalhoUnidade, Cartao, horaCurta, Kpi, pct, Secao } from "./comum";

export function BlocoOperacao() {
  const q = useQuartosHoje();
  return (
    <Secao titulo="Operação de hoje">
      {q.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Quartos: {(q.error as Error).message}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {UNIDADES_DASH.map((u) => {
            const r = resumoOperacao(q.data ?? [], u);
            return (
              <Cartao key={u}>
                <CabecalhoUnidade
                  unidade={u}
                  extra={<span className="text-[11px] text-slate-500">Cloudbeds {q.isLoading ? "…" : horaCurta(r.atualizadoEm)}</span>}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Kpi rotulo="Ocupação" valor={pct(r.ocupacao)} sub={`${r.ocupados} de ${r.vendaveis} quartos`} />
                  <Kpi rotulo="Chegadas" valor={r.chegadas} />
                  <Kpi rotulo="Saídas" valor={r.saidas} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  {[
                    ["Prontos", r.prontos, "text-emerald-700"],
                    ["Em faxina", r.emFaxina, "text-amber-700"],
                    ["Sujos", r.sujos, "text-red-600"],
                    ["Bloqueados", r.bloqueados, "text-slate-600"],
                  ].map(([rotulo, v, cor]) => (
                    <div key={rotulo as string} className="rounded-lg border border-slate-100 py-1.5">
                      <p className={`text-base font-black ${cor}`}>{v}</p>
                      <p className="text-[10px] font-semibold uppercase text-slate-500">{rotulo}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Kpi rotulo="A receber no balcão" valor={brl.format(r.aReceber)} sub={`${r.comSaldo} quarto(s) com saldo`} tom={r.aReceber > 0 ? "ruim" : undefined} />
                  <Kpi rotulo="Docs pendentes" valor={r.docsPendentes} sub="falta check-in online" />
                </div>
              </Cartao>
            );
          })}
        </div>
      )}
      <EscalaHojeCard />
      <PrevisaoCargaCard />
    </Secao>
  );
}
