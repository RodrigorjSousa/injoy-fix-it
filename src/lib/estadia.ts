// Datas da estadia no card das camareiras: quando o hóspede sai e em que noite da estadia está.

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-10-23" → "23/10 (sex)". */
export function dataCurta(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return "";
  const dia = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${m[3]}/${m[2]} (${SEMANA[dia.getUTCDay()]})`;
}

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export type ResumoEstadia = {
  saida: string; // "23/10 (sex)"
  quando: "hoje" | "amanha" | "depois" | "passou";
  noites: number | null; // total da reserva
  noiteAtual: number | null; // 1 = primeira noite (entrou hoje)
};

export function resumoEstadia(
  checkin: string | null | undefined,
  checkout: string | null | undefined,
  hoje: string,
): ResumoEstadia | null {
  const co = String(checkout ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(co)) return null;
  const faltam = diasEntre(hoje, co);
  const quando = faltam < 0 ? "passou" : faltam === 0 ? "hoje" : faltam === 1 ? "amanha" : "depois";
  const ci = String(checkin ?? "").slice(0, 10);
  const temEntrada = /^\d{4}-\d{2}-\d{2}$/.test(ci);
  const noites = temEntrada ? Math.max(0, diasEntre(ci, co)) : null;
  const noiteAtual = temEntrada && noites ? Math.min(noites, Math.max(1, diasEntre(ci, hoje) + 1)) : null;
  return { saida: dataCurta(co), quando, noites, noiteAtual };
}

/** Texto curto: "Sai amanhã, 23/10 (sex) · 3ª de 5 noites". */
export function textoEstadia(r: ResumoEstadia): string {
  const prefixo = r.quando === "hoje" ? "Sai hoje" : r.quando === "amanha" ? "Sai amanhã" : "Saída";
  const noite = r.noiteAtual && r.noites ? ` · ${r.noiteAtual}ª de ${r.noites} noite${r.noites === 1 ? "" : "s"}` : "";
  return `${prefixo}, ${r.saida}${noite}`;
}
