import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apiKey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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

      const [roomsRes, resRes, dashRes] = await Promise.all([
        fetch('https://hotels.cloudbeds.com/api/v1.2/getHousekeepingStatus', {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
        fetch(
          `https://hotels.cloudbeds.com/api/v1.2/getReservations?checkInFrom=${janelaInicio}&checkInTo=${janelaFim}&includeGuestsDetails=true&pageSize=500`,
          { headers: { Authorization: `Bearer ${apiKey}` } },
        ),
        fetch('https://hotels.cloudbeds.com/api/v1.2/getDashboard', {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
      ])

      const roomsJson = await roomsRes.json().catch(() => ({}))
      const resJson = await resRes.json().catch(() => ({}))
      const dashJson = await dashRes.json().catch(() => ({}))

      const houseData = roomsJson?.data
      const todosQuartos: any[] = Array.isArray(houseData)
        ? houseData
        : Array.isArray(houseData?.rooms)
          ? houseData.rooms
          : []
      const reservasRaw: any[] = resJson?.success ? resJson.data ?? [] : []

      // Normaliza reservas: extrai hóspede principal + número do quarto atribuído
      const reservas = reservasRaw.map((r: any) => {
        const mainGuestId = r.guestID
        const g = r.guestList?.[mainGuestId] ?? Object.values(r.guestList ?? {})[0] ?? {}
        const assignedRooms: any[] = Array.isArray(g.rooms) ? g.rooms : []
        const unassignedRooms: any[] = Array.isArray(g.unassignedRooms) ? g.unassignedRooms : []
        const roomInfo = assignedRooms[0] ?? unassignedRooms[0] ?? {}
        const roomNumber = String(
          roomInfo.roomName ?? roomInfo.roomNumber ?? roomInfo.assignedRoomNumber ?? '',
        ).trim()
        const checkInDate = String(r.startDate ?? r.checkInDate ?? '').slice(0, 10)
        const checkOutDate = String(r.endDate ?? r.checkOutDate ?? '').slice(0, 10)
        const guestFirstName = g.guestFirstName ?? ''
        const guestLastName = g.guestLastName ?? ''
        const guestDocumentNumber = g.guestDocumentNumber ?? r.guestDocumentNumber ?? ''
        const guestDocumentType = g.guestDocumentType ?? ''
        const guestTaxID = g.taxID ?? r.taxID ?? ''
        const guestCountry = g.guestCountry ?? r.guestCountry ?? ''
        const numberOfGuests = (parseInt(r.adults ?? 1, 10) || 0) + (parseInt(r.children ?? 0, 10) || 0)
        return {
          ...r,
          _roomNumber: roomNumber,
          _checkInDate: checkInDate,
          _checkOutDate: checkOutDate,
          guestFirstName,
          guestLastName,
          guestDocumentNumber,
          guestDocumentType,
          guestTaxID,
          guestCountry,
          numberOfGuests,
        }

      }).filter((r: any) => {
        const s = String(r.status ?? '').toLowerCase()
        return s !== 'canceled' && s !== 'cancelled' && s !== 'no_show'
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
            String(r.status).toLowerCase() !== 'checked_out',
        )
        const hospedeAtualInHouse = reservas.find(
          (r: any) =>
            r._roomNumber === numQuarto &&
            String(r.status).toLowerCase() === 'checked_in' &&
            (!r._checkOutDate || r._checkOutDate > hojeStr),
        )

        let tarefaSugerida = 'VERIFICAÇÃO'
        let corLegenda = 'CINZA'

        if (reservaSaindoHoje && reservaEntrandoHoje) {
          tarefaSugerida = 'GERAL - CHECK-IN'
          corLegenda = 'CINZA'
        } else if (reservaSaindoHoje && !reservaEntrandoHoje) {
          tarefaSugerida = 'GERAL'
          corLegenda = 'CINZA'
        } else if (hospedeAtualInHouse) {
          corLegenda = 'VERDE'
          const dataCheckin = new Date(hospedeAtualInHouse._checkInDate)
          const dataHoje = new Date(hojeStr)
          const diferencaDias = Math.floor(
            (dataHoje.getTime() - dataCheckin.getTime()) / (1000 * 60 * 60 * 24),
          )
          tarefaSugerida =
            diferencaDias > 0 && diferencaDias % 3 === 0 ? 'TROCA' : 'ARRUMAÇÃO'
        } else if (!hospedeAtualInHouse && reservaEntrandoHoje) {
          tarefaSugerida = 'REVISÃO'
          const temPendencia =
            parseFloat(reservaEntrandoHoje.balanceDue ?? reservaEntrandoHoje.balance ?? 0) > 0 ||
            !reservaEntrandoHoje.guestDocumentNumber
          corLegenda = temPendencia ? 'AZUL FRACO' : 'AZUL FORTE'
        } else if (String(room.housekeepingStatus ?? '').toLowerCase() === 'dirty') {
          tarefaSugerida = 'ARRUMAÇÃO'
        }

        const cond = String(room.roomCondition ?? '').toLowerCase()
        const blocked =
          room.roomBlocked === true || cond === 'out_of_service' || cond === 'maintenance'

        let status = 'dirty'
        if (blocked) status = 'maintenance'
        else if (cond === 'clean' || cond === 'inspected') status = 'clean'
        else if (cond === 'dirty') status = 'dirty'
        else status = String(room.housekeepingStatus ?? 'dirty').toLowerCase()

        const resAtiva = hospedeAtualInHouse || reservaEntrandoHoje || reservaSaindoHoje
        const guestName = resAtiva
          ? `${resAtiva.guestFirstName ?? ''} ${resAtiva.guestLastName ?? ''}`.trim() || 'Hóspede'
          : 'Quarto Vazio'
        const pax = resAtiva ? resAtiva.numberOfGuests || 0 : 0
        const hasPendingPayment = resAtiva
          ? parseFloat(String(resAtiva.balanceDue ?? resAtiva.balance ?? 0)) > 0
          : false
        // Docs completos se qualquer identificação estiver preenchida:
        // documento (passaporte/RG), taxID (CPF) ou tipo de documento cadastrado.
        // Cloudbeds só popula guestDocumentNumber quando digitado manualmente;
        // reservas de OTAs (Booking, Expedia) usam apenas taxID/CPF ou country.
        const docNum = String(resAtiva?.guestDocumentNumber ?? '').trim()
        const docType = String(resAtiva?.guestDocumentType ?? '').trim().replace(/^-$/, '')
        const taxId = String(resAtiva?.guestTaxID ?? '').trim()
        const hasPendingDocs = resAtiva
          ? !(docNum || taxId || docType)
          : false


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
          has_pending_docs: hasPendingDocs,
        }
      })

      return { quartos, dashboard: dashJson, reservas }
    }



    const [ipanema, botafogo] = await Promise.all([
      processarPropriedade(apiKeyIpanema, 'Ipanema'),
      processarPropriedade(apiKeyBotafogo, 'Botafogo'),
    ])

    const nowIso = new Date().toISOString()

    // Métricas do dashboard — deriva do housekeeping+reservas quando o dashboard não expõe os campos
    for (const [unidade, dados] of [
      ['Ipanema', ipanema] as const,
      ['Botafogo', botafogo] as const,
    ]) {
      const d = dados.dashboard?.data ?? {}
      console.log(`[consolidar-dados] dashboard ${unidade} keys:`, Object.keys(d))

      const limpos = dados.quartos.filter((q) => q.status === 'clean').length
      const sujos = dados.quartos.filter((q) => q.status === 'dirty').length
      const manut = dados.quartos.filter((q) => q.status === 'maintenance').length
      const total = dados.quartos.length

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

      // Docs pendentes: reservas com documento ou país ausente
      const pendingDocs = reservasAtivas.filter(
        (r: any) => !r.guestDocumentNumber || !r.guestCountry,
      ).length

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
          updated_at: nowIso,
        },
        { onConflict: 'property,date' },
      )
    }

    const consolidados = [...ipanema.quartos, ...botafogo.quartos]
    for (const q of consolidados) {
      if (!q.room_number) continue
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
