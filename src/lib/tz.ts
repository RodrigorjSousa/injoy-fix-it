// Fuso horário oficial da operação: America/Sao_Paulo.
// Usamos estas helpers para garantir que "hoje", cortes de 23h e datas
// exibidas sejam iguais para qualquer usuário, independentemente do fuso
// do navegador (Brasil, Portugal, etc.).

const TZ = "America/Sao_Paulo";

/**
 * Retorna um Date cujo horário LOCAL (getHours/getDate/...) corresponde
 * ao horário atual em São Paulo. Útil quando o código existente já
 * manipula um `new Date()` com getters locais.
 */
export function nowSP(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const hour = get("hour") === 24 ? 0 : get("hour");
  return new Date(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
}

/** YYYY-MM-DD do dia atual em São Paulo. */
export function todaySP(): string {
  const d = nowSP();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
