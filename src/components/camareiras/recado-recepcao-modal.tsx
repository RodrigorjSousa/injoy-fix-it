import { useEffect, useState } from "react";
import { X, MessageSquarePlus, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  unidade: Unidade;
  autorNome: string;
};

export function RecadoRecepcaoModal({
  open,
  onClose,
  onSuccess,
  unidade,
  autorNome,
}: Props) {
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) setMensagem("");
  }, [open]);

  if (!open) return null;

  const enviar = async () => {
    const texto = mensagem.trim();
    if (!texto) {
      toast.error("Escreva o recado antes de enviar");
      return;
    }
    setEnviando(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("recados_camareiras").insert({
      property: unidade,
      room_number: null,
      message: texto,
      created_by: userData.user?.id ?? null,
      created_by_name: autorNome || "Camareira",
      direction: "to_recepcao",
    });
    setEnviando(false);
    if (error) {
      toast.error("Não foi possível enviar o recado");
      console.error("[recado-recepcao]", error);
      return;
    }
    toast.success("Recado enviado com sucesso!");
    onSuccess?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="text-indigo-600" size={20} />
            <div>
              <h3 className="font-black text-slate-800 text-base">
                Deixar Recado para Recepção
              </h3>
              <p className="text-xs text-slate-500">INJOY {unidade}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-2">
          <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
            Mensagem
          </label>
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={5}
            placeholder="Digite seu recado aqui..."
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            autoFocus
          />
          <p className="text-[11px] text-slate-400">
            Assinado por: <span className="font-semibold">{autorNome || "Camareira"}</span>
          </p>
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={enviando || !mensagem.trim()}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-indigo-500/30 hover:brightness-110 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <Send size={15} />
            {enviando ? "Enviando..." : "Enviar Recado"}
          </button>
        </div>
      </div>
    </div>
  );
}
