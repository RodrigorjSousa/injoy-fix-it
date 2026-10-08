// Cobranças do totem: cria o pedido na maquininha Stone, acompanha o resultado
// (webhook + consulta de resiliência) e lança o pagamento no Cloudbeds uma única vez.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cloudbedsFetch, type CloudbedsProperty } from "@/lib/cloudbeds/client.server";
import {
  consultarPedido,
  criarPedidoMaquininha,
  fecharPedido,
  stoneConfigurada,
  type MetodoPagamento,
  type SituacaoPedido,
  type Unidade,
} from "./stone.server";
import type { Totem } from "./totem.server";

const db = () => supabaseAdmin as unknown as SupabaseClient;

export type Cobranca = {
  id: string;
  totem_id: string | null;
  unidade: Unidade;
  reservation_id: string;
  hospede: string | null;
  fluxo: "checkin" | "checkout";
  valor: number;
  metodo: MetodoPagamento;
  pedido_id: string | null;
  status: "pendente" | "pago" | "cancelado" | "falhou" | "expirado";
  pago_em: string | null;
  bandeira: string | null;
  autorizacao: string | null;
  cloudbeds_lancado: boolean;
  cloudbeds_erro: string | null;
  ultima_consulta: string | null;
  criado_em: string;
};

const CAMPOS =
  "id,totem_id,unidade,reservation_id,hospede,fluxo,valor,metodo,pedido_id,status,pago_em,bandeira,autorizacao,cloudbeds_lancado,cloudbeds_erro,ultima_consulta,criado_em";

/** Depois deste tempo sem pagamento a cobrança expira e o pedido sai da maquininha. */
export const VALIDADE_COBRANCA_MS = 5 * 60_000;

const normalizar = (r: Record<string, unknown>): Cobranca => ({ ...(r as unknown as Cobranca), valor: Number(r.valor) });

export function pagamentoDisponivel(totem: Totem): { ok: boolean; motivo: string | null } {
  if (!totem.pagamento_habilitado) return { ok: false, motivo: "pagamento desligado neste totem" };
  if (!totem.pos_serial) return { ok: false, motivo: "maquininha não cadastrada neste totem" };
  const cfg = stoneConfigurada(totem.unidade);
  if (!cfg.ok) return { ok: false, motivo: `faltam segredos: ${cfg.falta.join(", ")}` };
  return { ok: true, motivo: null };
}

export async function buscarCobranca(id: string): Promise<Cobranca | null> {
  const { data, error } = await db().from("totem_cobrancas").select(CAMPOS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao ler a cobrança: ${error.message}`);
  return data ? normalizar(data as Record<string, unknown>) : null;
}

/**
 * Quanto o totem já recebeu desta reserva nas últimas horas. Esse valor é
 * descontado do saldo do Cloudbeds para o hóspede não ser cobrado duas vezes
 * (o lançamento no Cloudbeds pode ter falhado ou ainda não ter aparecido).
 * Como cobramos sempre o saldo inteiro, descontar um pagamento que o Cloudbeds
 * já refletiu só leva o saldo a zero, nunca a um valor errado positivo.
 */
export async function pagoRecente(reservationID: string, horas = 6): Promise<number> {
  const { data, error } = await db()
    .from("totem_cobrancas")
    .select("valor")
    .eq("reservation_id", reservationID)
    .eq("status", "pago")
    .gte("pago_em", new Date(Date.now() - horas * 3_600_000).toISOString());
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return 0; // migração 0045 ainda não aplicada
    throw new Error(`Falha ao consultar pagamentos do totem: ${error.message}`);
  }
  return ((data ?? []) as Array<{ valor: number | string }>).reduce((s, r) => s + Number(r.valor), 0);
}

/** Último pagamento aprovado da reserva neste totem (para o comprovante). */
export async function ultimoPagamento(reservationID: string): Promise<Cobranca | null> {
  const { data, error } = await db()
    .from("totem_cobrancas")
    .select(CAMPOS)
    .eq("reservation_id", reservationID)
    .eq("status", "pago")
    .order("pago_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ? normalizar(data as Record<string, unknown>) : null;
}

export async function iniciarCobranca(
  totem: Totem,
  args: { reservationID: string; hospede: string; email: string | null; fluxo: "checkin" | "checkout"; valor: number; metodo: MetodoPagamento; quarto: string },
): Promise<Cobranca> {
  const disp = pagamentoDisponivel(totem);
  if (!disp.ok) throw new Error(`Pagamento indisponível: ${disp.motivo}.`);
  if (!(args.valor > 0)) throw new Error("Não há valor a pagar.");

  // A maquininha atende um pedido por vez: cancela o que tiver ficado pendente neste totem.
  const { data: pendentes } = await db()
    .from("totem_cobrancas")
    .select(CAMPOS)
    .eq("totem_id", totem.id)
    .eq("status", "pendente");
  for (const p of (pendentes ?? []) as Array<Record<string, unknown>>) {
    await cancelarCobranca(totem, normalizar(p), "substituida");
  }

  const { data: criada, error } = await db()
    .from("totem_cobrancas")
    .insert({
      totem_id: totem.id,
      unidade: totem.unidade,
      reservation_id: args.reservationID,
      hospede: args.hospede,
      fluxo: args.fluxo,
      valor: Number(args.valor.toFixed(2)),
      metodo: args.metodo,
      provedor: "stone",
    })
    .select(CAMPOS)
    .single();
  if (error || !criada) throw new Error(`Falha ao registrar a cobrança: ${error?.message ?? "sem retorno"}`);
  const cobranca = normalizar(criada as Record<string, unknown>);

  try {
    const pedido = await criarPedidoMaquininha({
      unidade: totem.unidade,
      posSerial: totem.pos_serial as string,
      valorCentavos: Math.round(args.valor * 100),
      metodo: args.metodo,
      descricao: `Hospedagem IN.JOY ${totem.unidade} · reserva ${args.reservationID} · quarto ${args.quarto}`,
      nomeNaTela: `Quarto ${args.quarto}`,
      cliente: { nome: args.hospede, email: args.email },
      codigo: cobranca.id,
    });
    await db().from("totem_cobrancas").update({ pedido_id: pedido.pedidoId, atualizado_em: new Date().toISOString() }).eq("id", cobranca.id);
    return { ...cobranca, pedido_id: pedido.pedidoId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db().from("totem_cobrancas").update({ status: "falhou", detalhe: { erro: msg }, atualizado_em: new Date().toISOString() }).eq("id", cobranca.id);
    throw new Error(msg);
  }
}

export async function cancelarCobranca(totem: Pick<Totem, "unidade">, c: Cobranca, motivo: string) {
  if (c.status !== "pendente") return;
  if (c.pedido_id) {
    // Antes de cancelar, confere se não foi pago no último segundo.
    try {
      const sit = await consultarPedido(totem.unidade, c.pedido_id);
      if (sit.status === "pago") {
        await aplicarSituacao(c, sit);
        return;
      }
      await fecharPedido(totem.unidade, c.pedido_id, "canceled");
    } catch (e) {
      console.error("[totem] falha ao cancelar pedido na Stone", c.pedido_id, e);
    }
  }
  await db()
    .from("totem_cobrancas")
    .update({ status: motivo === "expirada" ? "expirado" : "cancelado", detalhe: { motivo }, atualizado_em: new Date().toISOString() })
    .eq("id", c.id)
    .eq("status", "pendente");
}

/** Atualiza a cobrança a partir da situação do pedido na Stone. Idempotente. */
export async function aplicarSituacao(c: Cobranca, sit: SituacaoPedido): Promise<Cobranca> {
  const agora = new Date().toISOString();
  if (sit.status === "pago" && c.status !== "pago") {
    const valorPago = sit.valorPagoCentavos > 0 ? sit.valorPagoCentavos / 100 : c.valor;
    await db()
      .from("totem_cobrancas")
      .update({
        status: "pago",
        pago_em: agora,
        cobranca_id: sit.cobrancaId,
        bandeira: sit.bandeira,
        autorizacao: sit.autorizacao,
        valor: Number(valorPago.toFixed(2)),
        ultima_consulta: agora,
        atualizado_em: agora,
      })
      .eq("id", c.id)
      .neq("status", "pago");
    if (c.pedido_id) {
      try {
        await fecharPedido(c.unidade, c.pedido_id, "paid");
      } catch (e) {
        console.error("[totem] falha ao fechar pedido pago", c.pedido_id, e);
      }
    }
  } else if ((sit.status === "cancelado" || sit.status === "falhou") && c.status === "pendente") {
    await db()
      .from("totem_cobrancas")
      .update({ status: sit.status, ultima_consulta: agora, atualizado_em: agora })
      .eq("id", c.id)
      .eq("status", "pendente");
  } else {
    await db().from("totem_cobrancas").update({ ultima_consulta: agora }).eq("id", c.id);
  }
  const atual = (await buscarCobranca(c.id)) ?? c;
  if (atual.status === "pago" && !atual.cloudbeds_lancado) await lancarNoCloudbeds(atual);
  return (await buscarCobranca(c.id)) ?? atual;
}

/**
 * Situação atual para a tela do totem. O webhook é a fonte principal; a consulta
 * direta à Stone só acontece como resiliência (no máximo a cada 15 s).
 */
export async function acompanharCobranca(totem: Totem, id: string): Promise<Cobranca> {
  const c = await buscarCobranca(id);
  if (!c || c.totem_id !== totem.id) throw new Error("Cobrança não encontrada neste totem.");
  if (c.status === "pago" && !c.cloudbeds_lancado) await lancarNoCloudbeds(c);
  if (c.status !== "pendente" || !c.pedido_id) return (await buscarCobranca(id)) ?? c;

  const idade = Date.now() - new Date(c.criado_em).getTime();
  const desdeConsulta = c.ultima_consulta ? Date.now() - new Date(c.ultima_consulta).getTime() : Infinity;
  if (idade > 12_000 && desdeConsulta > 15_000) {
    try {
      const sit = await consultarPedido(c.unidade, c.pedido_id);
      const nova = await aplicarSituacao(c, sit);
      if (nova.status !== "pendente") return nova;
    } catch (e) {
      console.error("[totem] consulta de resiliência falhou", e);
    }
  }
  if (idade > VALIDADE_COBRANCA_MS) {
    await cancelarCobranca(totem, c, "expirada");
  }
  return (await buscarCobranca(id)) ?? c;
}

const TIPO_CLOUDBEDS: Record<MetodoPagamento, string> = { credito: "credit", debito: "debit", pix: "pix" };
const NOME_METODO: Record<MetodoPagamento, string> = { credito: "Cartão de Crédito", debito: "Cartão de Débito", pix: "PIX" };

/** Lança no Cloudbeds (postPayment) uma única vez, mesmo com webhook e consulta ao mesmo tempo. */
export async function lancarNoCloudbeds(c: Cobranca): Promise<void> {
  const agora = new Date();
  const { data: pegou } = await db()
    .from("totem_cobrancas")
    .update({ cloudbeds_lancando_em: agora.toISOString() })
    .eq("id", c.id)
    .eq("status", "pago")
    .eq("cloudbeds_lancado", false)
    .or(`cloudbeds_lancando_em.is.null,cloudbeds_lancando_em.lt.${new Date(agora.getTime() - 120_000).toISOString()}`)
    .select("id");
  if (!pegou?.length) return; // outro processo já está lançando

  const property = c.unidade.toLowerCase() as CloudbedsProperty;
  const body = new URLSearchParams({
    reservationID: c.reservation_id,
    amount: c.valor.toFixed(2),
    type: TIPO_CLOUDBEDS[c.metodo],
    description: `Totem Express · Stone ${NOME_METODO[c.metodo]}${c.bandeira ? ` ${c.bandeira}` : ""}${c.autorizacao ? ` · aut ${c.autorizacao}` : ""}`,
  });
  try {
    const res = await cloudbedsFetch(property, "/postPayment", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const texto = await res.text().catch(() => "");
    let json: Record<string, unknown> = {};
    try {
      json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
    } catch {
      json = {};
    }
    if (!res.ok || json.success === false) {
      throw new Error(String(json.message ?? `Cloudbeds recusou o lançamento (${res.status}).`));
    }
    await db().from("totem_cobrancas").update({ cloudbeds_lancado: true, cloudbeds_erro: null, atualizado_em: new Date().toISOString() }).eq("id", c.id);
    const { error } = await db().from("reservation_payments").insert({
      property: c.unidade,
      reservation_id: c.reservation_id,
      guest_name: c.hospede ?? "Hóspede",
      amount: c.valor,
      payment_method: NOME_METODO[c.metodo],
      received_by: "Totem Express (Stone)",
      received_by_user_id: null,
      cloudbeds_response: json,
    });
    if (error) console.error("[totem] falha ao registrar em reservation_payments", error.message);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db().from("totem_cobrancas").update({ cloudbeds_erro: msg, cloudbeds_lancando_em: null, atualizado_em: new Date().toISOString() }).eq("id", c.id);
    await db().from("recados_camareiras").insert({
      property: c.unidade,
      room_number: null,
      message: `Totem: pagamento APROVADO na Stone (R$ ${c.valor.toFixed(2)}, ${NOME_METODO[c.metodo]}) para a reserva ${c.reservation_id} (${c.hospede ?? "hóspede"}), mas o Cloudbeds recusou o lançamento: ${msg}. Lançar manualmente.`,
      created_by: null,
      created_by_name: "Totem Express",
      direction: "to_recepcao",
    });
  }
}

/** Webhook da Pagar.me/Stone: nunca confia no corpo — relê o pedido na API. */
export async function processarWebhook(payload: Record<string, unknown>): Promise<{ ok: boolean; motivo: string }> {
  const tipo = String(payload.type ?? "");
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const doPedido = (data.order as Record<string, unknown> | undefined)?.id;
  const pedidoId = String(doPedido ?? (tipo.startsWith("order.") ? (data.id ?? "") : ""));
  if (!pedidoId) return { ok: true, motivo: `evento ${tipo} sem pedido` };
  const { data: row } = await db().from("totem_cobrancas").select(CAMPOS).eq("pedido_id", pedidoId).maybeSingle();
  if (!row) return { ok: true, motivo: "pedido não é do totem" };
  const c = normalizar(row as Record<string, unknown>);
  const sit = await consultarPedido(c.unidade, pedidoId);
  await aplicarSituacao(c, sit);
  return { ok: true, motivo: `${tipo} → ${sit.status}` };
}
