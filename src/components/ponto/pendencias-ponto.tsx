import { useEffect, useState } from "react";
import { Check, ImageOff, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  MOTIVO_LABEL,
  TIPO_LABEL,
  dataBR,
  horaSP,
  urlSelfie,
  usePendenciasPonto,
  useRevisarBatida,
  type BatidaGestor,
} from "@/lib/ponto";

function Selfie({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void urlSelfie(path).then((u) => vivo && setUrl(u));
    return () => {
      vivo = false;
    };
  }, [path]);
  if (!path)
    return (
      <div className="grid h-24 w-20 place-items-center rounded-lg bg-slate-100 text-slate-400">
        <ImageOff className="h-5 w-5" />
      </div>
    );
  if (!url)
    return (
      <div className="grid h-24 w-20 place-items-center rounded-lg bg-slate-100">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Selfie da batida" className="h-24 w-20 rounded-lg object-cover" />
    </a>
  );
}

function PendenciaItem({ b }: { b: BatidaGestor }) {
  const revisar = useRevisarBatida();
  const [obs, setObs] = useState("");
  const decidir = (aprovar: boolean) =>
    revisar.mutate(
      { id: b.id, aprovar, observacao: obs },
      {
        onSuccess: () => toast.success(aprovar ? "Batida aprovada" : "Batida recusada"),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  return (
    <Card className="flex gap-3 p-3">
      <Selfie path={b.selfie_path} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong>{b.escala_colaboradores?.nome ?? "—"}</strong>
          <Badge variant="outline">{TIPO_LABEL[b.tipo]}</Badge>
          <span className="text-xs text-slate-500">
            {dataBR(b.data_ref)} · {horaSP(b.registrado_em)} · {b.unidade}
            {b.origem === "quiosque" ? " · recepção" : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {b.motivos.map((m) => (
            <Badge key={m} className="bg-amber-100 text-amber-800 hover:bg-amber-100">
              {MOTIVO_LABEL[m] ?? m}
            </Badge>
          ))}
        </div>
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {b.distancia_m != null && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {Math.round(b.distancia_m)} m da unidade
              {b.precisao_m ? ` (±${Math.round(b.precisao_m)} m)` : ""}
            </span>
          )}
          {b.face_distancia != null && (
            <span>
              diferença do rosto: {Number(b.face_distancia).toFixed(2)} (quanto menor, mais
              parecido)
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observação (opcional)"
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
      </div>
    </Card>
  );
}

export function PendenciasPonto() {
  const q = usePendenciasPonto();
  if (q.isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (q.error) return <p className="text-sm text-rose-600">{(q.error as Error).message}</p>;
  if (!q.data?.length)
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Nenhuma batida pendente.
      </Card>
    );
  return (
    <div className="space-y-2">
      {q.data.map((b) => (
        <PendenciaItem key={b.id} b={b} />
      ))}
    </div>
  );
}
