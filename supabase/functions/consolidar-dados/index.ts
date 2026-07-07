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

    const buscarDadosUnidade = async (apiKey: string | undefined, nomeUnidade: string) => {
      if (!apiKey) {
        console.error(`[${nomeUnidade}] Chave de API não encontrada no ambiente.`)
        return null
      }

      try {
        const [detalhesRes, statusQuartosRes] = await Promise.all([
          fetch('https://api.cloudbeds.com/api/v1.2/getHotelDetails', {
            headers: { "Authorization": `Bearer ${apiKey}` }
          }),
          fetch('https://api.cloudbeds.com/api/v1.2/getRoomsStatus', {
            headers: { "Authorization": `Bearer ${apiKey}` }
          })
        ])

        const detalhes = await detalhesRes.json()
        const statusQuartos = await statusQuartosRes.json()

        console.log(`[${nomeUnidade}] Resposta getHotelDetails:`, JSON.stringify(detalhes))
        console.log(`[${nomeUnidade}] Resposta getRoomsStatus:`, JSON.stringify(statusQuartos))

        return { detalhes, statusQuartos }
      } catch (err) {
        console.error(`[${nomeUnidade}] Erro na chamada de API:`, err)
        return null
      }
    }

    const [dadosIpanema, dadosBotafogo] = await Promise.all([
      buscarDadosUnidade(apiKeyIpanema, 'Ipanema'),
      buscarDadosUnidade(apiKeyBotafogo, 'Botafogo')
    ])

    const metricas = {
      Ipanema: { ocupacao: 0, limpos: 0, sujos: 0, manutencao: 0, aReceber: 0 },
      Botafogo: { ocupacao: 0, limpos: 0, sujos: 0, manutencao: 0, aReceber: 0 }
    }

    if (dadosIpanema?.detalhes?.success && dadosIpanema?.statusQuartos?.success) {
      const det = dadosIpanema.detalhes.data
      const st = dadosIpanema.statusQuartos.data
      metricas.Ipanema = {
        ocupacao: parseFloat(det.occupancyPercentage || 0),
        limpos: parseInt(st.counters?.clean || 0, 10),
        sujos: parseInt(st.counters?.dirty || 0, 10),
        manutencao: parseInt(st.counters?.maintenance || 0, 10),
        aReceber: parseFloat(det.financials?.balanceDue || 0)
      }
    }

    if (dadosBotafogo?.detalhes?.success && dadosBotafogo?.statusQuartos?.success) {
      const det = dadosBotafogo.detalhes.data
      const st = dadosBotafogo.statusQuartos.data
      metricas.Botafogo = {
        ocupacao: parseFloat(det.occupancyPercentage || 0),
        limpos: parseInt(st.counters?.clean || 0, 10),
        sujos: parseInt(st.counters?.dirty || 0, 10),
        manutencao: parseInt(st.counters?.maintenance || 0, 10),
        aReceber: parseFloat(det.financials?.balanceDue || 0)
      }
    }

    for (const [unidade, dados] of Object.entries(metricas)) {
      await supabaseClient
        .from('hotel_metrics')
        .upsert({
          property: unidade,
          date: new Date().toISOString().split('T')[0],
          occupancy_percentage: dados.ocupacao,
          clean_rooms: dados.limpos,
          dirty_rooms: dados.sujos,
          maintenance_rooms: dados.manutencao,
          pending_balance: dados.aReceber,
          updated_at: new Date().toISOString()
        }, { onConflict: 'property,date' })
    }

    return new Response(JSON.stringify({ success: true, data: metricas }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    })
  }
})
