import { useState } from "react";
import { Check, ExternalLink, Loader2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dataBR } from "@/lib/ponto";
import {
  COR_STATUS_ATESTADO,
  STATUS_ATESTADO_LABEL,
  urlArquivoPonto,
  useAtestadosGestor,
  useCancelarAtestado,
  useRevisarAtestado,
  type Atestado,
} from "@/lib/ponto-gestao";
import { cn } from "@/lib/utils";

const periodo = (a: Atestado) => {
  const dias =
    Math.round(
      (Date.parse(`${a.data_fim}T12:00:00Z`) - Date.parse(`${a.data_inicio}T12:00:00Z`)) / 86400000,
    ) + 1;
  return a.data_inicio === a.data_fim
    ? `${dataBR(a.data_inicio)} (1 dia)`
    : `${dataBR(a.data_inicio)} a ${dataBR(a.data_fim)} (${dias} dias)`;
};

function AbrirArquivo({ a }: { a: Atestado }) {
  const [abrindo, setAbrindo] = useState(false);
  const abrir = async () => {
    // Abre a aba antes do await para o navegador do celular não bloquear
    const aba = window.open("", "_blank");
    setAbrindo(true);
    try {
      const url = await urlArquivoPonto(a.arquivo_path);
      if (aba) aba.location.href = url;
      else window.location.href = url;
    } catch (e) {
      aba?.close();
      toast.error((e as Error).message);
    } finally {
      setAbrindo(false);
    }
  };
  return (
    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={abrir} disabled={abrindo}>
      {abrindo ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ExternalLink className="h-4 w-4" />
      )}
      Ver atestado
    </Button>
  );
}

function ItemPendente({ a }: { a: Atestado }) {
  const revisar = useRevisarAtestado();
  const [resposta, setResposta] = useState("");
  const decidir = (aprovar: boolean) => {
    if (!aprovar && !resposta.trim()) return toast.error("Escreva o motivo da recusa.");
    revisar.mutate(
      { id: a.id, aprovar, resposta },
      {
        onSuccess: (r) =>
          toast.success(
            aprovar
              ? `Atestado aprovado · ${r.dias_alterados} dia(s) da escala marcados como atestado`
              : "Atestado recusado",
          ),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };
  return (
    <Card className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{a.escala_colaboradores?.nome ?? "—"}</strong>
        <span className="text-sm text-slate-600">{periodo(a)}</span>
        <span className="text-xs text-slate-400">
          enviado em{" "}
          {new Date(a.enviado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </span>
      </div>
      {a.observacao && <p className="text-sm text-slate-600">“{a.observacao}”</p>}
      <div className="flex flex-wrap items-center gap-2">
        <AbrirArquivo a={a} />
        <Input
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          placeholder="Observação (obrigatória para recusar)"
          className="h-8 max-w-xs text-xs"
        />
        <Button
          size="sm"
          className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
          disabled={revisar.isPending}
          onClick={() => decidir(true)}
        >
          <Check className="h-4 w-4" />
          Aprovar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 border-rose-300 text-rose-700"
          disabled={revisar.isPending}
          onClick={() => decidir(false)}
        >
          <X className="h-4 w-4" />
          Recusar
        </Button>
      </div>
    </Card>
  );
}

function ItemHistorico({ a }: { a: Atestado }) {
  const cancelar = useCancelarAtestado();
  const desfazer = () => {
    const motivo = window.prompt(
      "Cancelar este atestado? Os dias voltam a ser como estavam na escala.\n\nMotivo do cancelamento:",
    );
    if (motivo == null) return;
    if (!motivo.trim()) return toast.error("Informe o motivo do cancelamento.");
    cancelar.mutate(
      { id: a.id, motivo },
      {
        onSuccess: (r) =>
          toast.success(`Atestado cancelado · ${r.dias_restaurados} dia(s) restaurados na escala`),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };
  return (
    <li className="flex flex-wrap items-center gap-2 border-t py-2 text-sm first:border-t-0">
      <span className="min-w-[8rem] font-semibold">{a.escala_colaboradores?.nome ?? "—"}</span>
      <span className="text-slate-600">{periodo(a)}</span>
      <Badge variant="outline" className={cn(COR_STATUS_ATESTADO[a.status])}>
        {STATUS_ATESTADO_LABEL[a.status]}
      </Badge>
      {a.resposta && <span className="text-xs text-slate-500">{a.resposta}</span>}
      <span className="ml-auto flex gap-1">
        <AbrirArquivo a={a} />
        {a.status === "aprovado" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-slate-600"
            onClick={desfazer}
            disabled={cancelar.isPending}
          >
            <Undo2 className="h-4 w-4" />
            Cancelar
          </Button>
        )}
      </span>
    </li>
  );
}

export function AtestadosGestor() {
  const q = useAtestadosGestor();
  if (q.isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (q.error) return <p className="text-sm text-rose-600">{(q.error as Error).message}</p>;
  const pendentes = (q.data ?? []).filter((a) => a.status === "pendente");
  const historico = (q.data ?? []).filter((a) => a.status !== "pendente");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        O funcionário envia o atestado pela tela Bater Ponto. Ao aprovar, os dias de trabalho (e
        faltas) da escala no período viram “atestado”: não contam como falta nem descontam do banco
        de horas.
      </p>
      {pendentes.length ? (
        <div className="space-y-2">
          {pendentes.map((a) => (
            <ItemPendente key={a.id} a={a} />
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhum atestado aguardando aprovação.
        </Card>
      )}
      {!!historico.length && (
        <Card className="p-4">
          <p className="mb-1 text-xs font-bold uppercase text-slate-500">Histórico</p>
          <ul>
            {historico.map((a) => (
              <ItemHistorico key={a.id} a={a} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
