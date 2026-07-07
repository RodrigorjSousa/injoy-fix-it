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

    const puxarMetricasCloudbeds = async (apiKey: string | undefined, nomeUnidade: string) => {
      if (!apiKey) return null
      try {
        const [dashRes, houseRes] = await Promise.all([
          fetch('https://hotels.cloudbeds.com/api/v1.2/getDashboard', { headers: { Authorization: `Bearer ${apiKey}` } }),
          fetch('https://hotels.cloudbeds.com/api/v1.2/getHousekeepingStatus', { headers: { Authorization: `Bearer ${apiKey}` } }),
        ])
        return { dashboard: await dashRes.json(), housekeeping: await houseRes.json() }
      } catch (err) {
        console.error(`Erro ao consultar ${nomeUnidade}:`, err)
        return null
      }
    }

    const [cbIpanema, cbBotafogo] = await Promise.all([
      puxarMetricasCloudbeds(apiKeyIpanema, 'Ipanema'),
      puxarMetricasCloudbeds(apiKeyBotafogo, 'Botafogo'),
    ])

    type QuartoOut = { room_number: string; room_type: string; status: string; condition: string }
    type DadosUnidade = {
      ocupacao: number
      disponiveis: number
      aReceber: number
      docsPendentes: number
      limpos: number
      sujos: number
      manutencao: number
      quartos: QuartoOut[]
    }

    const resultado: Record<string, DadosUnidade> = {
      Ipanema: { ocupacao: 0, disponiveis: 0, aReceber: 0, docsPendentes: 0, limpos: 0, sujos: 0, manutencao: 0, quartos: [] },
      Botafogo: { ocupacao: 0, disponiveis: 0, aReceber: 0, docsPendentes: 0, limpos: 0, sujos: 0, manutencao: 0, quartos: [] },
    }

    const processarPropriedade = (fonte: any, destino: DadosUnidade) => {
      if (fonte?.dashboard?.success) {
        const d = fonte.dashboard.data ?? {}
        destino.ocupacao = parseFloat(d.percentageOccupied ?? d.occupancy ?? d.occupancyPercentage ?? 0)
        destino.disponiveis = parseInt(d.roomsAvailable ?? d.availableRooms ?? 0, 10)
        destino.aReceber = parseFloat(d.balance ?? d.balanceDue ?? 0)
        destino.docsPendentes = parseInt(d.pendingPreCheckins ?? d.missingDocumentsCount ?? 0, 10)
      }

      if (fonte?.housekeeping?.success) {
        const h = fonte.housekeeping.data
        const listaQuartos = Array.isArray(h) ? h : (h?.rooms || [])
        listaQuartos.forEach((q: any) => {
          const cond = String(q.roomCondition ?? '').toLowerCase()
          const blocked = q.roomBlocked === true || cond === 'out_of_service' || cond === 'maintenance'
          let status = 'dirty'
          if (blocked) status = 'maintenance'
          else if (cond === 'clean' || cond === 'inspected') status = 'clean'
          else if (cond === 'dirty') status = 'dirty'
          else status = String(q.housekeepingStatus ?? 'dirty').toLowerCase()

          if (status === 'clean') destino.limpos++
          else if (status === 'dirty') destino.sujos++
          if (status === 'maintenance') destino.manutencao++

          destino.quartos.push({
            room_number: String(q.roomNumber ?? q.roomName ?? ''),
            room_type: String(q.roomTypeName ?? q.roomType ?? ''),
            status,
            condition: blocked ? 'maintenance' : 'normal',
          })
        })
      }
    }

    processarPropriedade(cbIpanema, resultado.Ipanema)
    processarPropriedade(cbBotafogo, resultado.Botafogo)

    const hoje = new Date().toISOString().split('T')[0]
    const nowIso = new Date().toISOString()

    for (const [unidade, dados] of Object.entries(resultado)) {
      await supabaseClient.from('hotel_metrics').upsert({
        property: unidade,
        date: hoje,
        occupancy_percentage: dados.ocupacao,
        clean_rooms: dados.limpos,
        dirty_rooms: dados.sujos,
        maintenance_rooms: dados.manutencao,
        pending_balance: dados.aReceber,
        available_rooms: dados.disponiveis,
        pending_docs_count: dados.docsPendentes,
        updated_at: nowIso,
      }, { onConflict: 'property,date' })

      for (const q of dados.quartos) {
        if (!q.room_number) continue
        await supabaseClient.from('room_housekeeping').upsert({
          property: unidade,
          room_number: q.room_number,
          room_type: q.room_type,
          status: q.status,
          condition: q.condition,
          updated_at: nowIso,
        }, { onConflict: 'property,room_number' })
      }
    }

    return new Response(JSON.stringify({ success: true, data: resultado }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
