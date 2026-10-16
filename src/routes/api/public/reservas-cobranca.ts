import { createFileRoute } from "@tanstack/react-router";
import { sincronizarCobrancas } from "@/lib/reservas/cobranca-sync.server";

// Chamado pelo agendamento do banco (private.run_reservas_cobranca_sync), a cada 1 hora.
export const Route = createFileRoute("/api/public/reservas-cobranca")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-dispatcher-secret");
        const expected = process.env.PUSH_DISPATCH_SECRET;
        if (!expected || provided !== expected) return new Response("Unauthorized", { status: 401 });
        try {
          return Response.json(await sincronizarCobrancas());
        } catch (error) {
          console.error("[reservas-cobranca]", error);
          return Response.json({ error: "Falha ao atualizar a lista de cobrança" }, { status: 500 });
        }
      },
    },
  },
});
