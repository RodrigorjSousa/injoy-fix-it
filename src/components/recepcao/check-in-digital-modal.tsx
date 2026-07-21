import { useEffect, useMemo, useState } from "react";
import {
  Key,
  CheckCircle2,
  Loader2,
  Copy,
  XCircle,
  Clock,
  Info,
  ChevronDown,
  ChevronUp,
  Share2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  loadTuyaDevices,
  resolveDevicesForRoom,
  type TuyaDevice,
} from "@/lib/tuya-devices";

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

function iconForTipo(tipo: TuyaDevice["tipo"]) {
  switch (tipo) {
    case "quarto":
      return "🛏️";
    case "portao":
      return "🚪";
    case "vidro":
      return "🪟";
    default:
      return "🔐";
  }
}

export function CheckInDigitalButton({
  roomNumber = "005",
  unidade = "Botafogo",
}: {
  roomNumber?: string;
  unidade?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hasRoomDevice, setHasRoomDevice] = useState<boolean | null>(null);

  useEffect(() => {
    let ativo = true;
    loadTuyaDevices()
      .then((devices) => {
        if (!ativo) return;
        const { quarto } = resolveDevicesForRoom(devices, unidade, roomNumber);
        setHasRoomDevice(!!quarto);
      })
      .catch(() => {
        if (!ativo) return;
        setHasRoomDevice(false);
      });
    return () => {
      ativo = false;
    };
  }, [unidade, roomNumber]);

  if (hasRoomDevice !== true) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-2.5 rounded-xl font-bold text-sm border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-700 flex items-center justify-center gap-2 transition-all"
      >
        <Key size={16} /> Check-in Digital Online
      </button>
      {open && (
        <CheckInDigitalModal
          roomNumber={roomNumber}
          unidade={unidade}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

type DeviceStatus = {
  state: "pending" | "success" | "error";
  message?: string;
  code?: number;
  passwordId?: string | number;
};

function CheckInDigitalModal({
  roomNumber,
  unidade,
  open,
  onOpenChange,
}: {
  roomNumber: string;
  unidade: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [nomeHospede, setNomeHospede] = useState("");
  const [entrada, setEntrada] = useState(defaultEntrada());
  const [saida, setSaida] = useState(defaultSaida());
  const [isLoading, setIsLoading] = useState(false);
  const [senhasGeradas, setSenhasGeradas] = useState<Record<string, string> | null>(null);
  const [senhaIds, setSenhaIds] = useState<Record<string, string | number>>({});
  const [deviceStatus, setDeviceStatus] = useState<Record<string, DeviceStatus>>({});
  const [showTips, setShowTips] = useState(false);
  const [devices, setDevices] = useState<TuyaDevice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    loadTuyaDevices()
      .then((all) => {
        if (!ativo) return;
        const { todos } = resolveDevicesForRoom(all, unidade, roomNumber);
        setDevices(todos);
      })
      .catch((e) => {
        if (!ativo) return;
        setLoadError(e?.message ?? "Falha ao carregar fechaduras.");
      });
    return () => {
      ativo = false;
    };
  }, [unidade, roomNumber]);

  const deviceIds = useMemo(() => (devices ?? []).map((d) => d.device_id), [devices]);
  const quartoDevice = useMemo(
    () => (devices ?? []).find((d) => d.tipo === "quarto") ?? null,
    [devices],
  );
  const labelByDeviceId = useMemo(() => {
    const map: Record<string, { label: string; tipo: TuyaDevice["tipo"] }> = {};
    for (const d of devices ?? []) map[d.device_id] = { label: d.label, tipo: d.tipo };
    return map;
  }, [devices]);

  const reset = () => {
    setNomeHospede("");
    setEntrada(defaultEntrada());
    setSaida(defaultSaida());
    setSenhasGeradas(null);
    setSenhaIds({});
    setDeviceStatus({});
    setShowTips(false);
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
    if (!quartoDevice) {
      toast.error(`Nenhuma fechadura cadastrada para o quarto ${roomNumber}.`);
      return;
    }
    if (deviceIds.length === 0) {
      toast.error("Nenhuma fechadura ativa para esta unidade.");
      return;
    }
    const startTs = new Date(entrada).getTime();
    const endTs = new Date(saida).getTime();
    if (!(endTs > startTs)) {
      toast.error("A saída deve ser posterior à entrada.");
      return;
    }

    const initialStatus: Record<string, DeviceStatus> = {};
    for (const id of deviceIds) initialStatus[id] = { state: "pending" };
    setDeviceStatus(initialStatus);
    setSenhasGeradas(null);
    setSenhaIds({});
    setIsLoading(true);

    const { data, error } = await supabase.functions.invoke("tuya-password", {
      body: {
        deviceIds,
        guestName: nomeHospede,
        startTime: startTs,
        endTime: endTs,
        roomNumber,
        unidade,
      },
    });
    setIsLoading(false);

    if (error) {
      const errored: Record<string, DeviceStatus> = {};
      for (const id of deviceIds) errored[id] = { state: "error", message: error.message };
      setDeviceStatus(errored);
      toast.error("Erro ao gerar senha: " + error.message);
      return;
    }

    const senhas: Record<string, string> = data?.senhas ?? {};
    const idsSenha: Record<string, string | number> = data?.senhaIds ?? {};
    const tuyaResults: Array<{
      deviceId: string;
      status: {
        success?: boolean;
        msg?: string;
        code?: number;
        result?: { id?: string | number; offline_temp_password_id?: string | number };
      };
    }> = data?.tuyaResults ?? [];

    const finalStatus: Record<string, DeviceStatus> = {};
    for (const id of deviceIds) {
      const r = tuyaResults.find((x) => x.deviceId === id);
      if (senhas[id]) {
        finalStatus[id] = {
          state: "success",
          passwordId:
            idsSenha[id] ??
            r?.status?.result?.id ??
            r?.status?.result?.offline_temp_password_id,
        };
      } else if (r) {
        finalStatus[id] = {
          state: "error",
          message: r.status?.msg || `Falha (code ${r.status?.code ?? "?"})`,
          code: r.status?.code,
        };
      } else {
        finalStatus[id] = { state: "error", message: "Sem resposta" };
      }
    }
    setDeviceStatus(finalStatus);
    setSenhaIds(idsSenha);

    if (Object.keys(senhas).length === 0) {
      toast.error("Nenhuma fechadura retornou senha. Verifique o status abaixo.");
      return;
    }
    setSenhasGeradas(senhas);

    const okCount = Object.values(finalStatus).filter((s) => s.state === "success").length;
    if (okCount < deviceIds.length) {
      toast.warning(`${okCount}/${deviceIds.length} fechaduras sincronizadas.`);
    } else {
      toast.success("Todas as fechaduras foram sincronizadas!");
    }

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
        device_ids: deviceIds,
        unidade,
        generated_by_user_id: uid,
        generated_by_name: nome,
      });
    } catch (e) {
      console.error("Falha ao registrar log Tuya:", e);
    }
  };

  const senhaUnica = senhasGeradas ? Object.values(senhasGeradas)[0] ?? null : null;

  const copiarSenha = async () => {
    if (!senhaUnica) return;
    try {
      await navigator.clipboard.writeText(senhaUnica);
      toast.success("Senha copiada!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const listaPortasTexto = useMemo(() => {
    return (devices ?? [])
      .map((d) => `${iconForTipo(d.tipo)} ${d.label}`)
      .join("\n");
  }, [devices]);

  const copiarWhatsapp = async () => {
    if (!senhaUnica) return;
    const saidaFmt = new Date(saida).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const texto = `Olá ${nomeHospede}! Bem-vindo ao INJOY ${unidade}.\n\n🔐 *Sua senha de acesso online (única para todas as portas):* ${senhaUnica}\n\n⚠️ *IMPORTANTE:* Digite a senha no teclado e aperte a tecla *#* (Jogo da Velha) no final para a porta abrir.\n\nUse a mesma senha em:\n${listaPortasTexto}\n\nO seu acesso é válido até ${saidaFmt}.\nTenha uma excelente estadia!`;
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Mensagem copiada!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const compartilharSenha = async () => {
    if (!senhaUnica) return;
    const texto = `Senha de acesso online INJOY ${unidade} (Quarto ${roomNumber}): ${senhaUnica}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Senha de Acesso Online", text: texto });
      } catch {
        /* user cancelled */
      }
    } else {
      await copiarSenha();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-teal-600" />
            Gerar Senha Online — {unidade} · Quarto {roomNumber}
          </DialogTitle>
          <DialogDescription>
            Uma única senha, sincronizada com todas as fechaduras do hóspede via Tuya Cloud.
          </DialogDescription>
        </DialogHeader>

        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5" />
            <span>{loadError}</span>
          </div>
        )}

        {devices !== null && devices.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Esta senha vai abrir:
            </p>
            <ul className="text-xs text-slate-700 space-y-0.5">
              {devices.map((d) => (
                <li key={d.device_id}>
                  {iconForTipo(d.tipo)} {d.label}
                </li>
              ))}
            </ul>
          </div>
        )}

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
              disabled={isLoading || !devices || devices.length === 0}
              className="w-full py-3 rounded-xl font-bold text-sm bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Gerando Senha Online...
                </>
              ) : (
                <>
                  <Key size={16} />
                  Gerar Senha Online
                </>
              )}
            </button>

            {Object.keys(deviceStatus).length > 0 && (
              <StatusList status={deviceStatus} labelByDeviceId={labelByDeviceId} />
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-2">
              <div className="h-16 w-16 rounded-full bg-emerald-100 grid place-items-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-slate-700 text-center">
                Senha online gerada com sucesso!
              </p>
            </div>

            <div className="rounded-xl border-2 border-dashed border-teal-300 bg-teal-50 py-4 px-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 text-center">
                🔐 Senha de Acesso Online
              </p>
              <div className="flex items-center justify-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={senhaUnica ?? ""}
                  className="flex-1 bg-white border border-teal-200 rounded-lg px-3 py-2 font-mono text-3xl font-bold tracking-widest text-teal-800 text-center focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-teal-700 text-center">
                Use esta senha em <strong>todas</strong> as portas abaixo.
              </p>
              <p className="text-[10px] text-teal-600 text-center">
                Válida de {new Date(entrada).toLocaleString("pt-BR")} até{" "}
                {new Date(saida).toLocaleString("pt-BR")}.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={copiarSenha}
                className="py-2.5 rounded-xl font-bold text-sm border border-teal-300 bg-white hover:bg-teal-50 text-teal-700 flex items-center justify-center gap-2"
              >
                <Copy size={14} /> Copiar
              </button>
              <button
                type="button"
                onClick={compartilharSenha}
                className="py-2.5 rounded-xl font-bold text-sm border border-teal-300 bg-white hover:bg-teal-50 text-teal-700 flex items-center justify-center gap-2"
              >
                <Share2 size={14} /> Compartilhar
              </button>
            </div>

            <StatusList status={deviceStatus} labelByDeviceId={labelByDeviceId} />

            <button
              type="button"
              onClick={copiarWhatsapp}
              className="w-full py-3 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2"
            >
              <Copy size={16} />
              Copiar mensagem para WhatsApp
            </button>

            <TroubleshootingTips open={showTips} onToggle={() => setShowTips((v) => !v)} />

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

function StatusList({
  status,
  labelByDeviceId,
}: {
  status: Record<string, DeviceStatus>;
  labelByDeviceId: Record<string, { label: string; tipo: TuyaDevice["tipo"] }>;
}) {
  const entries = Object.entries(status);
  return (
    <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Status da geração
      </div>
      {entries.map(([id, s]) => {
        const meta = labelByDeviceId[id];
        const label = meta ? `${iconForTipo(meta.tipo)} ${meta.label}` : id;
        return (
          <div key={id} className="flex items-center justify-between px-3 py-2 gap-2">
            <span className="text-xs font-semibold text-slate-700 truncate">{label}</span>
            {s.state === "pending" && (
              <span className="flex items-center gap-1 text-xs font-bold text-amber-600">
                <Clock size={14} className="animate-pulse" />
                Sincronizando…
              </span>
            )}
            {s.state === "success" && (
              <span className="flex flex-col items-end gap-0.5 text-right">
                <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                  <CheckCircle2 size={14} />
                  Aceita pela Tuya
                </span>
                {s.passwordId ? (
                  <span className="text-[10px] font-mono text-slate-500 truncate max-w-[180px]">
                    ID: {String(s.passwordId)}
                  </span>
                ) : null}
              </span>
            )}
            {s.state === "error" && (
              <span
                className="flex flex-col items-end gap-0.5 text-right max-w-[65%]"
                title={s.message}
              >
                <span className="flex items-center gap-1 text-xs font-bold text-red-600">
                  <XCircle size={14} />
                  <span className="truncate">{s.message || "Falha"}</span>
                </span>
                {typeof s.code === "number" ? (
                  <span className="text-[10px] font-mono text-red-500">code {s.code}</span>
                ) : null}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TroubleshootingTips({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-amber-800">
          <Info size={16} />
          Dicas se a senha não funcionar
        </span>
        {open ? (
          <ChevronUp size={16} className="text-amber-700" />
        ) : (
          <ChevronDown size={16} className="text-amber-700" />
        )}
      </button>
      {open && (
        <ul className="px-4 pb-3 space-y-2 text-xs text-amber-900 list-disc list-inside">
          <li>
            <strong>Sempre pressione a tecla #</strong> (Jogo da Velha) após digitar a senha — é
            o "Enter" da fechadura.
          </li>
          <li>
            <strong>Aguarde até 2 minutos</strong> após gerar: as fechaduras Zigbee saem de
            hibernação e sincronizam com o gateway.
          </li>
          <li>
            <strong>Verifique a bateria</strong> da fechadura. Bateria fraca faz o teclado travar
            ou não emitir bipe.
          </li>
          <li>
            <strong>Aproxime-se do teclado</strong> antes de digitar; alguns modelos ativam o
            painel só quando detectam presença.
          </li>
          <li>
            <strong>Se errar,</strong> aguarde 5 segundos e digite novamente do zero — não
            corrija dígito por dígito.
          </li>
        </ul>
      )}
    </div>
  );
}
