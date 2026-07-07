import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apiKey, content-type",
};

function int(val: any) {
  return parseInt(val || 0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const apiKeyIpanema = Deno.env.get("CLOUDBEDS_API_KEY_IPANEMA");
    const apiKeyBotafogo = Deno.env.get("CLOUDBEDS_API_KEY_BOTAFOGO");

    console.log("[consolidar-dados] API keys presentes:", {
      ipanema: apiKeyIpanema ? `${apiKeyIpanema.slice(0, 8)}...(${apiKeyIpanema.length})` : "MISSING",
      botafogo: apiKeyBotafogo ? `${apiKeyBotafogo.slice(0, 8)}...(${apiKeyBotafogo.length})` : "MISSING",
    });

    async function fetchCloudbeds(unidade: string, apiKey: string | undefined) {
      if (!apiKey) {
        console.error(`[${unidade}] API key ausente nas variáveis de ambiente.`);
        return null;
      }
      try {
        const response = await fetch("https://api.cloudbeds.com/api/v1.1/getHotelStatus", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        const rawText = await response.text();
        console.log(`[${unidade}] HTTP status:`, response.status);
        console.log(`[${unidade}] Raw response:`, rawText);
        try {
          const parsed = JSON.parse(rawText);
          if (!parsed?.success) {
            console.error(`[${unidade}] Cloudbeds retornou success=false:`, JSON.stringify(parsed));
          }
          return parsed;
        } catch (err) {
          console.error(`[${unidade}] Falha ao parsear JSON:`, (err as Error).message);
          return null;
        }
      } catch (err) {
        console.error(`[${unidade}] Erro na requisição:`, (err as Error).message);
        return null;
      }
    }

    const [resIpanema, resBotafogo] = await Promise.all([
      fetchCloudbeds("Ipanema", apiKeyIpanema),
      fetchCloudbeds("Botafogo", apiKeyBotafogo),
    ]);

    const metricas: Record<string, {
      ocupacao: number;
      limpos: number;
      sujos: number;
      manutencao: number;
      aReceber: number;
    }> = {
      Ipanema: { ocupacao: 0, limpos: 0, sujos: 0, manutencao: 0, aReceber: 0 },
      Botafogo: { ocupacao: 0, limpos: 0, sujos: 0, manutencao: 0, aReceber: 0 },
    };

    if (resIpanema?.success) {
      const data = resIpanema.data ?? {};
      metricas.Ipanema = {
        ocupacao: parseFloat(data.occupancyPercentage || 0),
        limpos: int(data.roomsStatus?.clean || 0),
        sujos: int(data.roomsStatus?.dirty || 0),
        manutencao: int(data.roomsStatus?.maintenance || 0),
        aReceber: parseFloat(data.financials?.balanceDue || 0),
      };
    }

    if (resBotafogo?.success) {
      const data = resBotafogo.data ?? {};
      metricas.Botafogo = {
        ocupacao: parseFloat(data.occupancyPercentage || 0),
        limpos: int(data.roomsStatus?.clean || 0),
        sujos: int(data.roomsStatus?.dirty || 0),
        manutencao: int(data.roomsStatus?.maintenance || 0),
        aReceber: parseFloat(data.financials?.balanceDue || 0),
      };
    }

    for (const [unidade, dados] of Object.entries(metricas)) {
      await supabaseClient
        .from("hotel_metrics")
        .upsert(
          {
            property: unidade,
            date: new Date().toISOString().split("T")[0],
            occupancy_percentage: dados.ocupacao,
            clean_rooms: dados.limpos,
            dirty_rooms: dados.sujos,
            maintenance_rooms: dados.manutencao,
            pending_balance: dados.aReceber,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "property,date" },
        );
    }

    return new Response(JSON.stringify({ success: true, data: metricas }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
