import { createFileRoute } from "@tanstack/react-router";
import { Key } from "lucide-react";
import { CheckInDigitalButton } from "@/components/recepcao/check-in-digital-modal";
import { TuyaLogsButton } from "@/components/recepcao/tuya-logs-modal";
import { AbrirPortasRemoto } from "@/components/recepcao/abrir-portas-remoto";
import { useUnidade } from "@/lib/unidade-context";

export const Route = createFileRoute("/_authenticated/check-in-digital")({
  component: CheckInDigitalPage,
});

function CheckInDigitalPage() {
  const { unidade } = useUnidade();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 grid place-items-center text-white shadow-sm">
          <Key className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Check-in Digital</h1>
          <p className="text-sm text-slate-500">
            Gestão das fechaduras inteligentes Tuya · INJOY {unidade}
          </p>
        </div>
      </div>

      {unidade === "Botafogo" ? (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm max-w-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 grid place-items-center text-white shadow-sm">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Quarto 005 · Botafogo</p>
              <p className="text-xs text-slate-500">
                Portão Principal + Porta de Vidro + Quarto 005
              </p>
            </div>
          </div>
          <CheckInDigitalButton roomNumber="005" />
          <div className="mt-3">
            <TuyaLogsButton />
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-2xl border border-dashed border-slate-300 text-center max-w-xl">
          <p className="text-sm text-slate-600">
            Nenhuma fechadura cadastrada para a unidade <strong>INJOY {unidade}</strong> ainda.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Novos dispositivos aparecerão aqui conforme forem instalados.
          </p>
          <div className="mt-4 max-w-xs mx-auto">
            <TuyaLogsButton />
          </div>
        </div>
      )}
    </div>
  );
}
