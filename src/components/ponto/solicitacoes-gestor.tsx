import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIPO_LABEL, dataBR, horaSP } from "@/lib/ponto";
import {
  COR_STATUS_SOLICITACAO,
  STATUS_SOLICITACAO_LABEL,
  TIPO_SOLICITACAO_LABEL,
  useRevisarSolicitacao,
  useSolicitacoesGestor,
  type Solicitacao,
} from "@/lib/ponto-mensal";
import { cn } from "@/lib/utils";

const horaLocal = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso))
    : "";

function ItemPendente({ s }: { s: Solicitacao }) {
  const revisar = useRevisarSolicitacao();
  const [resposta, setResposta] = useState("");
  const [abonar, setAbonar] = useState(s.pede_abono);
  const [hora, setHora] = useState(horaLocal(s.horario));
  const [unidade, setUnidade] = useState<string>(s.unidade ?? "Botafogo");

  const decidir = (aprovar: boolean) => {
    if (!aprovar && !resposta.trim()) return toast.error("Escreva o motivo da recusa.");
    const esqueci = s.tipo === "esqueci_batida";
    if (aprovar && esqueci && !hora) return toast.error("Informe o horário.");
    revisar.mutate(
      {
        id: s.id,
        aprovar,
        resposta,
        abonar: s.tipo === "justificativa" ? abonar : null,
        unidade: esqueci ? unidade : null,
        horario: esqueci && hora ? `${s.data}T${hora}:00-03:00` : null,
      },
      {
        onSuccess: () =>
          toast.success(
            !aprovar
              ? "Pedido recusado"
              : esqueci
                ? "Aprovado · batida lançada"
                : abonar
                  ? "Aprovado · dia abonado no banco de horas"
                  : "Justificativa aprovada (sem abono)",
          ),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Card className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{s.escala_colaboradores?.nome ?? "—"}</strong>
        <Badge variant="outline">{TIPO_SOLICITACAO_LABEL[s.tipo]}</Badge>
        <span className="text-sm text-slate-600">
          {dataBR(s.data)}
          {s.tipo === "esqueci_batida" && s.tipo_batida
            ? ` · ${TIPO_LABEL[s.tipo_batida]} às ${horaSP(s.horario)}`
            : ""}
        </span>
        {s.pede_abono && (
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">pede abono</Badge>
        )}
      </div>
      <p className="text-sm text-slate-700">“{s.motivo}”</p>
      <div className="flex flex-wrap items-center gap-2">
        {s.tipo === "esqueci_batida" && (
          <>
            <Input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="h-8 w-28 text-xs"
              title="Horário que será lançado"
            />
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Botafogo">Botafogo</SelectItem>
                <SelectItem value="Ipanema">Ipanema</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        {s.tipo === "justificativa" && (
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={abonar} onCheckedChange={(v) => setAbonar(v === true)} />
            Abonar (não descontar do banco)
          </label>
        )}
        <Input
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          placeholder="Resposta (obrigatória para recusar)"
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

export function SolicitacoesGestor() {
  const q = useSolicitacoesGestor();
  if (q.isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (q.error) return <p className="text-sm text-rose-600">{(q.error as Error).message}</p>;
  const pendentes = (q.data ?? []).filter((s) => s.status === "pendente");
  const historico = (q.data ?? []).filter((s) => s.status !== "pendente");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pedidos feitos pelo funcionário na tela Bater Ponto. Aprovar “Esqueci de bater” lança a
        batida (você pode corrigir o horário e a unidade antes). Aprovar uma justificativa com abono
        faz o dia não descontar do banco de horas.
      </p>
      {pendentes.length ? (
        <div className="space-y-2">
          {pendentes.map((s) => (
            <ItemPendente key={s.id} s={s} />
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhum pedido aguardando.
        </Card>
      )}
      {!!historico.length && (
        <Card className="p-4">
          <p className="mb-1 text-xs font-bold uppercase text-slate-500">Histórico</p>
          <ul>
            {historico.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 border-t py-2 text-sm first:border-t-0"
              >
                <span className="min-w-[8rem] font-semibold">
                  {s.escala_colaboradores?.nome ?? "—"}
                </span>
                <span className="text-slate-600">
                  {dataBR(s.data)} · {TIPO_SOLICITACAO_LABEL[s.tipo]}
                  {s.tipo === "esqueci_batida" && s.tipo_batida
                    ? ` (${TIPO_LABEL[s.tipo_batida].toLowerCase()} ${horaSP(s.horario)})`
                    : ""}
                  {s.abonado ? " · abonado" : ""}
                </span>
                <Badge variant="outline" className={cn(COR_STATUS_SOLICITACAO[s.status])}>
                  {STATUS_SOLICITACAO_LABEL[s.status]}
                </Badge>
                {s.resposta && <span className="text-xs text-slate-500">{s.resposta}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
