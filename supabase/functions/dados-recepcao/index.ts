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

    const [reservasJson, hkJson] = await Promise.all([
      cb(
        `/getReservations?checkInFrom=${hoje}&checkInTo=${hoje}&includeGuestsDetails=true`,
        apiKey,
      ),
      cb(`/getHousekeepingStatus`, apiKey),
    ])

    console.log(`[dados-recepcao] ${propriedade} sample:`, JSON.stringify((reservasJson?.data ?? [])[0] ?? {}).slice(0, 1500))
    void 0; //

    // Map de status de limpeza por número de quarto
    const limpezaPorQuarto: Record<string, 'Limpo' | 'Sujo' | 'Em Limpeza'> = {}
    const hkList = hkJson?.data ?? []
    if (Array.isArray(hkList)) {
      for (const room of hkList) {
        const num = String(room.roomName ?? room.roomNumber ?? '').trim()
        if (!num) continue
        const cond = String(room.roomCondition ?? '').toLowerCase()
        if (cond === 'clean' || cond === 'inspected') limpezaPorQuarto[num] = 'Limpo'
        else if (cond === 'dirty') limpezaPorQuarto[num] = 'Sujo'
        else limpezaPorQuarto[num] = 'Em Limpeza'
      }
    }

    if (!reservasJson?.success) {
      console.error(`[dados-recepcao] Cloudbeds ${propriedade}:`, reservasJson)
      return new Response(JSON.stringify({ success: false, data: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const ativos = (reservasJson.data ?? []).filter((r: any) => {
      const s = String(r.status ?? '').toLowerCase()
      return s !== 'canceled' && s !== 'cancelled' && s !== 'no_show'
    })

    const listaFormatada = ativos.map((res: any) => {
      const mainGuestId = res.guestID
      const g = res.guestList?.[mainGuestId] ?? Object.values(res.guestList ?? {})[0] ?? {}
      const assignedRooms: any[] = Array.isArray(g.rooms) ? g.rooms : []
      const unassignedRooms: any[] = Array.isArray(g.unassignedRooms) ? g.unassignedRooms : []
      const roomInfo = assignedRooms[0] ?? unassignedRooms[0] ?? {}
      const quarto = String(
        roomInfo.roomName ?? roomInfo.roomNumber ?? roomInfo.assignedRoomNumber ?? "S/Q",
      )
      const tipoQuarto = roomInfo.roomTypeName || "Não Alocado"

      const nome = `${g.guestFirstName ?? ''} ${g.guestLastName ?? ''}`.trim() ||
        res.guestName || "Hóspede"

      const docFaltando = !g.guestDocumentNumber || !g.guestCountry
      const pax = parseInt(res.adults || 1, 10) + parseInt(res.children || 0, 10)
      const saidaISO = res.endDate || roomInfo.roomCheckOut

      return {
        id: res.reservationID ?? res.reservationId,
        quarto,
        tipoQuarto,
        unidade: propriedade,
        hospede: nome,
        pax,
        chegadaHora: res.estimatedArrivalTime || "14:00",
        dataSaida: saidaISO ? String(saidaISO).split('-').reverse().join('/') : "--/--/----",
        pagamentoPendente: parseFloat(res.balance ?? res.balanceDue ?? 0) > 0,
        docPendente: docFaltando,
        statusCheckin: String(res.status).toLowerCase() === 'checked_in' ? 'Realizado' : 'Aguardando',
        statusLimpeza: limpezaPorQuarto[quarto] ?? 'Em Limpeza',
      }
    })

    return new Response(JSON.stringify({ success: true, data: listaFormatada }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
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
