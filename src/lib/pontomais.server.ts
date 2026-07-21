// Server-only helpers for Pontomais API integration.

const DEFAULT_PONTOMAIS_BASE_URL = "https://api.pontomais.com.br/external_api/v1";

export type PontomaisRegistro = {
  entrada?: string | null;
  almoco_saida?: string | null;
  almoco_retorno?: string | null;
  saida?: string | null;
};

type JsonRecord = Record<string, unknown>;

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

export function sanitizePontomaisCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asStringish(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function cpfFromPontomaisEmployee(row: unknown): string | null {
  const record = asRecord(row);
  const employee = asRecord(record?.employee);
  const person = asRecord(record?.person);
  const user = asRecord(record?.user);
  const individual = asRecord(record?.individual);
  const candidates = [
    record?.cpf,
    record?.document,
    record?.document_number,
    record?.documentNumber,
    record?.registration_number,
    record?.registrationNumber,
    employee?.cpf,
    employee?.document,
    person?.cpf,
    person?.document,
    user?.cpf,
    user?.document,
    individual?.cpf,
    individual?.document,
  ];

  for (const value of candidates) {
    const clean = sanitizePontomaisCpf(asStringish(value));
    if (clean) return clean;
  }

  return findCpfDeep(row);
}

function findCpfDeep(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;

  if (typeof value === "string" || typeof value === "number") {
    return sanitizePontomaisCpf(String(value));
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findCpfDeep(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;

  const preferredEntries = Object.entries(record).filter(([key]) =>
    /cpf|document|tax|registration/i.test(key),
  );
  const otherEntries = Object.entries(record).filter(
    ([key]) => !/cpf|document|tax|registration/i.test(key),
  );

  for (const [, nested] of [...preferredEntries, ...otherEntries]) {
    const hit = findCpfDeep(nested, depth + 1);
    if (hit) return hit;
  }

  return null;
}

function employeeIdFromPontomaisRow(row: unknown): number | string | null {
  const record = asRecord(row);
  const employee = asRecord(record?.employee);
  const id = record?.id ?? record?.employee_id ?? record?.employeeId ?? employee?.id;
  const idValue = asStringish(id);
  return idValue && idValue.trim() !== "" ? idValue : null;
}

function employeesFromPayload(payload: unknown): unknown[] {
  const record = asRecord(payload);
  const list =
    record?.employees ??
    record?.data ??
    record?.records ??
    record?.items ??
    record?.results ??
    (Array.isArray(payload) ? payload : []);
  return Array.isArray(list) ? list : [];
}

function nextPageFromPayload(
  payload: unknown,
  currentPage: number,
  currentCount: number,
): number | null {
  const record = asRecord(payload);
  const pagination = asRecord(record?.pagination);
  const explicitNext = record?.next_page ?? record?.nextPage ?? pagination?.next_page;
  if (explicitNext !== undefined && explicitNext !== null && explicitNext !== false) {
    const next = Number(explicitNext);
    return Number.isFinite(next) && next > currentPage ? next : null;
  }

  const totalPages = Number(record?.total_pages ?? record?.totalPages ?? pagination?.total_pages);
  if (Number.isFinite(totalPages) && currentPage < totalPages) return currentPage + 1;

  const perPage = Number(record?.per_page ?? record?.perPage ?? pagination?.per_page);
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
    configured.includes("/external_api/v1") ||
    configured.includes("/api/external") ||
    configured.includes("/api/v1");

  if (!isExternalApi) {
    console.warn(
      "[pontomais] PONTOMAIS_BASE_URL ignorada por não apontar para a API externa pública",
    );
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
  const token = value
    ?.trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^['"]|['"]$/g, "");
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

async function pontomaisGet(url: string, token: string): Promise<unknown> {
  const headers = authHeaders(token);
  const fingerprint = await tokenFingerprint(token);
  console.log("Enviando requisição para Pontomais com token:", {
    tokenFingerprint: fingerprint,
    tokenLength: token.length,
    hasAccessTokenHeader: Boolean(headers["access-token"]),
    hasAuthorizationHeader: false,
    url,
  });
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers });
    console.log("Resposta bruta da Pontomais:", {
      url,
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      contentType: res.headers.get("content-type"),
    });
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

async function listAllPontomaisEmployeesOnce(token: string): Promise<unknown[]> {
  const query = new URLSearchParams();
  query.set("page", "1");
  query.set("per_page", "1000");

  const url = `${getPontomaisBaseUrl()}/employees?${query.toString()}`;
  const payload = await pontomaisGet(url, token);
  const list = employeesFromPayload(payload);

  console.log("[pontomais] busca coletiva de funcionários concluída", {
    url,
    totalRecebido: list.length,
  });

  return list;
}

export type PontomaisEmployeeMatch = {
  employeeId: string;
  cpf: string;
};

export async function buildPontomaisEmployeeMapByCpf(): Promise<Record<string, PontomaisEmployeeMatch>> {
  const token = getPontomaisToken();
  const employees = await listAllPontomaisEmployeesOnce(token);
  const byCpf: Record<string, PontomaisEmployeeMatch> = {};
  let ignoredWithoutCpf = 0;
  let ignoredWithoutId = 0;
  let duplicatedCpf = 0;

  for (const row of employees) {
    const cpf = cpfFromPontomaisEmployee(row);
    if (!cpf) {
      ignoredWithoutCpf += 1;
      continue;
    }

    const employeeId = employeeIdFromPontomaisRow(row);
    if (!employeeId) {
      ignoredWithoutId += 1;
      continue;
    }

    if (byCpf[cpf]) {
      duplicatedCpf += 1;
      console.warn("[pontomais] CPF duplicado na listagem; mantendo primeiro ID", {
        cpf,
        primeiroId: byCpf[cpf].employeeId,
        idIgnorado: String(employeeId),
      });
      continue;
    }

    byCpf[cpf] = { cpf, employeeId: String(employeeId) };
  }

  console.log("[pontomais] mapa de funcionários por CPF criado", {
    totalPontomais: employees.length,
    totalComCpfEId: Object.keys(byCpf).length,
    ignoredWithoutCpf,
    ignoredWithoutId,
    duplicatedCpf,
  });

  return byCpf;
}

export async function fetchPontomaisRegistrosByEmployeeId(params: {
  employeeId: string | number;
  cpf?: string | null;
  startDate: string;
  endDate: string;
}): Promise<{
  byDate: Record<string, PontomaisRegistro>;
}> {
  const token = getPontomaisToken();
  const cleanCpf = sanitizePontomaisCpf(params.cpf);
  const employeeId = String(params.employeeId).trim();
  if (!employeeId) throw new Error(`CPF ${cleanCpf ?? "sem CPF"} encontrado sem ID na Pontomais`);

  const query = new URLSearchParams();
  query.set("start_date", params.startDate);
  query.set("end_date", params.endDate);
  query.set("employee_id", String(employeeId));
  query.set("q[employee_id_eq]", String(employeeId));
  // Solicita explicitamente as batidas (entries) na resposta — sem isso a Pontomais
  // devolve só resumos e o parser não encontra horários.
  query.set(
    "attributes",
    "id,date,work_date,time_cards_entries,time_card_entries,time_entries,punches",
  );

  const url = `${getPontomaisBaseUrl()}/time_cards?${query.toString()}`;
  let payload: unknown;
  try {
    payload = await pontomaisGet(url, token);
  } catch (err) {
    if (err instanceof PontomaisApiError && err.status === 404) {
      console.warn("[pontomais] batidas não encontradas para funcionário no período", {
        employeeId,
        cpf: cleanCpf,
        startDate: params.startDate,
        endDate: params.endDate,
      });
      return { byDate: {} };
    }
    throw err;
  }

  const payloadRecord = asRecord(payload);
  const rawRows =
    payloadRecord?.time_cards ?? payloadRecord?.data ?? payloadRecord?.registros ?? [];
  const rows: unknown[] = Array.isArray(rawRows) ? rawRows : [];
  const byDate: Record<string, PontomaisRegistro> = {};

  if (rows.length > 0) {
    console.log("[pontomais] estrutura da primeira batida recebida", {
      employeeId,
      totalRows: rows.length,
      firstRowKeys: Object.keys(asRecord(rows[0]) ?? {}),
      firstRowSample: JSON.stringify(rows[0]).slice(0, 800),
    });
  } else {
    console.log("[pontomais] nenhuma batida retornada", {
      employeeId,
      startDate: params.startDate,
      endDate: params.endDate,
      payloadKeys: payloadRecord ? Object.keys(payloadRecord) : null,
    });
  }

  for (const row of rows) {
    const rowRecord = asRecord(row);
    const date: string | undefined =
      asStringish(rowRecord?.date ?? rowRecord?.work_date ?? rowRecord?.data ?? rowRecord?.day) ??
      undefined;
    if (!date) continue;
    const key = String(date).substring(0, 10);

    const structured: PontomaisRegistro = {
      entrada: toTime(rowRecord?.entrada ?? rowRecord?.check_in ?? rowRecord?.entry),
      almoco_saida: toTime(
        rowRecord?.almoco_saida ?? rowRecord?.lunch_out ?? rowRecord?.break_start,
      ),
      almoco_retorno: toTime(
        rowRecord?.almoco_retorno ?? rowRecord?.lunch_in ?? rowRecord?.break_end,
      ),
      saida: toTime(rowRecord?.saida ?? rowRecord?.check_out ?? rowRecord?.exit),
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

    // Coleta batidas de todas as chaves conhecidas da Pontomais.
    const punchSources = [
      rowRecord?.time_cards_entries,
      rowRecord?.time_card_entries,
      rowRecord?.time_entries,
      rowRecord?.punches,
      rowRecord?.entries,
    ];
    const rawPunches: unknown[] = [];
    for (const src of punchSources) {
      if (Array.isArray(src)) rawPunches.push(...src);
    }

    const punches: string[] = rawPunches
      .map((p) => {
        const punchRecord = asRecord(p);
        return toTime(
          punchRecord?.time ??
            punchRecord?.hora ??
            punchRecord?.time_registration ??
            punchRecord?.registered_at ??
            punchRecord?.datetime ??
            punchRecord?.date_time ??
            p,
        );
      })
      .filter(Boolean) as string[];
    punches.sort();

    if (punches.length === 0) continue;

    byDate[key] = {
      entrada: punches[0] ?? null,
      almoco_saida: punches[1] ?? null,
      almoco_retorno: punches[2] ?? null,
      saida: punches[punches.length - 1] ?? null,
    };
  }

  return { byDate };
}
