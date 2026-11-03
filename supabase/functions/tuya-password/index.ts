import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// O esm.sh entrega o crypto-js sem exportações nomeadas e os tipos dele são no
// estilo `export =`, então o import default falha na verificação de tipos do Deno.
import * as CryptoJSMod from "https://esm.sh/crypto-js@4.2.0";
const CryptoJS = ((CryptoJSMod as any).default ??
  CryptoJSMod) as typeof CryptoJSMod;
import * as TT from "../_shared/ttlock.ts";

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

// deno-lint-ignore no-explicit-any
async function tratarTuya(payload: any, cred: CredTuya = credTuya(1)): Promise<Response> {
  try {
    const { deviceIds, guestName, startTime, endTime, roomNumber, unidade, action } = payload;



    const { clientId, secret } = cred;
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

    const tuyaRequest = async (method: string, endpoint: string, body?: unknown) => {
      const tReq = Date.now().toString();
      const bodyStr = body === undefined ? "" : JSON.stringify(body);
      const signStr = `${method}\n${await calcSha256(bodyStr)}\n\n${endpoint}`;
      const sign = await calcSign(clientId, accessToken, tReq, "", signStr, secret);
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: {
          client_id: clientId,
          access_token: accessToken,
          sign,
          t: tReq,
          sign_method: "HMAC-SHA256",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: bodyStr }),
      });
      const data = await res.json().catch(() => ({ raw: "no-json" }));
      return { httpStatus: res.status, data };
    };

    // ============ AÇÃO: verificar status online das fechaduras ============
    if (action === "check_status") {
      const statuses: Array<{
        deviceId: string;
        online: boolean;
        name?: string;
        success: boolean;
        code?: number;
        msg?: string;
      }> = [];

      for (const deviceId of deviceIds ?? []) {
        try {
          const tDev = Date.now().toString();
          const urlDev = `/v1.0/devices/${deviceId}`;
          const signStrDev = `GET\n${await calcSha256("")}\n\n${urlDev}`;
          const signDev = await calcSign(clientId, accessToken, tDev, "", signStrDev, secret);
          const devRes = await fetch(`${baseUrl}${urlDev}`, {
            method: "GET",
            headers: {
              client_id: clientId,
              access_token: accessToken,
              sign: signDev,
              t: tDev,
              sign_method: "HMAC-SHA256",
            },
          });
          const devData = await devRes.json();
          await logTuyaCall({
            device_id: deviceId,
            endpoint: urlDev,
            method: "GET",
            response_payload: devData,
            response_code: devData?.code ?? null,
            response_msg: devData?.msg ?? null,
            success: !!devData?.success,
            unidade,
          });
          statuses.push({
            deviceId,
            online: !!devData?.result?.online,
            name: devData?.result?.name,
            success: !!devData?.success,
            code: devData?.code,
            msg: devData?.msg,
          });
        } catch (err) {
          statuses.push({
            deviceId,
            online: false,
            success: false,
            msg: (err as Error).message,
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true, statuses }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ============ AÇÃO: diagnóstico funcional via API Tuya ============
    // Não abre a porta fisicamente, mas confirma se o dispositivo está online,
    // quais comandos/funções a Tuya expõe e se a senha temporária aparece listada
    // no caso das fechaduras door-lock.
    if (action === "diagnose") {
      const diagnostics: Array<{
        deviceId: string;
        device?: unknown;
        functions?: unknown;
        status?: unknown;
        tempPasswords?: unknown;
      }> = [];

      for (const deviceId of deviceIds ?? []) {
        const entry: {
          deviceId: string;
          device?: unknown;
          functions?: unknown;
          status?: unknown;
          tempPasswords?: unknown;
        } = { deviceId };

        for (const [key, endpoint] of [
          ["device", `/v1.0/devices/${deviceId}`],
          ["functions", `/v1.0/devices/${deviceId}/functions`],
          ["status", `/v1.0/devices/${deviceId}/status`],
          ["tempPasswords", `/v1.0/devices/${deviceId}/door-lock/temp-passwords?valid=true`],
        ] as const) {
          try {
            const result = await tuyaRequest("GET", endpoint);
            entry[key] = result.data;
            await logTuyaCall({
              device_id: deviceId,
              endpoint: `${endpoint} [diagnose]`,
              method: "GET",
              response_payload: result.data,
              response_code: result.data?.code ?? result.httpStatus,
              response_msg: result.data?.msg ?? null,
              success: !!result.data?.success,
              room_number: roomNumber,
              unidade,
            });
          } catch (err) {
            entry[key] = { success: false, error: (err as Error).message };
          }
        }

        diagnostics.push(entry);
      }

      return new Response(
        JSON.stringify({ success: true, diagnostics }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ============ AÇÃO: destravamento remoto (WiFi Access Controller "mk") ============
    // Usa o fluxo password-ticket + password-free/open-door, que é o único endpoint
    // público da Tuya que efetivamente aciona a fechadura das categorias mk.
    if (action === "unlock") {
      const unlocks: Array<{
        deviceId: string;
        success: boolean;
        code?: number;
        msg?: string;
      }> = [];
      for (const deviceId of deviceIds ?? []) {
        try {
          const tk = await tuyaRequest(
            "POST",
            `/v1.0/devices/${deviceId}/door-lock/password-ticket`,
          );
          await logTuyaCall({
            device_id: deviceId,
            endpoint: `/v1.0/devices/${deviceId}/door-lock/password-ticket [unlock]`,
            method: "POST",
            response_payload: tk.data,
            response_code: tk.data?.code ?? tk.httpStatus,
            response_msg: tk.data?.msg ?? null,
            success: !!tk.data?.success,
            unidade,
          });
          if (!tk.data?.success) {
            unlocks.push({
              deviceId,
              success: false,
              code: tk.data?.code,
              msg: tk.data?.msg ?? "ticket_failed",
            });
            continue;
          }
          const ticketId = tk.data.result.ticket_id;
          const open = await tuyaRequest(
            "POST",
            `/v1.0/devices/${deviceId}/door-lock/password-free/open-door`,
            { ticket_id: ticketId },
          );
          await logTuyaCall({
            device_id: deviceId,
            endpoint: `/v1.0/devices/${deviceId}/door-lock/password-free/open-door`,
            method: "POST",
            request_payload: { ticket_id: "[TICKET]" },
            response_payload: open.data,
            response_code: open.data?.code ?? open.httpStatus,
            response_msg: open.data?.msg ?? null,
            success: !!open.data?.success,
            unidade,
          });
          unlocks.push({
            deviceId,
            success: !!open.data?.success,
            code: open.data?.code,
            msg: open.data?.msg,
          });
        } catch (err) {
          unlocks.push({
            deviceId,
            success: false,
            msg: (err as Error).message,
          });
        }
      }
      return new Response(
        JSON.stringify({ success: true, unlocks }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ============ AÇÃO: revogar senha temporária (door-lock Zigbee/WiFi) ============
    // Remove imediatamente uma senha temporária da fechadura. Usado tanto pelo
    // painel de emergência da recepção quanto pelo cron de limpeza automática
    // (senhas expiradas ou reservas canceladas no Cloudbeds).
    if (action === "revoke") {
      const revokes: Array<{ deviceId: string; passwordId: string | number; success: boolean; code?: number; msg?: string }> = [];
      const items: Array<{ deviceId: string; passwordId: string | number }> = payload.items ?? [];
      for (const { deviceId, passwordId } of items) {
        if (!deviceId || !passwordId || String(passwordId) === "senha_fixa") {
          revokes.push({ deviceId, passwordId, success: false, msg: "skip:senha_fixa_ou_id_ausente" });
          continue;
        }
        try {
          const endpoint = `/v1.0/devices/${deviceId}/door-lock/temp-passwords/${passwordId}`;
          const r = await tuyaRequest("DELETE", endpoint);
          await logTuyaCall({
            device_id: deviceId,
            endpoint: `${endpoint} [revoke]`,
            method: "DELETE",
            response_payload: r.data,
            response_code: r.data?.code ?? r.httpStatus,
            response_msg: r.data?.msg ?? null,
            success: !!r.data?.success,
            room_number: roomNumber,
            unidade,
          });
          revokes.push({
            deviceId,
            passwordId,
            success: !!r.data?.success,
            code: r.data?.code,
            msg: r.data?.msg,
          });
        } catch (err) {
          revokes.push({ deviceId, passwordId, success: false, msg: (err as Error).message });
        }
      }
      return new Response(
        JSON.stringify({ success: true, revokes }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }




    // Regra Tuya: timestamps em SEGUNDOS (UNIX). effective_time precisa ser
    // >= "agora". Antes arredondávamos para a próxima hora cheia, o que fazia
    // uma senha gerada às 19:03 só começar às 20:00; isso parece sucesso na API,
    // mas falha no teste físico imediato. Agora a senha entra em vigor em poucos
    // segundos/minutos, mantendo uma pequena margem para evitar code 1109.
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = Math.floor(startTime / 1000);
    const endSec = Math.floor(endTime / 1000);
    const activationGraceSeconds = 90;
    let effectiveTime = Math.max(startSec, nowSec + activationGraceSeconds);
    let invalidTime = endSec;
    if (invalidTime <= effectiveTime + 300) invalidTime = effectiveTime + 3600;
    const tuyaTimeZone = "-03:00";

    const results: Array<{ deviceId: string; status: any }> = [];
    const senhasGeradas: Record<string, string> = {};
    const senhaIds: Record<string, string | number> = {};

    // 2. Gerar UMA ÚNICA senha de 6 dígitos usada em TODAS as portas
    //    (quarto Zigbee + portão/vidro WiFi Access Controller).
    //    Se a parte TTLock já escolheu a senha (portões), usa a mesma aqui.
    const senhaUnificada =
      typeof payload.senha === "string" && /^\d{6}$/.test(payload.senha)
        ? payload.senha
        : Math.floor(100000 + Math.random() * 900000).toString();
    const { data: deviceRows } = await supabaseAdmin
      .from("tuya_devices")
      .select("device_id,tipo,senha_fixa")
      .in("device_id", deviceIds ?? []);
    const infoPorDeviceId = new Map<string, { tipo: string; senha_fixa: string | null }>(
      (deviceRows ?? []).map((row: any) => [
        String(row.device_id),
        { tipo: String(row.tipo ?? ""), senha_fixa: row.senha_fixa ?? null },
      ]),
    );

    // 3. Loop para Gravar a Senha Online nas Fechaduras
    for (const deviceId of deviceIds) {
      try {
        const info = infoPorDeviceId.get(String(deviceId)) ?? { tipo: "", senha_fixa: null };
        const tipo = info.tipo;
        const isMkAccessController = tipo === "portao" || tipo === "vidro";

        // ============ CATEGORIA "mk" (WiFi Access Controller) ============
        // A API pública Tuya não permite CRIAR senha temporária nesses modelos
        // (endpoints retornam success sem persistir, ou "unsupported"). O uso
        // real é senha fixa cadastrada 1x no app Tuya Smart, servindo todos os
        // hóspedes; a recepção pode acionar destravamento remoto (action=unlock).
        if (isMkAccessController) {
          if (info.senha_fixa && info.senha_fixa.trim()) {
            senhasGeradas[deviceId] = info.senha_fixa.trim();
            senhaIds[deviceId] = "senha_fixa";
            results.push({
              deviceId,
              status: { success: true, result: { fixed: true }, msg: "senha_fixa" },
            });
          } else {
            results.push({
              deviceId,
              status: {
                success: false,
                code: 0,
                msg: "Senha fixa não cadastrada. Configure em Gestão → Fechaduras Tuya.",
              },
            });
          }
          continue;
        }

        // ============ FLUXO ORIGINAL: door-lock (Zigbee/Wi-Fi door lock) ============
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
        const ticketKeyHex = ticketData.result.ticket_key as string;

        const encryptedTicketKeyHex = CryptoJS.enc.Hex.parse(ticketKeyHex);
        const encryptedTicketKeyBase64 = CryptoJS.enc.Base64.stringify(encryptedTicketKeyHex);
        const accessSecretKey = CryptoJS.enc.Utf8.parse(secret);
        const aesKey = CryptoJS.AES.decrypt(encryptedTicketKeyBase64, accessSecretKey, {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7,
        });

        if (!aesKey.sigBytes || aesKey.sigBytes < 16) {
          throw new Error("Ticket Tuya inválido: chave descriptografada vazia.");
        }

        const senhaOriginal = senhaUnificada;
        const plaintextUtf8 = CryptoJS.enc.Utf8.parse(senhaOriginal);
        const encrypted = CryptoJS.AES.encrypt(plaintextUtf8, aesKey, {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7,
        });

        const senhaCriptografada = encrypted.ciphertext.toString(CryptoJS.enc.Hex).toUpperCase();
        const nomeTuya = (() => {
          const normalized = (guestName ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^A-Za-z0-9]/g, "");
          const base = normalized.length === 0 ? "Guest" : normalized.padEnd(4, "X");
          return `${base.slice(0, 4)}${senhaOriginal.slice(-2)}`;
        })();

        // --- PASSO C: Enviar a Senha para a Fechadura (Online) ---
        const tCreate = Date.now().toString();
        const bodyCreateBase = {
          ticket_id: ticketId,
          password: senhaCriptografada,
          password_type: "ticket",
          type: 0,
          effective_time: effectiveTime,
          invalid_time: invalidTime,
          time_zone: tuyaTimeZone,
        };
        const bodyCreate = { ...bodyCreateBase, name: nomeTuya };

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
          senhasGeradas[deviceId] = senhaOriginal;
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
}

// ======================================================================
// Credenciais Tuya por projeto. A cota grátis do IoT Core é de 10 fechaduras
// "Controllable" por conta, então as fechaduras ficam divididas em projetos:
//   1 = "INJOY FECHADURAS"   (TUYA_CLIENT_ID / TUYA_CLIENT_SECRET)
//   2 = "INJOY FECHADURAS 2" (TUYA2_CLIENT_ID / TUYA2_CLIENT_SECRET)
// tuya_devices.tuya_projeto (migração 0095) diz o projeto de cada fechadura.
// ======================================================================
type CredTuya = { clientId: string; secret: string };

function credTuya(projeto: number): CredTuya {
  if (projeto === 2) {
    const clientId = Deno.env.get("TUYA2_CLIENT_ID") ?? "";
    const secret = Deno.env.get("TUYA2_CLIENT_SECRET") ?? "";
    if (!clientId || !secret) throw new Error("Projeto Tuya 2 sem credenciais: faltam TUYA2_CLIENT_ID/TUYA2_CLIENT_SECRET.");
    return { clientId, secret };
  }
  // Projeto 1: segredos; o valor fixo antigo fica só até os segredos serem criados.
  return {
    clientId: Deno.env.get("TUYA_CLIENT_ID") ?? "vv57ktpj3ka4prqhfm9r",
    secret: Deno.env.get("TUYA_CLIENT_SECRET") ?? "e62b5e3d534548aa99ab458af9bd72b2",
  };
}

// ======================================================================
// Roteador: separa os aparelhos por quem atende (TTLock, Tuya projeto 1,
// Tuya projeto 2), chama cada um e junta as respostas. Na criação, a MESMA
// senha de 6 dígitos vai para todas as portas.
// ======================================================================

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Grupo = "ttlock" | number;

async function gruposDe(ids: string[]): Promise<Map<string, Grupo>> {
  const mapa = new Map<string, Grupo>();
  if (!ids.length) return mapa;
  // Sem as migrações 0093/0095 as colunas não existem: tenta com menos colunas e, no fim, tudo vai para o projeto 1.
  for (const colunas of ["device_id,fornecedor,tuya_projeto", "device_id,fornecedor"]) {
    const { data, error } = await supabaseAdmin.from("tuya_devices").select(colunas).in("device_id", ids);
    if (error) continue;
    // deno-lint-ignore no-explicit-any
    for (const r of (data ?? []) as any[])
      mapa.set(String(r.device_id), r.fornecedor === "ttlock" ? "ttlock" : Number(r.tuya_projeto ?? 1) || 1);
    break;
  }
  return mapa;
}

const msgDe = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Senha repetida no teclado (outro hóspede com o mesmo número): troca o número e tenta de novo. */
const ehRepetida = (e: unknown) => /exist|duplicat|same|repeat/i.test(msgDe(e));
/** Ao apagar, senha que já não existe (expirou, foi apagada no app) conta como apagada. */
const jaSumiu = (e: unknown) => /not exist|does not exist|no such|deleted|expired/i.test(msgDe(e));

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>;

/** Junta respostas: listas são concatenadas, objetos (senhas, senhaIds) mesclados. */
function juntar(partes: Json[]): Json {
  const out: Json = { success: true };
  for (const p of partes)
    for (const [k, v] of Object.entries(p)) {
      if (Array.isArray(v)) out[k] = [...(out[k] ?? []), ...v];
      else if (v && typeof v === "object") out[k] = { ...(out[k] ?? {}), ...v };
      else if (k !== "success") out[k] = v;
    }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const payload = await req.json();
    const action: string | undefined = payload.action;
    const ids: string[] = (payload.deviceIds ?? []).map(String);
    const itens: Array<{ deviceId: string; passwordId: string | number }> = payload.items ?? [];
    const grupos = await gruposDe([...ids, ...itens.map((i) => String(i.deviceId))]);
    const grupo = (id: string): Grupo => grupos.get(String(id)) ?? 1;
    const projetos = [...new Set([...ids.map(grupo), ...itens.map((i) => grupo(String(i.deviceId)))])].filter(
      (g): g is number => g !== "ttlock",
    );
    // Caso simples (tudo no projeto 1, sem TTLock): exatamente o fluxo antigo.
    if (!ids.some((id) => grupo(id) !== 1) && !itens.some((i) => grupo(String(i.deviceId)) !== 1)) return tratarTuya(payload);

    const ttIds = ids.filter((id) => grupo(id) === "ttlock");
    const log = (deviceId: string, endpoint: string, ok: boolean, detalhe: unknown) =>
      logTuyaCall({
        device_id: deviceId,
        endpoint: `ttlock:${endpoint}`,
        method: "POST",
        response_payload: detalhe,
        success: ok,
        guest_name: payload.guestName ?? null,
        room_number: payload.roomNumber ?? null,
        unidade: payload.unidade ?? null,
      });
    /** Chama a Tuya de cada projeto com os aparelhos (ou itens) dele. */
    const tuya = async (extra: (p: number) => Json | null): Promise<Json[]> => {
      const saidas: Json[] = [];
      for (const p of projetos) {
        const corpo = extra(p);
        if (!corpo) continue;
        const r = await tratarTuya({ ...payload, ...corpo }, credTuya(p));
        const j = await r.json();
        if (!r.ok) throw new Error(`Tuya projeto ${p}: ${String(j.error ?? r.status)}`);
        saidas.push(j);
      }
      return saidas;
    };
    const porProjeto = (p: number) => {
      const doProjeto = ids.filter((id) => grupo(id) === p);
      return doProjeto.length ? { deviceIds: doProjeto } : null;
    };

    if (action === "check_status") {
      const statuses = [];
      for (const id of ttIds) {
        try {
          const s = await TT.situacao(id);
          statuses.push({ deviceId: id, online: s.online, name: s.nome, success: true, msg: s.online ? "gateway" : "sem gateway" });
        } catch (e) {
          statuses.push({ deviceId: id, online: false, success: false, msg: msgDe(e) });
        }
      }
      return resposta(juntar([...(await tuya(porProjeto)), { statuses }]));
    }

    if (action === "diagnose") {
      const diagnostics = [];
      for (const id of ttIds) {
        try {
          diagnostics.push({ deviceId: id, device: await TT.situacao(id) });
        } catch (e) {
          diagnostics.push({ deviceId: id, device: { success: false, error: msgDe(e) } });
        }
      }
      return resposta(juntar([...(await tuya(porProjeto)), { diagnostics }]));
    }

    if (action === "unlock") {
      const unlocks = [];
      for (const id of ttIds) {
        try {
          await TT.abrir(id);
          await log(id, "lock/unlock", true, null);
          unlocks.push({ deviceId: id, success: true });
        } catch (e) {
          await log(id, "lock/unlock", false, msgDe(e));
          unlocks.push({ deviceId: id, success: false, msg: msgDe(e) });
        }
      }
      return resposta(juntar([...(await tuya(porProjeto)), { unlocks }]));
    }

    if (action === "revoke") {
      const revokes = [];
      for (const { deviceId, passwordId } of itens.filter((i) => grupo(String(i.deviceId)) === "ttlock")) {
        if (!passwordId || String(passwordId) === "senha_fixa") {
          revokes.push({ deviceId, passwordId, success: false, msg: "skip:id_ausente" });
          continue;
        }
        try {
          await TT.apagarSenha(String(deviceId), passwordId);
          await log(String(deviceId), "keyboardPwd/delete", true, { passwordId });
          revokes.push({ deviceId, passwordId, success: true });
        } catch (e) {
          const ok = jaSumiu(e);
          await log(String(deviceId), "keyboardPwd/delete", ok, msgDe(e));
          revokes.push({ deviceId, passwordId, success: ok, msg: msgDe(e) });
        }
      }
      const partes = await tuya((p) => {
        const doProjeto = itens.filter((i) => grupo(String(i.deviceId)) === p);
        return doProjeto.length ? { items: doProjeto } : null;
      });
      return resposta(juntar([...partes, { revokes }]));
    }

    if (action) {
      // Outras ações: cada projeto com os seus aparelhos.
      return resposta(juntar(await tuya(porProjeto)));
    }

    // ---- criação: escolhe a senha, grava nos portões TTLock e passa a mesma para cada projeto Tuya
    const inicio = Math.min(Number(payload.startTime) || Date.now(), Date.now()) - 60_000;
    const fim = Number(payload.endTime) || Date.now() + 24 * 3600_000;
    const nome = `${payload.roomNumber ? `Quarto ${payload.roomNumber} ` : ""}${payload.guestName ?? "Hospede"}`.trim();
    const senhas: Record<string, string> = {};
    const senhaIds: Record<string, string | number> = {};
    const tuyaResults: Array<{ deviceId: string; status: unknown }> = [];
    let senha = Math.floor(100000 + Math.random() * 900000).toString();
    for (let tentativa = 0; ttIds.length && tentativa < 4; tentativa++) {
      senha = Math.floor(100000 + Math.random() * 900000).toString();
      const criadas: Array<[string, number]> = [];
      let repetida = false;
      for (const id of ttIds) {
        try {
          const pwdId = await TT.criarSenha({ lockId: id, senha, nome, inicio, fim });
          criadas.push([id, pwdId]);
          await log(id, "keyboardPwd/add", true, { keyboardPwdId: pwdId });
        } catch (e) {
          await log(id, "keyboardPwd/add", false, msgDe(e));
          if (ehRepetida(e) && tentativa < 3) {
            repetida = true;
            break;
          }
          tuyaResults.push({ deviceId: id, status: { success: false, msg: msgDe(e) } });
        }
      }
      if (repetida) {
        for (const [id, pwdId] of criadas) await TT.apagarSenha(id, pwdId).catch(() => undefined);
        continue;
      }
      for (const [id, pwdId] of criadas) {
        senhas[id] = senha;
        senhaIds[id] = pwdId;
        tuyaResults.push({ deviceId: id, status: { success: true, result: { keyboardPwdId: pwdId }, msg: "ttlock" } });
      }
      break;
    }
    const partes = await tuya((p) => {
      const c = porProjeto(p);
      return c ? { ...c, senha } : null;
    });
    return resposta(juntar([...partes, { senhas, senhaIds, tuyaResults }]));
  } catch (error) {
    return resposta({ error: msgDe(error) }, 400);
  }
});
