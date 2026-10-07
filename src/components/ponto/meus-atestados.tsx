import { useRef, useState } from "react";
import { FileHeart, Loader2, Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dataBR } from "@/lib/ponto";
import {
  ARQUIVO_ATESTADO_MAX_MB,
  COR_STATUS_ATESTADO,
  STATUS_ATESTADO_LABEL,
  TIPOS_ATESTADO,
  useEnviarAtestado,
  useMeusAtestados,
} from "@/lib/ponto-gestao";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

/** Funcionário envia o atestado médico (foto ou PDF) para o gestor aprovar. */
export function MeusAtestados() {
  const lista = useMeusAtestados();
  const enviar = useEnviarAtestado();
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState(todaySP());
  const [fim, setFim] = useState(todaySP());
  const [obs, setObs] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const limpar = () => {
    setArquivo(null);
    setObs("");
    setInicio(todaySP());
    setFim(todaySP());
    if (inputRef.current) inputRef.current.value = "";
  };

  const salvar = () => {
    if (!arquivo) return toast.error("Anexe a foto ou o PDF do atestado.");
    if (fim < inicio) return toast.error("A data final é antes da data inicial.");
    enviar.mutate(
      { arquivo, dataInicio: inicio, dataFim: fim, observacao: obs },
      {
        onSuccess: () => {
          toast.success("Atestado enviado. O gestor vai conferir.");
          limpar();
          setAberto(false);
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold">
          <FileHeart className="h-4 w-4 text-rose-500" />
          Atestado médico
        </p>
        {!aberto && (
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setAberto(true)}>
            <Paperclip className="h-4 w-4" />
            Enviar atestado
          </Button>
        )}
      </div>

      {aberto && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Primeiro dia</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Último dia</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Foto ou PDF do atestado</Label>
            <Input
              ref={inputRef}
              type="file"
              accept={TIPOS_ATESTADO}
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Até {ARQUIVO_ATESTADO_MAX_MB} MB. A foto precisa mostrar o nome, a data e o carimbo do
              médico.
            </p>
          </div>
          <div>
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              placeholder="Ex.: consulta pela manhã, voltei à tarde"
            />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 gap-1" onClick={salvar} disabled={enviar.isPending}>
              {enviar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Enviar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                limpar();
                setAberto(false);
              }}
              disabled={enviar.isPending}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {lista.error ? (
        <p className="text-xs text-rose-600">{(lista.error as Error).message}</p>
      ) : lista.data?.length ? (
        <ul className="space-y-1 text-sm">
          {lista.data.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2">
              <span>
                {a.data_inicio === a.data_fim
                  ? dataBR(a.data_inicio)
                  : `${dataBR(a.data_inicio)} a ${dataBR(a.data_fim)}`}
                {a.resposta && a.status !== "aprovado" && (
                  <span className="block text-xs text-slate-500">{a.resposta}</span>
                )}
              </span>
              <Badge variant="outline" className={cn("shrink-0", COR_STATUS_ATESTADO[a.status])}>
                {STATUS_ATESTADO_LABEL[a.status]}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        !aberto && (
          <p className="text-xs text-muted-foreground">
            Faltou por motivo de saúde? Envie o atestado por aqui.
          </p>
        )
      )}
    </Card>
  );
}
