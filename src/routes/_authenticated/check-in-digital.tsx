import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Key, KeyRound } from "lucide-react";
import { CheckInDigitalButton } from "@/components/recepcao/check-in-digital-modal";
import { TuyaLogsButton } from "@/components/recepcao/tuya-logs-modal";
import { AbrirPortasRemoto } from "@/components/recepcao/abrir-portas-remoto";
import { SenhasAtivasPanel } from "@/components/recepcao/senhas-ativas-panel";
import { TuyaDevicesManagerModal } from "@/components/gestao/tuya-devices-manager";
import { useUnidade } from "@/lib/unidade-context";

export const Route = createFileRoute("/_authenticated/check-in-digital")({
  component: CheckInDigitalPage,
});

function CheckInDigitalPage() {
  const { unidade } = useUnidade();
  const [tuyaOpen, setTuyaOpen] = useState(false);


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

      <button
        type="button"
        onClick={() => setTuyaOpen(true)}
        className="w-full max-w-xl flex items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-teal-500 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 grid place-items-center text-white shadow-sm">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">Gerenciar Fechaduras Tuya</p>
            <p className="text-xs text-slate-500">Cadastro por unidade e por quarto — habilita o check-in digital</p>
          </div>
        </div>
      </button>

      <TuyaDevicesManagerModal open={tuyaOpen} onOpenChange={setTuyaOpen} />

      {unidade === "Botafogo" ? (
        <>

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

          <AbrirPortasRemoto unidade={unidade} />
          <SenhasAtivasPanel unidade={unidade} />
        </>
      ) : (
        <>
          <div className="bg-white p-6 rounded-2xl border border-dashed border-slate-300 text-center max-w-xl">
            <p className="text-sm text-slate-600">
              Nenhuma fechadura de quarto cadastrada para <strong>INJOY {unidade}</strong> ainda.
            </p>
            <div className="mt-4 max-w-xs mx-auto">
              <TuyaLogsButton />
            </div>
          </div>

          <AbrirPortasRemoto unidade={unidade} />
          <SenhasAtivasPanel unidade={unidade} />
        </>
      )}
    </div>
  );
}
