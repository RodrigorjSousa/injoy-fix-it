import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/image-compression";

const CHECKLIST_ITEMS = [
  "Ar condicionado testado e gelando",
  "Enxoval completo e cama montada",
  "Banheiro higienizado e com papel/toalhas",
  "Quarto cheiroso e sem poeira",
  "Controle remoto e TV funcionando",
] as const;

type ChecklistState = Record<string, boolean>;

interface VistoriaModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  unidade: Unidade;
  roomNumber: string; // Ex: "APT 001"
}

export function VistoriaModal({
  open,
  onClose,
  onSuccess,
  unidade,
  roomNumber,
}: VistoriaModalProps) {
  const [checklist, setChecklist] = useState<ChecklistState>(() =>
    Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i, false])),
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setChecklist(Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i, false])));
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

  const allChecked = CHECKLIST_ITEMS.every((i) => checklist[i]);
  const canSubmit = allChecked && !!file && !enviando;

  const toggleItem = (item: string) =>
    setChecklist((prev) => ({ ...prev, [item]: !prev[item] }));

  const handleSubmit = async () => {
    if (!canSubmit || !file) return;
    setEnviando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      let inspectorName = "Recepção";
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("nome")
          .eq("id", user.id)
          .maybeSingle();
        inspectorName = profile?.nome || user.email || "Recepção";
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeRoom = roomNumber.replace(/\s+/g, "_");
      const path = `${unidade}/${safeRoom}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("inspections")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;

      const { data: publicUrlData } = supabase.storage
        .from("inspections")
        .getPublicUrl(path);
      const photoUrl = publicUrlData.publicUrl;

      const { error: insErr } = await supabase.from("room_inspections").insert({
        property: unidade,
        room_number: roomNumber,
        inspector_name: inspectorName,
        inspector_id: user?.id ?? null,
        checklist,
        photo_url: photoUrl,
      });
      if (insErr) throw insErr;

      const { error: updErr } = await supabase
        .from("room_housekeeping")
        .update({
          status: "clean",
          assigned_task: "VERIFICAÇÃO",
          updated_at: new Date().toISOString(),
        })
        .eq("property", unidade)
        .eq("room_number", roomNumber);
      if (updErr) throw updErr;

      toast.success(`Quarto ${roomNumber} vistoriado e liberado`);
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("[vistoria] erro:", err);
      toast.error(
        err instanceof Error ? err.message : "Falha ao salvar vistoria",
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Vistoria Preventiva
            </p>
            <h3 className="text-base font-black text-slate-900">
              Quarto {roomNumber}
            </h3>
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
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Checklist obrigatório
            </p>
            {CHECKLIST_ITEMS.map((item) => {
              const checked = checklist[item];
              return (
                <label
                  key={item}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                    checked
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(item)}
                    className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      checked ? "text-emerald-800" : "text-slate-700",
                    )}
                  >
                    {item}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Anexar Foto do Quarto
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
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Prévia da vistoria"
                  className="w-full h-56 object-cover rounded-xl border border-slate-200"
                />
                <button
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 border border-slate-200 shadow-sm"
                >
                  Trocar foto
                </button>
              </div>
            ) : (
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:bg-slate-50"
              >
                <Camera size={28} />
                <span className="text-sm font-semibold">
                  Tirar foto ou escolher da galeria
                </span>
                <span className="text-[11px] text-slate-400">
                  Foto obrigatória para liberar o quarto
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
              canSubmit
                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                : "bg-slate-200 text-slate-400 cursor-not-allowed",
            )}
          >
            {enviando ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Salvando...
              </>
            ) : (
              <>
                <CheckCircle2 size={16} /> Salvar e Liberar Quarto
              </>
            )}
          </button>
          {!allChecked && (
            <p className="text-[11px] text-center text-slate-500 mt-2">
              Marque todos os itens do checklist e anexe uma foto.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
