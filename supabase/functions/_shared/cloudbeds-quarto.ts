// Regras ÚNICAS de leitura do Cloudbeds para o card do quarto.
// Usadas pelas funções `consolidar-dados` (Camareiras/Gestão) e `dados-recepcao` (Recepção),
// para que as duas telas mostrem SEMPRE a mesma coisa. Sem imports externos (testável no vitest).

export const TZ_HOTEL = 'America/Sao_Paulo'

/** YYYY-MM-DD no fuso do hotel (Rio). Antes usava UTC: depois das 21h o "hoje" virava amanhã. */
export function hojeNoHotel(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ_HOTEL }).format(agora)
}

export function somarDias(dataISO: string, dias: number): string {
  const [y, m, d] = dataISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + dias)
  return dt.toISOString().slice(0, 10)
}

// ------------------------------------------------------------------ ECI / LCO
export type EciLcoInfo = { eci: boolean; lco: boolean; eciTime: string | null; lcoTime: string | null }
export const emptyEciLco = (): EciLcoInfo => ({ eci: false, lco: false, eciTime: null, lcoTime: null })

const collectTextDeep = (value: unknown, parts: string[], seen = new WeakSet<object>(), depth = 0) => {
  if (value === null || value === undefined || depth > 6) return
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim()
    if (text) parts.push(text)
    return
  }
  if (typeof value !== 'object') return
  if (seen.has(value as object)) return
  seen.add(value as object)
  if (Array.isArray(value)) {
    for (const item of value) collectTextDeep(item, parts, seen, depth + 1)
    return
  }
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    parts.push(key)
    collectTextDeep(val, parts, seen, depth + 1)
  }
}

const normalizarHora = (hour: string, minute?: string) => {
  const h = parseInt(hour, 10)
  if (!Number.isFinite(h)) return null
  const hh = Math.min(23, Math.max(0, h))
  const m = minute ? parseInt(minute, 10) : 0
  const mm = Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

// Rótulos aceitos (sigla, inglês e português).
const ROTULOS = {
  ECI: ['ECI', 'early\\s*check[-\\s]*in', 'entrada\\s+antecipada', 'check[-\\s]*in\\s+antecipado'],
  LCO: ['LCO', 'late\\s*check[-\\s]*out', 'sa[ií]da\\s+(?:atrasada|tardia)', 'check[-\\s]*out\\s+(?:tardio|atrasado)'],
} as const

/** Procura ECI/LCO em textos do Cloudbeds (motivo do bloqueio, notas, campos da reserva). */
export function scanEciLco(...fontes: unknown[]): EciLcoInfo {
  const parts: string[] = []
  for (const f of fontes) collectTextDeep(f, parts)
  const blob = parts.join(' | ')
  if (!blob) return emptyEciLco()

  const achou = (kind: 'ECI' | 'LCO') =>
    ROTULOS[kind].some((rot, i) =>
      i === 0
        ? new RegExp(`(?:^|[^A-Z0-9])${rot}(?:[^A-Z0-9]|$)`, 'i').test(blob)
        : new RegExp(rot, 'i').test(blob),
    )
  const hora = (kind: 'ECI' | 'LCO'): string | null => {
    for (const rot of ROTULOS[kind]) {
      const depois = new RegExp(`(?:^|[^A-Z0-9])(?:${rot})[^0-9]{0,30}(\\d{1,2})(?:\\s*(?:[:hH.]|horas?|hrs?)\\s*(\\d{2})?)?`, 'i')
      const m1 = blob.match(depois)
      if (m1) return normalizarHora(m1[1], m1[2])
      const antes = new RegExp(`(\\d{1,2})(?:\\s*(?:[:hH.]|horas?|hrs?)\\s*(\\d{2})?)?[^A-Z0-9]{0,30}(?:${rot})(?:[^A-Z0-9]|$)`, 'i')
      const m2 = blob.match(antes)
      if (m2) return normalizarHora(m2[1], m2[2])
    }
    return null
  }
  const eci = achou('ECI')
  const lco = achou('LCO')
  return { eci, lco, eciTime: eci ? hora('ECI') : null, lcoTime: lco ? hora('LCO') : null }
}

export const mergeEciLco = (...items: EciLcoInfo[]): EciLcoInfo => ({
  eci: items.some((i) => i.eci),
  lco: items.some((i) => i.lco),
  eciTime: items.find((i) => i.eciTime)?.eciTime ?? null,
  lcoTime: items.find((i) => i.lcoTime)?.lcoTime ?? null,
})

// ------------------------------------------------------- bloqueio / manutenção
export type TipoBloqueio = 'manutencao' | 'bloqueado'

export type FlagsDoQuarto = EciLcoInfo & {
  bloqueio: TipoBloqueio | null
  motivoBloqueio: string | null
}

export const flagsVazias = (): FlagsDoQuarto => ({ ...emptyEciLco(), bloqueio: null, motivoBloqueio: null })

const MANUTENCAO_RE = /manut|maint|out[\s_-]*of[\s_-]*service|fora\s+de\s+servi|repar|conserto|obra|reforma|vazamento|infiltra|quebrad|el[eé]tric|hidr[aá]ul|ar[\s-]*condicionado|pintura/i

const dataDe = (v: unknown) => String(v ?? '').slice(0, 10)

/**
 * Lê `getRoomBlocks` e devolve, por roomID, o que vale HOJE no hotel:
 *  - bloqueio de MANUTENÇÃO (tipo out_of_service ou motivo de manutenção);
 *  - BLOQUEIO comum (qualquer outro bloqueio ativo hoje, exceto "courtesy hold");
 *  - ECI / LCO (bloqueios cujo motivo cita entrada antecipada / saída atrasada).
 * Considera o bloqueio de hoje quando início <= hoje <= fim (datas inclusivas). Um ECI lançado
 * como bloqueio da noite anterior (termina hoje) também conta.
 */
export function analisarRoomBlocks(json: unknown, hoje: string): Map<string, FlagsDoQuarto> {
  const mapa = new Map<string, FlagsDoQuarto>()
  const data = (json as { data?: unknown })?.data as { roomBlocks?: unknown } | unknown[] | undefined
  const blocos: any[] = Array.isArray((data as any)?.roomBlocks)
    ? (data as any).roomBlocks
    : Array.isArray(data)
      ? (data as any[])
      : []

  for (const bloco of blocos) {
    const tipo = String(bloco?.roomBlockType ?? '').toLowerCase()
    if (tipo.includes('courtesy')) continue // pré-reserva, não bloqueia o quarto
    const motivo = String(bloco?.roomBlockReason ?? bloco?.reason ?? '').trim()
    const eciLco = scanEciLco(motivo, bloco?.roomBlockReason)
    const quartos: any[] = Array.isArray(bloco?.rooms) ? bloco.rooms : []

    for (const q of quartos) {
      const roomId = String(q?.roomID ?? q?.roomId ?? '').trim()
      if (!roomId) continue
      const inicio = dataDe(q?.startDate ?? bloco?.startDate)
      const fim = dataDe(q?.endDate ?? bloco?.endDate) || inicio
      if (!inicio || inicio > hoje || fim < hoje) continue

      const atual = mapa.get(roomId) ?? flagsVazias()
      if (eciLco.eci || eciLco.lco) {
        mapa.set(roomId, { ...atual, ...mergeEciLco(atual, eciLco) })
        continue
      }
      const ehManutencao = tipo.includes('out_of_service') || tipo.includes('maint') || MANUTENCAO_RE.test(motivo)
      const bloqueio: TipoBloqueio = ehManutencao || atual.bloqueio === 'manutencao' ? 'manutencao' : 'bloqueado'
      mapa.set(roomId, {
        ...atual,
        bloqueio,
        motivoBloqueio: atual.motivoBloqueio ?? (motivo || null),
      })
    }
  }
  return mapa
}

/** Bloqueio vindo do próprio housekeeping (roomCondition fora de serviço). */
export function bloqueioDoHousekeeping(room: any): TipoBloqueio | null {
  const cond = String(room?.roomCondition ?? '').toLowerCase()
  if (cond === 'out_of_service' || cond === 'maintenance' || cond === 'out_of_order') return 'manutencao'
  return null
}

// ------------------------------------------------------------- chamadas HTTP
export class CloudbedsIndisponivel extends Error {}

/**
 * GET no Cloudbeds com nova tentativa em erro de rede, limite (429) e 5xx.
 * Lança CloudbedsIndisponivel se não conseguir — quem chama NÃO deve gravar dados parciais.
 */
export async function cloudbedsGet(url: string, apiKey: string, tentativas = 3): Promise<any> {
  let ultimoErro = ''
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
      if (res.status === 429 || res.status >= 500) {
        ultimoErro = `HTTP ${res.status}`
      } else {
        const texto = await res.text()
        let json: any = null
        try {
          json = JSON.parse(texto)
        } catch {
          ultimoErro = `resposta inválida (${texto.slice(0, 120)})`
        }
        if (json && json.success !== false) return json
        if (json) ultimoErro = String(json.message ?? json.error ?? 'success=false')
      }
    } catch (e) {
      ultimoErro = (e as Error).message
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1) * (i + 1)))
  }
  throw new CloudbedsIndisponivel(`Cloudbeds indisponível em ${url.split('?')[0].split('/').pop()}: ${ultimoErro}`)
}
