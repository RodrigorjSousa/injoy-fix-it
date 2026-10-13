import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook da Pagar.me / Stone Connect 2.0 (charge.paid, charge.refunded, order.*).
 * Cadastre no painel Pagar.me › Configurações › Webhooks:
 *   https://<endereço do app>/api/public/pagarme-webhook
 *
 * O corpo NÃO é confiável: o servidor relê o pedido na API da Pagar.me com a chave
 * secreta antes de marcar qualquer pagamento como aprovado.
 * Opcional: defina PAGARME_WEBHOOK_TOKEN e cadastre a URL com ?token=<valor>.
 */
export const Route = createFileRoute("/api/public/pagarme-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const esperado = process.env.PAGARME_WEBHOOK_TOKEN;
        if (esperado && new URL(request.url).searchParams.get("token") !== esperado) {
          return new Response("Unauthorized", { status: 401 });
        }
        let payload: Record<string, unknown>;
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }
        try {
          const { processarWebhook } = await import("@/lib/totem/cobranca.server");
          return Response.json(await processarWebhook(payload));
        } catch (error) {
          console.error("[pagarme-webhook]", error);
          // 500 faz a Pagar.me tentar de novo; a tela do totem também consulta sozinha.
          return Response.json({ error: error instanceof Error ? error.message : "erro" }, { status: 500 });
        }
      },
    },
  },
});
