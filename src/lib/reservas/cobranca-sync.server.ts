// Atualização da lista de cobrança (tela Reservas). Roda no servidor:
//   - a cada 1 h pelo agendamento do banco (/api/public/reservas-cobranca);
//   - no botão "Atualizar agora" da tela (cobranca.functions.ts).
//
// Regras em ./cobranca.ts. Cuidados:
//   - Se o Cloudbeds falhar, a lista da unidade NÃO é mexida (fica a última boa) e o erro aparece na tela.
//   - Cobrado? e Observação são da recepção: o servidor nunca grava essas colunas.
//   - Reserva que estava na lista e não veio nas buscas é consultada pelo número antes de sair.
import type { SupabaseClient } from "@supabase/supabase-js";
import { nowSP, todaySP } from "@/lib/tz";
import {
  avaliarReserva,
  motivoDeSaida,
  somarDiasISO,
  type Avaliacao,
} from "./cobranca";

export type Unidade = "Botafogo" | "Ipanema";
export const UNIDADES: Unidade[] = ["Botafogo", "Ipanema"];

const API_V13 = "https://api.cloudbeds.com/api/v1.3/getReservationsWithRateDetails";
const PAGE_SIZE = 100;
const MAX_PAGINAS = 30;
/** Avisos no celular só entre 7h e 22h (horário do hotel); o que entrar à noite avisa às 7h. */
const AVISO_DAS = 7;
const AVISO_ATE = 22;

type Obj = Record<string, unknown>;

export type ResultadoUnidade = {
  unidade: Unidade;
  ok: boolean;
  consultadas?: number;
  naLista?: number;
  entraram?: number;
  sairam?: number;
  erro?: string;
};

async function db(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

// ------------------------------------------------------------------ Cloudbeds

async function buscarPagina(unidade: Unidade, params: Record<string, string>, pagina: number): Promise<Obj[]> {
  const { cloudbedsFetch, cloudbedsApiKeyHeaders } = await import("@/lib/cloudbeds/client.server");
  const prop = unidade.toLowerCase() as "botafogo" | "ipanema";
  const qs = new URLSearchParams({ ...params, pageNumber: String(pagina), pageSize: String(PAGE_SIZE) });
  const res = await cloudbedsFetch(prop, `${API_V13}?${qs.toString()}`, { headers: cloudbedsApiKeyHeaders(prop) });
  const texto = await res.text();
  let json: Obj | null = null;
  try {
    json = JSON.parse(texto) as Obj;
  } catch {
    throw new Error(`Cloudbeds ${unidade} respondeu ${res.status} sem JSON: ${texto.slice(0, 160)}`);
  }
  if (!res.ok || json.success === false) {
    throw new Error(`Cloudbeds ${unidade} (${res.status}): ${String(json.message ?? json.error ?? "falhou")}`);
  }
  const data = json.data;
  return Array.isArray(data) ? (data.filter((x) => x && typeof x === "object") as Obj[]) : [];
}

async function buscarTodas(unidade: Unidade, params: Record<string, string>): Promise<Obj[]> {
  const todas: Obj[] = [];
  for (let p = 1; p <= MAX_PAGINAS; p++) {
    const pagina = await buscarPagina(unidade, params, p);
    todas.push(...pagina);
    if (pagina.length < PAGE_SIZE) break;
  }
  return todas;
}

const idDe = (r: Obj) => String(r.reservationID ?? r.reservationId ?? r.id ?? "").trim();
const inicioDoDia = (d: string) => `${d} 00:00:00`;
const fimDoDia = (d: string) => `${d} 23:59:59`;

/** As duas buscas do documento, juntadas sem repetir reserva. */
async function buscarReservas(unidade: Unidade, hoje: string): Promise<Map<string, Obj>> {
  const [porData, porEstadia] = await Promise.all([
    // Regra NR (8º dia e check-in próximo): reservas feitas nos últimos 30 dias.
    buscarTodas(unidade, { resultsFrom: inicioDoDia(somarDiasISO(hoje, -30)), resultsTo: fimDoDia(hoje) }),
    // Regra Standard: estadias com saída de hoje a 90 dias, reservadas nos últimos 2 anos.
    buscarTodas(unidade, {
      reservationCheckOutFrom: hoje,
      reservationCheckOutTo: somarDiasISO(hoje, 90),
      resultsFrom: inicioDoDia(somarDiasISO(hoje, -730)),
      resultsTo: fimDoDia(hoje),
    }),
  ]);
  const mapa = new Map<string, Obj>();
  for (const r of [...porData, ...porEstadia]) {
    const id = idDe(r);
    if (id && !mapa.has(id)) mapa.set(id, r);
  }
  return mapa;
}

/** Consulta direta por número (reservas que estavam na lista e não vieram nas buscas). */
async function buscarPorNumero(unidade: Unidade, ids: string[]): Promise<Obj[]> {
  const achadas: Obj[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    achadas.push(...(await buscarTodas(unidade, { reservationID: lote.join(",") })));
  }
  return achadas;
}

// ------------------------------------------------------------------ gravação

function linhaDaLista(unidade: Unidade, av: Avaliacao, agora: string) {
  return {
    unidade,
    reservation_id: av.reservationId,
    property_id: av.propertyId,
    hospede: av.hospede,
    data_reserva: av.dataReserva,
    checkin: av.checkin,
    checkout: av.checkout,
    plano: av.planos.join(" · ") || null,
    origem: av.origem || null,
    saldo: av.saldo,
    status_cloudbeds: av.status,
    motivo: av.motivo,
    ativa: true,
    saiu_em: null,
    motivo_saida: null,
    atualizado_em: agora,
  };
}

async function gravarSync(unidade: Unidade, campos: Obj) {
  const c = await db();
  await c.from("reservas_cobranca_sync").upsert({ unidade, ...campos }, { onConflict: "unidade" });
}

export async function sincronizarUnidade(unidade: Unidade): Promise<ResultadoUnidade> {
  const c = await db();
  const agora = new Date().toISOString();
  const hoje = todaySP();
  await gravarSync(unidade, { ultima_tentativa: agora });

  try {
    const mapa = await buscarReservas(unidade, hoje);

    const { data: atuais, error: errAtuais } = await c
      .from("reservas_cobranca")
      .select("id, reservation_id, ativa")
      .eq("unidade", unidade);
    if (errAtuais) throw new Error(errAtuais.message);
    const ativasAntes = new Map<string, string>();
    for (const r of (atuais ?? []) as { id: string; reservation_id: string; ativa: boolean }[]) {
      if (r.ativa) ativasAntes.set(r.reservation_id, r.id);
    }

    // Quem estava na lista e não veio nas buscas: confere pelo número antes de tirar.
    const faltando = [...ativasAntes.keys()].filter((id) => !mapa.has(id));
    if (faltando.length) {
      for (const r of await buscarPorNumero(unidade, faltando)) {
        const id = idDe(r);
        if (id && !mapa.has(id)) mapa.set(id, r);
      }
    }

    const avaliacoes = [...mapa.values()].map((r) => avaliarReserva(r, hoje)).filter((a) => a.reservationId);
    const porId = new Map(avaliacoes.map((a) => [a.reservationId, a]));
    const naLista = avaliacoes.filter((a) => a.motivo);

    // 1) Lista: atualiza dados do Cloudbeds (sem tocar em Cobrado?/Observação).
    const continuam = naLista.filter((a) => ativasAntes.has(a.reservationId)).map((a) => linhaDaLista(unidade, a, agora));
    const entram = naLista
      .filter((a) => !ativasAntes.has(a.reservationId))
      .map((a) => ({ ...linhaDaLista(unidade, a, agora), entrou_em: agora }));
    for (const lote of [continuam, entram]) {
      if (!lote.length) continue;
      const { error } = await c.from("reservas_cobranca").upsert(lote, { onConflict: "unidade,reservation_id" });
      if (error) throw new Error(error.message);
    }

    // 2) Quem saiu: saldo zerado, cancelada, check-in feito ou fora da regra.
    const idsNaLista = new Set(naLista.map((a) => a.reservationId));
    let sairam = 0;
    for (const [reservationId, rowId] of ativasAntes) {
      if (idsNaLista.has(reservationId)) continue;
      const av = porId.get(reservationId);
      const { error } = await c
        .from("reservas_cobranca")
        .update({
          ativa: false,
          saiu_em: agora,
          motivo_saida: motivoDeSaida(av),
          atualizado_em: agora,
          ...(av ? { saldo: av.saldo, status_cloudbeds: av.status } : {}),
        })
        .eq("id", rowId);
      if (error) throw new Error(error.message);
      sairam++;
    }

    // 3) Histórico: cada reserva uma única vez, quando entra na lista.
    if (naLista.length) {
      const { error } = await c.from("reservas_cobranca_historico").upsert(
        naLista.map((a) => ({
          unidade,
          reservation_id: a.reservationId,
          hospede: a.hospede,
          saldo: a.saldo,
          motivo: a.motivo,
        })),
        { onConflict: "unidade,reservation_id", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
    }

    // 4) Conferência (gestor): tudo o que foi consultado nesta atualização.
    await c.from("reservas_cobranca_conferencia").delete().eq("unidade", unidade);
    const conf = avaliacoes.map((a) => ({
      unidade,
      reservation_id: a.reservationId,
      hospede: a.hospede,
      status_cloudbeds: a.status,
      data_reserva: a.dataReserva,
      checkin: a.checkin,
      origem: a.origem || null,
      planos: a.planos.join(" · ") || null,
      nr: a.nr,
      saldo: a.saldo,
      motivo: a.motivo,
      exclusao: a.exclusao,
      entra_em: a.entraEm,
      consultado_em: agora,
    }));
    for (let i = 0; i < conf.length; i += 500) {
      const { error } = await c.from("reservas_cobranca_conferencia").insert(conf.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }

    await gravarSync(unidade, { ultima_ok: agora, erro: null, consultadas: avaliacoes.length });
    return { unidade, ok: true, consultadas: avaliacoes.length, naLista: naLista.length, entraram: entram.length, sairam };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error(`[reservas-cobranca] ${unidade}:`, erro);
    await gravarSync(unidade, { erro: erro.slice(0, 500) }).catch(() => undefined);
    return { unidade, ok: false, erro };
  }
}

/** Aviso no celular das reservas que entraram na lista e ainda não foram avisadas. */
export async function avisarNovas(): Promise<number> {
  const hora = nowSP().getHours();
  if (hora < AVISO_DAS || hora >= AVISO_ATE) return 0;
  const c = await db();
  const { data, error } = await c
    .from("reservas_cobranca_historico")
    .select("id, unidade, hospede, saldo")
    .eq("notificado", false)
    .limit(500);
  if (error || !data?.length) return 0;
  const linhas = data as { id: string; unidade: string; hospede: string; saldo: number }[];
  const total = linhas.reduce((s, l) => s + Number(l.saldo || 0), 0);
  const unidades = [...new Set(linhas.map((l) => l.unidade))].join(" e ");
  const { error: errPush } = await c.rpc("reservas_cobranca_notificar", {
    _payload: {
      quantidade: linhas.length,
      total: Math.round(total * 100) / 100,
      unidades,
      hospede: linhas.length === 1 ? linhas[0].hospede : null,
      data: todaySP(),
    },
  });
  if (errPush) {
    console.error("[reservas-cobranca] aviso:", errPush.message);
    return 0;
  }
  await c.from("reservas_cobranca_historico").update({ notificado: true }).in("id", linhas.map((l) => l.id));
  return linhas.length;
}

export async function sincronizarCobrancas(unidades: Unidade[] = UNIDADES) {
  const resultados: ResultadoUnidade[] = [];
  // Antes de recalcular a lista: links já pagos no Stripe entram no Cloudbeds (caso o aviso do Stripe falhe).
  const { conferirLinksEnviados } = await import("./cobranca-stripe.server");
  for (const u of unidades) {
    await conferirLinksEnviados(u).catch((e) => console.error(`[reservas-cobranca] links ${u}:`, (e as Error).message));
  }
  for (const u of unidades) resultados.push(await sincronizarUnidade(u));
  // Depois: etiqueta os Clientes do Stripe com o nº da reserva (busca direta no "Cobrar agora").
  const { indexarClientes } = await import("./stripe-indice.server");
  for (const u of unidades) {
    await indexarClientes(u).catch((e) => console.error(`[reservas-cobranca] índice ${u}:`, (e as Error).message));
  }
  // Selo "sem cartão no Stripe" na lista.
  const { conferirSituacoes } = await import("./cobranca-stripe.server");
  for (const u of unidades) {
    await conferirSituacoes(u).catch((e) => console.error(`[reservas-cobranca] situação ${u}:`, (e as Error).message));
  }
  const avisadas = await avisarNovas().catch(() => 0);
  return { resultados, avisadas };
}
