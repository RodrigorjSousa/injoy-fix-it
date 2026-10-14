import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { minutosDesde, syncAtrasada, textoAtraso } from "@/lib/sync-atraso";

/**
 * Faixa de alerta quando a última sincronização com o Cloudbeds da unidade está atrasada.
 * Sem ela, uma falha de sincronização deixava bloqueios/desbloqueios e chegadas velhos na tela
 * sem ninguém perceber.
 */
export function AvisoSyncCloudbeds({
  unidade,
  sincronizando,
  onSincronizar,
}: {
  unidade: string;
  sincronizando: boolean;
  onSincronizar: () => void;
}) {
  const [ultima, setUltima] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    if (sincronizando) return;
    let ativo = true;
    const ler = async () => {
      const { data } = await supabase
        .from("hotel_metrics")
        .select("updated_at")
        .eq("property", unidade)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ativo) {
        setUltima((data as { updated_at?: string } | null)?.updated_at ?? null);
        setAgora(new Date());
      }
    };
    void ler();
    const t = setInterval(ler, 60_000);
    return () => {
      ativo = false;
      clearInterval(t);
    };
  }, [unidade, sincronizando]);

  if (!syncAtrasada(ultima, agora)) return null;
  const min = minutosDesde(ultima, agora) ?? 0;

  return (
    <div className="flex items-start gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-amber-900">
      <AlertTriangle size={20} className="mt-0.5 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-bold">Cloudbeds sem atualizar {textoAtraso(min)}</p>
        <p className="text-xs">
          Bloqueios, desbloqueios e chegadas podem estar desatualizados. Confira com a recepção.
        </p>
      </div>
      <button
        onClick={onSincronizar}
        disabled={sincronizando}
        className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
      >
        <RefreshCw size={14} className={sincronizando ? "animate-spin" : ""} />
        Atualizar
      </button>
    </div>
  );
}
