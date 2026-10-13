import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useMetaSituacao } from "@/lib/bonus-meta";
import { useMesEmCurso, UNIDADES_DASH } from "@/lib/dashboard/dados";
import { todaySP } from "@/lib/tz";
import { brl0, CabecalhoUnidade, Cartao, Erros, Kpi, num, pct, Secao } from "./comum";

export function BlocoMes() {
  const mes = todaySP().slice(0, 7);
  const q = useMesEmCurso(mes);
  const meta = useMetaSituacao();
  const pessoas = meta.data?.pessoas?.filter((p) => p.ativo) ?? [];
  const emRisco = pessoas.filter((p) => p.situacao !== "ok");
  const [a, m] = mes.split("-");

  return (
    <Secao titulo={`Mês em curso · ${m}/${a}`}>
      {q.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{(q.error as Error).message}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {UNIDADES_DASH.map((u) => {
            const d = q.data?.[u];
            const resultado = d ? d.receita - d.despesa : 0;
            return (
              <Cartao key={u}>
                <CabecalhoUnidade unidade={u} />
                {q.isLoading || !d ? (
                  <p className="text-sm text-slate-500">Carregando…</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <Kpi rotulo="Receita lançada" valor={brl0.format(d.receita)} />
                      <Kpi rotulo="Despesa" valor={brl0.format(d.despesa)} />
                      <Kpi
                        rotulo="Resultado"
                        valor={brl0.format(resultado)}
                        sub={d.receita ? pct(resultado / d.receita, 1) : undefined}
                        tom={resultado < 0 ? "ruim" : "bom"}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Kpi
                        rotulo="Ocupação média"
                        valor={d.ocupacaoMedia == null ? "—" : `${num(d.ocupacaoMedia, 0)}%`}
                        sub={`${d.diasComMedicao} dia(s) medidos`}
                      />
                      <Kpi
                        rotulo="Notas (G/F/L)"
                        valor={`${num(d.notaGeral)} · ${num(d.notaFuncionarios)} · ${num(d.notaLimpeza)}`}
                        sub={`${d.avaliacoesBonificacao} avaliação(ões)`}
                      />
                      <Kpi rotulo="Totem" valor={d.totemMedia == null ? "—" : `${num(d.totemMedia)} ★`} sub={`${d.totemAvaliacoes} avaliação(ões)`} />
                    </div>
                    <Kpi rotulo="Lavanderia" valor={`${d.pecasLavanderia.toLocaleString("pt-BR")} peças`} sub={`${d.taloesLavanderia} talão(ões) no mês`} />
                    <Erros lista={d.erros} />
                  </>
                )}
              </Cartao>
            );
          })}
        </div>
      )}

      {meta.data && (
        <Cartao>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-slate-900">Meta da equipe</p>
            <Link to="/bonificacao" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
              Bonificação <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {!emRisco.length ? (
            <p className="text-sm text-emerald-700">Todos os {pessoas.length} participantes dentro da regra de atrasos e faltas.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {emRisco.map((p) => (
                <li
                  key={p.funcionario_id}
                  className={p.situacao === "perdeu" ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" : "rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"}
                >
                  <b>{p.nome}</b> · {p.atrasos} atraso(s), {p.faltas} falta(s) · {p.situacao === "perdeu" ? "perdeu a meta" : "em risco"}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}
    </Secao>
  );
}
