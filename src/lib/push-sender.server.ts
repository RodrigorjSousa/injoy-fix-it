// Envio de notificações Web Push (aes128gcm, RFC 8291) usando apenas
// Web Crypto — funciona no runtime do Cloudflare Worker.
//
// Uso: sendWebPush({ endpoint, p256dh, auth }, JSON.stringify(payload))

const encoder = new TextEncoder();

function b64urlDecode(input: string): Uint8Array {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, data as BufferSource);
  return new Uint8Array(sig);
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  const t = await hmacSha256(prk, concat(info, new Uint8Array([1])));
  return t.slice(0, length);
}

// Importa a chave pública P-256 do cliente (65 bytes 0x04||X||Y) para ECDH.
async function importClientPublicKey(rawUncompressed: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    rawUncompressed as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

async function exportPublicKeyRaw(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

async function generateEphemeralECDH(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
}

async function deriveSharedSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<Uint8Array> {
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256,
  );
  return new Uint8Array(bits);
}

async function importVapidPrivateKey(privateKeyB64Url: string): Promise<CryptoKey> {
  const d = privateKeyB64Url;
  // The VAPID public key (uncompressed P-256) is known to us via env.
  const rawPub = b64urlDecode(process.env.VAPID_PUBLIC_KEY ?? "");
  if (rawPub.length !== 65 || rawPub[0] !== 4) {
    throw new Error("VAPID_PUBLIC_KEY inválida");
  }
  const x = b64urlEncode(rawPub.slice(1, 33));
  const y = b64urlEncode(rawPub.slice(33, 65));
  const jwk = { kty: "EC", crv: "P-256", d, x, y, ext: true } as JsonWebKey;
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function signVapidJwt(audience: string): Promise<string> {
  const subject = process.env.VAPID_SUBJECT ?? "mailto:contato@injoyhoteis.com";
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) throw new Error("VAPID_PRIVATE_KEY ausente");

  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const encHeader = b64urlEncode(encoder.encode(JSON.stringify(header)));
  const encPayload = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${encHeader}.${encPayload}`;

  const key = await importVapidPrivateKey(privateKey);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(signingInput) as BufferSource,
  );
  return `${signingInput}.${b64urlEncode(new Uint8Array(sig))}`;
}

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

export async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: string,
): Promise<{ ok: boolean; status: number; body?: string }> {
  const clientPubRaw = b64urlDecode(sub.p256dh); // 65 bytes 0x04||X||Y
  const authSecret = b64urlDecode(sub.auth_key); // 16 bytes
  const clientPubKey = await importClientPublicKey(clientPubRaw);

  const ephemeral = await generateEphemeralECDH();
  const ephPubRaw = await exportPublicKeyRaw(ephemeral.publicKey);
  const shared = await deriveSharedSecret(ephemeral.privateKey, clientPubKey);

  // key_info = "WebPush: info\0" || client_pub || eph_pub
  const keyInfo = concat(encoder.encode("WebPush: info\0"), clientPubRaw, ephPubRaw);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const plaintext = concat(encoder.encode(payload), new Uint8Array([0x02]));
  const cekKey = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce as BufferSource },
    cekKey,
    plaintext as BufferSource,
  );
  const ciphertext = new Uint8Array(ciphertextBuf);

  // Header: salt(16) || rs(4) || idlen(1) || keyid(65) || ciphertext
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  const idlen = new Uint8Array([ephPubRaw.length]);
  const body = concat(salt, rs, idlen, ephPubRaw, ciphertext);

  const audience = new URL(sub.endpoint).origin;
  const jwt = await signVapidJwt(audience);
  const vapidKey = process.env.VAPID_PUBLIC_KEY ?? "";

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Urgency: "normal",
      Authorization: `vapid t=${jwt}, k=${vapidKey}`,
    },
    body: body as BodyInit,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, body: text };
  }
  return { ok: true, status: res.status };
}
