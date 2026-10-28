import { createFileRoute } from "@tanstack/react-router";

// Chamado pelo agendamento do banco (private.run_whatsapp_processar), a cada 1 minuto, só quando o
// WhatsApp está ligado e há conversa esperando. A Joy escreve RASCUNHOS; nada é enviado daqui.
export const Route = createFileRoute("/api/public/whatsapp-processar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-dispatcher-secret");
        const expected = process.env.PUSH_DISPATCH_SECRET;
        if (!expected || provided !== expected)
          return new Response("Unauthorized", { status: 401 });
        try {
          const { processarPendentes } = await import("@/lib/whatsapp/whatsapp.server");
          return Response.json(await processarPendentes());
        } catch (error) {
          console.error("[whatsapp-processar]", error);
          return Response.json({ error: "Falha ao processar o WhatsApp" }, { status: 500 });
        }
      },
    },
  },
});
