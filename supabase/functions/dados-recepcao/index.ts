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

    const [reservasJson, hkJson] = await Promise.all([
      cb(
        `/getReservations?checkInFrom=${janelaInicio}&checkInTo=${janelaFim}&includeGuestsDetails=true&pageSize=500`,
        apiKey,
      ),
      cb(`/getHousekeepingStatus`, apiKey),
    ])

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

    // Reservas ativas do dia agrupadas por quarto
    const reservasPorQuarto: Record<string, any> = {}
    if (reservasJson?.success) {
      const ativos = (reservasJson.data ?? []).filter((r: any) => {
        const s = String(r.status ?? '').toLowerCase()
        if (s === 'canceled' || s === 'cancelled' || s === 'no_show') return false
        // Estadia ativa hoje: check-in <= hoje < check-out, OU já em check_in
        const ci = String(r.startDate ?? r.checkInDate ?? '').slice(0, 10)
        const co = String(r.endDate ?? r.checkOutDate ?? '').slice(0, 10)
        if (s === 'checked_in') return !co || co >= hoje
        if (ci && co) return ci <= hoje && co >= hoje
        return ci === hoje
      })

      for (const res of ativos) {
        const mainGuestId = res.guestID
        const g = res.guestList?.[mainGuestId] ?? Object.values(res.guestList ?? {})[0] ?? {}
        const assignedRooms: any[] = Array.isArray(g.rooms) ? g.rooms : []
        const unassignedRooms: any[] = Array.isArray(g.unassignedRooms) ? g.unassignedRooms : []
        const roomInfo = assignedRooms[0] ?? unassignedRooms[0] ?? {}
        const quarto = String(
          roomInfo.roomName ?? roomInfo.roomNumber ?? roomInfo.assignedRoomNumber ?? '',
        ).trim()
        if (!quarto) continue

        const nome = `${g.guestFirstName ?? ''} ${g.guestLastName ?? ''}`.trim() ||
          res.guestName || 'Hóspede'
        const docFaltando = !g.guestDocumentNumber || !g.guestCountry
        const pax = parseInt(res.adults || 1, 10) + parseInt(res.children || 0, 10)
        const saidaISO = res.endDate || roomInfo.roomCheckOut
        const status = String(res.status ?? '').toLowerCase()

        const registro = {
          id: res.reservationID ?? res.reservationId,
          tipoQuartoReserva: roomInfo.roomTypeName || '',
          hospede: nome,
          pax,
          chegadaHora: res.estimatedArrivalTime || '14:00',
          dataSaida: saidaISO ? String(saidaISO).split('-').reverse().join('/') : '--/--/----',
          pagamentoPendente: parseFloat(res.balance ?? res.balanceDue ?? 0) > 0,
          docPendente: docFaltando,
          statusCheckin: status === 'checked_in' ? 'Realizado' : 'Aguardando',
          checkedIn: status === 'checked_in',
        }

        // Se houver mais de uma reserva no mesmo quarto, prioriza a que já fez check-in
        const existente = reservasPorQuarto[quarto]
        if (!existente || (registro.checkedIn && !existente.checkedIn)) {
          reservasPorQuarto[quarto] = registro
        }
      }
    } else if (reservasJson) {
      console.error(`[dados-recepcao] Cloudbeds reservas ${propriedade}:`, reservasJson)
    }

    // Monta lista final: TODOS os quartos físicos, com dados da reserva quando existir
    const listaFormatada = Object.values(quartosFisicos).map((hk) => {
      const r = reservasPorQuarto[hk.quarto]
      let ocupacao: 'Livre' | 'Ocupado' | 'Bloqueado' = 'Livre'
      if (hk.bloqueado) ocupacao = 'Bloqueado'
      else if (r?.checkedIn) ocupacao = 'Ocupado'

      return {
        id: r?.id ?? `room-${propriedade}-${hk.quarto}`,
        quarto: hk.quarto,
        tipoQuarto: r?.tipoQuartoReserva || hk.tipoQuarto,
        unidade: propriedade,
        statusLimpeza: hk.statusLimpeza,
        ocupacao,
        hospede: r?.hospede ?? '',
        pax: r?.pax ?? 0,
        chegadaHora: r?.chegadaHora ?? '',
        dataSaida: r?.dataSaida ?? '',
        pagamentoPendente: r?.pagamentoPendente ?? false,
        docPendente: r?.docPendente ?? false,
        statusCheckin: r?.statusCheckin ?? 'Aguardando',
        temReserva: Boolean(r),
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
