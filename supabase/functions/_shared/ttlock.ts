// TTLock Open Platform (euopen.ttlock.com): teclados de controle de acesso dos
// portões (MF03 + gateway G2). Usado pela edge function tuya-password, que
// trata TTLock e Tuya juntos para a mesma senha valer em todas as portas.
//
// Segredos (Supabase › Edge Functions › Secrets):
//   TTLOCK_CLIENT_ID, TTLOCK_CLIENT_SECRET  — aplicação "INJOY Totem"
//   TTLOCK_USERNAME                          — conta do app TTLock dona dos teclados
//   TTLOCK_PASSWORD (ou TTLOCK_PASSWORD_MD5) — senha dessa conta
import CryptoJS from "https://esm.sh/crypto-js@4.2.0";

const BASE = Deno.env.get("TTLOCK_BASE_URL") ?? "https://euapi.ttlock.com";

export class TTLockErro extends Error {
  constructor(
    public codigo: number,
    msg: string,
  ) {
    super(msg);
  }
}

function cfg() {
  const clientId = Deno.env.get("TTLOCK_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("TTLOCK_CLIENT_SECRET") ?? "";
  const username = Deno.env.get("TTLOCK_USERNAME") ?? "";
  const md5 =
    Deno.env.get("TTLOCK_PASSWORD_MD5") ??
    (Deno.env.get("TTLOCK_PASSWORD") ? CryptoJS.MD5(Deno.env.get("TTLOCK_PASSWORD")!).toString() : "");
  if (!clientId || !clientSecret || !username || !md5)
    throw new TTLockErro(0, "TTLock não configurado: faltam os segredos TTLOCK_* na edge function.");
  return { clientId, clientSecret, username, md5 };
}

let token: { valor: string; expira: number } | null = null;

async function post(caminho: string, campos: Record<string, string>) {
  const r = await fetch(BASE + caminho, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(campos),
  });
  const j = await r.json().catch(() => ({}));
  if (typeof j.errcode === "number" && j.errcode !== 0)
    throw new TTLockErro(j.errcode, `TTLock ${caminho}: ${j.errcode} ${j.errmsg ?? j.description ?? ""}`.trim());
  if (!r.ok) throw new TTLockErro(r.status, `TTLock ${caminho}: HTTP ${r.status}`);
  return j;
}

async function acesso(): Promise<{ clientId: string; accessToken: string }> {
  const c = cfg();
  if (!token || token.expira < Date.now() + 60_000) {
    const j = await post("/oauth2/token", {
      clientId: c.clientId,
      clientSecret: c.clientSecret,
      username: c.username,
      password: c.md5,
    });
    if (!j.access_token) throw new TTLockErro(0, "TTLock: login sem access_token.");
    token = { valor: j.access_token, expira: Date.now() + Number(j.expires_in ?? 3600) * 1000 };
  }
  return { clientId: c.clientId, accessToken: token.valor };
}

/** Senha personalizada (4–9 dígitos) com validade, gravada pelo gateway. Devolve o keyboardPwdId. */
export async function criarSenha(a: {
  lockId: string;
  senha: string;
  nome: string;
  inicio: number;
  fim: number;
}): Promise<number> {
  const { clientId, accessToken } = await acesso();
  const j = await post("/v3/keyboardPwd/add", {
    clientId,
    accessToken,
    lockId: a.lockId,
    keyboardPwd: a.senha,
    keyboardPwdName: a.nome.slice(0, 50),
    keyboardPwdType: "3",
    startDate: String(a.inicio),
    endDate: String(a.fim),
    addType: "2",
    date: String(Date.now()),
  });
  return Number(j.keyboardPwdId);
}

/** Apaga a senha no teclado, pelo gateway. */
export async function apagarSenha(lockId: string, keyboardPwdId: string | number): Promise<void> {
  const { clientId, accessToken } = await acesso();
  await post("/v3/keyboardPwd/delete", {
    clientId,
    accessToken,
    lockId,
    keyboardPwdId: String(keyboardPwdId),
    deleteType: "2",
    date: String(Date.now()),
  });
}

/** Abre o portão remotamente (aciona o relé), pelo gateway. */
export async function abrir(lockId: string): Promise<void> {
  const { clientId, accessToken } = await acesso();
  await post("/v3/lock/unlock", { clientId, accessToken, lockId, date: String(Date.now()) });
}

/** Situação do aparelho: online = tem gateway ligado. */
export async function situacao(lockId: string): Promise<{ online: boolean; nome?: string; bateria?: number }> {
  const { clientId, accessToken } = await acesso();
  const q = new URLSearchParams({ clientId, accessToken, lockId, date: String(Date.now()) });
  const r = await fetch(`${BASE}/v3/lock/detail?${q}`);
  const j = await r.json().catch(() => ({}));
  if (typeof j.errcode === "number" && j.errcode !== 0)
    throw new TTLockErro(j.errcode, `TTLock detail: ${j.errcode} ${j.errmsg ?? ""}`.trim());
  return { online: Number(j.hasGateway ?? 0) === 1, nome: j.lockAlias, bateria: j.electricQuantity };
}
