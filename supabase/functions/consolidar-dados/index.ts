import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apiKey, content-type, x-cron-secret',
}

type EciLcoInfo = {
  eci: boolean
  lco: boolean
  eciTime: string | null
  lcoTime: string | null
}

const emptyEciLco = (): EciLcoInfo => ({ eci: false, lco: false, eciTime: null, lcoTime: null })

const collectTextDeep = (value: unknown, parts: string[], seen = new WeakSet<object>(), depth = 0) => {
  if (value === null || value === undefined || depth > 6) return
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim()
    if (text) parts.push(text)
    return
  }
  if (typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) collectTextDeep(item, parts, seen, depth + 1)
    return
  }
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    parts.push(key)
    collectTextDeep(val, parts, seen, depth + 1)
  }
}

const normalizeEciLcoTime = (hour: string, minute?: string) => {
  const hhParsed = parseInt(hour, 10)
  if (!Number.isFinite(hhParsed)) return null
  const hh = Math.min(23, Math.max(0, hhParsed))
  const mmParsed = minute ? parseInt(minute, 10) : 0
  const mm = Number.isFinite(mmParsed) ? Math.min(59, Math.max(0, mmParsed)) : 0
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

const scanEciLco = (...sources: unknown[]): EciLcoInfo => {
  const parts: string[] = []
  for (const source of sources) collectTextDeep(source, parts)
  const blob = parts.join(' | ')
  if (!blob) return emptyEciLco()

  const siglaPattern = (sigla: 'ECI' | 'LCO') => new RegExp(`(?:^|[^A-Z0-9])${sigla}(?:[^A-Z0-9]|$)`, 'i')
  const eci = siglaPattern('ECI').test(blob) || /early\s*check[-\s]*in/i.test(blob)
  const lco = siglaPattern('LCO').test(blob) || /late\s*check[-\s]*out/i.test(blob)

  const extractTime = (kind: 'ECI' | 'LCO'): string | null => {
    const labels = kind === 'ECI'
      ? ['ECI', 'early\\s*check[-\\s]*in']
      : ['LCO', 'late\\s*check[-\\s]*out']
    for (const label of labels) {
      const after = new RegExp(`(?:^|[^A-Z0-9])(?:${label})[^0-9]{0,30}(\\d{1,2})(?:\\s*(?:[:hH.]|horas?|hrs?)\\s*(\\d{2})?)?`, 'i')
      const afterMatch = blob.match(after)
      if (afterMatch) return normalizeEciLcoTime(afterMatch[1], afterMatch[2])

      const before = new RegExp(`(\\d{1,2})(?:\\s*(?:[:hH.]|horas?|hrs?)\\s*(\\d{2})?)?[^A-Z0-9]{0,30}(?:${label})(?:[^A-Z0-9]|$)`, 'i')
      const beforeMatch = blob.match(before)
      if (beforeMatch) return normalizeEciLcoTime(beforeMatch[1], beforeMatch[2])
    }
    return null
  }

  return {
    eci,
    lco,
    eciTime: eci ? extractTime('ECI') : null,
    lcoTime: lco ? extractTime('LCO') : null,
  }
}

async function authorizeRequest(req: Request): Promise<{ ok: boolean; status?: number; message?: string }> {
  const cronSecret = Deno.env.get('CRON_SHARED_SECRET')
  const provided = req.headers.get('x-cron-secret')
  if (cronSecret && provided && provided === cronSecret) return { ok: true }

  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, message: 'Não autenticado' }
  }
  const token = authHeader.slice(7).trim()
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!SUPABASE_URL || !ANON || !token) {
    return { ok: false, status: 401, message: 'Não autenticado' }
  }
  const authed = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userRes, error: userErr } = await authed.auth.getUser(token)
  if (userErr || !userRes?.user) {
    return { ok: false, status: 401, message: 'Sessão inválida' }
  }
  const { data: roles } = await authed.from('user_roles').select('role').eq('user_id', userRes.user.id)
  const allowed = new Set(['admin', 'gestor', 'recepcao', 'camareira', 'funcionario'])
  if (!(roles ?? []).some((r: { role: string }) => allowed.has(r.role))) {
    return { ok: false, status: 403, message: 'Sem permissão' }
  }
  return { ok: true }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authz = await authorizeRequest(req)
  if (!authz.ok) {
    return new Response(JSON.stringify({ error: authz.message ?? 'Não autorizado' }), {
      status: authz.status ?? 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )


    const apiKeyIpanema = Deno.env.get('CLOUDBEDS_API_KEY_IPANEMA')
    const apiKeyBotafogo = Deno.env.get('CLOUDBEDS_API_KEY_BOTAFOGO')

    const hojeStr = new Date().toISOString().split('T')[0]

    const processarPropriedade = async (apiKey: string | undefined, nomeUnidade: string) => {
      if (!apiKey) return { quartos: [] as any[], dashboard: null as any }

      const janelaInicio = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]
      const janelaFim = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

      const authHeaders = { Authorization: `Bearer ${apiKey}` }

      // Busca reservas paginadas — Cloudbeds limita pageSize a 100.
      // Sem paginação, hóspedes de estadia longa (checkin > 100 reservas atrás)
      // ficam de fora e o quarto aparece como "Quarto Vazio".
      const fetchReservasPagina = async (
        pageNumber: number,
        checkInFrom: string,
        checkInTo: string,
        statusFilter = '',
      ) => {
        const url =
          `https://hotels.cloudbeds.com/api/v1.2/getReservations?checkInFrom=${checkInFrom}` +
          `&checkInTo=${checkInTo}&includeGuestsDetails=true&pageSize=100&pageNumber=${pageNumber}` +
          statusFilter
        const r = await fetch(url, { headers: authHeaders })
        return r.json().catch(() => ({}))
      }

      const fetchTodasReservas = async (
        checkInFrom: string,
        checkInTo: string,
        statusFilter = '',
      ) => {
        const primeira = await fetchReservasPagina(1, checkInFrom, checkInTo, statusFilter)
        if (!primeira?.success) return [] as any[]
        const total = Number(primeira.total ?? primeira.count ?? 0)
        const acc: any[] = Array.isArray(primeira.data) ? [...primeira.data] : []
        const totalPaginas = Math.min(Math.ceil(total / 100), 50) // hard cap de segurança
        if (totalPaginas > 1) {
          const pags = await Promise.all(
            Array.from({ length: totalPaginas - 1 }, (_, i) =>
              fetchReservasPagina(i + 2, checkInFrom, checkInTo, statusFilter),
            ),
          )
          for (const p of pags) {
            if (p?.success && Array.isArray(p.data)) acc.push(...p.data)
          }
        }
        return acc
      }

      const [roomsRes, dashRes, reservasWindow, reservasCheckedIn] = await Promise.all([
        fetch('https://hotels.cloudbeds.com/api/v1.2/getHousekeepingStatus', { headers: authHeaders }),
        fetch('https://hotels.cloudbeds.com/api/v1.2/getDashboard', { headers: authHeaders }),
        // Janela padrão: reservas do dia (arrivals/departures/short-stay)
        fetchTodasReservas(janelaInicio, janelaFim),
        // Hóspedes atualmente hospedados — checkin nos últimos 365 dias, filtro status
        fetchTodasReservas(
          new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          janelaFim,
          '&status=checked_in',
        ),
      ])

      const roomsJson = await roomsRes.json().catch(() => ({}))
      const dashJson = await dashRes.json().catch(() => ({}))

      const houseData = roomsJson?.data
      const todosQuartos: any[] = Array.isArray(houseData)
        ? houseData
        : Array.isArray(houseData?.rooms)
          ? houseData.rooms
          : []

      // Deduplica por reservationID unindo as duas consultas
      const mapReservas = new Map<string, any>()
      for (const r of [...reservasWindow, ...reservasCheckedIn]) {
        const id = String(r?.reservationID ?? r?.reservationId ?? r?.id ?? '')
        if (!id) continue
        if (!mapReservas.has(id)) mapReservas.set(id, r)
      }
      const reservasRaw: any[] = Array.from(mapReservas.values())

      // Normaliza reservas: EXPANDE por quarto atribuído.
      // Reservas multi-quarto (mesmo hóspede aluga 107 + 109) precisam gerar
      // uma entrada por quarto, senão só o primeiro quarto exibe o hóspede
      // e os demais aparecem como "Quarto Vazio".
      const reservas = reservasRaw.flatMap((r: any) => {
        const guestListObj = r.guestList ?? {}
        const guestsAll: any[] = Object.values(guestListObj)
        const mainGuestId = r.guestID
        const mainGuest = guestListObj?.[mainGuestId] ?? guestsAll[0] ?? {}

        // Coleta todos os quartos únicos citados por qualquer hóspede da reserva
        const roomsMap = new Map<string, any>()
        for (const g of guestsAll.length ? guestsAll : [mainGuest]) {
          const assigned: any[] = Array.isArray(g?.rooms) ? g.rooms : []
          const unassigned: any[] = Array.isArray(g?.unassignedRooms) ? g.unassignedRooms : []
          for (const info of [...assigned, ...unassigned]) {
            const num = String(
              info?.roomName ?? info?.roomNumber ?? info?.assignedRoomNumber ?? '',
            ).trim()
            if (num && !roomsMap.has(num)) roomsMap.set(num, info)
          }
        }
        // Fallback: reserva sem quartos vinculados → uma entrada única sem quarto
        if (roomsMap.size === 0) roomsMap.set('', {})

        const resCheckInDate = String(r.startDate ?? r.checkInDate ?? '').slice(0, 10)
        const resCheckOutDate = String(r.endDate ?? r.checkOutDate ?? '').slice(0, 10)
        const reservationStatus = String(r.status ?? '').toLowerCase()
        const isMultiRoom = roomsMap.size > 1

        return Array.from(roomsMap.entries()).map(([roomNumber, roomInfo]) => {
          const guestForRoom = guestsAll.find((g: any) => {
            const rs: any[] = [
              ...(Array.isArray(g?.rooms) ? g.rooms : []),
              ...(Array.isArray(g?.unassignedRooms) ? g.unassignedRooms : []),
            ]
            return rs.some((info) =>
              String(info?.roomName ?? info?.roomNumber ?? info?.assignedRoomNumber ?? '').trim() ===
                roomNumber,
            )
          }) ?? mainGuest

          const numberOfGuests =
            (parseInt(r.adults ?? 0, 10) || 0) + (parseInt(r.children ?? 0, 10) || 0)

          // Status POR QUARTO — reserva multi-quarto (mesmo hóspede aluga vários apts)
          // pode ter só um quarto de fato ocupado (check-in físico), os demais ainda
          // aguardando. Usa roomStatus/roomCheckIn quando disponível; se não houver,
          // e for multi-quarto, considera NÃO check-in (mais seguro do que assumir todos).
          const rawRoomStatus = String(roomInfo?.roomStatus ?? '').toLowerCase()
          const roomCheckInAt = String(
            roomInfo?.roomCheckIn ?? roomInfo?.dateCheckedIn ?? roomInfo?.checkedInDate ?? '',
          ).trim()
          let roomStatus: string
          if (rawRoomStatus) {
            roomStatus = rawRoomStatus
          } else if (roomCheckInAt) {
            roomStatus = 'checked_in'
          } else if (isMultiRoom) {
            // Sem sinal por quarto e reserva multi-quarto: não replica o checked_in
            // da reserva para todos os quartos — só o que tiver sinal explícito.
            roomStatus = reservationStatus === 'checked_in' ? 'confirmed' : reservationStatus
          } else {
            roomStatus = reservationStatus
          }

          // Datas POR QUARTO — reservas multi-quarto (ex.: Walter Kohan
          // reservou 19 apts, cada um com data de entrada distinta no
          // calendário do Cloudbeds) precisam usar roomCheckIn/roomCheckOut
          // do próprio quarto. Só caímos para as datas da reserva se o
          // Cloudbeds não expuser datas por quarto.
          const roomCheckInDate = String(
            roomInfo?.roomCheckIn ?? roomInfo?.checkInDate ?? '',
          ).slice(0, 10)
          const roomCheckOutDate = String(
            roomInfo?.roomCheckOut ?? roomInfo?.checkOutDate ?? '',
          ).slice(0, 10)
          const checkInDate = roomCheckInDate || resCheckInDate
          const checkOutDate = roomCheckOutDate || resCheckOutDate

          // TRAVA multi-quarto: quando o Cloudbeds NÃO expõe sinal próprio do
          // quarto (sem roomStatus, sem roomCheckIn, sem roomCheckOut) e a
          // reserva cobre vários apts, NÃO herdamos as datas da reserva —
          // senão o mesmo hóspede vaza para todos os quartos da reserva.
          const hasOwnRoomSignal =
            !!rawRoomStatus || !!roomCheckInAt || !!roomCheckInDate || !!roomCheckOutDate
          const skipRoom = isMultiRoom && !hasOwnRoomSignal
          // Se a janela do quarto termina antes/hoje sem check-in, o hóspede
          // não pertence a este quarto hoje.
          const roomWindowExpired =
            !!roomCheckOutDate && roomCheckOutDate <= hojeStr && roomStatus !== 'checked_in'
          // Janela do quarto começa depois de hoje: só entra em outra data.
          const roomWindowFuture = !!roomCheckInDate && roomCheckInDate > hojeStr && isMultiRoom

          return {
            ...r,
            _roomNumber: roomNumber,
            _roomStatus: roomStatus,
            _checkInDate: checkInDate,
            _checkOutDate: checkOutDate,
            _skip: skipRoom || roomWindowExpired,
            _isFutureRoom: roomWindowFuture,
            guestFirstName: guestForRoom?.guestFirstName ?? '',
            guestLastName: guestForRoom?.guestLastName ?? '',
            guestDocumentNumber: guestForRoom?.guestDocumentNumber ?? r.guestDocumentNumber ?? '',
            guestDocumentType: guestForRoom?.guestDocumentType ?? '',
            guestTaxID: guestForRoom?.taxID ?? r.taxID ?? '',
            guestCountry: guestForRoom?.guestCountry ?? r.guestCountry ?? '',
            numberOfGuests,
          }
        })
      }).filter((r: any) => {
        const s = String(r.status ?? '').toLowerCase()
        if (s === 'canceled' || s === 'cancelled' || s === 'no_show') return false
        if (r._skip) return false
        // Quartos com janela própria futura só devem aparecer como "próximo
        // hóspede" quando a data bate com hoje (tratado nos matchers abaixo).
        return true
      })



      const quartos = todosQuartos.map((room: any) => {
        const numQuarto = String(room.roomName ?? room.roomNumber ?? '').trim()

        const reservaSaindoHoje = reservas.find(
          (r: any) => r._roomNumber === numQuarto && r._checkOutDate === hojeStr,
        )
        const reservaEntrandoHoje = reservas.find(
          (r: any) =>
            r._roomNumber === numQuarto &&
            r._checkInDate === hojeStr &&
            String(r._roomStatus).toLowerCase() !== 'checked_out',
        )
        // In-house POR QUARTO: usa _roomStatus (derivado do roomStatus/roomCheckIn
        // do Cloudbeds), não o status da reserva. Isso garante que numa reserva
        // multi-quarto (ex.: 19 apts pro mesmo hóspede) só o quarto com check-in
        // físico efetivo apareça ocupado — os demais ficam livres/aguardando.
        const hospedeAtualInHouse = reservas.find(
          (r: any) =>
            r._roomNumber === numQuarto &&
            String(r._roomStatus).toLowerCase() === 'checked_in' &&
            (!r._checkOutDate || r._checkOutDate > hojeStr),
        )
        const reservaAtivaSobreposta = !hospedeAtualInHouse && !reservaEntrandoHoje && !reservaSaindoHoje
          ? reservas.find((r: any) => {
              if (r._roomNumber !== numQuarto) return false
              const st = String(r._roomStatus ?? '').toLowerCase()
              if (st === 'checked_in' || st === 'checked_out' || st === 'canceled' || st === 'cancelled' || st === 'no_show') return false
              return r._checkInDate && r._checkOutDate &&
                r._checkInDate <= hojeStr && r._checkOutDate > hojeStr
            })
          : null


        let tarefaSugerida = 'VERIFICAÇÃO'
        let corLegenda = 'CINZA'
        let blinkTroca = false

        const calcularTroca = (checkInISO: string, checkOutISO: string | null | undefined) => {
          const dataCheckin = new Date(checkInISO)
          const dataHoje = new Date(hojeStr)
          const diff = Math.floor(
            (dataHoje.getTime() - dataCheckin.getTime()) / (1000 * 60 * 60 * 24),
          )
          const diaDeTroca = diff > 0 && diff % 3 === 0
          const coincideCheckout = !!checkOutISO && checkOutISO === hojeStr
          return {
            tarefa: diaDeTroca ? 'TROCA + ARRUMAÇÃO' : 'ARRUMAÇÃO',
            blink: diaDeTroca && coincideCheckout,
          }
        }

        if (reservaSaindoHoje && reservaEntrandoHoje) {
          tarefaSugerida = 'GERAL - CHECK-IN'
          corLegenda = 'CINZA'
        } else if (reservaSaindoHoje && !reservaEntrandoHoje) {
          tarefaSugerida = 'GERAL'
          corLegenda = 'CINZA'
        } else if (hospedeAtualInHouse) {
          corLegenda = 'VERDE'
          const t = calcularTroca(hospedeAtualInHouse._checkInDate, hospedeAtualInHouse._checkOutDate)
          tarefaSugerida = t.tarefa
          blinkTroca = t.blink
        } else if (!hospedeAtualInHouse && reservaEntrandoHoje) {
          tarefaSugerida = 'REVISÃO'
          const temPendencia =
            parseFloat(reservaEntrandoHoje.balanceDue ?? reservaEntrandoHoje.balance ?? 0) > 0 ||
            !(reservaEntrandoHoje.guestDocumentNumber || reservaEntrandoHoje.guestTaxID || reservaEntrandoHoje.guestDocumentType)

          corLegenda = temPendencia ? 'AZUL FRACO' : 'AZUL FORTE'
        } else if (reservaAtivaSobreposta) {
          corLegenda = 'VERDE'
          const t = calcularTroca(reservaAtivaSobreposta._checkInDate, reservaAtivaSobreposta._checkOutDate)
          tarefaSugerida = t.tarefa
          blinkTroca = t.blink
        } else if (String(room.housekeepingStatus ?? '').toLowerCase() === 'dirty') {
          tarefaSugerida = 'ARRUMAÇÃO'
        }


        const cond = String(room.roomCondition ?? '').toLowerCase()
        // Cloudbeds marca `roomBlocked=true` para qualquer quarto com reserva
        // atribuída (ocupado, chegada hoje, etc.), não apenas manutenção.
        // Só consideramos bloqueio real quando o roomCondition indica isso.
        const blocked = cond === 'out_of_service' || cond === 'maintenance'

        let status = 'dirty'
        if (blocked) status = 'maintenance'
        else if (cond === 'clean' || cond === 'inspected') status = 'clean'
        else if (cond === 'dirty') status = 'dirty'
        else status = String(room.housekeepingStatus ?? 'dirty').toLowerCase()

        const resAtiva = hospedeAtualInHouse || reservaEntrandoHoje || reservaAtivaSobreposta || reservaSaindoHoje
        const guestName = resAtiva
          ? `${resAtiva.guestFirstName ?? ''} ${resAtiva.guestLastName ?? ''}`.trim() || 'Hóspede'
          : 'Quarto Vazio'
        const pax = resAtiva ? resAtiva.numberOfGuests || 0 : 0
        const pendingAmount = resAtiva
          ? (() => {
              const v = parseFloat(String(resAtiva.balanceDue ?? resAtiva.balance ?? 0))
              return Number.isFinite(v) && v > 0 ? Number(v.toFixed(2)) : 0
            })()
          : 0
        const hasPendingPayment = pendingAmount > 0
        // Docs completos se qualquer identificação estiver preenchida:
        // documento (passaporte/RG), taxID (CPF) ou tipo de documento cadastrado.
        // Cloudbeds só popula guestDocumentNumber quando digitado manualmente;
        // reservas de OTAs (Booking, Expedia) usam apenas taxID/CPF ou country.
        const docNum = String(resAtiva?.guestDocumentNumber ?? '').trim()
        const docType = String(resAtiva?.guestDocumentType ?? '').trim().replace(/^-$/, '')
        const taxId = String(resAtiva?.guestTaxID ?? '').trim()
        let hasPendingDocs = resAtiva
          ? !(docNum || taxId || docType)
          : false
        // Regra customizada: se a reserva está confirmada e sem saldo pendente,
        // consideramos a documentação liberada (ignora alerta falso do Cloudbeds).
        const statusReserva = String(resAtiva?.status ?? '').toLowerCase()
        if (
          hasPendingDocs &&
          (statusReserva === 'confirmed' || statusReserva === 'checked_in') &&
          pendingAmount <= 0
        ) {
          hasPendingDocs = false
        }


        // Hora estimada de chegada (do check-in online do hóspede no Cloudbeds).
        // Extrai HH:MM sem converter fuso — Cloudbeds retorna hora local do hotel.
        const formatHora = (v: unknown): string => {
          if (v === null || v === undefined) return ''
          const s = String(v).trim()
          if (!s) return ''
          if (s.includes('T')) {
            const parte = s.split('T')[1]
            if (parte && parte.length >= 5) return parte.substring(0, 5)
          }
          const hm = s.match(/(\d{1,2}):(\d{2})/)
          if (hm) return `${hm[1].padStart(2, '0')}:${hm[2]}`
          return ''
        }
        const arrivalTime = resAtiva
          ? formatHora(
              (resAtiva as any).estimatedArrivalTime ??
                (resAtiva as any).estimatedTimeArrival ??
                (resAtiva as any).arrivalTime ??
                (resAtiva as any).checkInTime,
            ) || null
          : null

        // ECI (Early Check-In) e LCO (Late Check-Out): Cloudbeds registra esses
        // "bloqueios temporários" como tags/observações na reserva. Varremos os
        // campos textuais buscando as siglas com word-boundary (case-insensitive).
        const eciLcoScan = (() => {
          if (!resAtiva) return { eci: false, lco: false, eciTime: null as string | null, lcoTime: null as string | null }
          const parts: string[] = []
          const push = (v: unknown) => { if (v) parts.push(String(v)) }
          const r: any = resAtiva
          push(r.specialRequests); push(r.notes); push(r.reservationNotes)
          push(r.guestComments); push(r.comments); push(r.sourceName)
          push(r.thirdPartyIdentifier); push(r.customFieldsText)
          if (Array.isArray(r.customFields)) {
            for (const cf of r.customFields) { push(cf?.value); push(cf?.name) }
          }
          if (Array.isArray(r.notesList)) {
            for (const n of r.notesList) push(typeof n === 'string' ? n : n?.note ?? n?.text)
          }
          const blob = parts.join(' | ')
          // Extrai horário próximo à sigla: "LCO 16h", "LCO 16:00", "LCO às 16", "ECI 10hs"
          const extractTime = (sigla: 'ECI' | 'LCO'): string | null => {
            const re = new RegExp(`\\b${sigla}\\b[^0-9]{0,10}(\\d{1,2})(?:[:h.]\\s*(\\d{2}))?`, 'i')
            const m = blob.match(re)
            if (!m) return null
            const hh = Math.min(23, parseInt(m[1], 10))
            const mm = m[2] ? Math.min(59, parseInt(m[2], 10)) : 0
            return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
          }
          const eci = /\bECI\b/i.test(blob)
          const lco = /\bLCO\b/i.test(blob)
          return {
            eci,
            lco,
            eciTime: eci ? extractTime('ECI') : null,
            lcoTime: lco ? extractTime('LCO') : null,
          }
        })()

        return {
          property: nomeUnidade,
          room_number: numQuarto,
          room_type: String(room.roomTypeName ?? room.roomType ?? ''),
          status,
          condition: blocked ? 'maintenance' : 'normal',
          assigned_task: tarefaSugerida,
          color_code: corLegenda,
          guest_name: guestName,
          pax,
          has_pending_payment: hasPendingPayment,
          pending_payment_amount: pendingAmount,
          has_pending_docs: hasPendingDocs,
          blink_troca: blinkTroca,
          arrival_time: arrivalTime,
          has_eci: eciLcoScan.eci,
          has_lco: eciLcoScan.lco,
          eci_time: eciLcoScan.eciTime,
          lco_time: eciLcoScan.lcoTime,
        }


      })

      return { quartos, dashboard: dashJson, reservas }
    }



    const [ipanema, botafogo] = await Promise.all([
      processarPropriedade(apiKeyIpanema, 'Ipanema'),
      processarPropriedade(apiKeyBotafogo, 'Botafogo'),
    ])

    const nowIso = new Date().toISOString()

    // Normalização de número de quarto: banco local grava "APT 001",
    // Cloudbeds retorna "001". Padroniza para "APT xxx" para que o mapa
    // de preservação encontre o registro existente.
    const normalizarNumero = (num: string) => {
      const clean = String(num ?? '').trim()
      if (!clean) return clean
      return clean.toUpperCase().startsWith('APT ') ? clean : `APT ${clean}`
    }

    const consolidados = [...ipanema.quartos, ...botafogo.quartos].map((q) => ({
      ...q,
      room_number: normalizarNumero(q.room_number),
    }))

    // Busca status/condition atuais para preservar o que as camareiras marcaram no app.
    // O app é a fonte da verdade do status de limpeza; Cloudbeds só alimenta dados de reserva.
    const { data: existentes } = await supabaseClient
      .from('room_housekeeping')
      .select('property, room_number, status, condition')

    const mapaExistente = new Map<string, { status: string | null; condition: string | null }>()
    for (const r of existentes ?? []) {
      mapaExistente.set(`${r.property}::${normalizarNumero(r.room_number)}`, {
        status: r.status,
        condition: r.condition,
      })
    }

    // Aplica preservação ANTES das métricas — os valores finais gravados
    // no banco são a fonte da verdade para os contadores da Gestão.
    // REGRA: `status` (limpeza) é do app (camareiras marcam limpo/sujo/em limpeza).
    // `condition` (bloqueio/manutenção) SEMPRE vem do Cloudbeds — é a fonte da verdade.
    const finais = consolidados
      .filter((q) => q.room_number)
      .map((q) => {
        const key = `${q.property}::${q.room_number}`
        const atual = mapaExistente.get(key)
        const preservarStatus = atual ? atual.status ?? q.status : q.status
        // condition sempre do Cloudbeds — sem preservação local
        return { ...q, status: preservarStatus, condition: q.condition }
      })


    // Métricas do dashboard — usa os valores FINAIS (já preservados) do banco,
    // nunca o status bruto do Cloudbeds.
    for (const [unidade, dados] of [
      ['Ipanema', ipanema] as const,
      ['Botafogo', botafogo] as const,
    ]) {
      const d = dados.dashboard?.data ?? {}
      console.log(`[consolidar-dados] dashboard ${unidade} keys:`, Object.keys(d))

      const quartosUnidade = finais.filter((q) => q.property === unidade)
      const limpos = quartosUnidade.filter((q) => q.status === 'clean').length
      const sujos = quartosUnidade.filter((q) => q.status === 'dirty').length
      const manut = quartosUnidade.filter((q) => q.status === 'maintenance').length
      const total = quartosUnidade.length

      // Reservas ativas hoje (check-in <= hoje < check-out) ou já em check-in
      const reservasAtivas = (dados.reservas ?? []).filter((r: any) => {
        const s = String(r.status ?? '').toLowerCase()
        if (s === 'canceled' || s === 'cancelled' || s === 'no_show') return false
        const ci = String(r.checkInDate ?? r.startDate ?? '').slice(0, 10)
        const co = String(r.checkOutDate ?? r.endDate ?? '').slice(0, 10)
        if (s === 'checked_in') return !co || co >= hojeStr
        if (ci && co) return ci <= hojeStr && co >= hojeStr
        return ci === hojeStr
      })

      // Ocupação: prefere dashboard, senão calcula do estoque de quartos
      const ocupados = reservasAtivas.filter((r: any) => String(r.status).toLowerCase() === 'checked_in').length
      const ocupacaoDash = parseFloat(
        d.percentageOccupied ?? d.occupancy ?? d.occupancyPercentage ?? 'NaN',
      )
      const ocupacao = Number.isFinite(ocupacaoDash) && ocupacaoDash > 0
        ? ocupacaoDash
        : total > 0 ? (ocupados / total) * 100 : 0

      // Disponíveis para venda: limpos e não bloqueados; fallback do dashboard se houver
      const dashAvail = parseInt(String(d.roomsAvailable ?? d.availableRooms ?? '0'), 10)
      const availableRooms = dashAvail > 0 ? dashAvail : Math.max(limpos - manut, 0)

      // Saldo pendente: soma de balanceDue das reservas ativas
      const pendingBalance = reservasAtivas.reduce((sum: number, r: any) => {
        const v = parseFloat(String(r.balanceDue ?? r.balance ?? 0))
        return sum + (Number.isFinite(v) && v > 0 ? v : 0)
      }, 0)

      // Docs pendentes: usa a mesma regra aplicada aos quartos (após validação de
      // reserva confirmada + saldo zero), garantindo consistência com os badges.
      const pendingDocs = quartosUnidade.filter((q) => q.has_pending_docs === true).length

      // Nota de avaliação (Cloudbeds Guest Reviews) — homologação: valores fixos por unidade
      const ratingUnidade = unidade === 'Botafogo' ? 8.6 : 7.8

      await supabaseClient.from('hotel_metrics').upsert(
        {
          property: unidade,
          date: hojeStr,
          occupancy_percentage: Number(ocupacao.toFixed(2)),
          clean_rooms: limpos,
          dirty_rooms: sujos,
          maintenance_rooms: manut,
          pending_balance: Number(pendingBalance.toFixed(2)),
          available_rooms: availableRooms,
          pending_docs_count: pendingDocs,
          rating: ratingUnidade,
          updated_at: nowIso,
        },
        { onConflict: 'property,date' },
      )
    }

    for (const q of finais) {
      await supabaseClient.from('room_housekeeping').upsert(
        { ...q, updated_at: nowIso },
        { onConflict: 'property,room_number' },
      )
    }


    return new Response(
      JSON.stringify({ success: true, count: consolidados.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
