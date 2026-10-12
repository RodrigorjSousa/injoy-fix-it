import { Ban, LogIn, LogOut, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export type TipoBloqueio = "manutencao" | "bloqueado" | null | undefined;

const hora = (t?: string | null) => {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  return m[2] === "00" ? `${parseInt(m[1], 10)}h` : `${m[1]}:${m[2]}`;
};

/**
 * Avisos que vêm do Cloudbeds e precisam ser vistos no card do quarto:
 * MANUTENÇÃO / BLOQUEADO (com motivo), ENTRADA ANTECIPADA (ECI) e SAÍDA ATRASADA (LCO).
 * Usado nos cards da Recepção e das Camareiras — mesma aparência nas duas telas.
 */
export function AvisosCloudbedsQuarto({
  bloqueado,
  tipoBloqueio,
  motivo,
  eci,
  lco,
  eciTime,
  lcoTime,
  className,
}: {
  bloqueado: boolean;
  tipoBloqueio?: TipoBloqueio;
  motivo?: string | null;
  eci?: boolean | null;
  lco?: boolean | null;
  eciTime?: string | null;
  lcoTime?: string | null;
  className?: string;
}) {
  if (!bloqueado && !eci && !lco) return null;
  const manutencao = tipoBloqueio !== "bloqueado";
  const IconeBloqueio = manutencao ? Wrench : Ban;
  return (
    <div className={cn("space-y-2", className)}>
      {bloqueado && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-red-500 bg-red-50 p-3 shadow-inner">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-600">
            <IconeBloqueio size={22} strokeWidth={3} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-700">
              {manutencao ? "Quarto em manutenção" : "Quarto bloqueado"} · Cloudbeds
            </p>
            <p className="break-words text-sm font-bold leading-snug text-red-900">
              {motivo?.trim() || (manutencao ? "Fora de operação para manutenção" : "Bloqueado no Cloudbeds")}
            </p>
          </div>
        </div>
      )}
      {eci && (
        <div className="flex items-center gap-2 rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-emerald-900">
          <LogIn size={18} strokeWidth={3} className="shrink-0 text-emerald-700" />
          <p className="text-sm font-black uppercase tracking-wide">
            Entrada antecipada{hora(eciTime) ? ` · ${hora(eciTime)}` : ""}
          </p>
        </div>
      )}
      {lco && (
        <div className="flex items-center gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 px-3 py-2 text-amber-900">
          <LogOut size={18} strokeWidth={3} className="shrink-0 text-amber-700" />
          <p className="text-sm font-black uppercase tracking-wide">
            Saída atrasada{hora(lcoTime) ? ` · até ${hora(lcoTime)}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
