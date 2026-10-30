import { useState } from "react";
import { ClipboardList, Loader2, MessageSquareText, TimerOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TIPO_LABEL, dataBR, horaSP, type TipoBatida } from "@/lib/ponto";
import {
  COR_STATUS_SOLICITACAO,
  STATUS_SOLICITACAO_LABEL,
  TIPO_SOLICITACAO_LABEL,
  useMinhasSolicitacoes,
  useSolicitar,
  type TipoSolicitacao,
} from "@/lib/ponto-mensal";
import { addCivilDays } from "@/lib/escala-engine";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

/** Funcionário: "esqueci de bater" e justificativa de atraso/falta, para o gestor aprovar. */
export function MeusPedidos() {
  const lista = useMinhasSolicitacoes();
  const solicitar = useSolicitar();
  const hoje = todaySP();
  const [tipo, setTipo] = useState<TipoSolicitacao | null>(null);
  const [data, setData] = useState(hoje);
  const [tipoBatida, setTipoBatida] = useState<TipoBatida>("saida");
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pedeAbono, setPedeAbono] = useState(true);

  const fechar = () => {
    setTipo(null);
    setMotivo("");
    setHora("");
    setData(hoje);
  };

  const enviar = () => {
    if (!tipo) return;
    if (tipo === "esqueci_batida" && !hora) return toast.error("Informe o horário.");
    if (!motivo.trim()) return toast.error("Explique o motivo.");
    solicitar.mutate(
      {
        tipo,
        data,
        tipoBatida: tipo === "esqueci_batida" ? tipoBatida : null,
        hora: tipo === "esqueci_batida" ? hora : null,
        motivo,
        pedeAbono: tipo === "justificativa" && pedeAbono,
      },
      {
        onSuccess: () => {
          toast.success("Pedido enviado. O gestor vai conferir.");
          fechar();
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Card className="space-y-3 p-4">
      <p className="flex items-center gap-2 text-sm font-bold">
        <ClipboardList className="h-4 w-4 text-sky-600" />
        Pedidos ao gestor
      </p>

      {!tipo ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" className="gap-2" onClick={() => setTipo("esqueci_batida")}>
            <TimerOff className="h-4 w-4" />
            Esqueci de bater
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setTipo("justificativa")}>
            <MessageSquareText className="h-4 w-4" />
            Justificar atraso ou falta
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-semibold">{TIPO_SOLICITACAO_LABEL[tipo]}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className={tipo === "justificativa" ? "col-span-2" : undefined}>
              <Label className="text-xs">Dia</Label>
              <Input
                type="date"
                value={data}
                max={hoje}
                min={addCivilDays(hoje, -31)}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            {tipo === "esqueci_batida" && (
              <div>
                <Label className="text-xs">Horário em que bateria</Label>
                <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </div>
            )}
          </div>
          {tipo === "esqueci_batida" && (
            <div>
              <Label className="text-xs">Qual batida</Label>
              <Select value={tipoBatida} onValueChange={(v) => setTipoBatida(v as TipoBatida)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABEL) as TipoBatida[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Motivo</Label>
            <Textarea
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                tipo === "esqueci_batida"
                  ? "Ex.: celular descarregou, saí às 17h05"
                  : "Ex.: ônibus quebrou; consulta médica sem atestado"
              }
            />
          </div>
          {tipo === "justificativa" && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={pedeAbono} onCheckedChange={(v) => setPedeAbono(v === true)} />
              <span>Peço que não desconte do banco de horas (abono)</span>
            </label>
          )}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={enviar} disabled={solicitar.isPending}>
              {solicitar.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Enviar
            </Button>
            <Button variant="ghost" onClick={fechar} disabled={solicitar.isPending}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {lista.error ? (
        <p className="text-xs text-rose-600">{(lista.error as Error).message}</p>
      ) : lista.data?.length ? (
        <ul className="space-y-1 text-sm">
          {lista.data.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-2">
              <span>
                {dataBR(s.data)} · {TIPO_SOLICITACAO_LABEL[s.tipo]}
                {s.tipo === "esqueci_batida" && s.tipo_batida
                  ? ` (${TIPO_LABEL[s.tipo_batida].toLowerCase()} ${horaSP(s.horario)})`
                  : ""}
                {s.status === "aprovada" && s.abonado && (
                  <span className="text-xs text-emerald-700"> · abonado</span>
                )}
                {s.resposta && <span className="block text-xs text-slate-500">{s.resposta}</span>}
              </span>
              <Badge variant="outline" className={cn("shrink-0", COR_STATUS_SOLICITACAO[s.status])}>
                {STATUS_SOLICITACAO_LABEL[s.status]}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        !tipo && (
          <p className="text-xs text-muted-foreground">
            Esqueceu de bater ou chegou atrasado? Avise o gestor por aqui.
          </p>
        )
      )}
    </Card>
  );
}
