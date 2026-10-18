// Cliente do navegador: registra o service worker, pede permissão e cria a
// subscription push. Nunca roda no preview Lovable (iframe / hostname preview).
import { supabase } from "@/integrations/supabase/client";
import { getVapidPublicKey } from "./push.functions";

const SW_PATH = "/push-sw.js";

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (!("Notification" in window)) return false;
  return true;
}

export function isPreviewContext(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (h.endsWith(".lovableproject.com") || h.endsWith(".lovableproject-dev.com")) return true;
  if (h.endsWith(".beta.lovable.dev")) return true;
  return false;
}

export function currentPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A inscrição do navegador foi feita com a chave VAPID atual? (chave trocada = push nunca chega) */
function inscritoComChave(sub: PushSubscription, vapidPublicKey: string): boolean {
  const atual = sub.options?.applicationServerKey;
  if (!atual) return true; // navegador não informa: não dá para comparar
  const a = new Uint8Array(atual);
  const b = urlBase64ToUint8Array(vapidPublicKey);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Grava o aparelho para QUEM está logado agora. Usa a função do banco (0068), que passa o
 * aparelho de um usuário para outro (celular/tablet compartilhado); sem ela, cai no upsert antigo.
 */
async function registrarNoBanco(subscription: PushSubscription): Promise<{ ok: true } | { ok: false; reason: string }> {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh ?? arrayBufferToBase64Url(subscription.getKey("p256dh"));
  const auth = json.keys?.auth ?? arrayBufferToBase64Url(subscription.getKey("auth"));
  const userAgent = navigator.userAgent.slice(0, 300);

  const rpc = supabase.rpc.bind(supabase) as unknown as (
    f: string,
    a: Record<string, unknown>,
  ) => Promise<{ error: { message: string; code?: string } | null }>;
  const { error } = await rpc("push_registrar_aparelho", {
    _endpoint: subscription.endpoint,
    _p256dh: p256dh,
    _auth: auth,
    _user_agent: userAgent,
  });
  if (!error) return { ok: true };
  if (!/push_registrar_aparelho|PGRST202|function/i.test(`${error.code ?? ""} ${error.message}`)) {
    return { ok: false, reason: error.message };
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, reason: "Faça login novamente." };
  const { error: upErr } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh,
      auth_key: auth,
      user_agent: userAgent,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  return upErr ? { ok: false, reason: upErr.message } : { ok: true };
}

async function inscricaoValida(
  reg: ServiceWorkerRegistration,
  vapidPublicKey: string,
  criar: boolean,
): Promise<PushSubscription | null> {
  let subscription = await reg.pushManager.getSubscription();
  if (subscription && !inscritoComChave(subscription, vapidPublicKey)) {
    // Chave do servidor mudou: a inscrição antiga nunca mais recebe nada. Refaz.
    await subscription.unsubscribe().catch(() => undefined);
    subscription = null;
    criar = true;
  }
  if (!subscription && criar) {
    const keyBytes = urlBase64ToUint8Array(vapidPublicKey);
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes.buffer.slice(
        keyBytes.byteOffset,
        keyBytes.byteOffset + keyBytes.byteLength,
      ) as ArrayBuffer,
    });
  }
  return subscription;
}

export async function enablePushNotifications(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (isPreviewContext())
    return {
      ok: false,
      reason: "As notificações só funcionam no app publicado — instale o app na tela inicial.",
    };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Permissão negada." };

  const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
  await navigator.serviceWorker.ready;

  const vapidPublicKey = await getVapidPublicKey();
  if (!vapidPublicKey) return { ok: false, reason: "Chave VAPID não configurada." };

  const subscription = await inscricaoValida(reg, vapidPublicKey, true);
  if (!subscription) return { ok: false, reason: "O navegador não criou a inscrição." };
  return registrarNoBanco(subscription);
}

/**
 * Roda ao abrir o app: se este aparelho já tem permissão e inscrição, confirma que ela está com a
 * chave atual e gravada para quem está logado AGORA. Devolve true só quando o aviso vai chegar.
 */
export async function sincronizarAparelho(): Promise<boolean> {
  try {
    if (!isPushSupported() || isPreviewContext()) return false;
    if (Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    if (!reg) return false;
    const vapidPublicKey = await getVapidPublicKey();
    if (!vapidPublicKey) return false;
    const subscription = await inscricaoValida(reg, vapidPublicKey, false);
    if (!subscription) return false;
    const r = await registrarNoBanco(subscription);
    if (!r.ok) console.warn("[push] não registrou o aparelho:", r.reason);
    return r.ok;
  } catch (e) {
    console.warn("[push] sincronização falhou", e);
    return false;
  }
}

export async function disablePushNotifications(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (e) {
    console.warn("[push] disable failed", e);
  }
}

/** Inscrito de verdade: o navegador tem a inscrição E o banco tem a linha deste usuário. */
export async function isCurrentlySubscribed(): Promise<boolean> {
  try {
    if (!isPushSupported()) return false;
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return false;
    const { data } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", sub.endpoint)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}
