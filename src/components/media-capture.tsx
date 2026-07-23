import { useRef } from "react";
import { Camera, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compression";
import type { Midia } from "@/lib/store";

export const MAX_VIDEO_SECONDS = 15;
export const MAX_VIDEO_MB = 60;

async function checkVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler o vídeo"));
    };
  });
}

export async function uploadMediaFile(
  file: File | Blob,
  kind: "photo" | "video" | "audio",
  ext?: string,
): Promise<string> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Sessão expirada.");
  const finalExt =
    ext ??
    ("name" in file && file.name.includes(".")
      ? file.name.split(".").pop()!
      : kind === "photo"
        ? "jpg"
        : kind === "video"
          ? "mp4"
          : "webm");
  const path = `${userData.user.id}/${crypto.randomUUID()}.${finalExt}`;
  const { error: upErr } = await supabase.storage
    .from("fotos-manutencao")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw upErr;
  const { data: signed, error: signErr } = await supabase.storage
    .from("fotos-manutencao")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr) throw signErr;
  return signed.signedUrl;
}

export function MediaCapture({
  midias,
  onAdd,
  onRemove,
  uploading,
  setUploading,
  singleVideo = true,
}: {
  midias: Midia[];
  onAdd: (m: Midia) => void;
  onRemove: (url: string) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
  singleVideo?: boolean;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const hasVideo = midias.some((m) => m.type === "video");

  const upload = async (file: File, type: "photo" | "video") => {
    setUploading(true);
    try {
      let toUpload: File = file;
      if (type === "photo") {
        toUpload = await compressImage(file);
      } else {
        if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
          throw new Error(`Vídeo muito grande (máx. ${MAX_VIDEO_MB}MB).`);
        }
        const duration = await checkVideoDuration(file);
        if (duration > MAX_VIDEO_SECONDS + 0.5) {
          throw new Error(`Vídeo deve ter no máximo ${MAX_VIDEO_SECONDS} segundos.`);
        }
      }
      const ext = toUpload.name.split(".").pop() || (type === "photo" ? "jpg" : "mp4");
      const url = await uploadMediaFile(toUpload, type, ext);
      onAdd({ type, url });
      toast.success(type === "photo" ? "Foto anexada" : "Vídeo anexado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no upload";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => photoRef.current?.click()}
          className="gap-2"
        >
          <Camera className="h-4 w-4" /> Adicionar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading || (singleVideo && hasVideo)}
          onClick={() => videoRef.current?.click()}
          className="gap-2"
        >
          <Video className="h-4 w-4" /> Gravar vídeo (até {MAX_VIDEO_SECONDS}s)
        </Button>
      </div>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f, "photo");
          e.target.value = "";
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f, "video");
          e.target.value = "";
        }}
      />

      {midias.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {midias.map((m) => (
            <div
              key={m.url}
              className="relative rounded-lg overflow-hidden border bg-card group"
            >
              {m.type === "photo" ? (
                <img src={m.url} alt="Anexo" className="w-full aspect-square object-cover" />
              ) : m.type === "video" ? (
                <video src={m.url} className="w-full aspect-square object-cover" controls playsInline />
              ) : (
                <div className="w-full aspect-square flex items-center justify-center bg-muted p-2">
                  <audio src={m.url} controls className="w-full" />
                </div>
              )}
              {m.type === "video" && (
                <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                  VÍDEO
                </span>
              )}
              {m.type === "audio" && (
                <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                  ÁUDIO
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(m.url)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-80 hover:opacity-100"
                aria-label="Remover mídia"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
