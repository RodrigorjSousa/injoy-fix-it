// Ticket de atendimento: depois que o hóspede se identifica com DOIS fatores, o
// servidor devolve um ticket assinado (HMAC-SHA256) que vale por 20 minutos e só
// para aquele totem e aquela reserva. Pagamento e documentos usam o ticket em vez
// de pedir a identificação de novo. A senha da porta continua refazendo toda a
// conferência no Cloudbeds.

export type Ticket = {
  totemId: string;
  reservationID: string;
  fluxo: "checkin" | "checkout";
  quarto: string;
  hospede: string;
  email: string | null;
  exp: number;
};

const VALIDADE_MS = 20 * 60_000;

function segredo(): string {
  const s = process.env.TOTEM_TICKET_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!s) throw new Error("Servidor sem segredo para assinar o atendimento do totem.");
  return s;
}

const b64url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const deB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function hmac(dados: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(dados))));
}

export async function assinarTicket(t: Omit<Ticket, "exp">, agora = Date.now()): Promise<string> {
  const corpo = b64url(new TextEncoder().encode(JSON.stringify({ ...t, exp: agora + VALIDADE_MS })));
  return `${corpo}.${await hmac(corpo)}`;
}

export async function lerTicket(ticket: string, totemId: string, agora = Date.now()): Promise<Ticket> {
  const [corpo, assinatura] = String(ticket ?? "").split(".");
  if (!corpo || !assinatura) throw new Error("Atendimento inválido. Comece de novo.");
  const esperada = await hmac(corpo);
  // comparação em tempo constante
  let dif = esperada.length ^ assinatura.length;
  for (let i = 0; i < Math.max(esperada.length, assinatura.length); i++) {
    dif |= (esperada.charCodeAt(i) || 0) ^ (assinatura.charCodeAt(i) || 0);
  }
  if (dif !== 0) throw new Error("Atendimento inválido. Comece de novo.");
  const t = JSON.parse(new TextDecoder().decode(deB64url(corpo))) as Ticket;
  if (t.totemId !== totemId) throw new Error("Atendimento de outro totem.");
  if (!(t.exp > agora)) throw new Error("O atendimento expirou. Comece de novo.");
  return t;
}
