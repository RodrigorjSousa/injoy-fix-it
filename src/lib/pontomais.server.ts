// Server-only helpers for Pontomais API integration.

const DEFAULT_PONTOMAIS_BASE_URL = "https://api.pontomais.com.br/external_api/v1";

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

function cpfFromPontomaisEmployee(row: any): string | null {
  const candidates = [
    row?.cpf,
    row?.document,
    row?.document_number,
    row?.documentNumber,
    row?.registration_number,
    row?.registrationNumber,
    row?.employee?.cpf,
    row?.employee?.document,
    row?.person?.cpf,
    row?.person?.document,
  ];

  for (const value of candidates) {
    const clean = sanitizeCpf(typeof value === "string" || typeof value === "number" ? String(value) : null);
    if (clean) return clean;
  }

  return null;
}

function employeeIdFromPontomaisRow(row: any): number | string | null {
  const id = row?.id ?? row?.employee_id ?? row?.employeeId ?? row?.employee?.id;
  return id !== undefined && id !== null && String(id).trim() !== "" ? id : null;
}

function employeesFromPayload(payload: any): any[] {
  const list =
    payload?.employees ??
    payload?.data ??
    payload?.records ??
    payload?.items ??
    payload?.results ??
    (Array.isArray(payload) ? payload : []);
  return Array.isArray(list) ? list : [];
}

function nextPageFromPayload(payload: any, currentPage: number, currentCount: number): number | null {
  const explicitNext = payload?.next_page ?? payload?.nextPage ?? payload?.pagination?.next_page;
  if (explicitNext !== undefined && explicitNext !== null && explicitNext !== false) {
    const next = Number(explicitNext);
    return Number.isFinite(next) && next > currentPage ? next : null;
  }

  const totalPages = Number(payload?.total_pages ?? payload?.totalPages ?? payload?.pagination?.total_pages);
  if (Number.isFinite(totalPages) && currentPage < totalPages) return currentPage + 1;

  const perPage = Number(payload?.per_page ?? payload?.perPage ?? payload?.pagination?.per_page);
  if (Number.isFinite(perPage) && currentCount >= perPage) return currentPage + 1;

  return null;
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

function getPontomaisBaseUrl(): string {
  const configured = process.env.PONTOMAIS_BASE_URL?.trim().replace(/\/$/, "");
  if (!configured) return DEFAULT_PONTOMAIS_BASE_URL;

  const isExternalApi =
    configured.includes("/external_api/v1") || configured.includes("/api/external");

  if (!isExternalApi) {
    console.warn("[pontomais] PONTOMAIS_BASE_URL ignorada por não apontar para a API externa pública");
    return DEFAULT_PONTOMAIS_BASE_URL;
  }

  return configured;
}

function getPontomaisToken(): string {
  // Em Workers/Lovable Cloud, variáveis de ambiente devem ser lidas durante a
  // execução da requisição. Nunca em escopo de módulo, senão podem virar undefined.
  const token = normalizeToken(process.env.PONTOMAIS_API_TOKEN);
  if (!token) {
    throw new Error(
      "A chave da Pontomais (Secret) não foi configurada ou não foi encontrada no Supabase",
    );
  }
  return token;
}

export function ensurePontomaisTokenConfigured(): void {
  getPontomaisToken();
}

function normalizeToken(value: string | undefined): string | null {
  const token = value?.trim().replace(/^Bearer\s+/i, "").replace(/^['\"]|['\"]$/g, "");
  return token || null;
}

async function tokenFingerprint(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function authHeaders(token: string): Record<string, string> {
  // Token da Conta / External API: enviar APENAS o token puro no header access-token.
  // Authorization: Bearer causa 403 "Token inválido!" nesse tipo de credencial.
  return {
    "Content-Type": "application/json",
    "access-token": token,
  };
}

async function pontomaisGet(url: string, token: string): Promise<any> {
  const headers = authHeaders(token);
  console.log("[pontomais] enviando token configurado", {
    tokenFingerprint: await tokenFingerprint(token),
    hasAccessTokenHeader: Boolean(headers["access-token"]),
    hasAuthorizationHeader: false,
  });
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers });
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
      hasAccessTokenHeader: Boolean(headers["access-token"]),
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
  const { cpf, token } = params;

  if (!cpf) return null;

  // Busca EXCLUSIVAMENTE por CPF — e-mail ignorado a pedido do gestor.
  // Nunca use /employees/{cpf}: esse caminho é para ID interno e retorna 404.
  const cleanCpf = sanitizeCpf(cpf);
  if (!cleanCpf) return null;

  const filteredAttempts: string[] = [
    `/employees?q[cpf_eq]=${encodeURIComponent(cleanCpf)}&per_page=100`,
    `/employees?cpf=${encodeURIComponent(cleanCpf)}&per_page=100`,
    `/employees?search=${encodeURIComponent(cleanCpf)}&per_page=100`,
  ];

  for (const path of filteredAttempts) {
    try {
      const payload = await pontomaisGet(`${getPontomaisBaseUrl()}${path}`, token);
      const list = employeesFromPayload(payload);
      if (list.length === 0) continue;

      const hit =
        list.find((row: any) => cpfFromPontomaisEmployee(row) === cleanCpf) ??
        (list.length === 1 ? list[0] : null);
      const id = hit ? employeeIdFromPontomaisRow(hit) : null;
      if (id) return id;
    } catch (err) {
      if (err instanceof PontomaisApiError && err.status === 404) continue;
      throw err;
    }
  }

  // Fallback mais seguro: lista funcionários e cruza o CPF localmente.
  // Isso evita depender de parâmetros não suportados pela API e elimina o 404 em massa.
  let page = 1;
  const visitedPages = new Set<number>();

  while (!visitedPages.has(page) && page <= 100) {
    visitedPages.add(page);
    const query = new URLSearchParams();
    query.set("page", String(page));
    query.set("per_page", "100");

    const payload = await pontomaisGet(`${getPontomaisBaseUrl()}/employees?${query.toString()}`, token);
    const list = employeesFromPayload(payload);

    const hit = list.find((row: any) => cpfFromPontomaisEmployee(row) === cleanCpf);
    const id = hit ? employeeIdFromPontomaisRow(hit) : null;
    if (id) return id;

    const nextPage = nextPageFromPayload(payload, page, list.length);
    if (!nextPage || list.length === 0) break;
    page = nextPage;
  }

  return null;
}

export async function fetchPontomaisRegistros(params: {
  cpf?: string | null;
  email?: string | null;
  pontomaisEmployeeId?: string | number | null;
  startDate: string;
  endDate: string;
}): Promise<{
  employeeId: string | number;
  resolvedByCpf: boolean;
  byDate: Record<string, PontomaisRegistro>;
}> {
  const token = getPontomaisToken();

  const cleanCpf = sanitizeCpf(params.cpf);
  const explicitId =
    params.pontomaisEmployeeId !== undefined && params.pontomaisEmployeeId !== null
      ? String(params.pontomaisEmployeeId).trim()
      : "";

  let employeeId: number | string | null = null;
  let resolvedByCpf = false;

  // 1) Tenta o ID explícito, mas se falhar (404 / inválido) segue para busca por CPF.
  if (explicitId) {
    try {
      const check = await pontomaisGet(
        `${getPontomaisBaseUrl()}/employees/${encodeURIComponent(explicitId)}`,
        token,
      );
      const found = check?.employee ?? check?.data ?? check;
      const foundId = found?.id ?? found?.employee_id;
      if (foundId) {
        employeeId = foundId;
      }
    } catch (err) {
      // Qualquer erro (inclusive 404) no ID salvo cai para o fluxo por CPF.
      console.warn("[pontomais] ID explícito falhou, tentando por CPF", {
        explicitId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2) Sem ID válido? Resolve exclusivamente pelo CPF.
  if (!employeeId) {
    if (!cleanCpf) {
      throw new Error(
        "Funcionário sem CPF cadastrado. Preencha o CPF em Controle de Ponto (a busca é feita exclusivamente pelo CPF).",
      );
    }

    employeeId = await resolveEmployeeId({ cpf: cleanCpf, email: null, token });

    if (!employeeId) {
      throw new PontomaisApiError(
        404,
        "",
        `Funcionário não localizado na Pontomais pelo CPF ${cleanCpf}. Confirme o CPF cadastrado.`,
      );
    }
    resolvedByCpf = true;
  }

  const query = new URLSearchParams();
  query.set("start_date", params.startDate);
  query.set("end_date", params.endDate);
  query.set("employee_id", String(employeeId));
  query.set("q[employee_id_eq]", String(employeeId));

  const url = `${getPontomaisBaseUrl()}/time_cards?${query.toString()}`;
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

  return { employeeId: employeeId as string | number, resolvedByCpf, byDate };
}
