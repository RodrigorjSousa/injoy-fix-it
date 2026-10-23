import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  averageDescriptor,
  captureSelfie,
  euclidean,
  loadFaceApi,
  readFace,
} from "@/lib/ponto-face";

export type VerificacaoResultado = {
  descritor: number[] | null;
  vivacidade: boolean;
  selfie: Blob | null;
};

type Props =
  | { modo: "verificar"; onResultado: (r: VerificacaoResultado) => void; onCancelar?: () => void }
  | {
      modo: "cadastro";
      amostras?: number;
      onAmostras: (descritores: number[][]) => void;
      onCancelar?: () => void;
    };

type Fase = "carregando" | "posicione" | "capturando" | "pronto" | "erro";

export function FaceCapture(props: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const ativoRef = useRef(true);
  const [fase, setFase] = useState<Fase>("carregando");
  const [mensagem, setMensagem] = useState("Preparando câmera e reconhecimento…");
  const [progresso, setProgresso] = useState(0);
  const ultimaLeitura = useRef<number[] | null>(null);
  const finalizadoRef = useRef(false);

  const verificar = props.modo === "verificar";

  const pararCamera = useCallback(() => {
    if (loopRef.current) window.clearTimeout(loopRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const iniciar = useCallback(async () => {
    finalizadoRef.current = false;
    setProgresso(0);
    setFase("carregando");
    setMensagem("Preparando câmera e reconhecimento…");
    try {
      const [stream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        }),
        loadFaceApi(),
      ]);
      if (!ativoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setFase("posicione");
      setMensagem(
        verificar
          ? "Olhe para a câmera. A foto é tirada sozinha, ou toque em Registrar."
          : "Encaixe o rosto no círculo, com boa luz.",
      );
    } catch (error) {
      console.error("[ponto] câmera", error);
      setFase("erro");
      setMensagem(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Permita o uso da câmera nas configurações do navegador para bater o ponto."
          : "Não foi possível abrir a câmera ou carregar o reconhecimento facial.",
      );
    }
  }, [verificar]);

  useEffect(() => {
    ativoRef.current = true;
    void iniciar();
    return () => {
      ativoRef.current = false;
      pararCamera();
    };
  }, [iniciar, pararCamera]);

  // Laço de leitura
  useEffect(() => {
    if (fase !== "posicione" && fase !== "capturando") return;
    const video = videoRef.current;
    if (!video) return;
    const amostras: number[][] = [];
    const total = props.modo === "cadastro" ? (props.amostras ?? 5) : 2;

    // Captura simples (sem prova de vida): foto + rosto lido, se houver
    const finalizarVerificacao = async () => {
      if (finalizadoRef.current || props.modo !== "verificar") return;
      finalizadoRef.current = true;
      const selfie = await captureSelfie(video);
      const descritor = amostras.length ? averageDescriptor(amostras) : ultimaLeitura.current;
      setFase("pronto");
      setMensagem("Pronto!");
      pararCamera();
      props.onResultado({ descritor, vivacidade: false, selfie });
    };

    const passo = async () => {
      if (!ativoRef.current || finalizadoRef.current) return;
      try {
        const leitura = await readFace(video);
        if (!leitura) {
          setMensagem("Rosto não encontrado. Olhe para a câmera.");
        } else if (!leitura.centered) {
          ultimaLeitura.current = leitura.descriptor;
          setMensagem("Aproxime e centralize o rosto no círculo.");
        } else {
          ultimaLeitura.current = leitura.descriptor;
          if (props.modo === "verificar") {
            setFase("capturando");
            setMensagem("Segure um instante…");
            amostras.push(leitura.descriptor);
            setProgresso(Math.round((amostras.length / total) * 100));
            if (amostras.length >= total) return void finalizarVerificacao();
          } else {
            // Cadastro: amostras espaçadas e diferentes entre si (leve movimento)
            const ultima = amostras[amostras.length - 1];
            if (!ultima || euclidean(ultima, leitura.descriptor) > 0.04) {
              amostras.push(leitura.descriptor);
              setProgresso(Math.round((amostras.length / total) * 100));
              setFase("capturando");
              setMensagem(
                amostras.length < total
                  ? "Mexa levemente a cabeça (um pouco para os lados, para cima e para baixo)."
                  : "Cadastro capturado!",
              );
              if (amostras.length >= total) {
                finalizadoRef.current = true;
                setFase("pronto");
                pararCamera();
                props.onAmostras(amostras);
                return;
              }
            }
          }
        }
      } catch (error) {
        console.warn("[ponto] leitura", error);
      }
      loopRef.current = window.setTimeout(passo, props.modo === "cadastro" ? 450 : 120);
    };
    void passo();

    forcarRef.current = () => void finalizarVerificacao();
    return () => {
      if (loopRef.current) window.clearTimeout(loopRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase === "carregando" || fase === "erro" || fase === "pronto" ? fase : "rodando"]);

  const forcarRef = useRef<() => void>(() => undefined);

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl bg-slate-900">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full -scale-x-100 object-cover"
        />
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 h-[62%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-4 transition-colors",
            fase === "capturando" || fase === "pronto" ? "border-emerald-400" : "border-white/70",
          )}
        />
        {fase === "carregando" && (
          <div className="absolute inset-0 grid place-items-center bg-slate-900/70 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}
        {progresso > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-2 bg-white/20">
            <div className="h-2 bg-emerald-400 transition-all" style={{ width: `${progresso}%` }} />
          </div>
        )}
      </div>

      <p
        className={cn(
          "flex items-center justify-center gap-2 text-center text-sm font-semibold",
          fase === "erro" ? "text-rose-600" : "text-slate-700",
        )}
        aria-live="polite"
      >
        {fase === "erro" ? <Camera className="h-4 w-4" /> : <ScanFace className="h-4 w-4" />}
        {mensagem}
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        {fase === "erro" && (
          <Button variant="outline" onClick={() => void iniciar()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Tentar de novo
          </Button>
        )}
        {props.modo === "verificar" && (fase === "posicione" || fase === "capturando") && (
          <Button onClick={() => forcarRef.current()} className="gap-2">
            <Camera className="h-4 w-4" /> Registrar agora
          </Button>
        )}
        {props.onCancelar && fase !== "pronto" && (
          <Button
            variant="ghost"
            onClick={() => {
              pararCamera();
              props.onCancelar?.();
            }}
          >
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
