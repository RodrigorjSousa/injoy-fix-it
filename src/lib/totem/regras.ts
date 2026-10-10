// Regras puras do Totem (sem acesso a rede/banco) — testadas em regras.test.ts.
// Lidam com o formato "solto" das reservas do Cloudbeds (getReservations com
// includeGuestsDetails=true): os campos variam entre contas, então tudo aqui é
// tolerante a nomes alternativos.

export type Raw = Record<string, unknown>;

const TZ = "America/Sao_Paulo";

// ---------------------------------------------------------------- normalização

export function normalizarTexto(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizarCodigo(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function normalizarQuarto(value: unknown) {
  const full = String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\b(APT|APTO|APARTAMENTO|QUARTO|ROOM)\b\.?/g, "")
    .replace(/[ºª#:\-_/.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^0+/, "");
  const digits = full.replace(/\D+/g, "").replace(/^0+/, "");
  return { full, digits };
}

/** "005", "Apto 5" e "QUARTO 05" são o mesmo quarto; "101" e "1010" não. */
export function quartosIguais(a: unknown, b: unknown): boolean {
  const na = normalizarQuarto(a);
  const nb = normalizarQuarto(b);
  if (!na.full && !na.digits) return false;
  if (na.full && na.full === nb.full) return true;
  return !!na.digits && na.digits === nb.digits;
}

export function dataDe(value: unknown): string {
  if (typeof value !== "string") return "";
  const t = value.trim();
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

function numero(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string" || !value.trim()) return 0;
  const direto = Number(value);
  if (Number.isFinite(direto)) return direto;
  const br = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(br) ? br : 0;
}

function texto(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

// ------------------------------------------------------------------- relógio

export type RelogioSP = { hoje: string; ontem: string; hhmm: string };

/** Data/hora de São Paulo, independente do fuso do servidor. */
export function relogioSP(agora: Date = new Date()): RelogioSP {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hoje = `${get("year")}-${get("month")}-${get("day")}`;
  const hora = get("hour") === "24" ? "00" : get("hour");
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return { hoje, ontem: d.toISOString().slice(0, 10), hhmm: `${hora}:${get("minute")}` };
}

/** "14:00:00" → "14:00" */
export function hhmm(value: unknown, padrao: string): string {
  const m = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : padrao;
}

/** Instante (ms) de uma data civil + hora em São Paulo (sem horário de verão desde 2019). */
export function instanteSP(data: string, hora: string): number {
  return new Date(`${data}T${hora}:00-03:00`).getTime();
}

// ------------------------------------------------------------------- reserva

export type Hospede = {
  primeiroNome: string;
  sobrenome: string;
  nomeCompleto: string;
  documentos: string[];
  principal: boolean;
};

export type QuartoReserva = {
  nome: string;
  roomID?: string;
  subReservationID?: string;
  checkIn: string;
  checkOut: string;
  status: string;
};

const CHAVE_DOCUMENTO = /(document|passport|passaporte|cpf|taxid|tax_id|rg\b|identity|identidade)/i;
const CHAVE_NAO_DOCUMENTO = /(type|tipo|issue|expir|country|pais|date|data|image|url|photo)/i;

function documentosDe(guest: Raw): string[] {
  const docs: string[] = [];
  for (const [k, v] of Object.entries(guest)) {
    if (!CHAVE_DOCUMENTO.test(k) || CHAVE_NAO_DOCUMENTO.test(k)) continue;
    const d = normalizarCodigo(v);
    if (d.length >= 4) docs.push(d);
  }
  return docs;
}

function hospedeDe(guest: Raw, principalPadrao: boolean): Hospede | null {
  const first = texto(guest.guestFirstName ?? guest.firstName);
  const last = texto(guest.guestLastName ?? guest.lastName);
  const full = texto(guest.guestName ?? guest.name) || [first, last].filter(Boolean).join(" ");
  if (!full) return null;
  const partes = full.split(/\s+/);
  const principal = guest.isMainGuest === undefined ? principalPadrao : !!guest.isMainGuest && guest.isMainGuest !== "0";
  return {
    primeiroNome: first || partes[0] || "",
    sobrenome: last || (partes.length > 1 ? partes.slice(1).join(" ") : ""),
    nomeCompleto: full,
    documentos: documentosDe(guest),
    principal,
  };
}

export function extrairHospedes(rec: Raw): Hospede[] {
  const out: Hospede[] = [];
  const lista = rec.guestList;
  const guests = Array.isArray(lista)
    ? lista
    : lista && typeof lista === "object"
      ? Object.values(lista as Raw)
      : [];
  for (const g of guests) {
    if (g && typeof g === "object") {
      const h = hospedeDe(g as Raw, false);
      if (h) out.push(h);
    }
  }
  const topo = hospedeDe(rec, true);
  if (topo && !out.some((h) => normalizarTexto(h.nomeCompleto) === normalizarTexto(topo.nomeCompleto))) {
    out.push(topo);
  } else if (topo) {
    // completa documentos que só vieram no nível da reserva
    const igual = out.find((h) => normalizarTexto(h.nomeCompleto) === normalizarTexto(topo.nomeCompleto));
    if (igual) {
      igual.documentos = [...new Set([...igual.documentos, ...topo.documentos])];
      igual.principal = true;
    }
  }
  return out;
}

function quartoDe(room: Raw, rec: Raw): QuartoReserva {
  return {
    nome: texto(room.roomName ?? room.roomNumber ?? room.assignedRoomNumber),
    roomID: texto(room.roomID) || undefined,
    subReservationID: texto(room.subReservationID) || undefined,
    checkIn:
      dataDe(room.roomCheckIn ?? room.checkInDate ?? room.startDate) ||
      dataDe(rec.reservationCheckIn ?? rec.startDate),
    checkOut:
      dataDe(room.roomCheckOut ?? room.checkOutDate ?? room.endDate) ||
      dataDe(rec.reservationCheckOut ?? rec.endDate),
    status: texto(room.roomStatus ?? room.status) || texto(rec.status),
  };
}

/** Quartos da reserva (atribuídos ou não). Quarto sem nome = ainda não atribuído. */
export function extrairQuartos(rec: Raw): QuartoReserva[] {
  const fontes: Raw[] = [];
  for (const key of ["rooms", "assigned", "unassigned"]) {
    const v = rec[key];
    if (Array.isArray(v)) fontes.push(...(v.filter((r) => r && typeof r === "object") as Raw[]));
  }
  if (fontes.length === 0) {
    const lista = rec.guestList;
    const guests = lista && typeof lista === "object" ? Object.values(lista as Raw) : [];
    for (const g of guests) {
      const gr = g as Raw;
      for (const key of ["rooms", "unassignedRooms"]) {
        const v = gr?.[key];
        if (Array.isArray(v)) fontes.push(...(v as Raw[]));
      }
    }
  }
  const vistos = new Set<string>();
  const out: QuartoReserva[] = [];
  for (const r of fontes) {
    const q = quartoDe(r, rec);
    const chave = q.subReservationID || q.roomID || `${q.nome}|${q.checkIn}` || String(out.length);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(q);
  }
  if (out.length === 0) {
    out.push({
      nome: "",
      checkIn: dataDe(rec.reservationCheckIn ?? rec.startDate),
      checkOut: dataDe(rec.reservationCheckOut ?? rec.endDate),
      status: texto(rec.status),
    });
  }
  return out;
}

export function saldoDe(rec: Raw): number {
  if (rec.balance !== undefined && rec.balance !== null && rec.balance !== "") return numero(rec.balance);
  const det = rec.balanceDetailed as Raw | undefined;
  if (det && typeof det === "object" && "balance" in det) return numero(det.balance);
  return 0;
}

export function statusDe(rec: Raw): string {
  return texto(rec.status).toLowerCase();
}

// ------------------------------------------------------------ identificação

/** Código da reserva no Cloudbeds ou no canal (Booking, Airbnb, Expedia...). */
export function codigoConfere(rec: Raw, codigo: string): boolean {
  const alvo = normalizarCodigo(codigo);
  if (alvo.length < 4) return false;
  for (const key of ["reservationID", "thirdPartyIdentifier", "thidPartyIdentifier", "sourceReservationID", "channelReservationID"]) {
    const v = normalizarCodigo(rec[key]);
    if (v && v === alvo) return true;
  }
  return false;
}

/** O sobrenome digitado precisa bater com o sobrenome (ou parte dele) de algum hóspede. */
export function sobrenomeConfere(hospedes: Hospede[], sobrenome: string): boolean {
  const alvo = normalizarTexto(sobrenome);
  if (alvo.length < 2) return false;
  return hospedes.some((h) => {
    const sob = normalizarTexto(h.sobrenome);
    if (!sob) return false;
    if (sob === alvo) return true;
    const partes = sob.split(" ");
    const digitadas = alvo.split(" ");
    return digitadas.every((d) => d.length >= 2 && partes.includes(d));
  });
}

/** Nome completo: pelo menos duas palavras, todas presentes no nome do hóspede. */
export function nomeConfere(hospede: Hospede, nome: string): boolean {
  const digitadas = normalizarTexto(nome).split(" ").filter((p) => p.length >= 2);
  if (digitadas.length < 2) return false;
  const partes = new Set(normalizarTexto(hospede.nomeCompleto).split(" "));
  return digitadas.every((p) => partes.has(p));
}

export function documentoConfere(hospede: Hospede, documento: string): boolean {
  const alvo = normalizarCodigo(documento);
  if (alvo.length < 5) return false;
  return hospede.documentos.includes(alvo);
}

// --------------------------------------------------------------- elegibilidade

export type Motivo =
  | { codigo: "reserva_cancelada" }
  | { codigo: "ja_saiu" }
  | { codigo: "ja_hospedado" }
  | { codigo: "chegada_outro_dia"; data: string }
  | { codigo: "antes_do_horario"; hora: string }
  | { codigo: "sem_quarto" }
  | { codigo: "quarto_nao_limpo"; quarto: string }
  | { codigo: "sem_fechadura"; quarto: string }
  | { codigo: "saldo_aberto"; valor: number }
  | { codigo: "nao_hospedado" }
  | { codigo: "documentos_pendentes"; faltam: number };

const CANCELADAS = new Set(["canceled", "cancelled", "cancelada", "no_show", "noshow"]);
const HOSPEDADAS = new Set(["checked_in", "in_house", "inhouse"]);

/** Quartos da reserva que chegam agora (hoje, ou ontem se ainda for madrugada). */
export function quartosChegandoAgora(quartos: QuartoReserva[], relogio: RelogioSP): QuartoReserva[] {
  return quartos.filter(
    (q) =>
      q.checkIn === relogio.hoje ||
      (q.checkIn === relogio.ontem && relogio.hhmm < "06:00" && !HOSPEDADAS.has(q.status.toLowerCase())),
  );
}

export type EntradaCheckin = {
  status: string;
  quartos: QuartoReserva[];
  relogio: RelogioSP;
  horaCheckin: string;
  exigeQuartoLimpo: boolean;
  quartoLimpo: (nome: string) => boolean;
  temFechadura: (nome: string) => boolean;
  saldo: number;
  bloqueiaSaldoAberto: boolean;
};

export type ResultadoCheckin = { quartos: QuartoReserva[]; motivos: Motivo[] };

/**
 * Decide se o totem pode liberar a senha. Devolve TODOS os motivos que impedem,
 * para o hóspede saber de uma vez o que resolver.
 */
export function avaliarCheckin(e: EntradaCheckin): ResultadoCheckin {
  const status = e.status.toLowerCase();
  if (CANCELADAS.has(status)) return { quartos: [], motivos: [{ codigo: "reserva_cancelada" }] };
  if (status === "checked_out") return { quartos: [], motivos: [{ codigo: "ja_saiu" }] };
  if (HOSPEDADAS.has(status)) return { quartos: [], motivos: [{ codigo: "ja_hospedado" }] };

  const chegando = quartosChegandoAgora(e.quartos, e.relogio);
  if (chegando.length === 0) {
    const datas = e.quartos.map((q) => q.checkIn).filter(Boolean).sort();
    return { quartos: [], motivos: [{ codigo: "chegada_outro_dia", data: datas[0] ?? "" }] };
  }

  const motivos: Motivo[] = [];
  const madrugadaDeOntem = chegando.every((q) => q.checkIn === e.relogio.ontem);
  if (!madrugadaDeOntem && e.relogio.hhmm < e.horaCheckin) {
    motivos.push({ codigo: "antes_do_horario", hora: e.horaCheckin });
  }
  if (chegando.some((q) => !q.nome)) motivos.push({ codigo: "sem_quarto" });
  for (const q of chegando.filter((x) => x.nome)) {
    if (e.exigeQuartoLimpo && !e.quartoLimpo(q.nome)) motivos.push({ codigo: "quarto_nao_limpo", quarto: q.nome });
  }
  if (e.bloqueiaSaldoAberto && e.saldo > 0.009) motivos.push({ codigo: "saldo_aberto", valor: e.saldo });
  for (const q of chegando.filter((x) => x.nome)) {
    if (!e.temFechadura(q.nome)) motivos.push({ codigo: "sem_fechadura", quarto: q.nome });
  }
  return { quartos: chegando, motivos };
}

export type EntradaCheckout = { status: string; saldo: number; bloqueiaSaldoAberto: boolean };

export function avaliarCheckout(e: EntradaCheckout): Motivo[] {
  const status = e.status.toLowerCase();
  if (status === "checked_out") return [{ codigo: "ja_saiu" }];
  if (!HOSPEDADAS.has(status)) return [{ codigo: "nao_hospedado" }];
  if (e.bloqueiaSaldoAberto && e.saldo > 0.009) return [{ codigo: "saldo_aberto", valor: e.saldo }];
  return [];
}

export function estaHospedada(status: string): boolean {
  return HOSPEDADAS.has(status.toLowerCase());
}

/** Primeiro nome para cumprimentar sem expor o nome completo na tela. */
export function primeiroNome(hospedes: Hospede[]): string {
  const h = hospedes.find((x) => x.principal) ?? hospedes[0];
  const nome = (h?.primeiroNome || h?.nomeCompleto || "").split(/\s+/)[0] ?? "";
  return nome ? nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase() : "";
}

// ------------------------------------------------------------------ bloqueio

export const MAX_TENTATIVAS = 5;
export const JANELA_BLOQUEIO_MIN = 10;

/** Bloqueia após N erros de identificação seguidos dentro da janela. */
export function tentativasEsgotadas(
  eventos: Array<{ tipo: string; criado_em: string }>,
  agoraMs: number,
): boolean {
  const limite = agoraMs - JANELA_BLOQUEIO_MIN * 60_000;
  let falhas = 0;
  const ordenados = [...eventos].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  for (const ev of ordenados) {
    if (new Date(ev.criado_em).getTime() < limite) break;
    if (ev.tipo === "identificacao_falhou") falhas++;
    else if (ev.tipo === "identificacao_ok") break;
  }
  return falhas >= MAX_TENTATIVAS;
}

// ------------------------------------------------------------------ adultos

export type AdultoReserva = { ordem: number; nome: string | null };

/**
 * Adultos que precisam mostrar documento. Usa o número de adultos da reserva
 * (ou dos quartos que chegam) e preenche os nomes conhecidos no Cloudbeds,
 * titular primeiro. Sempre pelo menos 1.
 */
export function adultosDaReserva(rec: Raw, quartos: QuartoReserva[] = []): AdultoReserva[] {
  const nums: number[] = [];
  const topo = Number(rec.adults ?? rec.numberOfAdults);
  if (Number.isFinite(topo) && topo > 0) nums.push(topo);
  const salas = Array.isArray(rec.rooms) ? (rec.rooms as Raw[]) : [];
  const nomesChegando = new Set(quartos.map((q) => q.nome).filter(Boolean));
  const somaSalas = salas
    .filter((r) => nomesChegando.size === 0 || nomesChegando.has(texto(r.roomName ?? r.roomNumber)))
    .reduce((s, r) => s + (Number(r.adults) || 0), 0);
  if (somaSalas > 0) nums.push(somaSalas);
  const hospedes = extrairHospedes(rec);
  const total = Math.min(Math.max(1, nums.length ? Math.max(...nums) : hospedes.length || 1), 12);
  const ordenados = [...hospedes].sort((a, b) => Number(b.principal) - Number(a.principal));
  return Array.from({ length: total }, (_, i) => ({ ordem: i + 1, nome: ordenados[i]?.nomeCompleto ?? null }));
}

/** Quantos adultos ainda não têm as duas fotos (selfie e selfie com o documento). */
export function documentosFaltando(adultos: number, enviados: Array<{ hospede_ordem: number; etapa: string }>): number {
  const tem = (ordem: number, etapa: string) => enviados.some((d) => d.hospede_ordem === ordem && d.etapa === etapa);
  let faltam = 0;
  for (let i = 1; i <= adultos; i++) if (!tem(i, "rosto") || !tem(i, "rosto_documento")) faltam++;
  return faltam;
}
