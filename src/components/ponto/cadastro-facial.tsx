import { useState } from "react";
import { Loader2, ScanFace, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FaceCapture } from "@/components/ponto/face-capture";
import { getDeviceId } from "@/lib/ponto-face";
import {
  CONSENTIMENTO_TEXTO,
  dataBR,
  useCadastrarBiometria,
  useColaboradoresPonto,
  useRemoverBiometria,
  useVincularAparelho,
} from "@/lib/ponto";

type Colab = NonNullable<ReturnType<typeof useColaboradoresPonto>["data"]>[number];

export function CadastroFacial() {
  const q = useColaboradoresPonto();
  const remover = useRemoverBiometria();
  const vincular = useVincularAparelho();
  const [alvo, setAlvo] = useState<Colab | null>(null);

  if (q.isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (q.error) return <p className="text-sm text-rose-600">{(q.error as Error).message}</p>;

  const esteAparelho = getDeviceId();
  return (
    <div className="space-y-3">
      <Card className="space-y-1 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Como cadastrar</p>
        <p>
          1. Abra esta tela <strong>no celular da empresa que a pessoa vai usar</strong> (assim o
          aparelho já fica vinculado).
        </p>
        <p>
          2. Leia o termo para a pessoa, marque o consentimento e capture o rosto (ela mexe
          levemente a cabeça).
        </p>
        <p>3. Freelancers: cadastre no aparelho da recepção — eles batem o ponto por lá.</p>
      </Card>
      <div className="grid gap-2 sm:grid-cols-2">
        {(q.data ?? []).map((c) => (
          <Card key={c.id} className="space-y-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{c.nome}</p>
                <p className="text-xs text-slate-500">
                  {c.setor} · {c.unidade} · {c.vinculo}
                  {!c.funcionario_id && c.vinculo === "fixo" ? " · sem login no app" : ""}
                </p>
              </div>
              {c.biometria ? (
                <Badge className="bg-emerald-600">Cadastrado</Badge>
              ) : (
                <Badge variant="outline">Sem cadastro</Badge>
              )}
            </div>
            {c.biometria && (
              <p className="text-xs text-slate-500">
                Consentimento em {dataBR(c.biometria.consentimento_em)} ·{" "}
                {c.biometria.device_id
                  ? c.biometria.device_id === esteAparelho
                    ? "vinculado a este aparelho"
                    : "vinculado a outro aparelho"
                  : "sem aparelho vinculado"}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={c.biometria ? "outline" : "default"}
                className="gap-1"
                onClick={() => setAlvo(c)}
              >
                <ScanFace className="h-4 w-4" />
                {c.biometria ? "Refazer cadastro" : "Cadastrar rosto"}
              </Button>
              {c.biometria && c.vinculo === "fixo" && c.biometria.device_id !== esteAparelho && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() =>
                    vincular.mutate(
                      { colaboradorId: c.id, deviceId: esteAparelho },
                      {
                        onSuccess: () => toast.success("Aparelho vinculado"),
                        onError: (e) => toast.error((e as Error).message),
                      },
                    )
                  }
                >
                  <Smartphone className="h-4 w-4" />
                  Vincular este aparelho
                </Button>
              )}
              {c.biometria && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-rose-600"
                  onClick={() => {
                    if (
                      !confirm(
                        `Apagar o cadastro facial de ${c.nome}? Ele(a) precisará cadastrar de novo para bater o ponto sem pendência.`,
                      )
                    )
                      return;
                    remover.mutate(c.id, {
                      onSuccess: () => toast.success("Cadastro facial apagado"),
                      onError: (e) => toast.error((e as Error).message),
                    });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Apagar
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      {alvo && <CadastroDialog colab={alvo} onClose={() => setAlvo(null)} />}
    </div>
  );
}

function CadastroDialog({ colab, onClose }: { colab: Colab; onClose: () => void }) {
  const cadastrar = useCadastrarBiometria();
  const [consentimento, setConsentimento] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const salvar = (descritores: number[][]) =>
    cadastrar.mutate(
      {
        colaboradorId: colab.id,
        descritores,
        deviceId: colab.vinculo === "fixo" ? getDeviceId() : null,
        consentimento,
      },
      {
        onSuccess: () => {
          toast.success(`Rosto de ${colab.nome} cadastrado`);
          onClose();
        },
        onError: (e) => {
          toast.error((e as Error).message);
          setCapturando(false);
        },
      },
    );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastro facial — {colab.nome}</DialogTitle>
          <DialogDescription>
            Só o modelo numérico do rosto é guardado. Nenhuma foto é salva no cadastro.
          </DialogDescription>
        </DialogHeader>
        {!capturando ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-slate-50 p-3 text-sm leading-relaxed">
              {CONSENTIMENTO_TEXTO}
            </p>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={consentimento}
                onCheckedChange={(v) => setConsentimento(v === true)}
              />
              <span>
                {colab.nome} leu e concorda com o termo acima. (Guarde também o termo assinado em
                papel.)
              </span>
            </label>
            <Button
              className="w-full"
              disabled={!consentimento}
              onClick={() => setCapturando(true)}
            >
              Iniciar captura
            </Button>
          </div>
        ) : cadastrar.isPending ? (
          <Loader2 className="mx-auto h-8 w-8 animate-spin" />
        ) : (
          <FaceCapture
            modo="cadastro"
            amostras={5}
            onAmostras={salvar}
            onCancelar={() => setCapturando(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
