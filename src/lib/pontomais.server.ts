// Server-only helpers for Pontomais API integration.
// The base URL and endpoint paths can be tuned to match the actual
// Pontomais API contract used by the account.

const PONTOMAIS_BASE_URL =
  process.env.PONTOMAIS_BASE_URL || "https://api.pontomais.com.br/external_api/v1";

export type PontomaisRegistro = {
  entrada?: string | null;
  almoco_saida?: string | null;
  almoco_retorno?: string | null;
  saida?: string | null;
};

function toTime(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  // Accept "HH:MM", "HH:MM:SS", or ISO timestamps and return HH:MM:SS
  const iso = value.includes("T") ? new Date(value) : null;
  if (iso && !isNaN(iso.getTime())) {
    return iso.toISOString().substring(11, 19);
  }
  const m = value.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
}

/**
 * Fetch time entries from Pontomais for a given identifier (CPF or email)
 * within a date range. Returns a map of date (YYYY-MM-DD) -> registro.
 *
 * The Pontomais external API returns time_cards with punches; we reduce
 * the punches per day into the 4 canonical slots.
 */
export async function fetchPontomaisRegistros(params: {
  cpf?: string | null;
  email?: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}): Promise<Record<string, PontomaisRegistro>> {
  const token = process.env.PONTOMAIS_API_TOKEN;
  if (!token) {
    throw new Error("PONTOMAIS_API_TOKEN não configurado");
  }

  const query = new URLSearchParams();
  query.set("start_date", params.startDate);
  query.set("end_date", params.endDate);
  if (params.cpf) query.set("cpf", params.cpf);
  if (params.email) query.set("email", params.email);

  const url = `${PONTOMAIS_BASE_URL}/time_cards?${query.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      access_token: token,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pontomais API ${res.status}: ${text.slice(0, 300)}`);
  }

  const payload = (await res.json().catch(() => ({}))) as any;
  const rows: any[] =
    payload?.time_cards ?? payload?.data ?? payload?.registros ?? [];

  const byDate: Record<string, PontomaisRegistro> = {};

  for (const row of rows) {
    const date: string | undefined =
      row?.date ?? row?.work_date ?? row?.data ?? row?.day;
    if (!date) continue;
    const key = String(date).substring(0, 10);

    // Try structured fields first
    const structured: PontomaisRegistro = {
      entrada: toTime(row?.entrada ?? row?.check_in ?? row?.entry),
      almoco_saida: toTime(row?.almoco_saida ?? row?.lunch_out ?? row?.break_start),
      almoco_retorno: toTime(row?.almoco_retorno ?? row?.lunch_in ?? row?.break_end),
      saida: toTime(row?.saida ?? row?.check_out ?? row?.exit),
    };

    if (
      structured.entrada ||
      structured.saida ||
      structured.almoco_saida ||
      structured.almoco_retorno
    ) {
      byDate[key] = structured;
      continue;
    }

    // Fall back to punches array (chronological)
    const punches: string[] = (row?.punches ?? row?.time_entries ?? [])
      .map((p: any) => toTime(p?.time ?? p?.hora ?? p))
      .filter(Boolean) as string[];
    punches.sort();

    byDate[key] = {
      entrada: punches[0] ?? null,
      almoco_saida: punches[1] ?? null,
      almoco_retorno: punches[2] ?? null,
      saida: punches[3] ?? null,
    };
  }

  return byDate;
}
