// Server-only Cloudbeds client for the Ipanema property.
// Never import from client code — .server.ts is stripped from the browser bundle.
//
// Auth strategy:
//   1. Prefer the permanent API key (CLOUDBEDS_API_KEY_IPANEMA, prefix `cbat_`)
//      when present — it is a long-lived bearer token, no token exchange needed.
//   2. Fall back to the OAuth client credentials flow using
//      CLOUDBEDS_CLIENT_ID_IPANEMA / CLOUDBEDS_CLIENT_SECRET_IPANEMA.
//
// Docs: https://hotels.cloudbeds.com/api/v1.2/docs/

const CLOUDBEDS_BASE = "https://api.cloudbeds.com/api/v1.2";
const CLOUDBEDS_OAUTH_TOKEN_URL = "https://hotels.cloudbeds.com/api/v1.2/oauth/token";

type CachedToken = { token: string; expiresAt: number };
let cachedOAuthToken: CachedToken | undefined;

async function getOAuthAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedOAuthToken && cachedOAuthToken.expiresAt > now + 30_000) {
    return cachedOAuthToken.token;
  }

  const clientId = process.env.CLOUDBEDS_CLIENT_ID_IPANEMA;
  const clientSecret = process.env.CLOUDBEDS_CLIENT_SECRET_IPANEMA;
  if (!clientId || !clientSecret) {
    throw new Error("Cloudbeds Ipanema OAuth credentials are not configured");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(CLOUDBEDS_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cloudbeds OAuth token request failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cachedOAuthToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

async function getIpanemaAuthHeader(): Promise<string> {
  const apiKey = process.env.CLOUDBEDS_API_KEY_IPANEMA;
  if (apiKey) return `Bearer ${apiKey}`;
  const token = await getOAuthAccessToken();
  return `Bearer ${token}`;
}

export async function cloudbedsIpanemaFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${CLOUDBEDS_BASE}${path}`;
  const authorization = await getIpanemaAuthHeader();
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
      Authorization: authorization,
    },
  });
}

// Convenience helpers — extend as needed by feature code.

export async function getIpanemaReservations(params: {
  checkInFrom?: string; // YYYY-MM-DD
  checkInTo?: string;
  status?: string;
  pageSize?: number;
  pageNumber?: number;
} = {}): Promise<unknown> {
  const qs = new URLSearchParams();
  if (params.checkInFrom) qs.set("checkInFrom", params.checkInFrom);
  if (params.checkInTo) qs.set("checkInTo", params.checkInTo);
  if (params.status) qs.set("status", params.status);
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.pageNumber) qs.set("pageNumber", String(params.pageNumber));
  const res = await cloudbedsIpanemaFetch(`/getReservations?${qs.toString()}`);
  if (!res.ok) throw new Error(`getReservations failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getIpanemaOccupancy(params: {
  startDate: string; // YYYY-MM-DD
  endDate: string;
}): Promise<unknown> {
  const qs = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
  });
  const res = await cloudbedsIpanemaFetch(`/getDailyReport?${qs.toString()}`);
  if (!res.ok) throw new Error(`getDailyReport failed: ${res.status} ${await res.text()}`);
  return res.json();
}
