import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { buscarVersaoPublicada, temVersaoNova, versoesCarregadas } from "@/lib/nova-versao";

const INTERVALO = 5 * 60_000;

/** Faixa fixa que aparece quando o app foi publicado de novo e esta tela ainda roda o código antigo. */
export function AvisoNovaVersao() {
  const [nova, setNova] = useState(false);

  useEffect(() => {
    if (versoesCarregadas().size === 0) return; // desenvolvimento/preview: nada a comparar
    let parar = false;
    const conferir = async () => {
      if (parar || document.visibilityState !== "visible") return;
      try {
        if (temVersaoNova(versoesCarregadas(), await buscarVersaoPublicada())) setNova(true);
      } catch {
        // sem internet: tenta de novo depois
      }
    };
    const primeira = window.setTimeout(conferir, 20_000);
    const repetir = window.setInterval(conferir, INTERVALO);
    document.addEventListener("visibilitychange", conferir);
    window.addEventListener("focus", conferir);
    return () => {
      parar = true;
      window.clearTimeout(primeira);
      window.clearInterval(repetir);
      document.removeEventListener("visibilitychange", conferir);
      window.removeEventListener("focus", conferir);
    };
  }, []);

  if (!nova) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-3 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md flex items-center gap-3 rounded-2xl bg-emerald-600 text-white shadow-2xl px-4 py-3">
        <RefreshCw className="h-5 w-5 shrink-0" />
        <p className="flex-1 text-sm font-semibold leading-snug">
          Tem uma versão nova do app. Toque em atualizar para usar as novidades.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-xl bg-white text-emerald-700 font-black text-xs uppercase px-3 py-2"
        >
          Atualizar
        </button>
      </div>
    </div>
  );
}
