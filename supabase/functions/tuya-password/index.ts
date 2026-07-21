import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { deviceIds, guestName, startTime, endTime } = await req.json();

    const clientId = "vv57ktpj3ka4prqhfm9r";
    const secret = "e62b5e3d534548aa99ab458af9bd72b2";
    const baseUrl = "https://openapi.tuyaus.com";

    const calcSha256 = async (str: string) => {
      const msgUint8 = new TextEncoder().encode(str);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    };

    const calcSign = async (
      clientId: string,
      accessToken: string,
      t: string,
      nonce: string,
      signStr: string,
      secret: string,
    ) => {
      const str = clientId + accessToken + t + nonce + signStr;
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(str),
      );
      return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    };

    // 1. Obter Access Token
    const t1 = Date.now().toString();
    const signStr1 = `GET\n${await calcSha256("")}\n\n/v1.0/token?grant_type=1`;
    const sign1 = await calcSign(clientId, "", t1, "", signStr1, secret);

    const tokenRes = await fetch(`${baseUrl}/v1.0/token?grant_type=1`, {
      method: "GET",
      headers: {
        client_id: clientId,
        sign: sign1,
        t: t1,
        sign_method: "HMAC-SHA256",
      },
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.success)
      throw new Error("Erro de Token Tuya: " + JSON.stringify(tokenData));
    const accessToken = tokenData.result.access_token;

    // Regra Tuya: Timestamp em segundos, arredondado para a hora cheia (Floor)
    const effectiveTime = Math.floor(startTime / 3600000) * 3600;
    let invalidTime = Math.floor(endTime / 3600000) * 3600;
    if (invalidTime <= effectiveTime) invalidTime = effectiveTime + 3600;

    const results: Array<{ deviceId: string; status: unknown }> = [];
    const senhasGeradas: Record<string, string> = {};

    // 2. Loop para Gerar Senhas Offline
    for (const deviceId of deviceIds) {
      const t2 = Date.now().toString();

      const bodyObj = {
        name: (guestName || "Hospede").substring(0, 10),
        effective_time: effectiveTime,
        invalid_time: invalidTime,
        type: "multiple",
      };
      const bodyStr = JSON.stringify(bodyObj);

      const url = `/v1.1/devices/${deviceId}/door-lock/offline-temp-password`;
      const signStr2 = `POST\n${await calcSha256(bodyStr)}\n\n${url}`;
      const sign2 = await calcSign(clientId, accessToken, t2, "", signStr2, secret);

      const lockRes = await fetch(`${baseUrl}${url}`, {
        method: "POST",
        headers: {
          client_id: clientId,
          access_token: accessToken,
          sign: sign2,
          t: t2,
          sign_method: "HMAC-SHA256",
          "Content-Type": "application/json",
        },
        body: bodyStr,
      });
      const lockData = await lockRes.json();
      results.push({ deviceId, status: lockData });

      if (lockData.success && lockData.result) {
        senhasGeradas[deviceId] = lockData.result.offline_temp_password;
      }
    }

    return new Response(
      JSON.stringify({ success: true, senhas: senhasGeradas, tuyaResults: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
