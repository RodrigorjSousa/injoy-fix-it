// Server-only Cloudbeds client, keyed by property ("ipanema" | "botafogo").
// Each property uses its own isolated credentials — no cross-property fallback.
//
// Auth strategy per property:
//   1. Prefer permanent API key CLOUDBEDS_API_KEY_<PROP> (prefix `cbat_`).
//   2. Fall back to OAuth client_credentials with
//      CLOUDBEDS_CLIENT_ID_<PROP> / CLOUDBEDS_CLIENT_SECRET_<PROP>.

const CLOUDBEDS_BASE = "https://api.cloudbeds.com/api/v1.2";
const CLOUDBEDS_OAUTH_TOKEN_URL = "https://hotels.cloudbeds.com/api/v1.2/oauth/token";

export type CloudbedsProperty = "ipanema" | "botafogo";

type CachedToken = { token: string; expiresAt: number };
const oauthTokenCache: Partial<Record<CloudbedsProperty, CachedToken>> = {};

function envFor(property: CloudbedsProperty) {
  const suffix = property.toUpperCase();
  return {
    apiKey: process.env[`CLOUDBEDS_API_KEY_${suffix}`],
    clientId: process.env[`CLOUDBEDS_CLIENT_ID_${suffix}`],
    clientSecret: process.env[`CLOUDBEDS_CLIENT_SECRET_${suffix}`],
  };
}

async function getOAuthAccessToken(property: CloudbedsProperty): Promise<string> {
  const now = Date.now();
  const cached = oauthTokenCache[property];
  if (cached && cached.expiresAt > now + 30_000) return cached.token;

  const { clientId, clientSecret } = envFor(property);
  if (!clientId || !clientSecret) {
    throw new Error(`Cloudbeds ${property} OAuth credentials are not configured`);
  }

  const res = await fetch(CLOUDBEDS_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Cloudbeds ${property} OAuth token failed: ${res.status} ${await res.text().catch(() => "")}`,
    );
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  oauthTokenCache[property] = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

async function getAuthHeader(property: CloudbedsProperty): Promise<string> {
  const { apiKey } = envFor(property);
  if (apiKey) return `Bearer ${apiKey}`;
  return `Bearer ${await getOAuthAccessToken(property)}`;
}

export async function cloudbedsFetch(
  property: CloudbedsProperty,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${CLOUDBEDS_BASE}${path}`;
  const authorization = await getAuthHeader(property);
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
      Authorization: authorization,
    },
  });
}

export async function getReservations(
  property: CloudbedsProperty,
  params: {
    checkInFrom?: string;
    checkInTo?: string;
    status?: string;
    pageSize?: number;
    pageNumber?: number;
  } = {},
): Promise<unknown> {
  const qs = new URLSearchParams();
  if (params.checkInFrom) qs.set("checkInFrom", params.checkInFrom);
  if (params.checkInTo) qs.set("checkInTo", params.checkInTo);
  if (params.status) qs.set("status", params.status);
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.pageNumber) qs.set("pageNumber", String(params.pageNumber));
  const res = await cloudbedsFetch(property, `/getReservations?${qs.toString()}`);
  if (!res.ok) throw new Error(`getReservations ${property} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getOccupancy(
  property: CloudbedsProperty,
  params: { startDate: string; endDate: string },
): Promise<unknown> {
  const qs = new URLSearchParams(params);
  const res = await cloudbedsFetch(property, `/getDailyReport?${qs.toString()}`);
  if (!res.ok) throw new Error(`getDailyReport ${property} failed: ${res.status} ${await res.text()}`);
  return res.json();
}
