// Regras puras da Joy (sem rede, sem banco) — testadas em regras.test.ts.
// Tudo o que é sensível é garantido aqui no servidor, não só pelo prompt.

import type { Conhecimento, UnidadeJoy, WifiConfig } from "./conhecimento";

// ------------------------------------------------------------------ cartão

function luhnOk(digitos: string): boolean {
  let soma = 0;
  let dobra = false;
  for (let i = digitos.length - 1; i >= 0; i--) {
    let n = digitos.charCodeAt(i) - 48;
    if (dobra) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
    dobra = !dobra;
  }
  return soma % 10 === 0;
}

export const CARTAO_REMOVIDO = "[número de cartão removido]";

/**
 * Troca números de cartão (13 a 19 dígitos, com ou sem espaço/traço, válidos no Luhn) por um aviso.
 * Aplicado ao texto do hóspede ANTES de gravar e de mandar para a IA, e também na resposta.
 */
export function mascararCartao(texto: string): string {
  return texto.replace(/\b\d(?:[ -]?\d){12,18}\b/g, (trecho) => {
    const digitos = trecho.replace(/\D/g, "");
    if (digitos.length < 13 || digitos.length > 19) return trecho;
    return luhnOk(digitos) ? CARTAO_REMOVIDO : trecho;
  });
}

// ------------------------------------------------------------------- datas

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function noites(checkin: string, checkout: string): number {
  const a = Date.parse(`${checkin}T12:00:00Z`);
  const b = Date.parse(`${checkout}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export type ErroDatas = "formato" | "passado" | "ordem" | "longa";

/** Confere datas de uma cotação. `hoje` é a data do hotel (São Paulo). */
export function validarDatas(checkin: string, checkout: string, hoje: string): ErroDatas | null {
  if (!DATA_ISO.test(checkin) || !DATA_ISO.test(checkout)) return "formato";
  if (checkin < hoje) return "passado";
  const n = noites(checkin, checkout);
  if (n < 1) return "ordem";
  if (n > 60) return "longa";
  return null;
}

// --------------------------------------------------------------- reserva

export type StatusReserva =
  "confirmada" | "nao_confirmada" | "hospedado" | "saiu" | "cancelada" | "no_show" | "outro";

export function statusReserva(status: string): StatusReserva {
  const s = status.toLowerCase().replace(/[\s-]/g, "_");
  if (s === "confirmed") return "confirmada";
  if (s === "not_confirmed") return "nao_confirmada";
  if (s === "checked_in" || s === "in_house") return "hospedado";
  if (s === "checked_out") return "saiu";
  if (s === "canceled" || s === "cancelled") return "cancelada";
  if (s === "no_show") return "no_show";
  return "outro";
}

/**
 * Wi-Fi só para quem está hospedado ou faz check-in hoje/amanhã (regra do Rodrigo).
 * Também libera durante a estadia mesmo que o status ainda não tenha virado "hospedado".
 */
export function wifiLiberado(
  r: { status: string; chegada: string; saida: string },
  hoje: string,
): boolean {
  const st = statusReserva(r.status);
  if (st === "cancelada" || st === "no_show" || st === "saiu") return false;
  if (st === "hospedado") return true;
  if (!r.chegada) return false;
  if (r.chegada === hoje || r.chegada === somarDias(hoje, 1)) return true;
  return !!r.saida && r.chegada <= hoje && hoje < r.saida;
}

// --------------------------------------------------------------- links

export function linkReserva(
  conhecimento: Conhecimento,
  unidade: UnidadeJoy,
  p: { checkin: string; checkout: string; adultos: number },
): string {
  const base = conhecimento.unidades[unidade].motorReserva;
  const qs = new URLSearchParams({
    checkin: p.checkin,
    checkout: p.checkout,
    adults: String(Math.max(1, Math.round(p.adultos))),
  });
  return `${base}?${qs.toString()}`;
}

export function linkMapsBusca(consulta: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}

export function linkMapsRota(destino: string, origem?: string): string {
  const qs = new URLSearchParams({ api: "1", destination: destino });
  if (origem && origem.trim()) qs.set("origin", origem.trim());
  return `https://www.google.com/maps/dir/?${qs.toString()}`;
}

/** Aceita "Botafogo", "botafogo", "BOTAFOGO"... */
export function unidadeDe(valor: unknown): UnidadeJoy | null {
  const v = String(valor ?? "")
    .trim()
    .toLowerCase();
  if (v.startsWith("bota")) return "Botafogo";
  if (v.startsWith("ipa")) return "Ipanema";
  return null;
}

// ------------------------------------------------------------ telefone

export function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** Dois telefones são o mesmo se os últimos 10 dígitos (DDD + número, ou os 10 finais) batem. */
export function mesmoTelefone(a: unknown, b: unknown): boolean {
  const x = soDigitos(a);
  const y = soDigitos(b);
  if (x.length < 8 || y.length < 8) return false;
  const n = Math.min(10, x.length, y.length);
  return x.slice(-n) === y.slice(-n);
}

// --------------------------------------------------------- filtro de saída

export type Bloqueio = "numero_acomodacao" | "codigo_acesso" | "wifi_nao_liberado" | "cartao";

const ACOMODACAO_COM_NUMERO =
  /\b(quarto|apto\.?|apartamento|acomoda[cç][aã]o|su[ií]te|est[uú]dio|loft|room|habitaci[oó]n|unidade)\s*(n[ºo°.]?\s*)?\d{1,4}\b/i;
const CODIGO_COM_NUMERO =
  /\b(senha|c[oó]digo|code|password|contrase[nñ]a|pin)\b[^\n]{0,30}?\b(\d{4,10})\b/gi;
const NUMERO_COM_CERQUILHA = /\b\d{4,10}\s*#/;

/**
 * Última barreira antes de a mensagem sair: bloqueia número de acomodação, código de acesso,
 * senha de Wi-Fi não liberada e número de cartão.
 * `numerosPermitidos`: números que podem aparecer junto de "código" (ex.: o código da própria reserva).
 * `nomesPermitidos`: nomes de tipos de acomodação vindos do Cloudbeds (ex.: "Studio 2") — não contam
 * como número de acomodação.
 */
export function verificarResposta(
  texto: string,
  opts: {
    wifi: WifiConfig;
    wifiLiberadoPara: UnidadeJoy[];
    numerosPermitidos: string[];
    nomesPermitidos?: string[];
  },
): Bloqueio[] {
  const bloqueios = new Set<Bloqueio>();
  let semNomes = texto;
  for (const nome of opts.nomesPermitidos ?? []) {
    const n = nome.trim();
    if (n.length >= 3)
      semNomes = semNomes
        .split(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"))
        .join(" ");
  }
  if (ACOMODACAO_COM_NUMERO.test(semNomes)) bloqueios.add("numero_acomodacao");
  if (NUMERO_COM_CERQUILHA.test(texto)) bloqueios.add("codigo_acesso");
  const permitidos = new Set(opts.numerosPermitidos.map(soDigitos).filter(Boolean));
  for (const m of texto.matchAll(CODIGO_COM_NUMERO)) {
    if (!permitidos.has(m[2])) bloqueios.add("codigo_acesso");
  }
  const baixo = texto.toLowerCase();
  for (const [unidade, w] of Object.entries(opts.wifi) as Array<
    [UnidadeJoy, { senha?: string } | undefined]
  >) {
    const senha = (w?.senha ?? "").trim();
    if (
      senha.length >= 4 &&
      baixo.includes(senha.toLowerCase()) &&
      !opts.wifiLiberadoPara.includes(unidade)
    ) {
      bloqueios.add("wifi_nao_liberado");
    }
  }
  if (mascararCartao(texto) !== texto) bloqueios.add("cartao");
  return [...bloqueios];
}

export const MOTIVO_BLOQUEIO: Record<Bloqueio, string> = {
  numero_acomodacao: "continha o número de uma acomodação",
  codigo_acesso: "continha o que parece um código ou senha de acesso",
  wifi_nao_liberado: "continha a senha do Wi-Fi para quem não está liberado",
  cartao: "continha um número de cartão",
};

export const RESPOSTA_SEGURA =
  "Deixa eu confirmar isso direitinho com a nossa equipe e já te retorno por aqui, tá bom?";

// ------------------------------------------------------ disponibilidade

export type OpcaoQuarto = {
  tipo: string;
  disponiveis: number;
  maxHospedes: number | null;
  totalEstadia: number | null;
  mediaNoite: number | null;
  plano: string | null;
};

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Lê a resposta de getAvailableRoomTypes (tolerante a variações de formato). */
export function lerDisponibilidade(payload: unknown, nNoites: number): OpcaoQuarto[] {
  const p = (payload ?? {}) as Record<string, unknown>;
  const data = Array.isArray(p.data) ? p.data : [];
  const out: OpcaoQuarto[] = [];
  for (const prop of data as Array<Record<string, unknown>>) {
    const quartos = Array.isArray(prop?.propertyRooms)
      ? (prop.propertyRooms as Array<Record<string, unknown>>)
      : [];
    for (const q of quartos) {
      const disponiveis = num(q.roomsAvailable) ?? 0;
      if (disponiveis <= 0) continue;
      const detalhado = Array.isArray(q.roomRateDetailed)
        ? (q.roomRateDetailed as Array<Record<string, unknown>>)
        : [];
      const somaDetalhe = detalhado.reduce((s, d) => s + (num(d.rate) ?? 0), 0);
      const total = detalhado.length > 0 && somaDetalhe > 0 ? somaDetalhe : num(q.roomRate);
      out.push({
        tipo: String(q.roomTypeName ?? q.roomTypeNameShort ?? "Acomodação"),
        disponiveis,
        maxHospedes: num(q.maxGuests),
        totalEstadia: total !== null ? Math.round(total * 100) / 100 : null,
        mediaNoite:
          total !== null && nNoites > 0 ? Math.round((total / nNoites) * 100) / 100 : null,
        plano: (q.ratePlanNamePublic as string | undefined) ?? null,
      });
    }
  }
  return out.sort((a, b) => (a.totalEstadia ?? Infinity) - (b.totalEstadia ?? Infinity));
}

export function reais(v: number | null): string | null {
  if (v === null) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
