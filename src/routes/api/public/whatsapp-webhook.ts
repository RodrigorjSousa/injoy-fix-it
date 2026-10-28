import { createFileRoute } from "@tanstack/react-router";

// Webhook da Meta (WhatsApp Cloud API). Ver docs/projeto-injoy/08-whatsapp-ia.md (E3).
//   GET  → verificação do endereço (hub.verify_token = WHATSAPP_VERIFY_TOKEN).
//   POST → só com a assinatura X-Hub-Signature-256 válida (WHATSAPP_APP_SECRET). Grava mensagens, ecos da
//          equipe e status, e responde 200 na hora. Quem escreve o rascunho da Joy é o agendamento de 1 min.
// Nada aqui envia mensagem a hóspede.
export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
        if (
          q.get("hub.mode") === "subscribe" &&
          esperado &&
          q.get("hub.verify_token") === esperado
        ) {
          return new Response(q.get("hub.challenge") ?? "", {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const corpo = await request.text();
        const segredo = process.env.WHATSAPP_APP_SECRET ?? "";
        const { assinaturaMetaValida, registrarWebhook } =
          await import("@/lib/whatsapp/whatsapp.server");
        if (
          !segredo ||
          !(await assinaturaMetaValida(corpo, request.headers.get("x-hub-signature-256"), segredo))
        ) {
          return new Response("assinatura inválida", { status: 401 });
        }
        let payload: unknown;
        try {
          payload = JSON.parse(corpo);
        } catch {
          return new Response("corpo inválido", { status: 400 });
        }
        try {
          return Response.json({ ok: true, ...(await registrarWebhook(payload)) });
        } catch (e) {
          // 500 faz a Meta reenviar depois; o wamid único evita duplicar.
          console.error("[whatsapp-webhook]", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
