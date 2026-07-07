import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apiKey, content-type',
}

const API_BASE = "https://hotels.cloudbeds.com/api/v1.2"

async function callCloudbeds(nomeUnidade: string, path: string, apiKey: string) {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  const raw = await res.text()
  console.log(`[${nomeUnidade}] ${path} (${res.status}):`, raw.slice(0, 2000))
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function buscarDadosUnidade(nomeUnidade: string, apiKey?: string) {
  if (!apiKey) {
    console.error(`[${nomeUnidade}] API key ausente.`)
    return null
  }
  const hoje = new Date().toISOString().split('T')[0]

  const [dashboard, housekeeping] = await Promise.all([
    callCloudbeds(nomeUnidade, `/getDashboard?date=${hoje}`, apiKey),
    callCloudbeds(nomeUnidade, `/getHousekeepingStatus`, apiKey),
  ])

  return { dashboard, housekeeping }
}

function extrair(d: any) {
  const dash = d?.dashboard?.data ?? d?.dashboard ?? {}
  const hk = d?.housekeeping?.data ?? []

  // getDashboard: campos possíveis — occupancyPercentage, occupancy, revenue, balanceDue
  const ocupacao = parseFloat(
    dash.occupancyPercentage ?? dash.occupancy ?? dash.occupancyRate ?? 0
  )
  const aReceber = parseFloat(
    dash.balanceDue ?? dash.pendingBalance ?? dash.financials?.balanceDue ?? 0
  )

  // getHousekeepingStatus: normalmente array de quartos com campo `roomCondition` (clean/dirty)
  // ou objeto com counters. Suportar ambos.
  let limpos = 0, sujos = 0, manutencao = 0
  if (Array.isArray(hk)) {
    for (const room of hk) {
      const cond = String(room.roomCondition ?? room.condition ?? '').toLowerCase()
      const outOfService = room.roomOccupied === false && (room.doNotDisturb || room.outOfService)
      if (cond === 'clean') limpos++
      else if (cond === 'dirty') sujos++
      else if (cond === 'out_of_service' || cond === 'maintenance' || outOfService) manutencao++
    }
  } else if (hk?.counters) {
    limpos = parseInt(hk.counters.clean ?? 0, 10)
    sujos = parseInt(hk.counters.dirty ?? 0, 10)
    manutencao = parseInt(hk.counters.maintenance ?? 0, 10)
  }

  return { ocupacao, limpos, sujos, manutencao, aReceber }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const [dadosIpanema, dadosBotafogo] = await Promise.all([
      buscarDadosUnidade('Ipanema', Deno.env.get('CLOUDBEDS_API_KEY_IPANEMA')),
      buscarDadosUnidade('Botafogo', Deno.env.get('CLOUDBEDS_API_KEY_BOTAFOGO')),
    ])

    const metricas = {
      Ipanema: { ocupacao: 0, limpos: 0, sujos: 0, manutencao: 0, aReceber: 0 },
      Botafogo: { ocupacao: 0, limpos: 0, sujos: 0, manutencao: 0, aReceber: 0 },
    }

    if (dadosIpanema) metricas.Ipanema = extrair(dadosIpanema)
    if (dadosBotafogo) metricas.Botafogo = extrair(dadosBotafogo)

    for (const [unidade, dados] of Object.entries(metricas)) {
      await supabaseClient.from('hotel_metrics').upsert({
        property: unidade,
        date: new Date().toISOString().split('T')[0],
        occupancy_percentage: dados.ocupacao,
        clean_rooms: dados.limpos,
        dirty_rooms: dados.sujos,
        maintenance_rooms: dados.manutencao,
        pending_balance: dados.aReceber,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'property,date' })
    }

    return new Response(JSON.stringify({ success: true, data: metricas }), {
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
