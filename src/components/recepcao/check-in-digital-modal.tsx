import { useState } from "react";
import { Key, CheckCircle2, Loader2, Copy, XCircle, Clock } from "lucide-react";
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
const DEVICE_PORTAO = "eba207725701fb044abmhl";
const DEVICE_VIDRO = "ebd7760a2310ee9930ozt9";
const DEVICE_QUARTO_005 = "eba3429756a5aaa8b2ssrw";

const DEVICE_IDS_005: string[] = [DEVICE_PORTAO, DEVICE_VIDRO, DEVICE_QUARTO_005];

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
  const [senhasGeradas, setSenhasGeradas] = useState<Record<string, string> | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<
    Record<string, { state: "pending" | "success" | "error"; message?: string }>
  >({});

  const reset = () => {
    setNomeHospede("");
    setEntrada(defaultEntrada());
    setSaida(defaultSaida());
    setSenhasGeradas(null);
    setDeviceStatus({});
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
    const senhas: Record<string, string> | undefined = data?.senhas;
    if (!senhas || Object.keys(senhas).length === 0) {
      toast.error("A função não retornou senhas.");
      return;
    }
    setSenhasGeradas(senhas);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      let nome: string | null = null;
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("nome")
          .eq("id", uid)
          .maybeSingle();
        nome = prof?.nome ?? userData?.user?.email ?? null;
      }
      const senhaResumo = Object.entries(senhas)
        .map(([id, p]) => `${id}:${p}`)
        .join(" | ");
      await supabase.from("tuya_password_logs").insert({
        room_number: roomNumber,
        guest_name: nomeHospede,
        password: senhaResumo,
        entrada: new Date(entrada).toISOString(),
        saida: new Date(saida).toISOString(),
        device_ids: DEVICE_IDS_005,
        unidade: "Botafogo",
        generated_by_user_id: uid,
        generated_by_name: nome,
      });
    } catch (e) {
      console.error("Falha ao registrar log Tuya:", e);
    }
  };

  const copiarWhatsapp = async () => {
    if (!senhasGeradas) return;
    const saidaFmt = new Date(saida).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const texto = `Olá ${nomeHospede}! Bem-vindo ao INJOY Botafogo.\n\nAqui estão as suas senhas de acesso exclusivas.\n⚠️ *IMPORTANTE:* Digite a senha no teclado e aperte a tecla *#* (Jogo da Velha) no final para a porta abrir.\n\n🚪 *Portão Principal (Rua):* ${senhasGeradas[DEVICE_PORTAO] || "Gerando..."}\n🚪 *Porta de Vidro (Recepção):* ${senhasGeradas[DEVICE_VIDRO] || "Gerando..."}\n🛏️ *Quarto ${roomNumber}:* ${senhasGeradas[DEVICE_QUARTO_005] || "Gerando..."}\n\nO seu acesso é válido até ${saidaFmt}.\nTenha uma excelente estadia!`;
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
            Senhas offline únicas por fechadura, sincronizadas via Tuya.
          </DialogDescription>
        </DialogHeader>

        {!senhasGeradas ? (
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
                  Gerando senhas offline...
                </>
              ) : (
                <>
                  <Key size={16} />
                  Gerar Senhas Offline
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
              <p className="text-sm font-semibold text-slate-700 text-center">
                Senhas offline geradas com sucesso!
              </p>
            </div>
            <div className="rounded-xl border-2 border-dashed border-teal-300 bg-teal-50 py-4 px-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                  🚪 Portão Principal
                </p>
                <p className="font-mono text-2xl font-bold tracking-widest text-teal-800">
                  {senhasGeradas[DEVICE_PORTAO] || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                  🚪 Porta de Vidro
                </p>
                <p className="font-mono text-2xl font-bold tracking-widest text-teal-800">
                  {senhasGeradas[DEVICE_VIDRO] || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                  🛏️ Quarto {roomNumber}
                </p>
                <p className="font-mono text-2xl font-bold tracking-widest text-teal-800">
                  {senhasGeradas[DEVICE_QUARTO_005] || "—"}
                </p>
              </div>
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
