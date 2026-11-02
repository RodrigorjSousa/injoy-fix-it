import { Clock } from "lucide-react";
import { useHoraServidor } from "@/lib/ponto-rep";

/** Relógio com segundos pela hora do servidor (a batida usa sempre a hora do servidor). */
export function RelogioPonto() {
  const { agora, sincronizado } = useHoraServidor();
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(agora);
  const data = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(agora);
  return (
    <div className="rounded-xl bg-slate-900 p-3 text-center text-white">
      <p className="font-mono text-3xl font-black tabular-nums tracking-wider" aria-live="off">
        {hora}
      </p>
      <p className="flex items-center justify-center gap-1 text-xs capitalize text-slate-300">
        <Clock className="h-3 w-3" />
        {data} · {sincronizado ? "horário de Brasília (servidor)" : "sincronizando…"}
      </p>
    </div>
  );
}
