import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apiKey, content-type',
}

const API_BASE = "https://hotels.cloudbeds.com/api/v1.2"

async function buscarDadosUnidade(nomeUnidade: string, apiKey?: string) {
  if (!apiKey) {
    console.error(`[${nomeUnidade}] API key ausente.`)
    return null
  }
  const headers = { Authorization: `Bearer ${apiKey}` }
  try {
    const [detalhesRes, statusQuartosRes] = await Promise.all([
      fetch(`${API_BASE}/getHotelDetails`, { headers }),
      fetch(`${API_BASE}/getRoomsStatus`, { headers }),
    ])
    const detalhesRaw = await detalhesRes.text()
    const statusRaw = await statusQuartosRes.text()
    console.log(`[${nomeUnidade}] getHotelDetails (${detalhesRes.status}):`, detalhesRaw)
    console.log(`[${nomeUnidade}] getRoomsStatus (${statusQuartosRes.status}):`, statusRaw)
    const detalhes = JSON.parse(detalhesRaw)
    const statusQuartos = JSON.parse(statusRaw)
    return { detalhes, statusQuartos }
  } catch (err) {
    console.error(`[${nomeUnidade}] Erro nas chamadas de API:`, (err as Error).message)
    return null
  }
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

    const extrair = (d: any) => {
      const det = d?.detalhes?.data ?? {}
      const st = d?.statusQuartos?.data ?? {}
      return {
        ocupacao: parseFloat(det.occupancyPercentage || 0),
        limpos: parseInt(st.counters?.clean || 0, 10),
        sujos: parseInt(st.counters?.dirty || 0, 10),
        manutencao: parseInt(st.counters?.maintenance || 0, 10),
        aReceber: parseFloat(det.financials?.balanceDue || 0),
      }
    }

    if (dadosIpanema?.detalhes?.success && dadosIpanema?.statusQuartos?.success) {
      metricas.Ipanema = extrair(dadosIpanema)
    }
    if (dadosBotafogo?.detalhes?.success && dadosBotafogo?.statusQuartos?.success) {
      metricas.Botafogo = extrair(dadosBotafogo)
    }

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
