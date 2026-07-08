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

      const [roomsRes, resRes, dashRes] = await Promise.all([
        fetch('https://hotels.cloudbeds.com/api/v1.2/getHousekeepingStatus', {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
        fetch(
          `https://hotels.cloudbeds.com/api/v1.2/getReservations?checkInFrom=${hojeStr}&checkOutTo=${hojeStr}&includeGuestsDetails=true&pageSize=100`,
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
      const reservas: any[] = resJson?.success ? resJson.data ?? [] : []

      const quartos = todosQuartos.map((room: any) => {
        const numQuarto = String(room.roomNumber ?? room.roomName ?? '')

        const roomOf = (r: any) =>
          String(r?.assignedRoomNumber ?? r?.roomNumber ?? r?.roomName ?? '')

        const reservaSaindoHoje = reservas.find(
          (r: any) => roomOf(r) === numQuarto && r.checkOutDate === hojeStr,
        )
        const reservaEntrandoHoje = reservas.find(
          (r: any) =>
            roomOf(r) === numQuarto &&
            r.checkInDate === hojeStr &&
            r.status !== 'checked_out',
        )
        const hospedeAtualInHouse = reservas.find(
          (r: any) =>
            roomOf(r) === numQuarto &&
            r.status === 'checked_in' &&
            r.checkOutDate > hojeStr,
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
          const dataCheckin = new Date(hospedeAtualInHouse.checkInDate)
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
        const pax = resAtiva ? parseInt(String(resAtiva.numberOfGuests ?? 1), 10) || 0 : 0
        const hasPendingPayment = resAtiva
          ? parseFloat(String(resAtiva.balanceDue ?? resAtiva.balance ?? 0)) > 0
          : false
        const hasPendingDocs = resAtiva
          ? !resAtiva.guestDocumentNumber || !resAtiva.guestCountry
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

      return { quartos, dashboard: dashJson }
    }

    const [ipanema, botafogo] = await Promise.all([
      processarPropriedade(apiKeyIpanema, 'Ipanema'),
      processarPropriedade(apiKeyBotafogo, 'Botafogo'),
    ])

    const nowIso = new Date().toISOString()

    // Métricas do dashboard
    for (const [unidade, dados] of [
      ['Ipanema', ipanema] as const,
      ['Botafogo', botafogo] as const,
    ]) {
      const d = dados.dashboard?.data ?? {}
      const limpos = dados.quartos.filter((q) => q.status === 'clean').length
      const sujos = dados.quartos.filter((q) => q.status === 'dirty').length
      const manut = dados.quartos.filter((q) => q.status === 'maintenance').length

      await supabaseClient.from('hotel_metrics').upsert(
        {
          property: unidade,
          date: hojeStr,
          occupancy_percentage: parseFloat(
            d.percentageOccupied ?? d.occupancy ?? d.occupancyPercentage ?? 0,
          ),
          clean_rooms: limpos,
          dirty_rooms: sujos,
          maintenance_rooms: manut,
          pending_balance: parseFloat(d.balance ?? d.balanceDue ?? 0),
          available_rooms: parseInt(d.roomsAvailable ?? d.availableRooms ?? 0, 10),
          pending_docs_count: parseInt(
            d.pendingPreCheckins ?? d.missingDocumentsCount ?? 0,
            10,
          ),
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
