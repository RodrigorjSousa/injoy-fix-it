// O "cérebro" da Joy: monta o contexto, chama o modelo pelo gateway de IA do Lovable (formato OpenAI,
// com ferramentas), executa as ferramentas, passa a resposta pelo filtro de segurança e grava tudo.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CONHECIMENTO_PADRAO,
  ESPERA_PADRAO,
  MODELO_PADRAO,
  PROMPT_PADRAO,
  UNIDADES_JOY,
  type Conhecimento,
  type UnidadeJoy,
  type WifiConfig,
} from "./conhecimento";
import { recarregarReserva, resumoReserva } from "./cloudbeds-joy.server";
import {
  DEFINICOES_FERRAMENTAS,
  executarFerramenta,
  type ContextoFerramenta,
  type ConversaRow,
} from "./ferramentas.server";
import { escolherLicoes, textoLicoes, type Licao } from "./licoes";
import { agoraNoHotel, montarPromptSistema } from "./prompt";
import {
  MOTIVO_BLOQUEIO,
  RESPOSTA_SEGURA,
  mascararCartao,
  verificarResposta,
  type Bloqueio,
} from "./regras";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MAX_PASSOS = 6;
const HISTORICO = 40;

// Tabelas novas ainda não estão no types.ts gerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// ------------------------------------------------------------- config

export type ConfigJoy = {
  modelo: string;
  espera_segundos: number;
  prompt: string;
  conhecimento: Conhecimento;
  wifi: WifiConfig;
  updated_at: string | null;
  /** E3 (0084). Antes da migração: desligado. */
  whatsapp_modo: "desligado" | "rascunho_teste" | "rascunho";
  numeros_teste: string[];
  envio_liberado: boolean;
  pausa_eco_minutos: number;
  /** 0087: a Joy envia sozinha, só para os números de teste. */
  envio_automatico_teste: boolean;
};

function normalizarConhecimento(v: unknown): Conhecimento {
  const c = (v && typeof v === "object" ? v : {}) as Partial<Conhecimento>;
  const unidades = { ...CONHECIMENTO_PADRAO.unidades };
  for (const u of UNIDADES_JOY) {
    const dado = (c.unidades as Record<string, unknown> | undefined)?.[u];
    if (dado && typeof dado === "object")
      unidades[u] = { ...CONHECIMENTO_PADRAO.unidades[u], ...(dado as object) };
  }
  return {
    marca: typeof c.marca === "string" && c.marca.trim() ? c.marca : CONHECIMENTO_PADRAO.marca,
    nomeAssistente:
      typeof c.nomeAssistente === "string" && c.nomeAssistente.trim()
        ? c.nomeAssistente
        : CONHECIMENTO_PADRAO.nomeAssistente,
    unidades,
    avisosInternos: Array.isArray(c.avisosInternos)
      ? c.avisosInternos.map(String)
      : CONHECIMENTO_PADRAO.avisosInternos,
    topicos: Array.isArray(c.topicos) ? c.topicos : CONHECIMENTO_PADRAO.topicos,
    problemas: Array.isArray(c.problemas) ? c.problemas : CONHECIMENTO_PADRAO.problemas,
    datasEspeciais: Array.isArray(c.datasEspeciais)
      ? c.datasEspeciais
          .filter((d) => d && typeof d === "object")
          .map((d) => ({
            nome: String(d.nome ?? "Data especial"),
            inicio: String(d.inicio ?? ""),
            fim: String(d.fim ?? ""),
          }))
      : CONHECIMENTO_PADRAO.datasEspeciais,
    equipe: { ...CONHECIMENTO_PADRAO.equipe, ...(c.equipe ?? {}) },
  };
}

function normalizarWifi(v: unknown): WifiConfig {
  const out: WifiConfig = {};
  const w = (v && typeof v === "object" ? v : {}) as Record<
    string,
    { rede?: unknown; senha?: unknown }
  >;
  for (const u of UNIDADES_JOY) {
    const item = w[u];
    if (item && (item.rede || item.senha))
      out[u] = { rede: String(item.rede ?? ""), senha: String(item.senha ?? "") };
  }
  return out;
}

/** Lê a configuração; cria a linha com o padrão na primeira vez. */
export async function carregarConfig(): Promise<ConfigJoy> {
  const { data, error } = await db.from("wa_config").select("*").eq("id", "joy").maybeSingle();
  if (error) throw new Error(`Não foi possível ler a configuração da Joy: ${error.message}`);
  let row = data;
  if (!row) {
    const ins = await db
      .from("wa_config")
      .insert({
        id: "joy",
        modelo: MODELO_PADRAO,
        espera_segundos: ESPERA_PADRAO,
        prompt: PROMPT_PADRAO,
        conhecimento: CONHECIMENTO_PADRAO,
        wifi: {},
      })
      .select("*")
      .single();
    if (ins.error)
      throw new Error(`Não foi possível criar a configuração da Joy: ${ins.error.message}`);
    row = ins.data;
  }
  return {
    modelo: String(row.modelo || MODELO_PADRAO),
    espera_segundos: Number.isFinite(Number(row.espera_segundos))
      ? Number(row.espera_segundos)
      : ESPERA_PADRAO,
    prompt: String(row.prompt || PROMPT_PADRAO),
    conhecimento: normalizarConhecimento(row.conhecimento),
    wifi: normalizarWifi(row.wifi),
    updated_at: row.updated_at ?? null,
    whatsapp_modo:
      row.whatsapp_modo === "rascunho" || row.whatsapp_modo === "rascunho_teste"
        ? row.whatsapp_modo
        : "desligado",
    numeros_teste: Array.isArray(row.numeros_teste) ? row.numeros_teste.map(String) : [],
    envio_liberado: row.envio_liberado === true,
    envio_automatico_teste: row.envio_automatico_teste === true,
    pausa_eco_minutos: Number.isFinite(Number(row.pausa_eco_minutos))
      ? Number(row.pausa_eco_minutos)
      : 120,
  };
}

// ------------------------------------------------------------- gateway

type MsgModelo =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

type RespostaModelo = {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: ToolCall[] };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string } | string;
};

function chaveGateway(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY não configurada no servidor (Lovable Cloud).");
  return k;
}

async function chamarModelo(
  modelo: string,
  messages: MsgModelo[],
  comFerramentas: boolean,
): Promise<RespostaModelo> {
  const corpo: Record<string, unknown> = { model: modelo, messages };
  if (comFerramentas) {
    corpo.tools = DEFINICOES_FERRAMENTAS;
    corpo.tool_choice = "auto";
  }
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${chaveGateway()}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const txt = await res.text();
  let json: RespostaModelo | null = null;
  try {
    json = JSON.parse(txt) as RespostaModelo;
  } catch {
    /* resposta não-JSON */
  }
  if (!res.ok) {
    const detalhe =
      (json && (typeof json.error === "string" ? json.error : json.error?.message)) ||
      txt.slice(0, 300) ||
      "sem detalhe";
    if (res.status === 429)
      throw new Error(`Muitas chamadas à IA agora (429). Tente de novo em instantes. ${detalhe}`);
    if (res.status === 402) throw new Error(`Créditos de IA do Lovable acabaram (402). ${detalhe}`);
    throw new Error(`O gateway de IA recusou (${res.status}) com o modelo "${modelo}": ${detalhe}`);
  }
  if (!json) throw new Error("O gateway de IA devolveu uma resposta que não é JSON.");
  return json;
}

/** Chamada simples, sem ferramentas (hóspede simulado e avaliador da E2). */
export async function completarTexto(
  modelo: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<{ texto: string; tokensEntrada: number; tokensSaida: number }> {
  const r = await chamarModelo(modelo, messages as MsgModelo[], false);
  return {
    texto: (r.choices?.[0]?.message?.content ?? "").trim(),
    tokensEntrada: r.usage?.prompt_tokens ?? 0,
    tokensSaida: r.usage?.completion_tokens ?? 0,
  };
}

export async function listarModelos(): Promise<string[]> {
  const res = await fetch(`${GATEWAY}/models`, {
    headers: { Authorization: `Bearer ${chaveGateway()}` },
  });
  const txt = await res.text();
  if (!res.ok)
    throw new Error(`Não foi possível listar os modelos (${res.status}): ${txt.slice(0, 300)}`);
  const json = JSON.parse(txt) as { data?: Array<{ id?: string }> };
  return (json.data ?? [])
    .map((m) => String(m.id ?? ""))
    .filter(Boolean)
    .sort();
}

// ------------------------------------------------------------- resposta

type MensagemRow = {
  id: string;
  autor: "cliente" | "joy" | "equipe" | "sistema";
  texto: string;
  meta: Record<string, unknown> | null;
  /** E3: estado do envio no WhatsApp (null no simulador e nas mensagens recebidas). */
  envio?: string | null;
};

/** Rascunho que não foi (ou ainda não foi) mandado ao hóspede não conta como dito. */
export function mensagemFoiDita(m: { autor: string; envio?: string | null }): boolean {
  if (m.autor !== "joy" && m.autor !== "equipe") return true;
  return !m.envio || ["enviando", "enviada", "entregue", "lida"].includes(m.envio);
}

/**
 * Lições ativas (migração 0078). Se a tabela ainda não existir, segue sem lições —
 * a Joy continua funcionando antes de a migração ser aplicada.
 */
export async function carregarLicoesAtivas(): Promise<{ licoes: Licao[]; disponivel: boolean }> {
  const { data, error } = await db
    .from("wa_licoes")
    .select("id,situacao,resposta_errada,resposta_certa,motivo,tema,ativa,updated_at")
    .eq("ativa", true)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) {
    console.warn("[Joy] lições indisponíveis:", error.message);
    return { licoes: [], disponivel: false };
  }
  return { licoes: (data ?? []) as Licao[], disponivel: true };
}

export type ResultadoResposta = {
  respondeu: boolean;
  texto?: string;
  transferida?: boolean;
  ferramentas: Array<{
    nome: string;
    args: Record<string, unknown>;
    resultado: Record<string, unknown>;
  }>;
  bloqueios: Bloqueio[];
  tokensEntrada: number;
  tokensSaida: number;
  duracaoMs: number;
};

function historicoParaModelo(msgs: MensagemRow[]): MsgModelo[] {
  const out: MsgModelo[] = [];
  for (const m of msgs) {
    if (!m.texto.trim()) continue;
    if (m.autor === "cliente") out.push({ role: "user", content: m.texto });
    else if (m.autor === "joy") out.push({ role: "assistant", content: m.texto });
    else if (m.autor === "equipe")
      out.push({ role: "assistant", content: `(Mensagem enviada pela equipe) ${m.texto}` });
  }
  return out;
}

function parseArgs(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Gera e grava a resposta da Joy para a conversa. Não responde se a conversa estiver com a equipe.
 * No canal "simulador" nada sai do app: nenhuma mensagem real, nenhum push.
 */
export async function responder(conversaId: string): Promise<ResultadoResposta> {
  const inicio = Date.now();
  const config = await carregarConfig();
  const { data: conversa, error: errConv } = await db
    .from("wa_conversas")
    .select("*")
    .eq("id", conversaId)
    .maybeSingle();
  if (errConv || !conversa)
    throw new Error(`Conversa não encontrada: ${errConv?.message ?? conversaId}`);
  const conv = conversa as ConversaRow;

  const vazio: ResultadoResposta = {
    respondeu: false,
    ferramentas: [],
    bloqueios: [],
    tokensEntrada: 0,
    tokensSaida: 0,
    duracaoMs: 0,
  };
  if (conv.modo !== "ia") return vazio;

  const { data: msgsDesc } = await db
    .from("wa_mensagens")
    .select("*")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(HISTORICO);
  const mensagens = ((msgsDesc ?? []) as MensagemRow[]).reverse().filter(mensagemFoiDita);

  const { hoje, hora, diaSemana } = agoraNoHotel();
  const ctx: ContextoFerramenta = {
    conversa: conv,
    conhecimento: config.conhecimento,
    wifi: config.wifi,
    hoje,
    wifiLiberadoPara: new Set<UnidadeJoy>(),
    numerosPermitidos: new Set<string>(),
    nomesPermitidos: new Set<string>(),
  };
  for (const m of mensagens) {
    const lib = (m.meta as { wifi_liberado?: unknown } | null)?.wifi_liberado;
    if (Array.isArray(lib))
      for (const u of lib) if (u === "Botafogo" || u === "Ipanema") ctx.wifiLiberadoPara.add(u);
  }

  let resumo: Record<string, unknown> | null = null;
  if (conv.reserva_id && conv.reserva_unidade) {
    const r = await recarregarReserva(conv.reserva_unidade, conv.reserva_id).catch(() => null);
    if (r) {
      ctx.reserva = r;
      ctx.numerosPermitidos.add(r.reservationID);
      const rs = resumoReserva(r);
      for (const t of rs.tipos_de_acomodacao) ctx.nomesPermitidos.add(t);
      resumo = rs as unknown as Record<string, unknown>;
    }
  }

  // Lições da equipe: as mais parecidas com as últimas mensagens do hóspede.
  const { licoes, disponivel: licoesDisponiveis } = await carregarLicoesAtivas();
  const textoRecente = mensagens
    .filter((m) => m.autor === "cliente")
    .slice(-3)
    .map((m) => m.texto)
    .join(" ");
  const licoesUsadas = escolherLicoes(licoes, textoRecente);

  const sistema = [
    montarPromptSistema(config.prompt, config.conhecimento, {
      hoje,
      hora,
      diaSemana,
      canal: conv.canal,
      contatoNome: conv.contato_nome,
      reserva: resumo,
    }),
    textoLicoes(licoesUsadas),
  ]
    .filter(Boolean)
    .join("\n\n");

  const conversaModelo: MsgModelo[] = [
    { role: "system", content: sistema },
    ...historicoParaModelo(mensagens),
  ];
  const resultado: ResultadoResposta = { ...vazio };
  let texto = "";
  let chamadas = 0;
  let erro: string | null = null;

  try {
    for (let passo = 0; passo <= MAX_PASSOS; passo++) {
      const ultimo = passo === MAX_PASSOS;
      const r = await chamarModelo(config.modelo, conversaModelo, !ultimo);
      chamadas++;
      resultado.tokensEntrada += r.usage?.prompt_tokens ?? 0;
      resultado.tokensSaida += r.usage?.completion_tokens ?? 0;
      const msg = r.choices?.[0]?.message;
      const calls = (msg?.tool_calls ?? []).filter((c) => c?.function?.name);
      if (calls.length > 0 && !ultimo) {
        conversaModelo.push({
          role: "assistant",
          content: msg?.content ?? null,
          tool_calls: calls,
        });
        for (const c of calls) {
          const args = parseArgs(c.function.arguments);
          let saida: Record<string, unknown>;
          try {
            saida = await executarFerramenta(c.function.name, args, ctx);
          } catch (e) {
            saida = {
              ok: false,
              erro: `Falha ao consultar: ${e instanceof Error ? e.message : String(e)}. Não invente; diga que vai confirmar com a equipe.`,
            };
          }
          resultado.ferramentas.push({ nome: c.function.name, args, resultado: saida });
          conversaModelo.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(saida) });
        }
        continue;
      }
      texto = (msg?.content ?? "").trim();
      break;
    }

    // Filtro de saída: uma chance de reescrever; se continuar bloqueado, resposta segura.
    const opts = () => ({
      wifi: config.wifi,
      wifiLiberadoPara: [...ctx.wifiLiberadoPara],
      numerosPermitidos: [...ctx.numerosPermitidos],
      nomesPermitidos: [...ctx.nomesPermitidos],
    });
    let bloqueios = texto ? verificarResposta(texto, opts()) : [];
    if (bloqueios.length > 0) {
      resultado.bloqueios.push(...bloqueios);
      conversaModelo.push({ role: "assistant", content: texto });
      conversaModelo.push({
        role: "user",
        content: `[AVISO DO SISTEMA, não é o hóspede] Sua última resposta foi bloqueada porque ${bloqueios
          .map((b) => MOTIVO_BLOQUEIO[b])
          .join(" e ")}. Reescreva a resposta ao hóspede sem isso, seguindo as regras absolutas.`,
      });
      const r = await chamarModelo(config.modelo, conversaModelo, false);
      chamadas++;
      resultado.tokensEntrada += r.usage?.prompt_tokens ?? 0;
      resultado.tokensSaida += r.usage?.completion_tokens ?? 0;
      texto = (r.choices?.[0]?.message?.content ?? "").trim();
      bloqueios = texto ? verificarResposta(texto, opts()) : [];
      if (bloqueios.length > 0) {
        resultado.bloqueios.push(...bloqueios);
        texto = RESPOSTA_SEGURA;
      }
    }
    if (!texto)
      texto = ctx.transferida
        ? "Vou chamar alguém da nossa equipe para te ajudar, tá? Já já te respondem por aqui."
        : RESPOSTA_SEGURA;
    texto = mascararCartao(texto);
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  resultado.duracaoMs = Date.now() - inicio;
  resultado.transferida = !!ctx.transferida;

  await db.from("wa_ia_execucoes").insert({
    conversa_id: conversaId,
    canal: conv.canal,
    modelo: config.modelo,
    tokens_entrada: resultado.tokensEntrada,
    tokens_saida: resultado.tokensSaida,
    chamadas_modelo: chamadas,
    ferramentas: resultado.ferramentas.map((f) => ({
      nome: f.nome,
      args: f.args,
      ok: f.resultado.ok !== false,
    })),
    bloqueios: [...new Set(resultado.bloqueios)],
    duracao_ms: resultado.duracaoMs,
    erro,
    // a coluna vem na mesma migração (0078) da tabela de lições
    ...(licoesDisponiveis ? { licoes_usadas: licoesUsadas.map((l) => l.id) } : {}),
  });

  if (erro) throw new Error(erro);

  await db.from("wa_mensagens").insert({
    conversa_id: conversaId,
    autor: "joy",
    texto,
    // E3: no WhatsApp a Joy só escreve rascunho; alguém aprova no painel.
    ...(conv.canal === "whatsapp" ? { envio: "rascunho" } : {}),
    meta: {
      ferramentas: resultado.ferramentas.map((f) => ({
        nome: f.nome,
        args: f.args,
        resultado: f.resultado,
      })),
      bloqueios: [...new Set(resultado.bloqueios)],
      wifi_liberado: [...ctx.wifiLiberadoPara],
      tokens: { entrada: resultado.tokensEntrada, saida: resultado.tokensSaida },
      modelo: config.modelo,
      duracao_ms: resultado.duracaoMs,
      licoes: licoesUsadas.map((l) => ({ id: l.id, tema: l.tema })),
    },
  });
  if (ctx.transferida) {
    await db.from("wa_mensagens").insert({
      conversa_id: conversaId,
      autor: "sistema",
      texto: "Conversa passada para a equipe. A Joy não responde mais até alguém devolver.",
    });
  }
  return { ...resultado, respondeu: true, texto };
}
