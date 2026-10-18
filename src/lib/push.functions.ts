import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Devolve a chave pública VAPID para o navegador se inscrever no push.
export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return process.env.VAPID_PUBLIC_KEY ?? "";
});

export type ResultadoTestePush = {
  ok: boolean;
  enviados: number;
  aparelhos: number;
  motivo?: string;
};

/**
 * Manda um aviso de teste para quem está logado, pelo MESMO caminho dos chamados
 * (endereço e senha guardados no banco → dispatcher → aparelhos). Se chegar, o caminho todo funciona.
 */
export const enviarNotificacaoTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResultadoTestePush> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("key,value")
      .in("key", ["push_dispatcher_url", "push_dispatcher_secret"]);
    const cfg = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));
    if (!cfg.push_dispatcher_url || !cfg.push_dispatcher_secret) {
      return {
        ok: false,
        enviados: 0,
        aparelhos: 0,
        motivo: "Endereço das notificações não configurado no banco.",
      };
    }
    try {
      const res = await fetch(String(cfg.push_dispatcher_url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dispatcher-secret": String(cfg.push_dispatcher_secret),
        },
        body: JSON.stringify({ event: "teste", data: { user_id: context.userId } }),
      });
      if (res.status === 401) {
        return {
          ok: false,
          enviados: 0,
          aparelhos: 0,
          motivo: "Senha do envio no banco diferente da do app (PUSH_DISPATCH_SECRET).",
        };
      }
      if (!res.ok)
        return { ok: false, enviados: 0, aparelhos: 0, motivo: `Envio respondeu ${res.status}.` };
      const j = (await res.json().catch(() => ({}))) as { sent?: number; total?: number };
      const enviados = Number(j.sent ?? 0);
      const aparelhos = Number(j.total ?? 0);
      return {
        ok: enviados > 0,
        enviados,
        aparelhos,
        motivo:
          aparelhos === 0
            ? "Nenhum aparelho seu cadastrado."
            : enviados === 0
              ? "O serviço de push recusou o envio."
              : undefined,
      };
    } catch (e) {
      return {
        ok: false,
        enviados: 0,
        aparelhos: 0,
        motivo: `Endereço das notificações não respondeu (${(e as Error).message}).`,
      };
    }
  });
