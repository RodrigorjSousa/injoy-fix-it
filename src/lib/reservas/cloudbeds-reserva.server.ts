// Cloudbeds para a cobrança da tela Reservas (SÓ NO SERVIDOR): reler a reserva na hora, lançar o pagamento
// no fólio e escrever a nota na reserva. Usa as mesmas chaves CLOUDBEDS_API_KEY_BOTAFOGO/IPANEMA.
type Obj = Record<string, unknown>;
export type Unidade = "Botafogo" | "Ipanema";

const V13 = "https://api.cloudbeds.com/api/v1.3";
const prop = (u: Unidade) => u.toLowerCase() as "botafogo" | "ipanema";

async function respostaJson(res: Response, oQue: string): Promise<Obj> {
  const texto = await res.text().catch(() => "");
  let json: Obj = {};
  try {
    json = texto ? (JSON.parse(texto) as Obj) : {};
  } catch {
    throw new Error(`Cloudbeds respondeu ${res.status} sem JSON ao ${oQue}.`);
  }
  if (!res.ok || json.success === false) {
    throw new Error(`Cloudbeds recusou ${oQue} (${res.status}): ${String(json.message ?? json.error ?? "sem detalhe")}`);
  }
  return json;
}

export type ReservaAgora = {
  status: string;
  balance: number;
  hospede: string;
  emails: string[];
  cartoes: { cardNumber?: unknown; cardType?: unknown }[];
};

/** Relê a reserva no Cloudbeds agora (saldo, status, e-mails e cartões guardados nela). */
export async function lerReservaAgora(unidade: Unidade, reservationId: string): Promise<ReservaAgora> {
  const { cloudbedsFetch, cloudbedsApiKeyHeaders } = await import("@/lib/cloudbeds/client.server");
  const qs = new URLSearchParams({ reservationID: reservationId });
  const res = await cloudbedsFetch(prop(unidade), `${V13}/getReservation?${qs}`, { headers: cloudbedsApiKeyHeaders(prop(unidade)) });
  const json = await respostaJson(res, "ler a reserva");
  const d = (json.data ?? {}) as Obj;
  const emails: string[] = [];
  if (typeof d.guestEmail === "string") emails.push(d.guestEmail);
  const gl = d.guestList;
  for (const g of Array.isArray(gl) ? gl : gl && typeof gl === "object" ? Object.values(gl) : []) {
    const e = (g as Obj)?.guestEmail;
    if (typeof e === "string") emails.push(e);
  }
  return {
    status: String(d.status ?? "").toLowerCase(),
    balance: Math.round(Number(d.balance ?? 0) * 100) / 100,
    hospede: String(d.guestName ?? "").trim(),
    emails: [...new Set(emails.map((e) => e.trim()).filter((e) => e.includes("@")))],
    cartoes: Array.isArray(d.cardsOnFile) ? (d.cardsOnFile as Obj[]) : [],
  };
}

/** Lança no fólio do Cloudbeds o pagamento feito no Stripe (para o saldo zerar e ninguém cobrar de novo). */
export async function lancarPagamentoNoCloudbeds(
  unidade: Unidade,
  reservationId: string,
  valor: number,
  descricao: string,
): Promise<void> {
  const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
  const body = new URLSearchParams({
    reservationID: reservationId,
    amount: valor.toFixed(2),
    type: "credit",
    description: descricao.slice(0, 250),
  });
  const res = await cloudbedsFetch(prop(unidade), "/postPayment", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  await respostaJson(res, "lançar o pagamento");
}

/** Escreve uma nota na reserva do Cloudbeds. */
export async function escreverNotaNoCloudbeds(unidade: Unidade, reservationId: string, nota: string): Promise<void> {
  const { cloudbedsFetch, cloudbedsApiKeyHeaders } = await import("@/lib/cloudbeds/client.server");
  const body = new URLSearchParams({ reservationID: reservationId, reservationNote: nota });
  const res = await cloudbedsFetch(prop(unidade), `${V13}/postReservationNote`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...cloudbedsApiKeyHeaders(prop(unidade)) },
    body: body.toString(),
  });
  await respostaJson(res, "escrever a nota");
}
