import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Server functions da Joy (WhatsApp com IA) — Área do Gestor › WhatsApp (Joy).
// Entrega E1: só o SIMULADOR. Nada aqui envia mensagem real a hóspede nem push para a equipe.
// Toda escrita é feita com a chave de serviço, depois de conferir no banco que o usuário é gestor/admin.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exigirGestor(supabase: any) {
  const { data, error } = await supabase.rpc("minha_permissao_whatsapp");
  if (error) throw new Error(`Não foi possível verificar seu acesso: ${error.message}`);
  if (!(data as { gerir?: boolean } | null)?.gerir)
    throw new Error("Somente gestor ou administrador usa a Joy.");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

const uuid = z.string().uuid();
const unidade = z.enum(["Botafogo", "Ipanema"]);

// ------------------------------------------------------------------ config

export const joyCarregarConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestor(context.supabase);
    const { carregarConfig } = await import("@/lib/whatsapp/agente.server");
    return carregarConfig();
  });

const configInput = z.object({
  modelo: z.string().trim().min(1).max(120),
  espera_segundos: z.number().int().min(0).max(60),
  prompt: z.string().trim().min(50).max(20000),
  conhecimento: z.record(z.unknown()),
  wifi: z.record(z.object({ rede: z.string().max(80), senha: z.string().max(80) })),
});

export const joySalvarConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => configInput.parse(input))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase);
    const { carregarConfig } = await import("@/lib/whatsapp/agente.server");
    await carregarConfig(); // garante que a linha existe
    const db = await admin();
    const { error } = await db
      .from("wa_config")
      .update({
        modelo: data.modelo,
        espera_segundos: data.espera_segundos,
        prompt: data.prompt,
        conhecimento: data.conhecimento,
        wifi: data.wifi,
        atualizado_por: context.userId,
      })
      .eq("id", "joy");
    if (error) throw new Error(`Não foi possível salvar: ${error.message}`);
    return carregarConfig();
  });

export const joyPadrao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestor(context.supabase);
    const C = await import("@/lib/whatsapp/conhecimento");
    return {
      prompt: C.PROMPT_PADRAO,
      conhecimento: C.CONHECIMENTO_PADRAO,
      modelo: C.MODELO_PADRAO,
      espera: C.ESPERA_PADRAO,
    };
  });

export const joyListarModelos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestor(context.supabase);
    const { listarModelos } = await import("@/lib/whatsapp/agente.server");
    return listarModelos();
  });

// --------------------------------------------------------------- simulador

const novaConversaInput = z.object({
  contato_nome: z.string().trim().max(80).optional(),
  telefone: z.string().trim().max(30).optional(),
  unidade: unidade.optional(),
});

export const joyNovaConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => novaConversaInput.parse(input))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase);
    const db = await admin();
    const { data: row, error } = await db
      .from("wa_conversas")
      .insert({
        canal: "simulador",
        contato_nome: data.contato_nome || "Hóspede de teste",
        telefone: data.telefone ? data.telefone.replace(/[^\d+]/g, "") : null,
        unidade: data.unidade ?? null,
        criado_por: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Não foi possível criar a conversa: ${error.message}`);
    return { id: row.id as string };
  });

const enviarInput = z.object({
  conversaId: uuid,
  textos: z.array(z.string().trim().min(1).max(2000)).min(1).max(20),
});

/** O "hóspede" do simulador manda uma ou mais mensagens (picotadas) e a Joy responde uma vez. */
export const joyEnviarSimulador = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => enviarInput.parse(input))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase);
    const db = await admin();
    const { data: conv, error: errConv } = await db
      .from("wa_conversas")
      .select("id,canal")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (errConv || !conv) throw new Error("Conversa não encontrada.");
    if (conv.canal !== "simulador") throw new Error("Esta tela só envia mensagens no simulador.");
    const { mascararCartao } = await import("@/lib/whatsapp/regras");
    const linhas = data.textos.map((t) => ({
      conversa_id: data.conversaId,
      autor: "cliente",
      texto: mascararCartao(t),
    }));
    const { error } = await db.from("wa_mensagens").insert(linhas);
    if (error) throw new Error(`Não foi possível gravar a mensagem: ${error.message}`);
    await db
      .from("wa_conversas")
      .update({ ultima_msg_cliente_em: new Date().toISOString() })
      .eq("id", data.conversaId);
    const { responder } = await import("@/lib/whatsapp/agente.server");
    const r = await responder(data.conversaId);
    // A tela relê as mensagens do banco (com as ferramentas no meta); aqui só o resumo serializável.
    return {
      respondeu: r.respondeu,
      transferida: !!r.transferida,
      ferramentas: r.ferramentas.map((f) => f.nome),
      bloqueios: r.bloqueios as string[],
      tokensEntrada: r.tokensEntrada,
      tokensSaida: r.tokensSaida,
      duracaoMs: r.duracaoMs,
    };
  });

/** Mensagem da equipe no simulador (como se a recepção respondesse pelo celular). */
export const joyMensagemEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ conversaId: uuid, texto: z.string().trim().min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase);
    const db = await admin();
    const { error } = await db
      .from("wa_mensagens")
      .insert({ conversa_id: data.conversaId, autor: "equipe", texto: data.texto });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const modoInput = z.object({ conversaId: uuid, modo: z.enum(["ia", "humano", "pausada"]) });

export const joyMudarModo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => modoInput.parse(input))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase);
    const db = await admin();
    const { error } = await db
      .from("wa_conversas")
      .update({ modo: data.modo })
      .eq("id", data.conversaId);
    if (error) throw new Error(error.message);
    if (data.modo === "ia") {
      await db
        .from("wa_passagens")
        .update({ resolvido_em: new Date().toISOString(), resolvido_por: context.userId })
        .eq("conversa_id", data.conversaId)
        .is("resolvido_em", null);
      await db.from("wa_mensagens").insert({
        conversa_id: data.conversaId,
        autor: "sistema",
        texto: "Conversa devolvida para a Joy.",
      });
    } else {
      await db.from("wa_mensagens").insert({
        conversa_id: data.conversaId,
        autor: "sistema",
        texto:
          data.modo === "humano" ? "Equipe assumiu a conversa." : "Joy pausada nesta conversa.",
      });
    }
    return { ok: true };
  });

export const joyApagarConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversaId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase);
    const db = await admin();
    const { data: apagadas, error } = await db
      .from("wa_conversas")
      .delete()
      .eq("id", data.conversaId)
      .eq("canal", "simulador")
      .select("id");
    if (error) throw new Error(error.message);
    if (!apagadas?.length)
      throw new Error("Nada foi apagado (só conversas do simulador podem ser apagadas).");
    return { ok: true };
  });

// ----------------------------------------------------------------- lições

const textoLicao = (max: number) => z.string().trim().max(max);

const licaoInput = z.object({
  id: uuid.optional(),
  situacao: textoLicao(2000).min(3),
  resposta_errada: textoLicao(2000).optional(),
  resposta_certa: textoLicao(2000).min(3),
  motivo: textoLicao(1000).optional(),
  tema: textoLicao(80).optional(),
  ativa: z.boolean().optional(),
  origem: z.enum(["correcao", "manual"]).optional(),
  conversaId: uuid.optional(),
  mensagemId: uuid.optional(),
});

/** Cria ou edita uma lição. Número de cartão digitado por engano é mascarado. */
export const joySalvarLicao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => licaoInput.parse(input))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase);
    const db = await admin();
    const { mascararCartao } = await import("@/lib/whatsapp/regras");
    const limpa = (t?: string) => (t && t.trim() ? mascararCartao(t.trim()) : null);
    const campos = {
      situacao: mascararCartao(data.situacao),
      resposta_errada: limpa(data.resposta_errada),
      resposta_certa: mascararCartao(data.resposta_certa),
      motivo: limpa(data.motivo),
      tema: limpa(data.tema),
      ...(data.ativa !== undefined ? { ativa: data.ativa } : {}),
    };
    if (data.id) {
      const { data: rows, error } = await db
        .from("wa_licoes")
        .update(campos)
        .eq("id", data.id)
        .select("id");
      if (error) throw new Error(`Não foi possível salvar a lição: ${error.message}`);
      if (!rows?.length) throw new Error("Lição não encontrada.");
      return { id: data.id };
    }
    const { data: row, error } = await db
      .from("wa_licoes")
      .insert({
        ...campos,
        origem: data.origem ?? "manual",
        conversa_id: data.conversaId ?? null,
        mensagem_id: data.mensagemId ?? null,
        criado_por: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Não foi possível salvar a lição: ${error.message}`);
    return { id: row.id as string };
  });

export const joyApagarLicao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase);
    const db = await admin();
    const { data: rows, error } = await db
      .from("wa_licoes")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Nada foi apagado.");
    return { ok: true };
  });

/**
 * Simulador: apaga a resposta da Joy (e o que veio depois dela) e pede uma resposta nova —
 * para ver na hora se a lição recém-criada pegou.
 */
export const joyRefazerResposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversaId: uuid, mensagemId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase);
    const db = await admin();
    const { data: conv } = await db
      .from("wa_conversas")
      .select("id,canal")
      .eq("id", data.conversaId)
      .maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada.");
    if (conv.canal !== "simulador") throw new Error("Refazer resposta só existe no simulador.");
    const { data: msg } = await db
      .from("wa_mensagens")
      .select("id,autor,created_at")
      .eq("id", data.mensagemId)
      .eq("conversa_id", data.conversaId)
      .maybeSingle();
    if (!msg || msg.autor !== "joy") throw new Error("Mensagem da Joy não encontrada.");
    const { error: errDel } = await db
      .from("wa_mensagens")
      .delete()
      .eq("conversa_id", data.conversaId)
      .gte("created_at", msg.created_at);
    if (errDel) throw new Error(`Não foi possível apagar a resposta antiga: ${errDel.message}`);
    // Se a resposta antiga tinha passado a conversa para a equipe, volta para a Joy.
    await db.from("wa_conversas").update({ modo: "ia" }).eq("id", data.conversaId);
    await db
      .from("wa_passagens")
      .update({ resolvido_em: new Date().toISOString(), resolvido_por: context.userId })
      .eq("conversa_id", data.conversaId)
      .is("resolvido_em", null);
    const { responder } = await import("@/lib/whatsapp/agente.server");
    const r = await responder(data.conversaId);
    return {
      respondeu: r.respondeu,
      bloqueios: r.bloqueios as string[],
      transferida: !!r.transferida,
    };
  });
