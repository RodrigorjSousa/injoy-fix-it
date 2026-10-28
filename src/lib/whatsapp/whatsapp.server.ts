// E3 — WhatsApp de verdade (Meta Cloud API) em MODO RASCUNHO.
//
// Fluxo:
//   webhook da Meta → registrarWebhook (grava mensagens, ecos da equipe e status; responde rápido)
//   agendamento de 1 min → processarPendentes (transcreve áudio, descreve imagem, Joy escreve RASCUNHO)
//   painel → aprovarRascunho / enviarManual (único caminho que envia; só para número de teste, a não ser
//            que o Rodrigo ligue "envio liberado")
//
// Segredos (Lovable Cloud): WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET,
// WHATSAPP_VERIFY_TOKEN. Opcional: WHATSAPP_GRAPH_VERSION (padrão v23.0).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { carregarConfig, responder, type ConfigJoy } from "./agente.server";
import {
  dentroDaJanela,
  joyAtende,
  lerWebhook,
  podeEnviarPara,
  soDigitos,
  type EcoEquipe,
  type MsgRecebida,
} from "./meta";
import { mascararCartao } from "./regras";

// Tabelas novas ainda não estão no types.ts gerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MAX_MIDIA = 16 * 1024 * 1024;

function graph(): string {
  return `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v23.0"}`;
}

function segredo(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não configurado no servidor (Lovable Cloud).`);
  return v;
}

/** Quais segredos estão preenchidos (sem mostrar o valor). */
export function segredosConfigurados(): Record<string, boolean> {
  return Object.fromEntries(
    [
      "WHATSAPP_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_APP_SECRET",
      "WHATSAPP_VERIFY_TOKEN",
    ].map((n) => [n, !!process.env[n]]),
  );
}

// ------------------------------------------------------------ assinatura

/** Confere o cabeçalho X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o App Secret). */
export async function assinaturaMetaValida(
  corpo: string,
  cabecalho: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!cabecalho || !appSecret || !cabecalho.startsWith("sha256=")) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const esperado = createHmac("sha256", appSecret).update(corpo, "utf8").digest();
  let recebido: Buffer;
  try {
    recebido = Buffer.from(cabecalho.slice(7), "hex");
  } catch {
    return false;
  }
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

// ---------------------------------------------------------------- conversa

type ConversaWa = {
  id: string;
  wa_id: string;
  contato_nome: string | null;
  modo: "ia" | "humano" | "pausada";
  ultima_msg_cliente_em: string | null;
  atendida_ate: string | null;
  pausada_ate: string | null;
  processando_ate: string | null;
};

async function conversaDoNumero(waId: string, nome: string | null): Promise<ConversaWa> {
  const { data } = await db
    .from("wa_conversas")
    .select("*")
    .eq("canal", "whatsapp")
    .eq("wa_id", waId)
    .maybeSingle();
  if (data) {
    if (nome && !data.contato_nome)
      await db.from("wa_conversas").update({ contato_nome: nome }).eq("id", data.id);
    return data as ConversaWa;
  }
  const ins = await db
    .from("wa_conversas")
    .insert({
      canal: "whatsapp",
      modo: "ia",
      wa_id: waId,
      telefone: `+${waId}`,
      contato_nome: nome,
    })
    .select("*")
    .single();
  if (ins.error) {
    // corrida: outra entrega do webhook criou ao mesmo tempo
    const again = await db
      .from("wa_conversas")
      .select("*")
      .eq("canal", "whatsapp")
      .eq("wa_id", waId)
      .maybeSingle();
    if (again.data) return again.data as ConversaWa;
    throw new Error(`Não foi possível criar a conversa: ${ins.error.message}`);
  }
  return ins.data as ConversaWa;
}

/** Grava a mensagem; false se o wamid já existia (a Meta reenviou o webhook). */
async function gravarUnica(linha: Record<string, unknown>): Promise<boolean> {
  const { error } = await db.from("wa_mensagens").insert(linha);
  if (!error) return true;
  if (error.code === "23505" || /duplicate|unique/i.test(error.message)) return false;
  throw new Error(error.message);
}

async function substituirRascunhos(conversaId: string) {
  await db
    .from("wa_mensagens")
    .update({ envio: "substituida" })
    .eq("conversa_id", conversaId)
    .eq("envio", "rascunho");
}

// ----------------------------------------------------------------- webhook

const NAO_VOLTA: Record<string, string> = {
  enviada: "(entregue,lida,falhou)",
  entregue: "(lida,falhou)",
  lida: "(falhou)",
  falhou: "(lida)",
};

export type ResumoWebhook = { mensagens: number; ecos: number; status: number; ignorados: number };

export async function registrarWebhook(payload: unknown): Promise<ResumoWebhook> {
  const w = lerWebhook(payload);
  const nosso = process.env.WHATSAPP_PHONE_NUMBER_ID || null;
  const resumo: ResumoWebhook = { mensagens: 0, ecos: 0, status: 0, ignorados: 0 };
  const deOutroNumero = (id: string | null) => !!nosso && !!id && id !== nosso;

  for (const m of w.mensagens) {
    if (deOutroNumero(m.phoneNumberId)) {
      resumo.ignorados++;
      continue;
    }
    if (await registrarMensagem(m)) resumo.mensagens++;
  }
  for (const e of w.ecos) {
    if (deOutroNumero(e.phoneNumberId)) {
      resumo.ignorados++;
      continue;
    }
    if (await registrarEco(e)) resumo.ecos++;
  }
  for (const s of w.status) {
    const { data } = await db
      .from("wa_mensagens")
      .update({ envio: s.envio, ...(s.erro ? { erro_envio: s.erro } : {}) })
      .eq("wamid", s.wamid)
      // os avisos podem chegar fora de ordem: nunca volta de "lida" para "entregue", por exemplo
      .not("envio", "in", NAO_VOLTA[s.envio])
      .select("id");
    if (data?.length) resumo.status++;
  }
  return resumo;
}

async function registrarMensagem(m: MsgRecebida): Promise<boolean> {
  const conv = await conversaDoNumero(m.waId, m.nome);
  const nova = await gravarUnica({
    conversa_id: conv.id,
    autor: "cliente",
    texto: mascararCartao(m.texto),
    wamid: m.wamid,
    tipo: m.tipo,
    created_at: m.quando,
    meta: m.midiaId ? { midia: { id: m.midiaId, mime: m.mime, pendente: true } } : {},
  });
  if (!nova) return false;
  if (!conv.ultima_msg_cliente_em || m.quando > conv.ultima_msg_cliente_em)
    await db.from("wa_conversas").update({ ultima_msg_cliente_em: m.quando }).eq("id", conv.id);
  return true;
}

/** A recepção respondeu pelo celular (coexistência): entra no histórico e a Joy fica quieta um tempo. */
async function registrarEco(e: EcoEquipe): Promise<boolean> {
  const conv = await conversaDoNumero(e.waId, null);
  const nova = await gravarUnica({
    conversa_id: conv.id,
    autor: "equipe",
    texto: e.texto,
    wamid: e.wamid,
    tipo: e.tipo,
    envio: "enviada",
    enviado_em: e.quando,
    created_at: e.quando,
    meta: { origem: "celular" },
  });
  if (!nova) return false;
  const config = await carregarConfig();
  await substituirRascunhos(conv.id);
  await db
    .from("wa_conversas")
    .update({
      pausada_ate: new Date(Date.now() + config.pausa_eco_minutos * 60_000).toISOString(),
      atendida_ate: conv.ultima_msg_cliente_em,
    })
    .eq("id", conv.id);
  return true;
}

// ------------------------------------------------------------------ mídia

async function baixarMidia(midiaId: string): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const token = segredo("WHATSAPP_TOKEN");
  const info = await fetch(`${graph()}/${encodeURIComponent(midiaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = (await info.json().catch(() => ({}))) as {
    url?: string;
    mime_type?: string;
    file_size?: number;
  };
  if (!info.ok || !j.url) throw new Error(`Meta não entregou a mídia (${info.status}).`);
  if (j.file_size && j.file_size > MAX_MIDIA) throw new Error("Mídia grande demais.");
  const arq = await fetch(j.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!arq.ok) throw new Error(`Falha ao baixar a mídia (${arq.status}).`);
  const bytes = await arq.arrayBuffer();
  if (bytes.byteLength > MAX_MIDIA) throw new Error("Mídia grande demais.");
  return { bytes, mime: j.mime_type || "application/octet-stream" };
}

async function transcrever(bytes: ArrayBuffer, mime: string): Promise<string> {
  const ext = /ogg|opus/.test(mime)
    ? "ogg"
    : /mp4|m4a|aac/.test(mime)
      ? "m4a"
      : /mpeg|mp3/.test(mime)
        ? "mp3"
        : "ogg";
  const form = new FormData();
  form.append("model", "openai/gpt-4o-mini-transcribe");
  form.append("file", new Blob([bytes], { type: mime.split(";")[0] }), `audio.${ext}`);
  const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${segredo("LOVABLE_API_KEY")}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcrição falhou (${res.status}).`);
  const j = (await res.json()) as { text?: string };
  return (j.text ?? "").trim();
}

async function descreverImagem(bytes: ArrayBuffer, mime: string, modelo: string): Promise<string> {
  const b64 = Buffer.from(bytes).toString("base64");
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${segredo("LOVABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelo,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Descreva em uma ou duas frases, em português, o que esta imagem enviada por um hóspede de hotel mostra. Se for comprovante de pagamento, diga só que parece um comprovante (sem copiar valores, chaves, nomes ou números). Se for documento de identidade, diga só que é um documento, sem copiar dados. Não invente.",
            },
            { type: "image_url", image_url: { url: `data:${mime.split(";")[0]};base64,${b64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Descrição da imagem falhou (${res.status}).`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (j.choices?.[0]?.message?.content ?? "").trim();
}

/** Transcreve áudios e descreve imagens que ainda estão pendentes na conversa. */
async function processarMidias(conversaId: string, modelo: string) {
  const { data } = await db
    .from("wa_mensagens")
    .select("id,tipo,texto,meta")
    .eq("conversa_id", conversaId)
    .eq("autor", "cliente")
    .in("tipo", ["audio", "imagem"])
    .order("created_at", { ascending: false })
    .limit(10);
  for (const m of (data ?? []) as Array<{
    id: string;
    tipo: string;
    texto: string;
    meta: Record<string, unknown>;
  }>) {
    const midia = (m.meta?.midia ?? {}) as { id?: string; mime?: string; pendente?: boolean };
    if (!midia.pendente || !midia.id) continue;
    let texto = m.texto;
    let erro: string | null = null;
    try {
      const { bytes, mime } = await baixarMidia(midia.id);
      if (m.tipo === "audio") {
        const t = await transcrever(bytes, midia.mime || mime);
        texto = t ? `[áudio] ${mascararCartao(t)}` : "[áudio sem fala reconhecível]";
      } else {
        const d = await descreverImagem(bytes, midia.mime || mime, modelo);
        const legenda = m.texto.replace(/^\[imagem\]\s*/, "");
        texto = `[imagem] ${d || "sem descrição"}${legenda ? ` (legenda: ${legenda})` : ""}`;
      }
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
    await db
      .from("wa_mensagens")
      .update({
        texto,
        meta: { ...m.meta, midia: { ...midia, pendente: false, ...(erro ? { erro } : {}) } },
      })
      .eq("id", m.id);
  }
}

// ------------------------------------------------------------- rascunho

export type ResultadoProcessar = { conversaId: string; acao: string; erro?: string };

/**
 * Faz o rascunho da Joy para uma conversa. `forcar` (botão do painel) ignora o modo e a pausa, mas não
 * o modo humano (aí é preciso devolver a conversa para a Joy).
 */
export async function processarConversa(
  conversaId: string,
  opts: { forcar?: boolean; config?: ConfigJoy } = {},
): Promise<ResultadoProcessar> {
  const config = opts.config ?? (await carregarConfig());
  const { data: c } = await db.from("wa_conversas").select("*").eq("id", conversaId).maybeSingle();
  const conv = c as (ConversaWa & { canal: string }) | null;
  if (!conv || conv.canal !== "whatsapp") return { conversaId, acao: "não é conversa do WhatsApp" };
  const marca = conv.ultima_msg_cliente_em;
  const fechar = async () =>
    db.from("wa_conversas").update({ atendida_ate: marca }).eq("id", conversaId);

  if (!opts.forcar && !joyAtende(config, conv.wa_id)) {
    await fechar();
    return { conversaId, acao: "fora do modo (número não é de teste ou WhatsApp desligado)" };
  }
  if (conv.modo !== "ia") {
    await fechar();
    return { conversaId, acao: "conversa com a equipe" };
  }
  if (!opts.forcar && conv.pausada_ate && Date.parse(conv.pausada_ate) > Date.now())
    return { conversaId, acao: "pausada (a equipe respondeu há pouco)" };

  // trava: só um processamento por conversa (vale 2 minutos)
  const agora = new Date().toISOString();
  const { data: pegou } = await db
    .from("wa_conversas")
    .update({ processando_ate: new Date(Date.now() + 120_000).toISOString() })
    .eq("id", conversaId)
    .or(`processando_ate.is.null,processando_ate.lt.${agora}`)
    .select("id");
  if (!pegou?.length) return { conversaId, acao: "já está sendo processada" };

  try {
    await processarMidias(conversaId, config.modelo);
    await substituirRascunhos(conversaId);
    await responder(conversaId);
    await fechar();
    // Opção de teste: a Joy responde sozinha, mas SÓ para os números da lista de teste.
    if (
      config.envio_automatico_teste &&
      podeEnviarPara({ envio_liberado: false, numeros_teste: config.numeros_teste }, conv.wa_id)
    ) {
      const { data: rasc } = await db
        .from("wa_mensagens")
        .select("id")
        .eq("conversa_id", conversaId)
        .eq("envio", "rascunho")
        .order("created_at", { ascending: false })
        .limit(1);
      const id = (rasc ?? [])[0]?.id as string | undefined;
      if (id) {
        try {
          await aprovarRascunho({ mensagemId: id, userId: null });
          return { conversaId, acao: "enviada automaticamente (número de teste)" };
        } catch (e) {
          return {
            conversaId,
            acao: "rascunho criado; envio automático falhou",
            erro: e instanceof Error ? e.message : String(e),
          };
        }
      }
    }
    return { conversaId, acao: "rascunho criado" };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await db.from("wa_mensagens").insert({
      conversa_id: conversaId,
      autor: "sistema",
      texto: `A Joy não conseguiu fazer o rascunho: ${erro.slice(0, 300)}`,
    });
    await fechar();
    return { conversaId, acao: "erro", erro };
  } finally {
    await db.from("wa_conversas").update({ processando_ate: null }).eq("id", conversaId);
  }
}

/** Chamado pelo agendamento de 1 minuto. */
export async function processarPendentes(): Promise<{ resultados: ResultadoProcessar[] }> {
  const config = await carregarConfig();
  if (config.whatsapp_modo === "desligado") return { resultados: [] };
  const limite = new Date(Date.now() - config.espera_segundos * 1000).toISOString();
  const { data, error } = await db
    .from("wa_conversas")
    .select("id,ultima_msg_cliente_em,atendida_ate,pausada_ate,modo")
    .eq("canal", "whatsapp")
    .eq("modo", "ia")
    .not("ultima_msg_cliente_em", "is", null)
    .lte("ultima_msg_cliente_em", limite)
    .order("ultima_msg_cliente_em", { ascending: true })
    .limit(30);
  if (error) throw new Error(error.message);
  const pendentes = (data ?? []).filter(
    (c: ConversaWa) =>
      (!c.atendida_ate || (c.ultima_msg_cliente_em ?? "") > c.atendida_ate) &&
      (!c.pausada_ate || Date.parse(c.pausada_ate) <= Date.now()),
  );
  const resultados: ResultadoProcessar[] = [];
  for (const c of pendentes.slice(0, 5)) resultados.push(await processarConversa(c.id, { config }));
  return { resultados };
}

// ------------------------------------------------------------------ envio

async function enviarTexto(para: string, texto: string): Promise<string> {
  const res = await fetch(`${graph()}/${segredo("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${segredo("WHATSAPP_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: para,
      type: "text",
      text: { body: texto, preview_url: true },
    }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; code?: number };
  };
  if (!res.ok || !j.messages?.[0]?.id)
    throw new Error(
      `A Meta recusou o envio (${res.status}${j.error?.code ? `/${j.error.code}` : ""}): ${j.error?.message ?? "sem detalhe"}`,
    );
  return j.messages[0].id;
}

async function conferirEnvio(conv: ConversaWa, config: ConfigJoy) {
  if (!podeEnviarPara(config, conv.wa_id))
    throw new Error(
      "Envio bloqueado: este número não está na lista de teste e o envio para hóspedes ainda não foi liberado pelo Rodrigo.",
    );
  if (!dentroDaJanela(conv.ultima_msg_cliente_em))
    throw new Error(
      "Passaram 24 horas desde a última mensagem do hóspede: a Meta só permite responder com modelo aprovado (não usamos). Responda pelo celular.",
    );
}

async function conversaWa(conversaId: string): Promise<ConversaWa> {
  const { data } = await db.from("wa_conversas").select("*").eq("id", conversaId).maybeSingle();
  if (!data || data.canal !== "whatsapp") throw new Error("Conversa do WhatsApp não encontrada.");
  return data as ConversaWa;
}

/** Envia o rascunho da Joy (com a edição de quem aprovou, se houver). */
export async function aprovarRascunho(p: {
  mensagemId: string;
  texto?: string;
  /** null = enviado automaticamente (opção de teste). */
  userId: string | null;
}): Promise<{ wamid: string }> {
  const { data: m } = await db
    .from("wa_mensagens")
    .select("*")
    .eq("id", p.mensagemId)
    .maybeSingle();
  if (!m || m.autor !== "joy") throw new Error("Rascunho não encontrado.");
  if (m.envio !== "rascunho") throw new Error("Este rascunho não está mais pendente.");
  const conv = await conversaWa(m.conversa_id);
  const config = await carregarConfig();
  await conferirEnvio(conv, config);
  const texto = (p.texto ?? m.texto).trim();
  if (!texto) throw new Error("Texto vazio.");
  // marca antes de enviar: dois cliques não mandam duas vezes
  const { data: pegou } = await db
    .from("wa_mensagens")
    .update({ envio: "enviando" })
    .eq("id", m.id)
    .eq("envio", "rascunho")
    .select("id");
  if (!pegou?.length) throw new Error("Este rascunho já está sendo enviado.");
  try {
    const wamid = await enviarTexto(conv.wa_id, texto);
    await db
      .from("wa_mensagens")
      .update({
        envio: "enviada",
        wamid,
        texto,
        aprovado_por: p.userId,
        enviado_em: new Date().toISOString(),
        erro_envio: null,
        meta: {
          ...(m.meta ?? {}),
          ...(texto !== m.texto ? { texto_original: m.texto } : {}),
          ...(p.userId === null ? { envio_automatico: true } : {}),
        },
      })
      .eq("id", m.id);
    return { wamid };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await db.from("wa_mensagens").update({ envio: "rascunho", erro_envio: erro }).eq("id", m.id);
    throw new Error(erro);
  }
}

export async function descartarRascunho(mensagemId: string): Promise<void> {
  const { data } = await db
    .from("wa_mensagens")
    .update({ envio: "descartada" })
    .eq("id", mensagemId)
    .eq("autor", "joy")
    .eq("envio", "rascunho")
    .select("id");
  if (!data?.length) throw new Error("Rascunho não encontrado ou já resolvido.");
}

/** Resposta escrita pela equipe no painel. Pausa a Joy na conversa, como o eco do celular. */
export async function enviarManual(p: {
  conversaId: string;
  texto: string;
  userId: string;
}): Promise<{ wamid: string }> {
  const conv = await conversaWa(p.conversaId);
  const config = await carregarConfig();
  await conferirEnvio(conv, config);
  const wamid = await enviarTexto(conv.wa_id, p.texto);
  await db.from("wa_mensagens").insert({
    conversa_id: conv.id,
    autor: "equipe",
    texto: p.texto,
    wamid,
    envio: "enviada",
    aprovado_por: p.userId,
    enviado_em: new Date().toISOString(),
    meta: { origem: "painel" },
  });
  await substituirRascunhos(conv.id);
  await db
    .from("wa_conversas")
    .update({
      pausada_ate: new Date(Date.now() + config.pausa_eco_minutos * 60_000).toISOString(),
      atendida_ate: conv.ultima_msg_cliente_em,
    })
    .eq("id", conv.id);
  return { wamid };
}

export { soDigitos };
