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

export type IdiomaLink = "pt" | "en" | "es";

const IDIOMA_MOTOR: Record<IdiomaLink, string> = { pt: "pt-br", en: "en", es: "es" };

/**
 * Link do motor do Cloudbeds no formato que a recepção usa:
 * hotels.cloudbeds.com/pt-br/reservation/<unidade>?checkin=…&checkout=…&adults=…&currency=brl
 */
export function linkReserva(
  conhecimento: Conhecimento,
  unidade: UnidadeJoy,
  p: { checkin: string; checkout: string; adultos: number; idioma?: IdiomaLink },
): string {
  const lang = IDIOMA_MOTOR[p.idioma ?? "pt"] ?? "pt-br";
  let base = conhecimento.unidades[unidade].motorReserva.replace(/\/+$/, "");
  // Só põe o idioma se o link cadastrado ainda não tiver um (…/xx/reservation/…).
  if (!/\/[a-z]{2}(-[a-z]{2})?\/reservation\//i.test(base))
    base = base.replace("/reservation/", `/${lang}/reservation/`);
  const qs = new URLSearchParams({
    checkin: p.checkin,
    checkout: p.checkout,
    adults: String(Math.max(1, Math.round(p.adultos))),
    currency: "brl",
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

// ------------------------------------------------------------ cancelamento
//
// Regra do Rodrigo (23/10/2026), com o texto da Booking sobre o CDC:
// 1. Saúde, carta de crédito ou exceção → equipe (decidido pela IA, antes de chamar a ferramenta).
// 2. Reserva de canal (Booking etc.) → cancela pelo canal, com a política de lá.
// 3. CDC (hóspede brasileiro): grátis até 7 dias após a confirmação da reserva original; se o check-in
//    cair nesses 7 dias, grátis até as 11h do dia do check-in. Vale para qualquer tarifa.
// 4. Datas especiais (Réveillon, Carnaval, Rock in Rio): toda tarifa vira Não reembolsável.
// 5. Tarifa Exclusiva Site / Standard: grátis até 3 dias antes da chegada (chegada dia 10 → até dia 7).
// 6. Não reembolsável: sem reembolso.
// Faltou dado → equipe. Quem decide é este código; a IA só escolhe as palavras.

export type DataEspecial = { nome: string; inicio: string; fim: string };

export type ResultadoCancelamento =
  | "canal" // cancelar pelo canal onde reservou
  | "reembolso_cdc" // tem direito pelo CDC → equipe processa
  | "gratis" // dentro do prazo da tarifa → equipe cancela
  | "sem_reembolso" // a Joy explica com cuidado
  | "equipe"; // faltou dado ou caso duvidoso → equipe

export type AvaliacaoCancelamento = {
  resultado: ResultadoCancelamento;
  motivo: string;
  data_especial?: string;
};

export type DadosCancelamento = {
  /** "direto" = site/recepção; "canal" = Booking, Expedia, Airbnb...; null = não sei. */
  canal: "direto" | "canal" | null;
  canalNome?: string;
  /** Data de confirmação da reserva original (AAAA-MM-DD). */
  dataReserva: string | null;
  chegada: string | null;
  saida: string | null;
  tarifa: "flexivel" | "nao_reembolsavel" | null;
  /** País do titular: true = Brasil, false = outro, null = não informado. */
  brasileiro: boolean | null;
  hoje: string;
  /** HH:MM no horário do hotel. */
  hora: string;
  datasEspeciais: DataEspecial[];
};

export const PRAZO_CDC_DIAS = 7;
export const PRAZO_FLEXIVEL_DIAS = 3;
export const HORA_LIMITE_CDC = "11:00";

/** A estadia (noites de chegada até a véspera da saída) toca algum período especial? */
export function dataEspecialDaEstadia(
  chegada: string,
  saida: string | null,
  datas: DataEspecial[],
): DataEspecial | null {
  const ultimaNoite = saida && saida > chegada ? somarDias(saida, -1) : chegada;
  for (const d of datas) {
    if (!DATA_ISO.test(d.inicio) || !DATA_ISO.test(d.fim)) continue;
    if (chegada <= d.fim && ultimaNoite >= d.inicio) return d;
  }
  return null;
}

export function avaliarCancelamento(d: DadosCancelamento): AvaliacaoCancelamento {
  if (d.canal === "canal")
    return {
      resultado: "canal",
      motivo: `Reserva feita por ${d.canalNome || "outro site"}: o cancelamento é feito por lá, com a política de lá.`,
    };
  if (d.canal === null)
    return { resultado: "equipe", motivo: "Não deu para saber por onde a reserva foi feita." };
  if (!d.dataReserva || !d.chegada || !DATA_ISO.test(d.dataReserva) || !DATA_ISO.test(d.chegada))
    return { resultado: "equipe", motivo: "Faltam as datas da reserva no sistema." };

  // CDC: até o fim do 7º dia depois da confirmação (reserva dia 1 → até dia 8).
  const fimCdc = somarDias(d.dataReserva, PRAZO_CDC_DIAS);
  let dentroCdc = d.hoje <= fimCdc;
  if (dentroCdc && d.chegada <= fimCdc) {
    // Check-in dentro dos 7 dias: só até as 11h do dia do check-in.
    dentroCdc = d.hoje < d.chegada || (d.hoje === d.chegada && d.hora < HORA_LIMITE_CDC);
  }
  if (dentroCdc) {
    if (d.brasileiro === true)
      return {
        resultado: "reembolso_cdc",
        motivo: "Dentro dos 7 dias do direito de arrependimento (CDC).",
      };
    if (d.brasileiro === null)
      return {
        resultado: "equipe",
        motivo: "Dentro dos 7 dias do CDC, mas o país do hóspede não está na reserva.",
      };
  }

  const especial = dataEspecialDaEstadia(d.chegada, d.saida, d.datasEspeciais);
  if (especial)
    return {
      resultado: "sem_reembolso",
      motivo: `${especial.nome}: nessas datas toda tarifa é Não reembolsável.`,
      data_especial: especial.nome,
    };

  if (d.tarifa === "nao_reembolsavel")
    return { resultado: "sem_reembolso", motivo: "Tarifa Não reembolsável." };
  if (d.tarifa === null)
    return { resultado: "equipe", motivo: "Não deu para saber a tarifa da reserva." };

  const diasAteChegada = noites(d.hoje, d.chegada);
  if (diasAteChegada >= PRAZO_FLEXIVEL_DIAS)
    return {
      resultado: "gratis",
      motivo: `Tarifa com cancelamento grátis até ${PRAZO_FLEXIVEL_DIAS} dias antes da chegada, e ainda faltam ${diasAteChegada} dias.`,
    };
  return {
    resultado: "sem_reembolso",
    motivo: `Faltam menos de ${PRAZO_FLEXIVEL_DIAS} dias para a chegada (prazo do cancelamento grátis encerrado).`,
  };
}

/** Classifica o nome do plano de tarifa do Cloudbeds. */
export function tipoTarifa(planos: string[]): "flexivel" | "nao_reembolsavel" | null {
  if (planos.length === 0) return null;
  const norm = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[-_]/g, " ");
  // Basta um quarto NR para a reserva inteira ser NR.
  if (planos.some((p) => /nao reembols|non ?refund|\bnr\b/.test(norm(p))))
    return "nao_reembolsavel";
  return "flexivel";
}

/** País do titular → brasileiro? */
export function ehBrasileiro(pais: string | null | undefined): boolean | null {
  const p = (pais ?? "").trim().toLowerCase();
  if (!p) return null;
  return p === "br" || p === "bra" || p === "brasil" || p === "brazil";
}

/** Origem da reserva → direta, canal, ou não sei (null → equipe). */
export function canalDaOrigem(origem: string): "direto" | "canal" | null {
  const o = origem.trim().toLowerCase();
  if (!o) return null;
  if (
    /website|booking engine|motor|site|walk|phone|telefone|e-?mail|direct|direto|recep|whats/.test(
      o,
    )
  )
    return "direto";
  if (
    /booking|expedia|airbnb|hotels\.com|decolar|despegar|agoda|trivago|hostelworld|vrbo|tripadvisor/.test(
      o,
    )
  )
    return "canal";
  return null;
}
