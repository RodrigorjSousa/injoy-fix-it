import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apiKey, content-type',
}

const API_BASE = "https://hotels.cloudbeds.com/api/v1.2"

async function cb(path: string, apiKey: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const raw = await res.text()
  try {
    return JSON.parse(raw)
  } catch {
    console.error(`[dados-recepcao] non-JSON ${path}:`, raw.slice(0, 500))
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const propriedade = url.searchParams.get('property')
    if (!propriedade) throw new Error("Propriedade não especificada.")

    const apiKey = propriedade === 'Ipanema'
      ? Deno.env.get('CLOUDBEDS_API_KEY_IPANEMA')
      : Deno.env.get('CLOUDBEDS_API_KEY_BOTAFOGO')
    if (!apiKey) throw new Error(`Chave de API para ${propriedade} não configurada.`)

    const hoje = new Date().toISOString().split('T')[0]
    // Janela ampla para pegar hóspedes já hospedados (check-in em dias anteriores)
    const janelaInicio = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]
    const janelaFim = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    // Cloudbeds limita pageSize a 100. Sem paginação, hóspedes de estadia longa
    // (checkin > 100 reservas atrás) somem da lista e o quarto aparece como Livre.
    const fetchReservasPag = async (
      page: number,
      from: string,
      to: string,
      statusFilter = '',
    ) =>
      cb(
        `/getReservations?checkInFrom=${from}&checkInTo=${to}` +
          `&includeGuestsDetails=true&pageSize=100&pageNumber=${page}${statusFilter}`,
        apiKey,
      )

    const fetchTodasReservas = async (from: string, to: string, statusFilter = '') => {
      const p1 = await fetchReservasPag(1, from, to, statusFilter)
      if (!p1?.success) return [] as any[]
      const total = Number(p1.total ?? p1.count ?? 0)
      const acc: any[] = Array.isArray(p1.data) ? [...p1.data] : []
      const totalPaginas = Math.min(Math.ceil(total / 100), 50)
      if (totalPaginas > 1) {
        const rest = await Promise.all(
          Array.from({ length: totalPaginas - 1 }, (_, i) =>
            fetchReservasPag(i + 2, from, to, statusFilter),
          ),
        )
        for (const p of rest) {
          if (p?.success && Array.isArray(p.data)) acc.push(...p.data)
        }
      }
      return acc
    }

    const janelaLonga = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    // Cliente Supabase para ler o painel das camareiras (fonte de verdade da limpeza)
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const fetchRoomHousekeeping = async () => {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [] as any[]
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/room_housekeeping?property=eq.${encodeURIComponent(propriedade)}&select=room_number,status,condition,assigned_task,blink_troca,service_status,assigned_camareira`,
          {
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
          },
        )
        if (!res.ok) return []
        return (await res.json()) as any[]
      } catch (e) {
        console.error('[dados-recepcao] erro room_housekeeping:', e)
        return []
      }
    }

    const [reservasWindow, reservasCheckedIn, hkJson, camareiraRows] = await Promise.all([
      fetchTodasReservas(janelaInicio, janelaFim),
      fetchTodasReservas(janelaLonga, janelaFim, '&status=checked_in'),
      cb(`/getHousekeepingStatus`, apiKey),
      fetchRoomHousekeeping(),
    ])

    // Deduplica reservas
    const mapaReservas = new Map<string, any>()
    for (const r of [...reservasWindow, ...reservasCheckedIn]) {
      const id = String(r?.reservationID ?? r?.reservationId ?? r?.id ?? '')
      if (!id) continue
      if (!mapaReservas.has(id)) mapaReservas.set(id, r)
    }
    const todasReservas = Array.from(mapaReservas.values())
    const reservasJson = { success: true, data: todasReservas }

    // Índice do painel das camareiras por número normalizado (só dígitos)
    const normalizeKey = (v: string) => {
      const digits = String(v ?? '').replace(/\D+/g, '')
      return digits ? digits.replace(/^0+/, '') || '0' : String(v ?? '').trim().toUpperCase()
    }
    type CamareiraInfo = {
      status: 'Limpo' | 'Sujo' | 'Em Limpeza'
      assignedTask: string | null
      blinkTroca: boolean
      serviceStatus: string | null
      assignedCamareira: string | null
    }
    const camareiraPorQuarto: Record<string, CamareiraInfo> = {}
    for (const row of camareiraRows ?? []) {
      const key = normalizeKey(row?.room_number ?? '')
      if (!key) continue
      const st = String(row?.status ?? '').toLowerCase()
      let statusLimpeza: 'Limpo' | 'Sujo' | 'Em Limpeza' = 'Em Limpeza'
      if (st === 'clean' || st === 'limpo' || st === 'inspected') statusLimpeza = 'Limpo'
      else if (st === 'dirty' || st === 'sujo') statusLimpeza = 'Sujo'
      else if (st === 'in_progress' || st === 'em_limpeza' || st === 'em limpeza') statusLimpeza = 'Em Limpeza'
      camareiraPorQuarto[key] = {
        status: statusLimpeza,
        assignedTask: row?.assigned_task ?? null,
        blinkTroca: row?.blink_troca === true,
        serviceStatus: row?.service_status ?? null,
        assignedCamareira: row?.assigned_camareira ?? null,
      }
    }


    // Mapa de todos os quartos físicos a partir do housekeeping
    type HKRoom = {
      quarto: string
      tipoQuarto: string
      statusLimpeza: 'Limpo' | 'Sujo' | 'Em Limpeza'
      bloqueado: boolean
    }
    const quartosFisicos: Record<string, HKRoom> = {}
    const hkList = hkJson?.data ?? []
    if (Array.isArray(hkList)) {
      for (const room of hkList) {
        const num = String(room.roomName ?? room.roomNumber ?? '').trim()
        if (!num) continue
        const cond = String(room.roomCondition ?? '').toLowerCase()
        let statusLimpeza: 'Limpo' | 'Sujo' | 'Em Limpeza' = 'Em Limpeza'
        if (cond === 'clean' || cond === 'inspected') statusLimpeza = 'Limpo'
        else if (cond === 'dirty') statusLimpeza = 'Sujo'
        const bloqueado =
          room.roomBlocked === true ||
          room.roomBlocked === 'true' ||
          room.roomBlocked === 1 ||
          String(room.roomBlocked ?? '').toLowerCase() === 'yes' ||
          String(room.roomOutOfService ?? '').toLowerCase() === 'yes'
        quartosFisicos[num] = {
          quarto: num,
          tipoQuarto: room.roomTypeName || room.roomType || 'Standard',
          statusLimpeza,
          bloqueado,
        }
      }
    }

    // Reservas ativas do dia agrupadas por quarto — separando hóspede atual (in-house) e próximo (chegando hoje)
    const reservasPorQuarto: Record<string, { atual?: any; proximo?: any }> = {}
    if (reservasJson?.success) {
      const ativos = (reservasJson.data ?? []).filter((r: any) => {
        const s = String(r.status ?? '').toLowerCase()
        if (s === 'canceled' || s === 'cancelled' || s === 'no_show') return false
        const ci = String(r.startDate ?? r.checkInDate ?? '').slice(0, 10)
        const co = String(r.endDate ?? r.checkOutDate ?? '').slice(0, 10)
        if (s === 'checked_in') return !co || co >= hoje
        if (ci && co) return ci <= hoje && co >= hoje
        return ci === hoje
      })

      for (const res of ativos) {
        const guestListObj = res.guestList ?? {}
        const guestsAll: any[] = Object.values(guestListObj)
        const mainGuestId = res.guestID
        const mainGuest = guestListObj?.[mainGuestId] ?? guestsAll[0] ?? {}

        // Expande TODOS os quartos citados por qualquer hóspede da reserva.
        // Reservas multi-quarto (ex.: mesma pessoa aluga 107 + 109) precisam
        // gerar uma entrada por quarto, senão o segundo aparece como Livre.
        const roomsMap = new Map<string, any>()
        for (const gg of guestsAll.length ? guestsAll : [mainGuest]) {
          const assigned: any[] = Array.isArray(gg?.rooms) ? gg.rooms : []
          const unassigned: any[] = Array.isArray(gg?.unassignedRooms) ? gg.unassignedRooms : []
          for (const info of [...assigned, ...unassigned]) {
            const num = String(
              info?.roomName ?? info?.roomNumber ?? info?.assignedRoomNumber ?? '',
            ).trim()
            if (num && !roomsMap.has(num)) roomsMap.set(num, info)
          }
        }
        if (roomsMap.size === 0) continue

        for (const [quarto, roomInfo] of roomsMap.entries()) {
        // Hóspede exibido no quarto: primeiro guest cujas rooms contêm esse quarto,
        // fallback para o principal (reservas sem split explícito).
        const g = guestsAll.find((gg: any) => {
          const rs: any[] = [
            ...(Array.isArray(gg?.rooms) ? gg.rooms : []),
            ...(Array.isArray(gg?.unassignedRooms) ? gg.unassignedRooms : []),
          ]
          return rs.some((info) =>
            String(info?.roomName ?? info?.roomNumber ?? info?.assignedRoomNumber ?? '').trim() === quarto,
          )
        }) ?? mainGuest

        const nome = `${g.guestFirstName ?? ''} ${g.guestLastName ?? ''}`.trim() ||
          res.guestName || 'Hóspede'
        const docFaltando = !g.guestDocumentNumber || !g.guestCountry
        const paxNoQuarto = guestsAll.filter((gg: any) => {
          const rs: any[] = [
            ...(Array.isArray(gg?.rooms) ? gg.rooms : []),
            ...(Array.isArray(gg?.unassignedRooms) ? gg.unassignedRooms : []),
          ]
          return rs.some((info) =>
            String(info?.roomName ?? info?.roomNumber ?? info?.assignedRoomNumber ?? '').trim() === quarto,
          )
        }).length
        const totalReserva = (parseInt(res.adults || 1, 10) || 0) + (parseInt(res.children || 0, 10) || 0)
        const pax = paxNoQuarto > 0 ? paxNoQuarto : totalReserva
        const saidaISO = res.endDate || roomInfo.roomCheckOut
        const status = String(res.status ?? '').toLowerCase()

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

        const isCheckedIn = status === 'checked_in'
        const horaChegada = isCheckedIn
          ? formatHora(
              res.checkInTime ??
                res.checkinTime ??
                res.checkedInDate ??
                res.dateCheckedIn ??
                res.startDate,
            ) || formatHora(res.estimatedArrivalTime) || '--:--'
          : formatHora(res.estimatedArrivalTime) || 'A definir'

        const startISO = String(res.startDate ?? res.checkInDate ?? '').slice(0, 10)
        const endISO = String(res.endDate ?? res.checkOutDate ?? '').slice(0, 10)
        const emCasa = isCheckedIn || (!!startISO && startISO < hoje && (!endISO || endISO > hoje))

        const registro = {
          id: res.reservationID ?? res.reservationId,
          tipoQuartoReserva: roomInfo.roomTypeName || '',
          hospede: nome,
          pax,
          chegadaHora: horaChegada,
          dataSaida: saidaISO ? String(saidaISO).split('-').reverse().join('/') : '--/--/----',
          pagamentoPendente: parseFloat(res.balance ?? res.balanceDue ?? 0) > 0,
          pagamentoValor: (() => {
            const v = parseFloat(res.balance ?? res.balanceDue ?? 0)
            return Number.isFinite(v) && v > 0 ? Number(v.toFixed(2)) : 0
          })(),
          docPendente: docFaltando,
          statusCheckin: emCasa ? 'Realizado' : 'Aguardando',
          checkedIn: emCasa,
          startISO,
          chegadaHoje: startISO === hoje,
        }

        const bucket = reservasPorQuarto[quarto] ?? {}
        if (emCasa) {
          // hóspede atual (in-house). Se houver conflito, mantém o já registrado.
          if (!bucket.atual) bucket.atual = registro
        } else if (registro.chegadaHoje) {
          // próximo hóspede (chega hoje mas ainda não fez check-in)
          if (!bucket.proximo) bucket.proximo = registro
        } else {
          // fallback (raro): reserva ativa que não é in-house nem chegada hoje
          if (!bucket.atual && !bucket.proximo) bucket.proximo = registro
        }
        reservasPorQuarto[quarto] = bucket
        }
      }

    } else if (reservasJson) {
      console.error(`[dados-recepcao] Cloudbeds reservas ${propriedade}:`, reservasJson)
    }

    // Monta lista final: TODOS os quartos físicos, com dados da reserva quando existir
    const listaFormatada = Object.values(quartosFisicos).map((hk) => {
      const bucket = reservasPorQuarto[hk.quarto] ?? {}
      const r = bucket.atual ?? bucket.proximo
      const prox = bucket.atual ? bucket.proximo : undefined
      const cam = camareiraPorQuarto[normalizeKey(hk.quarto)]
      const statusLimpeza = cam?.status ?? hk.statusLimpeza

      let ocupacao: 'Livre' | 'Ocupado' | 'Bloqueado' = 'Livre'
      if (hk.bloqueado) ocupacao = 'Bloqueado'
      else if (bucket.atual?.checkedIn) ocupacao = 'Ocupado'

      return {
        id: r?.id ?? `room-${propriedade}-${hk.quarto}`,
        quarto: hk.quarto,
        tipoQuarto: r?.tipoQuartoReserva || hk.tipoQuarto,
        unidade: propriedade,
        statusLimpeza,
        assignedTask: cam?.assignedTask ?? null,
        blinkTroca: cam?.blinkTroca ?? false,
        serviceStatus: cam?.serviceStatus ?? null,
        assignedCamareira: cam?.assignedCamareira ?? null,
        ocupacao,
        hospede: r?.hospede ?? '',
        pax: r?.pax ?? 0,
        chegadaHora: r?.chegadaHora ?? '',
        dataSaida: r?.dataSaida ?? '',
        pagamentoPendente: r?.pagamentoPendente ?? false,
        pagamentoValor: r?.pagamentoValor ?? 0,
        docPendente: r?.docPendente ?? false,
        statusCheckin: r?.statusCheckin ?? 'Aguardando',
        temReserva: Boolean(r),
        // Próximo hóspede (quando há hóspede atual in-house e outra reserva chegando hoje)
        proximoHospede: prox?.hospede ?? '',
        proximoChegadaHora: prox?.chegadaHora ?? '',
        proximoPax: prox?.pax ?? 0,
        proximoPagamentoPendente: prox?.pagamentoPendente ?? false,
        proximoPagamentoValor: prox?.pagamentoValor ?? 0,
        proximoDocPendente: prox?.docPendente ?? false,
        temProximoHospede: Boolean(prox),
      }
    })

    // Ordena por número do quarto
    listaFormatada.sort((a, b) => {
      const na = parseInt(a.quarto, 10)
      const nb = parseInt(b.quarto, 10)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      return a.quarto.localeCompare(b.quarto)
    })

    return new Response(JSON.stringify({ success: true, data: listaFormatada }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }
})
