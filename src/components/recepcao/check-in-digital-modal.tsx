import { useState } from "react";
import { Key, CheckCircle2, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

// Devices Tuya - Botafogo (Portão Principal, Porta de Vidro, Quarto 005)
const DEVICE_IDS_005: string[] = [
  "eb68bdeb2d042fa20floc9", // Portão Principal
  "ebd0532b4638fa030ea1ea", // Porta de Vidro
  "eba3429756a5aaa8b2ssrw", // Quarto 005
];

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultEntrada() {
  return toLocalInput(new Date());
}

function defaultSaida() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return toLocalInput(d);
}

export function CheckInDigitalButton({ roomNumber = "005" }: { roomNumber?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-2.5 rounded-xl font-bold text-sm border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-700 flex items-center justify-center gap-2 transition-all"
      >
        <Key size={16} /> Check-in Digital
      </button>
      {open && (
        <CheckInDigitalModal
          roomNumber={roomNumber}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

function CheckInDigitalModal({
  roomNumber,
  open,
  onOpenChange,
}: {
  roomNumber: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [nomeHospede, setNomeHospede] = useState("");
  const [entrada, setEntrada] = useState(defaultEntrada());
  const [saida, setSaida] = useState(defaultSaida());
  const [isLoading, setIsLoading] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);

  const reset = () => {
    setNomeHospede("");
    setEntrada(defaultEntrada());
    setSaida(defaultSaida());
    setSenhaGerada(null);
    setIsLoading(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const gerarSenhaTuya = async () => {
    if (!nomeHospede.trim()) {
      toast.error("Informe o nome do hóspede.");
      return;
    }
    const startTs = new Date(entrada).getTime();
    const endTs = new Date(saida).getTime();
    if (!(endTs > startTs)) {
      toast.error("A saída deve ser posterior à entrada.");
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("tuya-password", {
      body: {
        deviceIds: DEVICE_IDS_005,
        guestName: nomeHospede,
        startTime: startTs,
        endTime: endTs,
      },
    });
    setIsLoading(false);

    if (error) {
      toast.error("Erro ao gerar senha: " + error.message);
      return;
    }
    if (!data?.password) {
      toast.error("A função não retornou uma senha.");
      return;
    }
    setSenhaGerada(data.password);
  };

  const copiarWhatsapp = async () => {
    if (!senhaGerada) return;
    const saidaFmt = new Date(saida).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const texto = `Olá ${nomeHospede}! Bem-vindo ao INJOY Botafogo.\nA sua senha de acesso exclusiva é: ${senhaGerada}\nEsta senha é válida até ${saidaFmt} e abre as seguintes portas:\n🚪 Portão Principal (Rua)\n🚪 Porta de Vidro (Recepção)\n🛏️ Quarto ${roomNumber}\nTenha uma excelente estadia!`;
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Mensagem copiada!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-teal-600" />
            Gerar Senha de Acesso (Quarto {roomNumber})
          </DialogTitle>
          <DialogDescription>
            A senha será sincronizada diretamente na fechadura inteligente.
          </DialogDescription>
        </DialogHeader>

        {!senhaGerada ? (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Nome do Hóspede
              </label>
              <input
                type="text"
                value={nomeHospede}
                onChange={(e) => setNomeHospede(e.target.value)}
                placeholder="Ex: João Silva"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                disabled={isLoading}
              />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Entrada
                </label>
                <input
                  type="datetime-local"
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Saída
                </label>
                <input
                  type="datetime-local"
                  value={saida}
                  onChange={(e) => setSaida(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  disabled={isLoading}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={gerarSenhaTuya}
              disabled={isLoading}
              className="w-full py-3 rounded-xl font-bold text-sm bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <Key size={16} />
                  Gerar e Sincronizar na Fechadura
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-3">
              <div className="h-16 w-16 rounded-full bg-emerald-100 grid place-items-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                Senha sincronizada com sucesso!
              </p>
            </div>
            <div className="rounded-xl border-2 border-dashed border-teal-300 bg-teal-50 py-5 px-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 text-center mb-2">
                Senha de acesso · Quarto {roomNumber}
              </p>
              <p className="font-mono text-3xl font-bold tracking-widest text-center text-teal-800">
                {senhaGerada}
              </p>
            </div>
            <button
              type="button"
              onClick={copiarWhatsapp}
              className="w-full py-3 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2"
            >
              <Copy size={16} />
              Copiar para WhatsApp
            </button>
            <button
              type="button"
              onClick={() => handleClose(false)}
              className="w-full py-2.5 rounded-xl font-semibold text-sm border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
            >
              Fechar
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
