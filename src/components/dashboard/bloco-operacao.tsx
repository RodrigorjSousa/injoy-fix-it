import { EscalaHojeCard } from "@/components/escala/escala-hoje-card";
import { PrevisaoCargaCard } from "@/components/gestao/previsao-carga-card";
import { useQuartosHoje, useOcupacaoHoje, UNIDADES_DASH, type QuartoHoje } from "@/lib/dashboard/dados";
import { resumoOperacao } from "@/lib/dashboard/operacao";
import { situacaoQuarto, taxaOcupacaoCloudbeds } from "@/lib/dashboard/operacao";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sincronizarCloudbeds } from "@/lib/cloudbeds-sync";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { DetalhesPainel, type DetalhePainel } from "./detalhes";
import { brl, CabecalhoUnidade, Cartao, horaCurta, Kpi, pct, Secao } from "./comum";

export function BlocoOperacao() {
  const q = useQuartosHoje();
  const ocupacao = useOcupacaoHoje();
  const qc = useQueryClient();
  const sync = useMutation({ mutationFn: sincronizarCloudbeds, onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }) });
  const [detalhe, setDetalhe] = useState<DetalhePainel | null>(null);
  const abrir = (u: string, titulo: string, filtro: (q: QuartoHoje) => boolean) => {
    const linhas = (q.data ?? []).filter((r) => r.property === u && filtro(r));
    setDetalhe({ titulo: `${titulo} · ${u}`, descricao: `${linhas.length} quarto(s) · dados sincronizados do Cloudbeds`, conteudo:
      linhas.length ? <ul className="divide-y divide-border">{linhas.map((r) => <li key={r.room_number} className="py-3 text-sm"><b>Quarto {r.room_number}</b><p>{r.guest_name ?? "Sem hóspede"}</p>{r.departing_guest_name && <p>Saída: {r.departing_guest_name}</p>}{r.next_guest_name && <p>Chegada: {r.next_guest_name}</p>}{r.has_pending_payment && <p>Saldo: {brl.format(Number(r.pending_payment_amount) || 0)}</p>}{r.has_pending_docs && <p>Documentação pendente</p>}</li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum quarto nesta situação.</p> });
  };
  return (
    <Secao titulo="Operação de hoje" acao={<Button variant="outline" size="sm" disabled={sync.isPending} onClick={() => sync.mutate()}><RefreshCw className={sync.isPending ? "animate-spin" : ""} />{sync.isPending ? "Atualizando…" : "Atualizar operação"}</Button>}>
      {sync.error && <p role="alert" className="text-sm text-destructive">{sync.error.message}</p>}
      {ocupacao.error && <p role="alert" className="text-sm text-destructive">Ocupação: {ocupacao.error.message}</p>}
      {q.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Quartos: {(q.error as Error).message}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {UNIDADES_DASH.map((u) => {
            const r = resumoOperacao(q.data ?? [], u);
            const metrica = ocupacao.data?.find((m) => m.property === u);
            return (
              <Cartao key={u}>
                <CabecalhoUnidade
                  unidade={u}
                  extra={<span className="text-[11px] text-slate-500">Cloudbeds {q.isLoading ? "…" : horaCurta(metrica?.updated_at ?? r.atualizadoEm)}</span>}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Kpi rotulo="Ocupação" valor={pct(taxaOcupacaoCloudbeds(metrica?.occupancy_percentage), 2)} sub={metrica ? "Taxa informada pelo Cloudbeds" : "Taxa indisponível"} onClick={() => setDetalhe({ titulo: `Ocupação · ${u}`, descricao: "Cloudbeds · operação de hoje", conteudo: <div className="space-y-3"><p className="text-2xl font-bold">{pct(taxaOcupacaoCloudbeds(metrica?.occupancy_percentage), 2)}</p><p>Ocupação informada pelo Cloudbeds, sem inferir presença pelo nome do hóspede.</p><Kpi rotulo="Abrir operação" valor="Ver quartos na Gestão" to="/gestao" unidade={u} /></div> })} />
                  <Kpi rotulo="Chegadas" valor={r.chegadas} onClick={() => abrir(u, "Chegadas", (r) => !!r.next_guest_name)} />
                  <Kpi rotulo="Saídas" valor={r.saidas} onClick={() => abrir(u, "Saídas", (r) => !!r.departing_guest_name)} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  {[
                    ["Prontos", r.prontos, "text-emerald-700"],
                    ["Em faxina", r.emFaxina, "text-amber-700"],
                    ["Sujos", r.sujos, "text-red-600"],
                    ["Bloqueados", r.bloqueados, "text-slate-600"],
                  ].map(([rotulo, v, cor]) => (
                    <Button variant="outline" key={rotulo as string} className="h-auto flex-col gap-0 py-1.5" onClick={() => abrir(u, String(rotulo), (r) => situacaoQuarto(r) === ({ Prontos: "prontos", "Em faxina": "emFaxina", Sujos: "sujos", Bloqueados: "bloqueados" }[String(rotulo)]))}>
                      <p className={`text-base font-black ${cor}`}>{v}</p>
                      <p className="text-[10px] font-semibold uppercase text-slate-500">{rotulo}</p>
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Kpi rotulo="A receber no balcão" valor={brl.format(r.aReceber)} sub={`${r.comSaldo} quarto(s) com saldo`} tom={r.aReceber > 0 ? "ruim" : undefined} onClick={() => abrir(u, "A receber no balcão", (r) => r.has_pending_payment === true)} />
                  <Kpi rotulo="Docs pendentes" valor={r.docsPendentes} sub="falta check-in online" onClick={() => abrir(u, "Docs pendentes", (r) => r.has_pending_docs === true)} />
                </div>
              </Cartao>
            );
          })}
        </div>
      )}
      <EscalaHojeCard />
      <PrevisaoCargaCard />
      <DetalhesPainel detalhe={detalhe} fechar={() => setDetalhe(null)} />
    </Secao>
  );
}
