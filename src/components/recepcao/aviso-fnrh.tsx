// Aviso FNRH no card da Recepção: o que falta no cadastro do Cloudbeds para a ficha
// (FNRH Digital) passar no check-in. Um hóspede com erro trava a reserva inteira.
import { useState } from "react";
import { ShieldAlert } from "lucide-react";

export type PendenciaFnrh = { hospede: string; faltando: string[] };

export function AvisoFnrh({
  pendencias,
  checkinFeito = false,
  compacto = false,
}: {
  pendencias?: PendenciaFnrh[] | null;
  checkinFeito?: boolean;
  compacto?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const lista = Array.isArray(pendencias) ? pendencias : [];
  if (!lista.length) return null;
  const resumo = [...new Set(lista.flatMap((p) => p.faltando))];
  return (
    <div
      className={`rounded-lg border ${compacto ? "border-orange-200" : "border-2 border-orange-300"} bg-orange-50 px-2.5 py-1.5 text-orange-800`}
    >
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-start gap-1.5 text-left"
      >
        <ShieldAlert size={compacto ? 12 : 14} className="mt-0.5 shrink-0" />
        <span className={compacto ? "text-[11px]" : "text-xs"}>
          <span className="font-black">FNRH: falta </span>
          <span className="font-semibold">{resumo.join(", ")}</span>
          <span className="ml-1 underline decoration-dotted">{aberto ? "ocultar" : "ver"}</span>
        </span>
      </button>
      {aberto && (
        <div className="mt-1.5 space-y-1 border-t border-orange-200 pt-1.5 text-[11px]">
          {lista.map((p, i) => (
            <p key={`${p.hospede}-${i}`}>
              <span className="font-bold">{p.hospede}:</span> {p.faltando.join(", ")}
            </p>
          ))}
          <p className="text-orange-700/80">
            {checkinFeito
              ? "A ficha pode ter dado erro no check-in. Corrija no Cloudbeds e reenvie: mude o status da reserva para Confirmada (\"Confirmar\", sem e-mail) e volte para Hospedado."
              : "Corrija no cadastro do hóspede no Cloudbeds antes do check-in — um hóspede com erro trava a FNRH da reserva toda."}
          </p>
        </div>
      )}
    </div>
  );
}
