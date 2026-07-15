import { useEffect, useState } from "react";
import { X, MessageSquarePlus, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  unidadePadrao: Unidade;
  quarto?: string | null;
  autorNome: string;
};

export function RecadoCamareiraModal({
  open,
  onClose,
  onSuccess,
  unidadePadrao,
  quarto,
  autorNome,
}: Props) {
  const [unidade, setUnidade] = useState<Unidade>(unidadePadrao);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) {
      setUnidade(unidadePadrao);
      setMensagem("");
    }
  }, [open, unidadePadrao]);

  if (!open) return null;

  const enviar = async () => {
    const texto = mensagem.trim();
    if (!texto) {
      toast.error("Escreva a mensagem antes de enviar");
      return;
    }
    setEnviando(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("recados_camareiras").insert({
      property: unidade,
      room_number: quarto ?? null,
      message: texto,
      created_by: userData.user?.id ?? null,
      created_by_name: autorNome || "Recepção",
      direction: "to_camareira",
    });
    setEnviando(false);
    if (error) {
      toast.error("Não foi possível enviar o recado");
      console.error("[recado-camareira]", error);
      return;
    }
    toast.success(
      quarto
        ? `Recado enviado para camareira (Quarto ${quarto} · ${unidade})`
        : `Recado geral enviado (${unidade})`,
    );
    onSuccess?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="text-blue-600" size={20} />
            <div>
              <h3 className="font-black text-slate-800 text-base">
                Recado para camareiras
              </h3>
              <p className="text-xs text-slate-500">
                {quarto ? `Quarto ${quarto}` : "Recado geral"}
              </p>
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

        <div className="p-4 space-y-4">
          <div>
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Unidade destino
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(["Botafogo", "Ipanema"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnidade(u)}
                  className={`py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                    unidade === u
                      ? "bg-blue-600 text-white border-blue-700 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  INJOY {u}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Mensagem
            </label>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={4}
              placeholder="Ex: Levar toalhas extras, verificar frigobar, hóspede pediu troca de roupa de cama..."
              className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              autoFocus
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Assinado por: <span className="font-semibold">{autorNome || "Recepção"}</span>
            </p>
          </div>
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
            className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <Send size={15} />
            {enviando ? "Enviando..." : "Enviar recado"}
          </button>
        </div>
      </div>
    </div>
  );
}
