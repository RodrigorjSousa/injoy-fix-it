import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import CryptoJS from "npm:crypto-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function logTuyaCall(entry: {
  device_id?: string | null;
  endpoint: string;
  method: string;
  request_payload?: unknown;
  response_payload?: unknown;
  response_code?: number | null;
  response_msg?: string | null;
  success?: boolean | null;
  guest_name?: string | null;
  room_number?: string | null;
  unidade?: string | null;
}) {
  try {
    await supabaseAdmin.from("tuya_api_logs").insert({
      device_id: entry.device_id ?? null,
      endpoint: entry.endpoint,
      method: entry.method,
      request_payload: entry.request_payload ?? null,
      response_payload: entry.response_payload ?? null,
      response_code: entry.response_code ?? null,
      response_msg: entry.response_msg ?? null,
      success: entry.success ?? null,
      guest_name: entry.guest_name ?? null,
      room_number: entry.room_number ?? null,
      unidade: entry.unidade ?? null,
    });
  } catch (e) {
    console.error("Falha ao gravar tuya_api_logs:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { deviceIds, guestName, startTime, endTime, roomNumber, unidade } = await req.json();

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
    const tokenEndpoint = "/v1.0/token?grant_type=1";
    const signStr1 = `GET\n${await calcSha256("")}\n\n${tokenEndpoint}`;
    const sign1 = await calcSign(clientId, "", t1, "", signStr1, secret);

    const tokenRes = await fetch(`${baseUrl}${tokenEndpoint}`, {
      method: "GET",
      headers: {
        client_id: clientId,
        sign: sign1,
        t: t1,
        sign_method: "HMAC-SHA256",
      },
    });
    const tokenData = await tokenRes.json();

    await logTuyaCall({
      endpoint: tokenEndpoint,
      method: "GET",
      response_payload: tokenData,
      response_code: tokenData?.code ?? null,
      response_msg: tokenData?.msg ?? null,
      success: !!tokenData?.success,
      guest_name: guestName,
      room_number: roomNumber,
      unidade,
    });

    if (!tokenData.success)
      throw new Error("Erro de Token Tuya: " + JSON.stringify(tokenData));
    const accessToken = tokenData.result.access_token;

    // Regra Tuya: timestamps em segundos, arredondados para a hora cheia
    const effectiveTime = Math.floor(startTime / 3600000) * 3600;
    let invalidTime = Math.floor(endTime / 3600000) * 3600;
    if (invalidTime <= effectiveTime) invalidTime = effectiveTime + 3600;

    const results: Array<{ deviceId: string; status: any }> = [];
    const senhasGeradas: Record<string, string> = {};
    const senhaIds: Record<string, string | number> = {};

    // 2. Gerar UMA ÚNICA senha de 6 dígitos para todas as portas
    const senhaUnificada = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Loop para Gravar a Senha Online nas Fechaduras
    for (const deviceId of deviceIds) {
      try {
        // --- PASSO A: Obter o Ticket de Segurança (Password Ticket) ---
        const tTicket = Date.now().toString();
        const urlTicket = `/v1.0/devices/${deviceId}/door-lock/password-ticket`;
        const signStrTicket = `POST\n${await calcSha256("")}\n\n${urlTicket}`;
        const signTicket = await calcSign(clientId, accessToken, tTicket, "", signStrTicket, secret);

        const ticketRes = await fetch(`${baseUrl}${urlTicket}`, {
          method: "POST",
          headers: {
            client_id: clientId,
            access_token: accessToken,
            sign: signTicket,
            t: tTicket,
            sign_method: "HMAC-SHA256",
          },
        });

        const ticketData = await ticketRes.json();

        await logTuyaCall({
          device_id: deviceId,
          endpoint: urlTicket,
          method: "POST",
          response_payload: ticketData,
          response_code: ticketData?.code ?? null,
          response_msg: ticketData?.msg ?? null,
          success: !!ticketData?.success,
          guest_name: guestName,
          room_number: roomNumber,
          unidade,
        });

        if (!ticketData.success) {
          console.error(`Falha ao obter ticket para ${deviceId}:`, ticketData);
          results.push({ deviceId, status: ticketData });
          continue;
        }

        const ticketId = ticketData.result.ticket_id;
        const ticketKey = ticketData.result.ticket_key;

        // --- PASSO B: Criptografar a Senha (AES-128-ECB) ---
        const keyHex = CryptoJS.enc.Utf8.parse(ticketKey);
        const encrypted = CryptoJS.AES.encrypt(senhaUnificada, keyHex, {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7,
        });
        const senhaCriptografada = encrypted.ciphertext.toString(CryptoJS.enc.Hex);

        // --- PASSO C: Enviar a Senha para a Fechadura (Online) ---
        const tCreate = Date.now().toString();
        const bodyCreate = {
          ticket_id: ticketId,
          password: senhaCriptografada,
          effective_time: effectiveTime,
          invalid_time: invalidTime,
          type: 2,
          name: guestName ? guestName.substring(0, 10).trim() : "Visita",
        };

        const bodyCreateStr = JSON.stringify(bodyCreate);
        const urlCreate = `/v1.0/devices/${deviceId}/door-lock/temp-password`;
        const signStrCreate = `POST\n${await calcSha256(bodyCreateStr)}\n\n${urlCreate}`;
        const signCreate = await calcSign(clientId, accessToken, tCreate, "", signStrCreate, secret);

        const createRes = await fetch(`${baseUrl}${urlCreate}`, {
          method: "POST",
          headers: {
            client_id: clientId,
            access_token: accessToken,
            sign: signCreate,
            t: tCreate,
            sign_method: "HMAC-SHA256",
            "Content-Type": "application/json",
          },
          body: bodyCreateStr,
        });

        const createData = await createRes.json();
        results.push({ deviceId, status: createData });

        await logTuyaCall({
          device_id: deviceId,
          endpoint: urlCreate,
          method: "POST",
          request_payload: { ...bodyCreate, password: "[ENCRYPTED]" },
          response_payload: createData,
          response_code: createData?.code ?? null,
          response_msg: createData?.msg ?? null,
          success: !!createData?.success,
          guest_name: guestName,
          room_number: roomNumber,
          unidade,
        });

        if (createData.success) {
          senhasGeradas[deviceId] = senhaUnificada;
          senhaIds[deviceId] =
            createData.result?.id ?? createData.result?.password_id ?? "";
        }
      } catch (err) {
        console.error(`Erro ao processar dispositivo ${deviceId}:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        senhas: senhasGeradas,
        senhaIds,
        tuyaResults: results,
      }),
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
