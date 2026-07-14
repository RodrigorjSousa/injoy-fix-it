import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/image-compression";

interface DndModalProps {
  open: boolean;
  onClose: () => void;
  unidade: "Botafogo" | "Ipanema";
  roomNumber: string;
  camareiraName?: string | null;
  taskName?: string | null;
  startedAt?: string | null;
  comment?: string | null;
}

export function DndModal({ open, onClose, unidade, roomNumber, camareiraName, taskName, startedAt, comment }: DndModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setPreviewUrl(null);
    }
  }, [open]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!open) return null;

  const canSubmit = !!file && !enviando;

  const handleSubmit = async () => {
    if (!canSubmit || !file) return;
    setEnviando(true);
    try {
      const compressed = await compressImage(file);
      const ext = compressed.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeRoom = roomNumber.replace(/\s+/g, "_");
      const path = `dnd/${unidade}/${safeRoom}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("inspections")
        .upload(path, compressed, { cacheControl: "3600", upsert: false, contentType: compressed.type });
      if (upErr) throw upErr;

      const { data: publicUrlData } = supabase.storage
        .from("inspections")
        .getPublicUrl(path);
      const photoUrl = publicUrlData.publicUrl;

      const { error: updErr } = await supabase
        .from("room_housekeeping")
        // biome-ignore lint/suspicious/noExplicitAny: colunas novas ainda não estão no types.ts gerado
        .update({
          is_dnd: true,
          dnd_photo_url: photoUrl,
          status: "clean",
          service_status: "done",
          service_ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("property", unidade)
        .eq("room_number", roomNumber);
      if (updErr) throw updErr;

      // Registra no histórico cumulativo
      const nowIso = new Date().toISOString();
      const { error: histErr } = await supabase
        .from("room_housekeeping_history")
        // biome-ignore lint/suspicious/noExplicitAny: tabela nova ainda não está no types.ts gerado
        .insert({
          property: unidade,
          room_number: roomNumber,
          camareira_name: camareiraName ?? "—",
          action_type: "NÃO PERTURBE",
          task_name: taskName ?? "NÃO PERTURBE",
          started_at: startedAt ?? nowIso,
          ended_at: nowIso,
          photo_url: photoUrl,
          comment: comment ?? null,
        } as any);
      if (histErr) console.error("[dnd] falha ao gravar histórico", histErr);

      toast.success(`Não Perturbe ativado no quarto ${roomNumber}`);
      onClose();
    } catch (err) {
      console.error("[dnd] erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao ativar Não Perturbe");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div>
            <p className="text-[11px] font-bold text-red-600 uppercase tracking-wider">
              🚫 Não Perturbe
            </p>
            <h3 className="text-base font-black text-slate-900">Quarto {roomNumber}</h3>
            <p className="text-xs text-slate-500">INJOY {unidade}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <p className="text-sm text-slate-700 bg-red-50 border border-red-200 rounded-xl p-3">
            Para ativar o <b>Não Perturbe</b>, tire uma foto da placa na porta do quarto.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          {previewUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-slate-200">
              <img src={previewUrl} alt="Placa Não Perturbe" className="w-full max-h-64 object-cover" />
              <button
                onClick={() => setFile(null)}
                className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5 shadow"
                aria-label="Remover foto"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 hover:border-red-500 hover:text-red-600 transition-colors font-semibold"
            >
              <Camera size={20} />
              Tirar foto da placa
            </button>
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2",
              canSubmit
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-slate-200 text-slate-400 cursor-not-allowed",
            )}
          >
            {enviando ? <Loader2 size={16} className="animate-spin" /> : null}
            Registrar Não Perturbe
          </button>
        </div>
      </div>
    </div>
  );
}
