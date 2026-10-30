import { useState } from "react";
import { CheckCircle2, Download, Loader2, Lock, LockOpen, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { baixarCsv, csvContador, resumoFechamento } from "@/lib/ponto-export";
import { useBancoHoras } from "@/lib/ponto-gestao";
import {
  fimDoMes,
  mesAnterior,
  mesBR,
  useFecharMes,
  usePendenciasDoMes,
  useReabrirMes,
} from "@/lib/ponto-mensal";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

function Item({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li
      className={cn("flex items-center gap-2 text-sm", ok ? "text-emerald-700" : "text-amber-700")}
    >
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
      {texto}
    </li>
  );
}

export function FechamentoPonto() {
  const mesAtual = todaySP().slice(0, 7);
  const [mes, setMes] = useState(mesAnterior(mesAtual));
  const banco = useBancoHoras(`${mes}-01`, fimDoMes(mes));
  const pend = usePendenciasDoMes(mes);
  const fechar = useFecharMes();
  const reabrir = useReabrirMes();

  const pessoas = banco.data?.pessoas ?? [];
  const fechamento = banco.data?.fechamento ?? null;
  const incompletos = pessoas.reduce((t, p) => t + p.diasIncompletos, 0);
  const cientes = pessoas.filter((p) => p.ciencia).length;
  const encerrado = mes < mesAtual;

  const baixar = () => baixarCsv(csvContador(pessoas), `ponto-contador-${mes}.csv`);

  const fecharMes = () => {
    const avisos = [
      pend.data?.batidas ? `${pend.data.batidas} batida(s) pendente(s)` : null,
      pend.data?.pedidos ? `${pend.data.pedidos} pedido(s) sem resposta` : null,
      pend.data?.atestados ? `${pend.data.atestados} atestado(s) sem resposta` : null,
      incompletos ? `${incompletos} dia(s) com batidas incompletas` : null,
    ].filter(Boolean);
    const texto =
      `Fechar ${mesBR(mes)}? Depois disso, lançamentos, revisões, ajustes do banco e pedidos ` +
      `desse mês ficam travados (as batidas em tempo real continuam entrando).` +
      (avisos.length ? `\n\nAinda há: ${avisos.join(", ")}.` : "");
    if (!window.confirm(texto)) return;
    fechar.mutate(
      { mes, resumo: resumoFechamento(pessoas) },
      {
        onSuccess: () => {
          toast.success(`${mesBR(mes)} fechado`);
          baixar();
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  const reabrirMes = () => {
    const motivo = window.prompt(`Reabrir ${mesBR(mes)}? Informe o motivo:`);
    if (motivo == null) return;
    if (!motivo.trim()) return toast.error("Informe o motivo para reabrir.");
    reabrir.mutate(
      { mes, motivo },
      {
        onSuccess: () => toast.success(`${mesBR(mes)} reaberto`),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <Label className="text-xs">Mês</Label>
          <Input
            type="month"
            value={mes}
            max={mesAtual}
            onChange={(e) => e.target.value && setMes(e.target.value)}
            className="w-44"
          />
        </div>
        <Button
          variant="outline"
          className="ml-auto gap-2"
          disabled={!pessoas.length}
          onClick={baixar}
        >
          <Download className="h-4 w-4" />
          Planilha do contador
        </Button>
      </Card>

      {banco.isLoading || pend.isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      ) : banco.error || pend.error ? (
        <p className="text-sm text-rose-600">{((banco.error ?? pend.error) as Error).message}</p>
      ) : (
        <>
          <Card className="space-y-3 p-4">
            <p className="flex items-center gap-2 font-semibold">
              {fechamento ? (
                <>
                  <Lock className="h-4 w-4" />
                  {mesBR(mes)} fechado em{" "}
                  {new Date(fechamento.fechado_em).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </>
              ) : (
                <>
                  <LockOpen className="h-4 w-4" />
                  {mesBR(mes)} aberto
                </>
              )}
            </p>
            <ul className="space-y-1">
              <Item
                ok={!pend.data?.batidas}
                texto={`Batidas pendentes de conferência: ${pend.data?.batidas ?? 0}`}
              />
              <Item
                ok={!pend.data?.pedidos}
                texto={`Pedidos do funcionário sem resposta: ${pend.data?.pedidos ?? 0}`}
              />
              <Item
                ok={!pend.data?.atestados}
                texto={`Atestados sem resposta: ${pend.data?.atestados ?? 0}`}
              />
              <Item ok={!incompletos} texto={`Dias com batidas incompletas: ${incompletos}`} />
              <Item
                ok={!pessoas.length || cientes === pessoas.length}
                texto={`Ciência do espelho: ${cientes} de ${pessoas.length} funcionário(s)`}
              />
            </ul>
            {!encerrado ? (
              <p className="text-sm text-muted-foreground">
                O mês só pode ser fechado depois que terminar.
              </p>
            ) : fechamento ? (
              <Button
                variant="outline"
                className="gap-2"
                onClick={reabrirMes}
                disabled={reabrir.isPending}
              >
                <LockOpen className="h-4 w-4" />
                Reabrir {mesBR(mes)}
              </Button>
            ) : (
              <Button className="gap-2" onClick={fecharMes} disabled={fechar.isPending}>
                <Lock className="h-4 w-4" />
                Fechar {mesBR(mes)} e baixar a planilha
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Recomendado: resolver as pendências, esperar a ciência dos funcionários (eles
              confirmam em Bater Ponto › Meu espelho) e então fechar. A planilha traz, por pessoa,
              horas trabalhadas, extras 50% e 100%, noturno (real e em hora reduzida), débitos,
              faltas, abonos, alertas de jornada e saldo do banco.
            </p>
          </Card>

          {!!pend.data?.log.length && (
            <Card className="p-4">
              <p className="mb-1 text-xs font-bold uppercase text-slate-500">Histórico</p>
              <ul className="space-y-1 text-sm">
                {pend.data.log.map((l) => (
                  <li key={l.id}>
                    {new Date(l.feito_em).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}{" "}
                    · {l.acao === "fechou" ? "Fechado" : "Reaberto"}
                    {l.motivo ? ` — ${l.motivo}` : ""}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
