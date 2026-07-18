// Server-only helpers for Pontomais API integration.

const PONTOMAIS_BASE_URL =
  process.env.PONTOMAIS_BASE_URL || "https://api.pontomais.com.br/external_api/v1";

export type PontomaisRegistro = {
  entrada?: string | null;
  almoco_saida?: string | null;
  almoco_retorno?: string | null;
  saida?: string | null;
};

export class PontomaisApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, message?: string) {
    super(message ?? `Pontomais API ${status}`);
    this.status = status;
    this.body = body;
  }
}

function toTime(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const iso = value.includes("T") ? new Date(value) : null;
  if (iso && !isNaN(iso.getTime())) {
    return iso.toISOString().substring(11, 19);
  }
  const m = value.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
}

function sanitizeCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

function friendlyErrorMessage(status: number, body: string): string {
  const snippet = body ? ` — ${body.slice(0, 200)}` : "";
  switch (status) {
    case 400:
      return `Requisição inválida enviada à Pontomais (400). Verifique CPF/e-mail e período.${snippet}`;
    case 401:
      return `Token da Pontomais não autorizado (401). Verifique PONTOMAIS_API_TOKEN.${snippet}`;
    case 403:
      return `Acesso negado pela Pontomais (403). Confirme permissões do token.${snippet}`;
    case 404:
      return `Funcionário/registro não encontrado na Pontomais (404).${snippet}`;
    case 422:
      return `Parâmetros rejeitados pela Pontomais (422).${snippet}`;
    case 429:
      return `Limite de requisições atingido na Pontomais (429). Tente novamente em instantes.${snippet}`;
    default:
      if (status >= 500) return `Pontomais indisponível (${status}). Tente novamente.${snippet}`;
      return `Erro Pontomais (${status}).${snippet}`;
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    // Cover common Pontomais auth header variants.
    Authorization: `Bearer ${token}`,
    "access-token": token,
    access_token: token,
    "api-token": token,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function pontomaisGet(url: string, token: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: authHeaders(token) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pontomais] network error", { url, error: msg });
    throw new Error(`Falha de rede ao contatar a Pontomais: ${msg}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[pontomais] non-2xx response", {
      url,
      status: res.status,
      statusText: res.statusText,
      body: text.slice(0, 500),
    });
    throw new PontomaisApiError(res.status, text, friendlyErrorMessage(res.status, text));
  }

  try {
    return await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pontomais] invalid JSON", { url, error: msg });
    throw new Error("Resposta da Pontomais em formato inesperado (JSON inválido).");
  }
}

/**
 * Resolve the internal Pontomais employee_id by CPF (preferred) or email.
 * Uses the /employees listing endpoint with ransack-style filters — never
 * pass the CPF as a path segment (that returns 404 because it is not the
 * internal numeric ID).
 */
async function resolveEmployeeId(params: {
  cpf: string | null;
  email: string | null;
  token: string;
}): Promise<number | string | null> {
  const { cpf, email, token } = params;

  const attempts: string[] = [];
  if (cpf) {
    // Ransack filter — Pontomais accepts q[cpf_eq]. Also try plain cpf= as fallback.
    attempts.push(`/employees?q[cpf_eq]=${encodeURIComponent(cpf)}&per_page=1`);
    attempts.push(`/employees?cpf=${encodeURIComponent(cpf)}&per_page=1`);
    attempts.push(`/employees?search=${encodeURIComponent(cpf)}&per_page=1`);
  }
  if (email) {
    attempts.push(`/employees?q[email_eq]=${encodeURIComponent(email)}&per_page=1`);
    attempts.push(`/employees?email=${encodeURIComponent(email)}&per_page=1`);
  }

  for (const path of attempts) {
    try {
      const payload = await pontomaisGet(`${PONTOMAIS_BASE_URL}${path}`, token);
      const list: any[] =
        payload?.employees ?? payload?.data ?? payload?.records ?? (Array.isArray(payload) ? payload : []);
      if (!Array.isArray(list) || list.length === 0) continue;

      const matcher = (row: any) => {
        const rowCpf = String(row?.cpf ?? row?.document ?? "").replace(/\D/g, "");
        const rowEmail = String(row?.email ?? "").toLowerCase();
        if (cpf && rowCpf === cpf) return true;
        if (email && rowEmail === email) return true;
        return false;
      };

      const hit = list.find(matcher) ?? list[0];
      const id = hit?.id ?? hit?.employee_id ?? hit?.employeeId;
      if (id !== undefined && id !== null) return id;
    } catch (err) {
      if (err instanceof PontomaisApiError && err.status === 404) {
        // 404 on this filter path just means no match — try the next variant.
        continue;
      }
      throw err;
    }
  }

  return null;
}

export async function fetchPontomaisRegistros(params: {
  cpf?: string | null;
  email?: string | null;
  startDate: string;
  endDate: string;
}): Promise<Record<string, PontomaisRegistro>> {
  const token = process.env.PONTOMAIS_API_TOKEN;
  if (!token) {
    throw new Error("PONTOMAIS_API_TOKEN não configurado");
  }

  const cleanCpf = sanitizeCpf(params.cpf);
  const cleanEmail = params.email?.trim().toLowerCase() || null;

  if (!cleanCpf && !cleanEmail) {
    throw new Error(
      "Funcionário sem CPF válido (11 dígitos) ou e-mail cadastrado para vincular ao Pontomais.",
    );
  }

  const employeeId = await resolveEmployeeId({
    cpf: cleanCpf,
    email: cleanEmail,
    token,
  });

  if (!employeeId) {
    throw new PontomaisApiError(
      404,
      "",
      `Funcionário não localizado na Pontomais (CPF/e-mail sem correspondência).`,
    );
  }

  const query = new URLSearchParams();
  query.set("start_date", params.startDate);
  query.set("end_date", params.endDate);
  query.set("employee_id", String(employeeId));
  // Ransack fallback in case the API expects filter[] syntax:
  query.set("q[employee_id_eq]", String(employeeId));

  const url = `${PONTOMAIS_BASE_URL}/time_cards?${query.toString()}`;
  const payload = await pontomaisGet(url, token);

  const rows: any[] = payload?.time_cards ?? payload?.data ?? payload?.registros ?? [];
  const byDate: Record<string, PontomaisRegistro> = {};

  for (const row of rows) {
    const date: string | undefined =
      row?.date ?? row?.work_date ?? row?.data ?? row?.day;
    if (!date) continue;
    const key = String(date).substring(0, 10);

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
