// Lado servidor do Totem. Só é importado dentro de handlers de server functions.
// Usa a chave de serviço (supabaseAdmin) porque o tablet não tem login; quem
// autoriza cada chamada é o token do aparelho (ver autenticarTotem).

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cloudbedsFetch, type CloudbedsProperty } from "@/lib/cloudbeds/client.server";
import {
  findMatchingRoomIdentifiers,
  getReservationsFromPayload,
  reservationMatchesRoom,
} from "@/lib/cloudbeds/checkout-match.server";
import {
  codigoConfere,
  documentoConfere,
  extrairHospedes,
  extrairQuartos,
  hhmm,
  nomeConfere,
  normalizarCodigo,
  quartosIguais,
  relogioSP,
  sobrenomeConfere,
  tentativasEsgotadas,
  type Hospede,
  type QuartoReserva,
  type Raw,
} from "./regras";

// As tabelas novas ainda não estão no types.ts gerado pelo Lovable.
const db = () => supabaseAdmin as unknown as SupabaseClient;

export const ERRO_NAO_AUTORIZADO = "TOTEM_NAO_AUTORIZADO";

export type Totem = {
  id: string;
  nome: string;
  unidade: "Botafogo" | "Ipanema";
  hora_checkin: string;
  hora_checkout: string;
  exige_quarto_limpo: boolean;
  bloqueia_saldo_aberto: boolean;
  telefone_suporte: string | null;
  modo: ModoTotem;
  pagamento_habilitado: boolean;
  pos_serial: string | null;
  pede_documentos: boolean;
  impressora: "nenhuma" | "rawbt";
  wifi_rede: string | null;
  wifi_senha: string | null;
  mensagem_comprovante: string | null;
  voz_ativa: boolean;
};

export type ModoTotem = "ambos" | "checkin" | "checkout";

// "*" de propósito: se uma migração nova ainda não foi aplicada, o totem segue
// funcionando com os valores padrão em vez de quebrar por coluna inexistente.
const CAMPOS_TOTEM = "*";

function normalizarTotem(row: Record<string, unknown>): Totem {
  return {
    id: String(row.id),
    nome: String(row.nome ?? "Totem"),
    unidade: row.unidade === "Ipanema" ? "Ipanema" : "Botafogo",
    hora_checkin: hhmm(row.hora_checkin, "14:00"),
    hora_checkout: hhmm(row.hora_checkout, "12:00"),
    exige_quarto_limpo: row.exige_quarto_limpo !== false,
    bloqueia_saldo_aberto: row.bloqueia_saldo_aberto !== false,
    telefone_suporte: (row.telefone_suporte as string | null) ?? null,
    modo: row.modo === "checkin" || row.modo === "checkout" ? row.modo : "ambos",
    pagamento_habilitado: row.pagamento_habilitado === true,
    pos_serial: ((row.pos_serial as string | null) ?? "").trim() || null,
    pede_documentos: row.pede_documentos !== false,
    impressora: row.impressora === "rawbt" ? "rawbt" : "nenhuma",
    wifi_rede: (row.wifi_rede as string | null) ?? null,
    wifi_senha: (row.wifi_senha as string | null) ?? null,
    mensagem_comprovante: (row.mensagem_comprovante as string | null) ?? null,
    voz_ativa: row.voz_ativa !== false,
  };
}

export const propriedade = (t: Totem) => t.unidade.toLowerCase() as CloudbedsProperty;

// ------------------------------------------------------------------ token

export async function sha256Hex(valor: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function novoToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Troca o código de 8 caracteres (gerado pelo gestor) pelo token definitivo do tablet. */
export async function parearTotem(codigo: string): Promise<{ token: string; totem: Totem }> {
  const limpo = normalizarCodigo(codigo);
  if (limpo.length !== 8) throw new Error("O código tem 8 letras e números (ex.: K7M2-9QXP).");
  const hash = await sha256Hex(limpo);
  const { data, error } = await db()
    .from("totem_dispositivos")
    .select(CAMPOS_TOTEM)
    .eq("pareamento_hash", hash)
    .eq("ativo", true)
    .gt("pareamento_expira", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao conferir o código: ${error.message}`);
  if (!data) throw new Error("Código inválido ou expirado. Gere um novo em Área do Gestor › Totem.");

  const totem = normalizarTotem(data as Record<string, unknown>);
  const token = novoToken();
  const { error: upErr } = await db()
    .from("totem_dispositivos")
    .update({
      token_hash: await sha256Hex(token),
      pareamento_hash: null,
      pareamento_expira: null,
      pareado_em: new Date().toISOString(),
    })
    .eq("id", totem.id);
  if (upErr) throw new Error(`Falha ao parear: ${upErr.message}`);
  await registrarEvento(totem, "pareamento", {});
  return { token, totem };
}

/** Garante que o tablet só faz a função para a qual foi configurado. */
export function exigirModo(totem: Totem, acao: "checkin" | "checkout") {
  if (totem.modo !== "ambos" && totem.modo !== acao) {
    throw new Error(acao === "checkin" ? "Este totem é só para check-out." : "Este totem é só para check-in.");
  }
}

export async function autenticarTotem(token: string): Promise<Totem> {
  if (!token || token.length < 20) throw new Error(ERRO_NAO_AUTORIZADO);
  const { data, error } = await db()
    .from("totem_dispositivos")
    .select(CAMPOS_TOTEM)
    .eq("token_hash", await sha256Hex(token))
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao validar o totem: ${error.message}`);
  if (!data) throw new Error(ERRO_NAO_AUTORIZADO);
  const totem = normalizarTotem(data as Record<string, unknown>);
  await db().from("totem_dispositivos").update({ ultimo_uso: new Date().toISOString() }).eq("id", totem.id);
  return totem;
}

// ---------------------------------------------------------------- eventos

export async function registrarEvento(
  totem: Totem,
  tipo: string,
  extra: { reservation_id?: string | null; quarto?: string | null; hospede?: string | null; detalhe?: string | null },
) {
  const { error } = await db().from("totem_eventos").insert({
    totem_id: totem.id,
    unidade: totem.unidade,
    tipo,
    reservation_id: extra.reservation_id ?? null,
    quarto: extra.quarto ?? null,
    hospede: extra.hospede ?? null,
    detalhe: extra.detalhe ? extra.detalhe.slice(0, 1000) : null,
  });
  if (error) console.error("[totem] falha ao registrar evento", tipo, error.message);
}

export async function totemBloqueado(totem: Totem): Promise<boolean> {
  const desde = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data, error } = await db()
    .from("totem_eventos")
    .select("tipo,criado_em")
    .eq("totem_id", totem.id)
    .in("tipo", ["identificacao_falhou", "identificacao_ok"])
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(30);
  if (error) throw new Error(`Falha ao consultar o histórico do totem: ${error.message}`);
  return tentativasEsgotadas((data ?? []) as Array<{ tipo: string; criado_em: string }>, Date.now());
}

// --------------------------------------------------------------- Cloudbeds

async function listarReservas(property: CloudbedsProperty, filtros: Record<string, string>): Promise<Raw[]> {
  const out: Raw[] = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const qs = new URLSearchParams({
      ...filtros,
      pageSize: "100",
      pageNumber: String(pagina),
      includeGuestsDetails: "true",
      includeAllRooms: "true",
    });
    const res = await cloudbedsFetch(property, `/getReservations?${qs.toString()}`);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Cloudbeds indisponível (${res.status}). ${txt.slice(0, 160)}`.trim());
    }
    const json = (await res.json()) as { success?: boolean; data?: unknown; total?: unknown; count?: unknown; message?: string };
    if (json.success === false) throw new Error(`Cloudbeds recusou a consulta: ${json.message ?? "erro"}`);
    const lista = getReservationsFromPayload(json as never) as Raw[];
    out.push(...lista);
    const total = Number(json.total ?? json.count ?? 0);
    if (lista.length < 100 || (total && out.length >= total)) break;
  }
  return out;
}

export async function buscarReservaPorId(property: CloudbedsProperty, id: string): Promise<Raw | null> {
  const res = await cloudbedsFetch(property, `/getReservation?reservationID=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: Raw } | null;
  if (!json || json.success === false || !json.data || typeof json.data !== "object") return null;
  return json.data;
}

function diasAtras(dias: number, hoje: string) {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Reservas que podem estar chegando agora (janela de 7 dias por causa de reservas multi-quarto). */
async function chegadasRecentes(totem: Totem): Promise<Raw[]> {
  const { hoje } = relogioSP();
  return listarReservas(propriedade(totem), { checkInFrom: diasAtras(7, hoje), checkInTo: hoje });
}

export type IdentificacaoCheckin =
  | { modo: "codigo"; codigo: string; sobrenome: string }
  | { modo: "documento"; nome: string; documento: string };

export type ReservaIdentificada = { rec: Raw; hospedes: Hospede[]; reservationID: string };

function identificada(rec: Raw): ReservaIdentificada {
  return { rec, hospedes: extrairHospedes(rec), reservationID: String(rec.reservationID ?? "") };
}

/**
 * Encontra a reserva com DOIS fatores: código + sobrenome, ou nome + documento.
 * Nada é revelado ao hóspede se os dois não baterem juntos.
 */
export async function identificarReservaCheckin(
  totem: Totem,
  ident: IdentificacaoCheckin,
): Promise<ReservaIdentificada | null> {
  const property = propriedade(totem);
  const lista = await chegadasRecentes(totem);

  if (ident.modo === "codigo") {
    const candidatos = lista.filter((r) => codigoConfere(r, ident.codigo));
    for (const rec of candidatos) {
      if (sobrenomeConfere(extrairHospedes(rec), ident.sobrenome)) return identificada(rec);
    }
    // Código do Cloudbeds de uma reserva fora da janela (ex.: chegada amanhã).
    if (candidatos.length === 0 && /^[A-Za-z0-9-]{6,}$/.test(ident.codigo.trim())) {
      const det = await buscarReservaPorId(property, normalizarCodigo(ident.codigo));
      if (det && codigoConfere(det, ident.codigo) && sobrenomeConfere(extrairHospedes(det), ident.sobrenome)) {
        return identificada(det);
      }
    }
    return null;
  }

  for (const rec of lista) {
    const hospedes = extrairHospedes(rec);
    const mesmoNome = hospedes.filter((h) => nomeConfere(h, ident.nome));
    if (mesmoNome.length === 0) continue;
    if (mesmoNome.some((h) => documentoConfere(h, ident.documento))) return identificada(rec);
    // A lista às vezes vem sem documento: confere no detalhe da reserva.
    if (mesmoNome.every((h) => h.documentos.length === 0) && rec.reservationID) {
      const det = await buscarReservaPorId(property, String(rec.reservationID));
      if (det && extrairHospedes(det).some((h) => nomeConfere(h, ident.nome) && documentoConfere(h, ident.documento))) {
        return identificada({ ...rec, ...det });
      }
    }
  }
  return null;
}

/** Reserva hospedada no quarto informado cujo sobrenome confere. */
export async function identificarReservaCheckout(
  totem: Totem,
  quarto: string,
  sobrenome: string,
): Promise<ReservaIdentificada | null> {
  const property = propriedade(totem);
  const vistos = new Map<string, Raw>();
  for (const status of ["checked_in", "in_house"]) {
    try {
      for (const r of await listarReservas(property, { status })) {
        vistos.set(String(r.reservationID ?? vistos.size), r);
      }
    } catch (e) {
      if (vistos.size === 0 && status === "in_house") throw e;
    }
  }
  for (const rec of vistos.values()) {
    if (!reservationMatchesRoom(rec as never, quarto)) continue;
    if (sobrenomeConfere(extrairHospedes(rec), sobrenome)) return identificada(rec);
  }
  return null;
}

export async function checkinNoCloudbeds(totem: Totem, reservationID: string): Promise<void> {
  const body = new URLSearchParams({ reservationID, status: "checked_in" });
  const res = await cloudbedsFetch(propriedade(totem), "/putReservation", {
    method: "PUT",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
  if (!res.ok || json.success === false) {
    throw new Error(json.message ?? `Cloudbeds recusou o check-in (${res.status}).`);
  }
}

export async function checkoutNoCloudbeds(totem: Totem, rec: Raw, quarto: string): Promise<void> {
  const proprio = extrairQuartos(rec).find((q) => quartosIguais(q.nome, quarto));
  const ids = proprio?.subReservationID || proprio?.roomID ? proprio : findMatchingRoomIdentifiers(rec as never, quarto);
  const body = new URLSearchParams({ reservationID: String(rec.reservationID) });
  if (ids?.subReservationID) body.set("subReservationID", ids.subReservationID);
  else if (ids?.roomID) body.set("roomID", ids.roomID);
  const res = await cloudbedsFetch(propriedade(totem), "/postRoomCheckOut", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
  if (!res.ok || json.success === false) {
    throw new Error(json.message ?? `Cloudbeds recusou o check-out (${res.status}).`);
  }
}

// ---------------------------------------------------------- limpeza e Tuya

export async function quartosLimpos(totem: Totem): Promise<(nome: string) => boolean> {
  const { data, error } = await db()
    .from("room_housekeeping")
    .select("room_number,status")
    .eq("property", totem.unidade);
  if (error) throw new Error(`Falha ao consultar a limpeza dos quartos: ${error.message}`);
  const limpos = ((data ?? []) as Array<{ room_number: string; status: string | null }>)
    .filter((r) => ["clean", "inspected"].includes(String(r.status ?? "").toLowerCase()))
    .map((r) => r.room_number);
  return (nome) => limpos.some((r) => quartosIguais(r, nome));
}

export type Fechadura = { device_id: string; tipo: string; label: string; room_number: string | null; senha_fixa: string | null };

export async function fechadurasDaUnidade(totem: Totem): Promise<Fechadura[]> {
  const { data, error } = await db()
    .from("tuya_devices")
    .select("device_id,tipo,label,room_number,senha_fixa")
    .eq("unidade", totem.unidade)
    .eq("ativo", true);
  if (error) throw new Error(`Falha ao consultar as fechaduras: ${error.message}`);
  return (data ?? []) as Fechadura[];
}

export const fechaduraDoQuarto = (fechaduras: Fechadura[], quarto: string) =>
  fechaduras.find((f) => f.tipo === "quarto" && f.room_number && quartosIguais(f.room_number, quarto)) ?? null;

async function chamarTuya(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Servidor sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.");
  const res = await fetch(`${url}/functions/v1/tuya-password`, {
    method: "POST",
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Tuya: ${String(json.error ?? res.status)}`);
  return json;
}

/** senha = senha própria da porta; mesma = abre com a senha do quarto; nenhum dos dois = sem senha (equipe abre). */
export type Porta = { label: string; tipo: string; senha: string | null; mesma: boolean };
export type SenhaGerada = { senha: string; portas: Porta[]; validaAte: string };

function portasDe(fechaduras: Fechadura[], senhas: Record<string, string>, senhaQuarto: string): Porta[] {
  return fechaduras.map((f) => {
    const s = senhas[f.device_id] ?? (f.tipo !== "quarto" ? f.senha_fixa : null) ?? null;
    if (f.tipo === "quarto") return { label: f.label, tipo: f.tipo, senha: senhaQuarto, mesma: true };
    return { label: f.label, tipo: f.tipo, senha: s && s !== senhaQuarto ? s : null, mesma: s === senhaQuarto };
  });
}

/** Senha ainda válida gerada antes para esta reserva (evita duplicar e permite reexibir). */
export async function senhaExistente(
  totem: Totem,
  reservationID: string,
  quartos: string[],
  desdeMs?: number,
): Promise<SenhaGerada | null> {
  let q = db()
    .from("tuya_password_logs")
    .select("room_number,password,device_ids,saida,created_at")
    .eq("reservation_id", reservationID)
    .eq("unidade", totem.unidade)
    .is("revoked_at", null)
    .gt("saida", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(10);
  if (desdeMs) q = q.gte("created_at", new Date(desdeMs).toISOString());
  const { data, error } = await q;
  if (error || !data?.length) return null;
  const linhas = data as Array<{ room_number: string; password: string; device_ids: string[]; saida: string }>;
  if (!quartos.every((nome) => linhas.some((l) => quartosIguais(l.room_number, nome)))) return null;
  const fechaduras = await fechadurasDaUnidade(totem);
  const senhas: Record<string, string> = {};
  for (const parte of linhas[0].password.split("|")) {
    const [dev, senha] = parte.trim().split(":");
    if (dev && senha) senhas[dev.trim()] = senha.trim();
  }
  const quartoDev = linhas[0].device_ids.find((id) => fechaduras.some((f) => f.device_id === id && f.tipo === "quarto"));
  const senhaQuarto = (quartoDev && senhas[quartoDev]) || "";
  if (!senhaQuarto) return null;
  const usadas = fechaduras.filter((f) => linhas.some((l) => l.device_ids.includes(f.device_id)));
  return { senha: senhaQuarto, portas: portasDe(usadas, senhas, senhaQuarto), validaAte: linhas[0].saida };
}

/** Gera UMA senha para os quartos da reserva + portas compartilhadas e registra no histórico. */
export async function gerarSenhaTuya(
  totem: Totem,
  args: { reservationID: string; hospede: string; quartos: QuartoReserva[] },
): Promise<SenhaGerada> {
  const fechaduras = await fechadurasDaUnidade(totem);
  const doQuarto = args.quartos.map((q) => ({ q, f: fechaduraDoQuarto(fechaduras, q.nome) }));
  const faltando = doQuarto.filter((x) => !x.f).map((x) => x.q.nome);
  if (faltando.length) throw new Error(`Quarto ${faltando.join(", ")} sem fechadura cadastrada.`);
  const compartilhadas = fechaduras.filter((f) => f.tipo !== "quarto");
  const usadas = [...doQuarto.map((x) => x.f as Fechadura), ...compartilhadas];

  const checkout = args.quartos.map((q) => q.checkOut).filter(Boolean).sort().pop() ?? relogioSP().hoje;
  const saidaMs = new Date(`${checkout}T${totem.hora_checkout}:00-03:00`).getTime();
  const entradaMs = Date.now();

  const resp = await chamarTuya({
    deviceIds: usadas.map((f) => f.device_id),
    guestName: args.hospede,
    startTime: entradaMs,
    endTime: saidaMs,
    roomNumber: args.quartos.map((q) => q.nome).join(","),
    unidade: totem.unidade,
  });
  const senhas = (resp.senhas ?? {}) as Record<string, string>;
  const senhaIds = (resp.senhaIds ?? {}) as Record<string, string | number>;
  const semSenha = doQuarto.filter((x) => !senhas[(x.f as Fechadura).device_id]);
  if (semSenha.length) {
    const results = (resp.tuyaResults ?? []) as Array<{ deviceId: string; status?: { code?: number; msg?: string } }>;
    const detalhe = semSenha
      .map((x) => {
        const r = results.find((y) => y.deviceId === (x.f as Fechadura).device_id);
        return `${x.q.nome}: ${r?.status?.msg ?? "sem resposta"}${r?.status?.code ? ` (code ${r.status.code})` : ""}`;
      })
      .join("; ");
    throw new Error(`A fechadura não aceitou a senha — ${detalhe}`);
  }
  const senhaQuarto = senhas[(doQuarto[0].f as Fechadura).device_id];
  const resumo = Object.entries(senhas)
    .map(([id, p]) => `${id}:${p}`)
    .join(" | ");

  for (const { q, f } of doQuarto) {
    const ids = [(f as Fechadura).device_id, ...compartilhadas.map((c) => c.device_id)];
    const { error } = await db().from("tuya_password_logs").insert({
      room_number: q.nome,
      guest_name: args.hospede,
      password: resumo,
      entrada: new Date(entradaMs).toISOString(),
      saida: new Date(saidaMs).toISOString(),
      device_ids: ids,
      senha_ids: Object.fromEntries(ids.filter((id) => senhaIds[id] !== undefined).map((id) => [id, senhaIds[id]])),
      unidade: totem.unidade,
      generated_by_user_id: null,
      generated_by_name: `Totem ${totem.nome}`,
      reservation_id: args.reservationID,
    });
    if (error) console.error("[totem] falha ao registrar senha", error.message);
  }
  return { senha: senhaQuarto, portas: portasDe(usadas, senhas, senhaQuarto), validaAte: new Date(saidaMs).toISOString() };
}

/** Revoga as senhas temporárias do quarto no check-out. Devolve quantas foram revogadas. */
export async function revogarSenhasDoQuarto(totem: Totem, reservationID: string, quarto: string): Promise<number> {
  const agora = new Date().toISOString();
  const { data, error } = await db()
    .from("tuya_password_logs")
    .select("id,room_number,senha_ids,reservation_id,entrada")
    .eq("unidade", totem.unidade)
    .is("revoked_at", null)
    .gt("saida", agora)
    .limit(50);
  if (error) throw new Error(`Falha ao consultar senhas ativas: ${error.message}`);
  const linhas = ((data ?? []) as Array<{ id: string; room_number: string; senha_ids: Record<string, string | number> | null; reservation_id: string | null; entrada: string }>)
    .filter((l) => quartosIguais(l.room_number, quarto))
    // Senha de outra reserva (ex.: próximo hóspede já cadastrado) não é tocada.
    .filter((l) =>
      l.reservation_id ? l.reservation_id === reservationID : new Date(l.entrada).getTime() <= Date.now(),
    );
  let revogadas = 0;
  for (const l of linhas) {
    const items = Object.entries(l.senha_ids ?? {})
      .filter(([, pid]) => pid && String(pid) !== "senha_fixa")
      .map(([deviceId, passwordId]) => ({ deviceId, passwordId }));
    let ok = true;
    if (items.length) {
      const r = await chamarTuya({ action: "revoke", items, roomNumber: l.room_number, unidade: totem.unidade });
      ok = Array.isArray(r.revokes) && (r.revokes as Array<{ success: boolean }>).every((x) => x.success);
    }
    await db()
      .from("tuya_password_logs")
      .update({
        revoked_at: agora,
        revoked_by_name: `Totem ${totem.nome}`,
        revoke_reason: ok ? "checkout_totem" : "checkout_totem:parcial",
      })
      .eq("id", l.id);
    if (ok) revogadas++;
  }
  return revogadas;
}

// ------------------------------------------------------------- recepção

export async function avisarRecepcao(totem: Totem, quarto: string | null, mensagem: string) {
  const { error } = await db().from("recados_camareiras").insert({
    property: totem.unidade,
    room_number: quarto,
    message: mensagem,
    created_by: null,
    created_by_name: `Totem ${totem.nome}`,
    direction: "to_recepcao",
  });
  if (error) console.error("[totem] falha ao avisar recepção", error.message);
}

export async function registrarCheckoutLog(totem: Totem, rec: Raw, quarto: string, hospede: string) {
  const { error } = await db().from("cloudbeds_checkout_logs").insert({
    property: totem.unidade,
    room_number: quarto,
    guest_name: hospede,
    reservation_id: String(rec.reservationID ?? ""),
    camareira_id: null,
    camareira_name: `Totem ${totem.nome}`,
  });
  if (error) console.error("[totem] falha ao registrar check-out", error.message);
}

export async function salvarAvaliacao(
  totem: Totem,
  a: { reservationID: string; quarto: string; nota: number; comentario: string | null },
): Promise<void> {
  // Só aceita avaliação de quem acabou de sair por este totem (últimos 30 min).
  const desde = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: ev } = await db()
    .from("totem_eventos")
    .select("hospede,quarto")
    .eq("totem_id", totem.id)
    .eq("tipo", "checkout_ok")
    .eq("reservation_id", a.reservationID)
    .gte("criado_em", desde)
    .limit(1)
    .maybeSingle();
  if (!ev) throw new Error("Avaliação disponível só logo após o check-out neste totem.");
  const { error } = await db().from("totem_avaliacoes").insert({
    totem_id: totem.id,
    unidade: totem.unidade,
    reservation_id: a.reservationID,
    quarto: a.quarto,
    hospede: (ev as { hospede: string | null }).hospede,
    nota: a.nota,
    comentario: a.comentario,
  });
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(`Falha ao salvar avaliação: ${error.message}`);
}

/** E-mail do hóspede na reserva (opcional; vai para o comprovante da Stone). */
export function emailDe(rec: Raw): string | null {
  const e = String(rec.guestEmail ?? rec.email ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
