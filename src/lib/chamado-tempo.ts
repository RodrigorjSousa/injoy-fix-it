// Tempo que o chamado levou do aberto ao fechado ("2 d 3 h", "4 h 20 min", "35 min").

export function duracaoChamado(
  inicio: string | null | undefined,
  fim: string | null | undefined,
): string | null {
  if (!inicio || !fim) return null;
  const a = Date.parse(inicio);
  const b = Date.parse(fim);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const totalMin = Math.round((b - a) / 60_000);
  if (totalMin < 1) return "menos de 1 min";
  const dias = Math.floor(totalMin / 1440);
  const horas = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;
  if (dias > 0) return horas > 0 ? `${dias} d ${horas} h` : `${dias} d`;
  if (horas > 0) return min > 0 ? `${horas} h ${min} min` : `${horas} h`;
  return `${min} min`;
}

/** "18/10/2026 09:36" no horário do Rio. */
export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
