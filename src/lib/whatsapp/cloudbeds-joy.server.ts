// Consultas ao Cloudbeds usadas pelas ferramentas da Joy. Só leitura.
// O resumo da reserva NUNCA leva número/nome da acomodação (regra do Rodrigo: a Joy não informa).

import { cloudbedsFetch, type CloudbedsProperty } from "@/lib/cloudbeds/client.server";
import { buscarReservaPorId, listarReservas } from "@/lib/totem/totem.server";
import {
  codigoConfere,
  extrairHospedes,
  normalizarCodigo,
  saldoDe,
  sobrenomeConfere,
  type Raw,
} from "@/lib/totem/regras";
import { UNIDADES_JOY, type UnidadeJoy } from "./conhecimento";
import {
  lerDisponibilidade,
  mesmoTelefone,
  noites,
  somarDias,
  statusReserva,
  type OpcaoQuarto,
} from "./regras";

const propriedade = (u: UnidadeJoy) => u.toLowerCase() as CloudbedsProperty;

function texto(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function data(v: unknown): string {
  const s = texto(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}

// ------------------------------------------------------ disponibilidade

export async function consultarDisponibilidade(
  unidade: UnidadeJoy,
  p: { checkin: string; checkout: string; adultos: number; criancas: number },
): Promise<OpcaoQuarto[]> {
  const qs = new URLSearchParams({
    startDate: p.checkin,
    endDate: p.checkout,
    rooms: "1",
    adults: String(p.adultos),
    children: String(p.criancas),
    detailedRates: "true",
  });
  const res = await cloudbedsFetch(propriedade(unidade), `/getAvailableRoomTypes?${qs.toString()}`);
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
  } | null;
  if (!res.ok || !json || json.success === false) {
    throw new Error(
      `Cloudbeds ${unidade} recusou a consulta de disponibilidade (${res.status}): ${json?.message ?? "sem resposta"}`,
    );
  }
  return lerDisponibilidade(json, noites(p.checkin, p.checkout));
}

// --------------------------------------------------------------- reserva

export type ReservaJoy = {
  unidade: UnidadeJoy;
  reservationID: string;
  rec: Raw;
};

export type ResumoReserva = {
  codigo_reserva: string;
  unidade: UnidadeJoy;
  titular_primeiro_nome: string;
  chegada: string;
  saida: string;
  noites: number;
  status: string;
  saldo_em_aberto: number;
  tipos_de_acomodacao: string[];
  adultos: number | null;
  criancas: number | null;
};

const STATUS_PT: Record<string, string> = {
  confirmada: "confirmada",
  nao_confirmada: "aguardando confirmação",
  hospedado: "hospedado",
  saiu: "já fez check-out",
  cancelada: "cancelada",
  no_show: "não compareceu (no-show)",
  outro: "outro",
};

function tiposDeAcomodacao(rec: Raw): string[] {
  const tipos = new Set<string>();
  for (const key of ["rooms", "assigned", "unassigned"]) {
    const v = rec[key];
    if (!Array.isArray(v)) continue;
    for (const r of v as Raw[]) {
      const t = texto(r?.roomTypeName ?? r?.roomTypeNameShort);
      if (t) tipos.add(t);
    }
  }
  return [...tipos];
}

function chegadaSaida(rec: Raw): { chegada: string; saida: string } {
  return {
    chegada: data(rec.startDate ?? rec.reservationCheckIn ?? rec.checkIn),
    saida: data(rec.endDate ?? rec.reservationCheckOut ?? rec.checkOut),
  };
}

export function resumoReserva(r: ReservaJoy): ResumoReserva {
  const { chegada, saida } = chegadaSaida(r.rec);
  const hospedes = extrairHospedes(r.rec);
  const titular = hospedes.find((h) => h.principal) ?? hospedes[0];
  const adultos = Number(r.rec.adults ?? r.rec.adultsNumber);
  const criancas = Number(r.rec.children ?? r.rec.childrenNumber);
  return {
    codigo_reserva: r.reservationID,
    unidade: r.unidade,
    titular_primeiro_nome: titular?.primeiroNome ?? "",
    chegada,
    saida,
    noites: chegada && saida ? noites(chegada, saida) : 0,
    status: STATUS_PT[statusReserva(texto(r.rec.status))] ?? texto(r.rec.status),
    saldo_em_aberto: Math.round(saldoDe(r.rec) * 100) / 100,
    tipos_de_acomodacao: tiposDeAcomodacao(r.rec),
    adultos: Number.isFinite(adultos) ? adultos : null,
    criancas: Number.isFinite(criancas) ? criancas : null,
  };
}

export function dadosParaWifi(r: ReservaJoy): { status: string; chegada: string; saida: string } {
  return { status: texto(r.rec.status), ...chegadaSaida(r.rec) };
}

/** Recarrega a reserva já identificada (status e saldo mudam). */
export async function recarregarReserva(
  unidade: UnidadeJoy,
  reservationID: string,
): Promise<ReservaJoy | null> {
  const rec = await buscarReservaPorId(propriedade(unidade), reservationID);
  return rec ? { unidade, reservationID, rec } : null;
}

/**
 * Código (Cloudbeds ou canal: Booking, Airbnb...) + sobrenome, nas duas unidades.
 * Os dois precisam bater juntos; nada é revelado se não baterem.
 */
export async function identificarReserva(
  codigo: string,
  sobrenome: string,
  hoje: string,
): Promise<ReservaJoy | null> {
  const id = normalizarCodigo(codigo);
  if (id.length < 4 || sobrenome.trim().length < 2) return null;

  for (const unidade of UNIDADES_JOY) {
    const det = await buscarReservaPorId(propriedade(unidade), id).catch(() => null);
    if (det && codigoConfere(det, codigo) && sobrenomeConfere(extrairHospedes(det), sobrenome)) {
      return { unidade, reservationID: texto(det.reservationID) || id, rec: det };
    }
  }

  // Código do canal: procura nas reservas com chegada de 30 dias atrás a 1 ano à frente.
  for (const unidade of UNIDADES_JOY) {
    const lista = await listarReservas(propriedade(unidade), {
      checkInFrom: somarDias(hoje, -30),
      checkInTo: somarDias(hoje, 365),
    }).catch(() => [] as Raw[]);
    for (const rec of lista) {
      if (!codigoConfere(rec, codigo)) continue;
      const reservationID = texto(rec.reservationID);
      const det = reservationID
        ? await buscarReservaPorId(propriedade(unidade), reservationID).catch(() => null)
        : null;
      const completo = det ? { ...rec, ...det } : rec;
      if (sobrenomeConfere(extrairHospedes(completo), sobrenome))
        return { unidade, reservationID, rec: completo };
    }
  }
  return null;
}

/**
 * Reserva atual ou próxima cujo telefone (fixo ou celular) é o do contato.
 * Usa getGuestList (chegadas de 30 dias atrás a 6 meses à frente, saída a partir de ontem) e compara os dígitos aqui.
 */
export async function reservaPorTelefone(
  telefone: string,
  hoje: string,
): Promise<ReservaJoy | null> {
  const achados: ReservaJoy[] = [];
  for (const unidade of UNIDADES_JOY) {
    for (let pagina = 1; pagina <= 5; pagina++) {
      const qs = new URLSearchParams({
        checkInFrom: somarDias(hoje, -30),
        checkInTo: somarDias(hoje, 180),
        checkOutFrom: somarDias(hoje, -1),
        pageSize: "100",
        pageNumber: String(pagina),
      });
      const res = await cloudbedsFetch(
        propriedade(unidade),
        `/getGuestList?${qs.toString()}`,
      ).catch(() => null);
      if (!res || !res.ok) break;
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: unknown;
      } | null;
      if (!json || json.success === false) break;
      const lista = Array.isArray(json.data)
        ? (json.data as Raw[])
        : json.data && typeof json.data === "object"
          ? (Object.values(json.data as Raw) as Raw[])
          : [];
      for (const g of lista) {
        if (mesmoTelefone(g.guestCellPhone, telefone) || mesmoTelefone(g.guestPhone, telefone)) {
          const reservationID = texto(g.reservationID);
          if (reservationID && !achados.some((a) => a.reservationID === reservationID)) {
            const rec = await buscarReservaPorId(propriedade(unidade), reservationID).catch(
              () => null,
            );
            if (rec) achados.push({ unidade, reservationID, rec });
          }
        }
      }
      if (lista.length < 100) break;
    }
  }
  const validas = achados.filter((a) => {
    const st = statusReserva(texto(a.rec.status));
    return st !== "cancelada" && st !== "no_show" && st !== "saiu";
  });
  // A mais próxima de hoje (hospedada primeiro).
  validas.sort((a, b) => chegadaSaida(a.rec).chegada.localeCompare(chegadaSaida(b.rec).chegada));
  return (
    validas.find((v) => statusReserva(texto(v.rec.status)) === "hospedado") ?? validas[0] ?? null
  );
}
