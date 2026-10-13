// Camareira finaliza o quarto no app → quarto LIMPO no Cloudbeds.
// Regras puras usadas pelo servidor do app (src/lib/cloudbeds-housekeeping.functions.ts) e pela
// sincronização automática (supabase/functions/consolidar-dados), que reenvia o que ficou pendente.
// Testes em src/lib/cloudbeds/cloudbeds-limpeza.test.ts.

/** Tentativas no total (a da camareira + as da sincronização a cada 5 min) antes de desistir. */
export const MAX_TENTATIVAS_LIMPO = 6
/** Depois disso a sincronização não reenvia mais (o quarto pode já ter mudado de situação). */
export const JANELA_REENVIO_MS = 12 * 60 * 60 * 1000

/** "APT 107", "107", "Apto 01" → "107" / "1". Igual a chaveQuarto do app. */
export function chaveQuartoLimpeza(valor: unknown): string {
  const t = String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\b(APT|APTO|APARTAMENTO|QUARTO|ROOM)\b/g, '')
    .trim()
  const digitos = t.replace(/\D+/g, '').replace(/^0+/, '')
  return digitos || t.replace(/\s+/g, ' ')
}

export type QuartoHousekeeping = { roomID: string; roomName: string; condicao: string }

/** Linhas de getHousekeepingStatus → formato simples. */
export function lerHousekeeping(lista: unknown): QuartoHousekeeping[] {
  if (!Array.isArray(lista)) return []
  return (lista as Record<string, unknown>[])
    .filter((q) => q && typeof q === 'object')
    .map((q) => ({
      roomID: String(q.roomID ?? '').trim(),
      roomName: String(q.roomName ?? q.roomNumber ?? '').trim(),
      condicao: String(q.roomCondition ?? '').trim().toLowerCase(),
    }))
    .filter((q) => q.roomID)
}

/**
 * Acha o quarto no Cloudbeds. Usa o roomID gravado pela sincronização quando existe; senão o número.
 * Se dois quartos do Cloudbeds tiverem o mesmo número, não arrisca: devolve erro.
 */
export function acharQuarto(
  lista: QuartoHousekeeping[],
  roomNumber: string,
  roomIdSalvo?: string | null,
): { quarto: QuartoHousekeeping } | { erro: string } {
  if (roomIdSalvo) {
    const porId = lista.find((q) => q.roomID === String(roomIdSalvo))
    if (porId) return { quarto: porId }
  }
  const alvo = chaveQuartoLimpeza(roomNumber)
  const iguais = lista.filter((q) => chaveQuartoLimpeza(q.roomName) === alvo)
  if (iguais.length === 1) return { quarto: iguais[0] }
  if (iguais.length > 1) return { erro: `Mais de um quarto ${roomNumber} no Cloudbeds (${iguais.map((q) => q.roomName).join(', ')})` }
  return { erro: `Quarto ${roomNumber} não encontrado no Cloudbeds` }
}

export function condicaoLimpa(condicao: unknown): boolean {
  const c = String(condicao ?? '').trim().toLowerCase()
  return c === 'clean' || c === 'inspected'
}

export type SituacaoApp = {
  status: string | null
  service_status: string | null
  service_ended_at: string | null
  cloudbeds_limpo_tentativas: number | null
  is_dnd?: boolean | null
}

/**
 * O que a sincronização faz com um quarto marcado "pendente":
 * - cancelar: o quarto não está mais finalizado no app (nova saída, novo serviço) ou ficou em
 *   "Não perturbe" (não foi limpo) → para de insistir;
 * - confirmar: o Cloudbeds já está limpo;
 * - desistir: passou do limite de tentativas ou do tempo → fica "falhou" para a recepção ver;
 * - reenviar: manda limpo de novo.
 */
export function decidirReenvio(
  app: SituacaoApp,
  condicaoCloudbeds: string | null,
  agoraMs: number,
): 'cancelar' | 'confirmar' | 'desistir' | 'reenviar' {
  if (app.status !== 'clean' || app.service_status !== 'done' || app.is_dnd) return 'cancelar'
  if (condicaoLimpa(condicaoCloudbeds)) return 'confirmar'
  const fim = app.service_ended_at ? Date.parse(app.service_ended_at) : NaN
  if (!Number.isFinite(fim) || agoraMs - fim > JANELA_REENVIO_MS) return 'desistir'
  if ((app.cloudbeds_limpo_tentativas ?? 0) >= MAX_TENTATIVAS_LIMPO) return 'desistir'
  return 'reenviar'
}

/** Corpo do POST /postHousekeepingStatus. Sem roomCondition o Cloudbeds INVERTE o estado, por isso é obrigatório aqui. */
export function corpoLimpo(roomID: string): string {
  if (!roomID) throw new Error('roomID vazio')
  return new URLSearchParams({ roomID, roomCondition: 'clean' }).toString()
}

// ------------------------------------------------------------- limpeza pendente no Cloudbeds
// O app marca cloudbeds_limpo_status = 'pendente' quando a camareira finaliza. Se o envio feito na
// hora não confirmou (sem sinal, Cloudbeds fora), esta rodada confere e reenvia. Regras em
// _shared/cloudbeds-limpeza.ts. Se a coluna ainda não existir, não faz nada.
// deno-lint-ignore no-explicit-any
export async function reenviarLimpezasPendentes(
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  unidades: [string, { falhou?: boolean; housekeeping?: QuartoHousekeeping[]; apiKey?: string }][],
  apiBase: string,
  fetchFn: typeof fetch = fetch,
  agora = Date.now(),
) {
  const resultado: { quarto: string; acao: string; erro?: string }[] = []
  const { data: pendentes, error } = await supabaseClient
    .from('room_housekeeping')
    .select('property, room_number, status, service_status, service_ended_at, is_dnd, cloudbeds_room_id, cloudbeds_limpo_tentativas')
    .eq('cloudbeds_limpo_status', 'pendente')
    .limit(40)
  if (error) {
    if (!/cloudbeds_limpo|cloudbeds_room_id/i.test(error.message)) console.warn('[consolidar-dados] limpeza pendente:', error.message)
    return resultado
  }
  for (const p of (pendentes ?? []) as any[]) {
    const dados = unidades.find(([nome]) => nome === p.property)?.[1]
    if (!dados || dados.falhou || !dados.apiKey || !dados.housekeeping?.length) continue
    const achado = acharQuarto(dados.housekeeping, p.room_number, p.cloudbeds_room_id)
    const condicao = 'quarto' in achado ? achado.quarto.condicao : null
    const acao = decidirReenvio(p, condicao, agora)
    const base = { property: p.property, room_number: p.room_number }
    const log = (resultadoLog: string, erro: string | null, roomId: string | null) =>
      supabaseClient.from('cloudbeds_limpeza_logs').insert({
        ...base,
        room_id: roomId,
        origem: 'sincronizacao',
        resultado: resultadoLog,
        condicao_cloudbeds: condicao,
        erro,
      })
    const atualizar = (campos: Record<string, unknown>) =>
      supabaseClient.from('room_housekeeping').update(campos).eq('property', p.property).eq('room_number', p.room_number)
    const tentativas = Number(p.cloudbeds_limpo_tentativas ?? 0)

    if (acao === 'cancelar') {
      await atualizar({ cloudbeds_limpo_status: null, cloudbeds_limpo_erro: null })
      await log('cancelado', null, p.cloudbeds_room_id ?? null)
    } else if (acao === 'confirmar') {
      await atualizar({ cloudbeds_limpo_status: 'confirmado', cloudbeds_limpo_em: new Date().toISOString(), cloudbeds_limpo_erro: null })
      await log('confirmado', null, 'quarto' in achado ? achado.quarto.roomID : null)
    } else if (acao === 'desistir' || !('quarto' in achado)) {
      const erro = 'erro' in achado ? achado.erro : `Sem confirmação depois de ${tentativas} tentativa(s)`
      if (acao === 'desistir') {
        await atualizar({ cloudbeds_limpo_status: 'falhou', cloudbeds_limpo_erro: erro })
        await log('falhou', erro, null)
      } else {
        await atualizar({ cloudbeds_limpo_tentativas: tentativas + 1, cloudbeds_limpo_erro: erro })
        await log('pendente', erro, null)
      }
    } else {
      // reenviar: o resultado é conferido na próxima rodada (5 min), lendo o housekeeping de novo.
      let erro: string | null = null
      try {
        const res = await fetchFn(`${apiBase}/postHousekeepingStatus`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${dados.apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: corpoLimpo(achado.quarto.roomID),
        })
        const j = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string }
        if (!res.ok || j?.success === false) erro = String(j?.message ?? `HTTP ${res.status}`)
      } catch (e) {
        erro = (e as Error).message
      }
      await atualizar({
        cloudbeds_limpo_tentativas: tentativas + 1,
        cloudbeds_limpo_em: new Date().toISOString(),
        cloudbeds_limpo_erro: erro,
        cloudbeds_room_id: achado.quarto.roomID,
      })
      await log(erro ? 'pendente' : 'reenviado', erro, achado.quarto.roomID)
    }
    resultado.push({ quarto: `${p.property} ${p.room_number}`, acao })
  }
  return resultado
}
