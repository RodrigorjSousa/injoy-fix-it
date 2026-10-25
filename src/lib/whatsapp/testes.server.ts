// E2 — roda os cenários de hóspedes simulados contra a Joy, no SIMULADOR (nada sai para hóspedes).
// A tela chama um passo por vez (hóspede fala → Joy responde), para cada chamada ser curta, e no fim
// pede a avaliação (checagens automáticas + IA avaliadora). As sugestões de lição ficam guardadas no
// teste e só viram lição se o gestor aprovar na tela.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { carregarConfig, completarTexto, responder } from "./agente.server";
import {
  cenarioPorId,
  checagensAutomaticas,
  lerAvaliacao,
  lerFalaHospede,
  mensagensAvaliador,
  mensagensHospede,
  resultadoFinal,
  type MsgTeste,
} from "./cenarios";
import { agoraNoHotel, textoConhecimento } from "./prompt";
import { mascararCartao } from "./regras";

// Tabelas novas ainda não estão no types.ts gerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

type TesteRow = {
  id: string;
  cenario_id: string;
  conversa_id: string | null;
  status: "rodando" | "avaliar" | "avaliado" | "erro";
  turnos: number;
  tokens_entrada: number;
  tokens_saida: number;
};

async function carregarTeste(id: string): Promise<TesteRow> {
  const { data, error } = await db.from("wa_testes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Não foi possível ler o teste: ${error.message}`);
  if (!data) throw new Error("Teste não encontrado.");
  return data as TesteRow;
}

async function mensagensDoTeste(conversaId: string): Promise<MsgTeste[]> {
  const { data, error } = await db
    .from("wa_mensagens")
    .select("autor,texto,meta,created_at")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map(
    (m: {
      autor: MsgTeste["autor"];
      texto: string;
      meta: { ferramentas?: Array<{ nome: string }>; bloqueios?: string[] } | null;
    }) => ({
      autor: m.autor,
      texto: m.texto,
      ferramentas: (m.meta?.ferramentas ?? []).map((f) => f.nome),
      bloqueios: m.meta?.bloqueios ?? [],
    }),
  );
}

export async function iniciarTeste(p: {
  cenarioId: string;
  lote: string | null;
  userId: string;
}): Promise<{ testeId: string; conversaId: string }> {
  const c = cenarioPorId(p.cenarioId);
  if (!c) throw new Error(`Cenário desconhecido: ${p.cenarioId}`);
  const { data: conv, error: e1 } = await db
    .from("wa_conversas")
    .insert({ canal: "simulador", contato_nome: `🧪 ${c.titulo}`, criado_por: p.userId })
    .select("id")
    .single();
  if (e1) throw new Error(`Não foi possível criar a conversa do teste: ${e1.message}`);
  const { data: t, error: e2 } = await db
    .from("wa_testes")
    .insert({
      lote: p.lote,
      cenario_id: c.id,
      titulo: c.titulo,
      conversa_id: conv.id,
      criado_por: p.userId,
    })
    .select("id")
    .single();
  if (e2) {
    await db.from("wa_conversas").delete().eq("id", conv.id);
    throw new Error(
      `Não foi possível criar o teste: ${e2.message}${/wa_testes/.test(e2.message) ? " (a migração 0081 já foi aplicada?)" : ""}`,
    );
  }
  return { testeId: t.id as string, conversaId: conv.id as string };
}

export type PassoTeste = {
  status: TesteRow["status"];
  turnos: number;
  fala?: string;
  resposta?: string;
  erro?: string;
};

/** Um turno: o hóspede simulado fala e a Joy responde. */
export async function passoTeste(testeId: string): Promise<PassoTeste> {
  const t = await carregarTeste(testeId);
  if (t.status !== "rodando" || !t.conversa_id) return { status: t.status, turnos: t.turnos };
  const c = cenarioPorId(t.cenario_id);
  if (!c) throw new Error(`Cenário desconhecido: ${t.cenario_id}`);

  const atualizar = async (campos: Record<string, unknown>) => {
    const { error } = await db.from("wa_testes").update(campos).eq("id", testeId);
    if (error) throw new Error(error.message);
  };

  const { data: conv } = await db
    .from("wa_conversas")
    .select("modo")
    .eq("id", t.conversa_id)
    .maybeSingle();
  if (!conv || conv.modo !== "ia" || t.turnos >= c.maxTurnos) {
    await atualizar({ status: "avaliar" });
    return { status: "avaliar", turnos: t.turnos };
  }

  const config = await carregarConfig();
  const agora = agoraNoHotel();
  const msgs = await mensagensDoTeste(t.conversa_id);
  let tokensEntrada = 0;
  let tokensSaida = 0;
  try {
    const h = await completarTexto(config.modelo, mensagensHospede(c, msgs, agora));
    tokensEntrada += h.tokensEntrada;
    tokensSaida += h.tokensSaida;
    const fala = lerFalaHospede(h.texto);
    if (!fala) {
      await atualizar({
        status: "avaliar",
        tokens_entrada: t.tokens_entrada + tokensEntrada,
        tokens_saida: t.tokens_saida + tokensSaida,
      });
      return { status: "avaliar", turnos: t.turnos };
    }
    await db
      .from("wa_mensagens")
      .insert({ conversa_id: t.conversa_id, autor: "cliente", texto: mascararCartao(fala) });
    await db
      .from("wa_conversas")
      .update({ ultima_msg_cliente_em: new Date().toISOString() })
      .eq("id", t.conversa_id);

    const r = await responder(t.conversa_id);
    tokensEntrada += r.tokensEntrada;
    tokensSaida += r.tokensSaida;
    const turnos = t.turnos + 1;
    const status = r.transferida || turnos >= c.maxTurnos ? "avaliar" : "rodando";
    await atualizar({
      status,
      turnos,
      tokens_entrada: t.tokens_entrada + tokensEntrada,
      tokens_saida: t.tokens_saida + tokensSaida,
    });
    return { status, turnos, fala, resposta: r.texto };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await atualizar({
      status: "erro",
      erro,
      tokens_entrada: t.tokens_entrada + tokensEntrada,
      tokens_saida: t.tokens_saida + tokensSaida,
    });
    return { status: "erro", turnos: t.turnos, erro };
  }
}

/** Checagens automáticas + IA avaliadora. Grava nota, falhas e sugestões de lição. */
export async function avaliarTeste(testeId: string): Promise<{ nota: number; aprovado: boolean }> {
  const t = await carregarTeste(testeId);
  if (!t.conversa_id) throw new Error("O teste perdeu a conversa (foi apagada?).");
  const c = cenarioPorId(t.cenario_id);
  if (!c) throw new Error(`Cenário desconhecido: ${t.cenario_id}`);
  const config = await carregarConfig();
  const msgs = await mensagensDoTeste(t.conversa_id);
  const { data: passagens } = await db
    .from("wa_passagens")
    .select("id")
    .eq("conversa_id", t.conversa_id)
    .limit(1);
  const transferida = (passagens ?? []).length > 0;
  const auto = checagensAutomaticas(c, msgs, transferida);

  try {
    const pedido = mensagensAvaliador(c, msgs, textoConhecimento(config.conhecimento));
    let r = await completarTexto(config.modelo, pedido);
    let tokensEntrada = r.tokensEntrada;
    let tokensSaida = r.tokensSaida;
    let av;
    try {
      av = lerAvaliacao(r.texto);
    } catch {
      // uma segunda chance: às vezes o modelo escreve texto em volta
      r = await completarTexto(config.modelo, [
        ...pedido,
        { role: "assistant", content: r.texto },
        {
          role: "user",
          content: "Responda de novo SOMENTE com o JSON pedido, sem nenhum texto fora dele.",
        },
      ]);
      tokensEntrada += r.tokensEntrada;
      tokensSaida += r.tokensSaida;
      av = lerAvaliacao(r.texto);
    }
    const final = resultadoFinal(auto, av);
    const { error } = await db
      .from("wa_testes")
      .update({
        status: "avaliado",
        nota: final.nota,
        aprovado: final.aprovado,
        resumo: av.resumo || null,
        falhas: final.falhas,
        sugestoes: av.sugestoes,
        erro: null,
        tokens_entrada: t.tokens_entrada + tokensEntrada,
        tokens_saida: t.tokens_saida + tokensSaida,
      })
      .eq("id", testeId);
    if (error) throw new Error(error.message);
    return { nota: final.nota, aprovado: final.aprovado };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await db
      .from("wa_testes")
      .update({ status: "erro", erro: `Avaliação: ${erro}`, falhas: auto })
      .eq("id", testeId);
    throw new Error(erro);
  }
}
