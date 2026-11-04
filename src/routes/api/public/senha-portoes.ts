import { createFileRoute } from "@tanstack/react-router";
import { rodarSenhasPortoes } from "@/lib/totem/senha-portoes.server";

// Chamado pelo agendamento do banco (private.run_senha_portoes), a cada 15 minutos:
// senha provisória dos portões para quem fez o check-in online no Cloudbeds.
export const Route = createFileRoute("/api/public/senha-portoes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-dispatcher-secret");
        const expected = process.env.PUSH_DISPATCH_SECRET;
        if (!expected || provided !== expected) return new Response("Unauthorized", { status: 401 });
        try {
          return Response.json(await rodarSenhasPortoes());
        } catch (error) {
          console.error("[senha-portoes]", error);
          return Response.json({ error: "Falha ao gerar as senhas provisórias dos portões" }, { status: 500 });
        }
      },
    },
  },
});
