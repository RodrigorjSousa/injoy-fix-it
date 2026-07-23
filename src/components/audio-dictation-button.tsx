import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { transcribeAudio } from "@/lib/transcribe.functions";

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    reader.onload = () => {
      const s = String(reader.result ?? "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.readAsDataURL(blob);
  });

export function AudioDictationButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const transcribe = useServerFn(transcribeAudio);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = async () => {
    if (busy || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = mimeCandidates.find(
        (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m),
      );
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (blob.size < 1024) {
          toast.error("Gravação muito curta. Tente novamente.");
          return;
        }
        setBusy(true);
        try {
          const audioBase64 = await blobToBase64(blob);
          const { text } = await transcribe({ data: { audioBase64, mimeType: type } });
          const clean = (text || "").trim();
          if (!clean) {
            toast.error("Não foi possível entender o áudio.");
          } else {
            onTranscript(clean);
            toast.success("Áudio transcrito");
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha ao transcrever");
        } finally {
          setBusy(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      toast.error(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Permissão de microfone negada."
          : "Não foi possível acessar o microfone.",
      );
    }
  };

  const stop = () => {
    if (!recording) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={recording ? "destructive" : "outline"}
        size="sm"
        disabled={disabled || busy}
        onClick={recording ? stop : start}
        className={cn("gap-2", recording && "animate-pulse")}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Transcrevendo...
          </>
        ) : recording ? (
          <>
            <Square className="h-4 w-4" /> Parar ({mm}:{ss})
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" /> Gravar áudio
          </>
        )}
      </Button>
      {recording && (
        <span className="text-xs text-muted-foreground">
          Fale a descrição do chamado. Clique em parar para transcrever.
        </span>
      )}
    </div>
  );
}
