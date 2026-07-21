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
  const m = value.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
}

function toTimes(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const out: string[] = [];
  const matches = value.matchAll(/(?:\b|T)([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/g);
  for (const match of matches) out.push(`${match[1]}:${match[2]}:${match[3] ?? "00"}`);
  return out;
}

function uniqueSortedTimes(times: string[]): string[] {
  return [...new Set(times.filter(Boolean))].sort();
}

function collectTimesFromUnknown(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 6 || value == null) return out;
  if (typeof value === "string") {
    out.push(...toTimes(value));
    return out;
  }
  if (typeof value === "number") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectTimesFromUnknown(item, depth + 1, out);
    return out;
  }
  const rec = asRecord(value);
  if (!rec) return out;
  for (const [k, v] of Object.entries(rec)) {
    if (/^(id|employee|user|person|created_at|updated_at|deleted_at)$/i.test(k)) continue;
    collectTimesFromUnknown(v, depth + 1, out);
  }
  return out;
}

function collectTimesDeep(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 6 || value == null) return out;
  if (typeof value === "string") {
    out.push(...toTimes(value));
    return out;
  }
  if (typeof value === "number") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectTimesDeep(item, depth + 1, out);
    return out;
  }
  const rec = asRecord(value);
  if (!rec) return out;
  for (const [k, v] of Object.entries(rec)) {
    // Ignora chaves obviamente não relacionadas a tempo para evitar falso-positivos
    if (/^(id|employee|user|person|created_at|updated_at|deleted_at|shift_appointments|shift_name|shift_time|time_breaks|summary|extra_time|total_time|custom_interval_time|overnight_time|time_balance|motive)$/i.test(k)) continue;
    collectTimesDeep(v, depth + 1, out);
  }
  return out;
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

async function pontomaisRequest(
  url: string,
  token: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<unknown> {
  const headers = authHeaders(token);
  const fingerprint = await tokenFingerprint(token);
  console.log("Enviando requisição para Pontomais com token:", {
    tokenFingerprint: fingerprint,
    tokenLength: token.length,
    hasAccessTokenHeader: Boolean(headers["access-token"]),
    hasAuthorizationHeader: false,
    method: init?.method ?? "GET",
    url,
  });
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    console.log("Resposta bruta da Pontomais:", {
      url,
      method: init?.method ?? "GET",
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

async function pontomaisGet(url: string, token: string): Promise<unknown> {
  return pontomaisRequest(url, token, { method: "GET" });
}

async function pontomaisPost(url: string, token: string, body: unknown): Promise<unknown> {
  return pontomaisRequest(url, token, { method: "POST", body });
}

function dateKeyFromValue(value: unknown): string | null {
  const raw = asStringish(value)?.trim();
  if (!raw) return null;
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const br = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function dateFromPontomaisRecord(record: JsonRecord | null): string | null {
  if (!record) return null;
  return dateKeyFromValue(
    record.date ??
      record.work_date ??
      record.data ??
      record.day ??
      record.reference_date ??
      record.period_date,
  );
}

function normalizedEmployeeId(value: unknown): string | null {
  const raw = asStringish(value)?.trim();
  return raw || null;
}

function employeeIdFromPontomaisRecord(record: JsonRecord, hasOwnDate: boolean): string | null {
  const employee = asRecord(record.employee);
  const person = asRecord(record.person);
  const user = asRecord(record.user);
  const candidates = [
    record.employee_id,
    record.employeeId,
    record.pontomais_employee_id,
    record.pontomaisEmployeeId,
    employee?.id,
    employee?.employee_id,
    person?.employee_id,
    user?.employee_id,
    !hasOwnDate ? record.id : null,
  ];

  for (const candidate of candidates) {
    const id = normalizedEmployeeId(candidate);
    if (id) return id;
  }
  return null;
}

function sameEmployeeId(a: unknown, b: unknown): boolean {
  const aa = normalizedEmployeeId(a);
  const bb = normalizedEmployeeId(b);
  return Boolean(aa && bb && aa === bb);
}

const PONTOMAIS_ACTUAL_PUNCH_KEYS = [
  "time_cards",
  "timeCards",
  "time_cards_entries",
  "time_card_entries",
  "time_entries",
  "timeEntries",
  "punches",
  "entries",
  "appointments",
  "markings",
  "records",
  "batidas",
  "marcacoes",
];

function structuredTimesFromRecord(record: JsonRecord): PontomaisRegistro {
  return {
    entrada: toTime(
      record.entrada ??
        record.entry ??
        record.check_in ??
        record.clock_in ??
        record.start_time ??
        record.first_in ??
        record.in,
    ),
    almoco_saida: toTime(
      record.almoco_saida ??
        record.lunch_out ??
        record.break_start ??
        record.interval_start ??
        record.pause_start,
    ),
    almoco_retorno: toTime(
      record.almoco_retorno ??
        record.lunch_in ??
        record.break_end ??
        record.interval_end ??
        record.pause_end,
    ),
    saida: toTime(
      record.saida ??
        record.exit ??
        record.check_out ??
        record.clock_out ??
        record.end_time ??
        record.last_out ??
        record.out,
    ),
  };
}

function hasAnyStructuredTime(registro: PontomaisRegistro): boolean {
  return Boolean(
    registro.entrada || registro.almoco_saida || registro.almoco_retorno || registro.saida,
  );
}

function actualPunchTimesFromRecord(record: JsonRecord): string[] {
  const times: string[] = [];
  for (const key of PONTOMAIS_ACTUAL_PUNCH_KEYS) {
    if (record[key] !== undefined && record[key] !== null) {
      times.push(...collectTimesFromUnknown(record[key]));
    }
  }
  return uniqueSortedTimes(times);
}

function registroFromOrderedPunches(punches: string[]): PontomaisRegistro {
  return {
    entrada: punches[0] ?? null,
    almoco_saida: punches[1] ?? null,
    almoco_retorno: punches[2] ?? null,
    saida: punches.length > 1 ? punches[punches.length - 1] : null,
  };
}

function hasPontomaisPunchData(record: JsonRecord): boolean {
  if (hasAnyStructuredTime(structuredTimesFromRecord(record))) return true;
  return actualPunchTimesFromRecord(record).length > 0;
}

type PontomaisDayRecord = {
  record: JsonRecord;
  date: string;
  employeeId: string | null;
};

function collectPontomaisDayRecords(
  value: unknown,
  targetEmployeeId: string,
  startDate: string,
  endDate: string,
  context: { employeeId?: string | null; date?: string | null } = {},
  out: PontomaisDayRecord[] = [],
  depth = 0,
): PontomaisDayRecord[] {
  if (depth > 8 || value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPontomaisDayRecords(item, targetEmployeeId, startDate, endDate, context, out, depth + 1);
    }
    return out;
  }

  const record = asRecord(value);
  if (!record) return out;

  const ownDate = dateFromPontomaisRecord(record);
  const date = ownDate ?? context.date ?? null;
  const ownEmployeeId = employeeIdFromPontomaisRecord(record, Boolean(ownDate));
  const employeeId = ownEmployeeId ?? context.employeeId ?? null;
  const inRange = Boolean(date && date >= startDate && date <= endDate);
  const employeeMatches = !employeeId || sameEmployeeId(employeeId, targetEmployeeId);

  if (inRange && employeeMatches && hasPontomaisPunchData(record)) {
    out.push({ record, date: date!, employeeId });
  }

  for (const [key, nested] of Object.entries(record)) {
    if (PONTOMAIS_ACTUAL_PUNCH_KEYS.includes(key) && (ownDate || context.date)) continue;
    if (/^(shift_appointments|shift_name|shift_time|time_breaks|summary|extra_time|total_time|custom_interval_time|overnight_time|time_balance|motive)$/i.test(key)) continue;
    if (nested && (Array.isArray(nested) || typeof nested === "object")) {
      collectPontomaisDayRecords(
        nested,
        targetEmployeeId,
        startDate,
        endDate,
        { employeeId, date },
        out,
        depth + 1,
      );
    }
  }

  return out;
}

function parsePontomaisRegistrosPayload(params: {
  payload: unknown;
  employeeId: string;
  startDate: string;
  endDate: string;
}): Record<string, PontomaisRegistro> {
  const rows = collectPontomaisDayRecords(
    params.payload,
    params.employeeId,
    params.startDate,
    params.endDate,
  );
  const byDate: Record<string, PontomaisRegistro> = {};

  console.log("[pontomais] linhas de batida compatíveis encontradas", {
    employeeId: params.employeeId,
    totalRows: rows.length,
    datas: rows.map((row) => row.date),
  });

  for (const row of rows) {
    const structured = structuredTimesFromRecord(row.record);
    const punches = actualPunchTimesFromRecord(row.record);

    if (punches.length > 0) {
      byDate[row.date] = registroFromOrderedPunches(punches);
      continue;
    }

    if (hasAnyStructuredTime(structured)) {
      byDate[row.date] = structured;
      continue;
    }

    const deep = uniqueSortedTimes(collectTimesDeep(row.record));
    if (deep.length > 0) {
      console.log("[pontomais] batidas extraídas via varredura profunda", {
        employeeId: params.employeeId,
        date: row.date,
        totalEncontradas: deep.length,
      });
      byDate[row.date] = registroFromOrderedPunches(deep);
    }
  }

  return byDate;
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
    if (!cpf) { ignoredWithoutCpf += 1; continue; }
    const employeeId = employeeIdFromPontomaisRow(row);
    if (!employeeId) { ignoredWithoutId += 1; continue; }
    if (byCpf[cpf]) { duplicatedCpf += 1; continue; }
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

function buildPontomaisTimeCardsReportBody(params: {
  employeeId: string;
  startDate: string;
  endDate: string;
  includeEmployeeFilter: boolean;
}): unknown {
  const report: Record<string, unknown> = {
    start_date: params.startDate,
    end_date: params.endDate,
    format: "json",
  };
  if (params.includeEmployeeFilter) {
    report.employee_id = params.employeeId;
    report.employee_ids = [params.employeeId];
  }
  return { report };
}

async function fetchPontomaisTimeCardsReport(params: {
  token: string;
  employeeId: string;
  startDate: string;
  endDate: string;
}): Promise<unknown> {
  const url = `${getPontomaisBaseUrl()}/reports/time_cards`;
  const filteredBody = buildPontomaisTimeCardsReportBody({
    employeeId: params.employeeId,
    startDate: params.startDate,
    endDate: params.endDate,
    includeEmployeeFilter: true,
  });
  try {
    return await pontomaisPost(url, params.token, filteredBody);
  } catch (err) {
    if (err instanceof PontomaisApiError && (err.status === 400 || err.status === 422)) {
      return pontomaisPost(
        url,
        params.token,
        buildPontomaisTimeCardsReportBody({
          employeeId: params.employeeId,
          startDate: params.startDate,
          endDate: params.endDate,
          includeEmployeeFilter: false,
        }),
      );
    }
    throw err;
  }
}

function parseBrazilianDate(value: unknown): string | null {
  const raw = asStringish(value)?.trim();
  if (!raw) return null;
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

type PontomaisPunchRow = { date: string; time: string; employeeId: string | null };

function collectPunchRowsFromTimeCardsReport(
  value: unknown,
  targetEmployeeId: string,
  startDate: string,
  endDate: string,
  out: PontomaisPunchRow[] = [],
  depth = 0,
): PontomaisPunchRow[] {
  if (depth > 10 || value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPunchRowsFromTimeCardsReport(item, targetEmployeeId, startDate, endDate, out, depth + 1);
    }
    return out;
  }
  const record = asRecord(value);
  if (!record) return out;

  // Punch leaf: has a time HH:MM(:SS) plus a date field
  const timeRaw = asStringish(record.time ?? record.hour ?? record.hora);
  const dateRaw = record.date ?? record.data ?? record.day;
  const parsedDate = parseBrazilianDate(dateRaw);
  const timeMatch = timeRaw?.match(/([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/);

  if (parsedDate && timeMatch) {
    const employeeId = normalizedEmployeeId(record.employee_id ?? record.employeeId);
    const matchesEmployee =
      !employeeId || sameEmployeeId(employeeId, targetEmployeeId);
    const inRange = parsedDate >= startDate && parsedDate <= endDate;
    if (matchesEmployee && inRange) {
      const hh = timeMatch[1].padStart(2, "0");
      const mm = timeMatch[2];
      const ss = timeMatch[3] ?? "00";
      out.push({ date: parsedDate, time: `${hh}:${mm}:${ss}`, employeeId });
      return out;
    }
  }

  for (const nested of Object.values(record)) {
    if (nested && (Array.isArray(nested) || typeof nested === "object")) {
      collectPunchRowsFromTimeCardsReport(nested, targetEmployeeId, startDate, endDate, out, depth + 1);
    }
  }
  return out;
}

function parsePontomaisTimeCardsPayload(params: {
  payload: unknown;
  employeeId: string;
  startDate: string;
  endDate: string;
}): Record<string, PontomaisRegistro> {
  const rows = collectPunchRowsFromTimeCardsReport(
    params.payload,
    params.employeeId,
    params.startDate,
    params.endDate,
  );
  const grouped: Record<string, string[]> = {};
  for (const row of rows) {
    (grouped[row.date] ??= []).push(row.time);
  }
  const byDate: Record<string, PontomaisRegistro> = {};
  for (const [date, times] of Object.entries(grouped)) {
    const ordered = uniqueSortedTimes(times);
    byDate[date] = registroFromOrderedPunches(ordered);
  }
  console.log("[pontomais] batidas extraídas do relatório time_cards", {
    employeeId: params.employeeId,
    totalDias: Object.keys(byDate).length,
    datas: Object.keys(byDate),
  });
  return byDate;
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

  let payload: unknown;
  try {
    payload = await fetchPontomaisTimeCardsReport({
      token,
      employeeId,
      startDate: params.startDate,
      endDate: params.endDate,
    });
  } catch (err) {
    if (err instanceof PontomaisApiError && err.status === 404) {
      console.warn("[pontomais] batidas não encontradas", {
        employeeId,
        cpf: cleanCpf,
        startDate: params.startDate,
        endDate: params.endDate,
      });
      return { byDate: {} };
    }
    throw err;
  }

  const byDate = parsePontomaisTimeCardsPayload({
    payload,
    employeeId,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  return { byDate };
}

