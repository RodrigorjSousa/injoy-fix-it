/** 150 → "2h30"; 60 → "1h"; 25 → "25min". */
export function fmtHoras(min: number): string {
  const m = Math.round(Math.abs(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const t = h || !r ? `${h}h${r ? String(r).padStart(2, "0") : ""}` : `${r}min`;
  return min < 0 ? `−${t}` : t;
}

export const mesLabel = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

/** "1.234,56" / "1234,5" / "1234.5" → número; vazio → null. */
export function lerValor(texto: string): number | null {
  const t = texto.trim().replace(/\s|R\$/g, "");
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export const paraTexto = (n: number | null | undefined) =>
  n == null ? "" : String(n).replace(".", ",");

/** "8", "8,5", "8:30", "8h30", "8h" ou "25min" → minutos; inválido → null. */
export function lerHorasTexto(texto: string): number | null {
  const t = texto.trim().toLowerCase();
  if (!t) return null;
  const so = /^(\d{1,4})\s*min$/.exec(t);
  if (so) return Number(so[1]);
  const hm = /^(\d{1,4})\s*[h:]\s*(\d{1,2})?\s*(?:min)?$/.exec(t);
  if (hm) return Number(hm[2] ?? 0) < 60 ? Number(hm[1]) * 60 + Number(hm[2] ?? 0) : null;
  const dec = /^(\d+(?:[.,]\d+)?)$/.exec(t);
  return dec ? Math.round(Number(dec[1].replace(",", ".")) * 60) : null;
}
