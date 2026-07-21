import { supabase } from "@/integrations/supabase/client";

export type TuyaDeviceTipo = "quarto" | "portao" | "vidro" | "outro";

export type TuyaDevice = {
  id: string;
  unidade: string;
  tipo: TuyaDeviceTipo;
  room_number: string | null;
  device_id: string;
  label: string;
  ativo: boolean;
};

let cache: Promise<TuyaDevice[]> | null = null;

export function loadTuyaDevices(force = false): Promise<TuyaDevice[]> {
  if (!cache || force) {
    cache = supabase
      .from("tuya_devices")
      .select("id,unidade,tipo,room_number,device_id,label,ativo")
      .eq("ativo", true)
      .then(({ data, error }) => {
        if (error) {
          cache = null;
          throw error;
        }
        return (data ?? []) as TuyaDevice[];
      });
  }
  return cache;
}

export function invalidateTuyaDevicesCache() {
  cache = null;
}

export type ResolvedDevices = {
  quarto: TuyaDevice | null;
  compartilhados: TuyaDevice[];
  todos: TuyaDevice[];
};

/**
 * Resolve as fechaduras que devem receber a senha de um hóspede:
 * o device do quarto (se cadastrado) + todos os devices compartilhados
 * ativos daquela unidade (portão, porta de vidro, etc).
 */
export function resolveDevicesForRoom(
  devices: TuyaDevice[],
  unidade: string,
  roomNumber: string,
): ResolvedDevices {
  const dosUnidade = devices.filter((d) => d.ativo && d.unidade === unidade);
  const quarto =
    dosUnidade.find(
      (d) => d.tipo === "quarto" && (d.room_number ?? "") === roomNumber,
    ) ?? null;
  const compartilhados = dosUnidade.filter((d) => d.tipo !== "quarto");
  const todos = quarto ? [quarto, ...compartilhados] : [...compartilhados];
  return { quarto, compartilhados, todos };
}
