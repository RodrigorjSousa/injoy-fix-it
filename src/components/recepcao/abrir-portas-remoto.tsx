import { useEffect, useState } from "react";
import { DoorOpen, Loader2, Unlock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loadTuyaDevices, type TuyaDevice } from "@/lib/tuya-devices";

function iconForTipo(tipo: TuyaDevice["tipo"]) {
  switch (tipo) {
    case "portao":
      return "🚪";
    case "vidro":
      return "🪟";
    case "quarto":
      return "🛏️";
    default:
      return "🔐";
  }
}

export function AbrirPortasRemoto({ unidade }: { unidade: string }) {
  const [devices, setDevices] = useState<TuyaDevice[] | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    loadTuyaDevices()
      .then((all) => {
        if (!ativo) return;
        // portas compartilhadas da unidade (portão / vidro / outro)
        setDevices(
          all.filter(
            (d) => d.ativo && d.unidade === unidade && d.tipo !== "quarto",
          ),
        );
      })
      .catch(() => ativo && setDevices([]));
    return () => {
      ativo = false;
    };
  }, [unidade]);

  const abrir = async (d: TuyaDevice) => {
    setUnlockingId(d.device_id);
    const { data, error } = await supabase.functions.invoke("tuya-password", {
      body: { action: "unlock", deviceIds: [d.device_id], unidade },
    });
    setUnlockingId(null);
    if (error) return toast.error("Falha: " + error.message);
    const r = data?.unlocks?.[0];
    if (r?.success) toast.success(`${d.label} destravada!`);
    else toast.error(r?.msg ?? "Não foi possível abrir.");
  };

  if (!devices || devices.length === 0) return null;

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm max-w-xl">
      <div className="flex items-center gap-2 mb-3">
        <DoorOpen className="h-5 w-5 text-teal-600" />
        <h2 className="text-sm font-black text-slate-900">
          Abrir portas remotamente
        </h2>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Destrave portão e porta de vidro direto da recepção quando o hóspede tocar a campainha.
      </p>
      <div className="space-y-2">
        {devices.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => abrir(d)}
            disabled={unlockingId === d.device_id}
            className="w-full py-2.5 px-3 rounded-xl font-bold text-sm bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {unlockingId === d.device_id ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Unlock size={16} />
            )}
            {iconForTipo(d.tipo)} Abrir {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
