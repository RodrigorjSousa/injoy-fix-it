import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Megaphone, ImagePlus, Video, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compression";
import { cn } from "@/lib/utils";

type Unidade = "Botafogo" | "Ipanema";
type Setor = "manutencao" | "recepcao" | "camareiras";

const SETOR_LABEL: Record<Setor, string> = {
  manutencao: "Manutenção",
  recepcao: "Recepção",
  camareiras: "Camareiras",
};

export function RecadorGestorModal({
  open,
  onOpenChange,
  gestorNome,
  gestorId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  gestorNome: string;
  gestorId: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [setor, setSetor] = useState<Setor | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [midia, setMidia] = useState<{ file: File; tipo: "foto" | "video"; preview: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setUnidade(null);
      setSetor(null);
      setMensagem("");
      if (midia) URL.revokeObjectURL(midia.preview);
      setMidia(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const compressed = await compressImage(f);
      if (midia) URL.revokeObjectURL(midia.preview);
      setMidia({ file: compressed, tipo: "foto", preview: URL.createObjectURL(compressed) });
    } catch {
      toast.error("Não foi possível processar a foto.");
    }
  };

  const handleVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 60 * 1024 * 1024) {
      toast.error("Vídeo muito grande (máx. 60MB).");
      return;
    }
    const url = URL.createObjectURL(f);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      if (v.duration > 15.5) {
        URL.revokeObjectURL(url);
        toast.error(`O vídeo tem ${Math.round(v.duration)}s. O limite é 15 segundos.`);
        return;
      }
      if (midia) URL.revokeObjectURL(midia.preview);
      setMidia({ file: f, tipo: "video", preview: url });
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("Não foi possível ler o vídeo.");
    };
    v.src = url;
  };

  const removerMidia = () => {
    if (midia) URL.revokeObjectURL(midia.preview);
    setMidia(null);
  };

  const enviar = async () => {
    if (!unidade || !setor || !mensagem.trim()) {
      toast.error("Preencha unidade, setor e mensagem.");
      return;
    }
    setSaving(true);
    try {
      let midia_url: string | null = null;
      let midia_tipo: "foto" | "video" | null = null;
      if (midia) {
        const ext = midia.file.name.split(".").pop() || (midia.tipo === "foto" ? "jpg" : "mp4");
        const path = `${gestorId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("recados-midia")
          .upload(path, midia.file, { contentType: midia.file.type, upsert: false });
        if (upErr) throw upErr;
        midia_url = path;
        midia_tipo = midia.tipo;
      }
      const { error } = await supabase.from("recados_gestor").insert({
        gestor_id: gestorId,
        gestor_nome: gestorNome,
        unidade,
        setor,
        mensagem: mensagem.trim(),
        midia_url,
        midia_tipo,
      });
      if (error) throw error;
      toast.success(`Recado enviado para ${SETOR_LABEL[setor]} — ${unidade}.`);
      onOpenChange(false);
    } catch (err) {
      console.error("[RecadorGestor] erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao enviar recado.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-red-500" />
            Recado do Gestor
          </DialogTitle>
          <DialogDescription>
            Passo {step} de 3 · enviando como <strong>{gestorNome}</strong>
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <Label className="text-sm font-bold">1. Selecione a unidade</Label>
            <div className="grid grid-cols-2 gap-3">
              {(["Botafogo", "Ipanema"] as Unidade[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => {
                    setUnidade(u);
                    setStep(2);
                  }}
                  className={cn(
                    "rounded-xl border-2 p-5 font-black text-lg transition",
                    unidade === u
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-slate-200 hover:border-red-400 hover:bg-red-50/50",
                  )}
                >
                  🏢 {u}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Label className="text-sm font-bold">2. Selecione o setor destinatário</Label>
            <div className="grid gap-2">
              {(["manutencao", "recepcao", "camareiras"] as Setor[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSetor(s);
                    setStep(3);
                  }}
                  className={cn(
                    "rounded-xl border-2 p-4 text-left font-bold transition",
                    setor === s
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-slate-200 hover:border-red-400 hover:bg-red-50/50",
                  )}
                >
                  {SETOR_LABEL[s]}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              ← Voltar
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-100 p-3 text-xs">
              📤 Destino: <strong>{SETOR_LABEL[setor!]}</strong> · <strong>{unidade}</strong>
            </div>
            <div className="space-y-2">
              <Label htmlFor="msg" className="text-sm font-bold">
                3. Mensagem
              </Label>
              <Textarea
                id="msg"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value.slice(0, 800))}
                placeholder="Escreva aqui o recado…"
                rows={4}
                maxLength={800}
              />
              <p className="text-[10px] text-slate-500 text-right">{mensagem.length}/800</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-bold">Anexar mídia (opcional)</Label>
              {!midia ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fotoRef.current?.click()}
                    className="flex-1"
                  >
                    <ImagePlus className="h-4 w-4 mr-1" /> Foto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => videoRef.current?.click()}
                    className="flex-1"
                  >
                    <Video className="h-4 w-4 mr-1" /> Vídeo (15s)
                  </Button>
                  <input
                    ref={fotoRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFoto}
                  />
                  <input
                    ref={videoRef}
                    type="file"
                    accept="video/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleVideo}
                  />
                </div>
              ) : (
                <div className="relative rounded-lg overflow-hidden border bg-slate-50">
                  {midia.tipo === "foto" ? (
                    <img src={midia.preview} alt="preview" className="w-full max-h-56 object-contain" />
                  ) : (
                    <video src={midia.preview} controls className="w-full max-h-56" />
                  )}
                  <button
                    type="button"
                    onClick={removerMidia}
                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 shadow"
                    aria-label="Remover mídia"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(2)} disabled={saving}>
                ← Voltar
              </Button>
              <Button
                onClick={enviar}
                disabled={saving || !mensagem.trim()}
                className="bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Megaphone className="h-4 w-4 mr-1" />}
                Enviar recado
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
