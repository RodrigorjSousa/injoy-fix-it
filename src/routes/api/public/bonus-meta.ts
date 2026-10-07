import { createFileRoute } from "@tanstack/react-router";
import { atualizarMetaEquipe } from "@/lib/pontomais-sync.server";

// Chamado pelo agendamento do banco (private.run_bonus_meta_sync), 3x por dia.
export const Route = createFileRoute("/api/public/bonus-meta")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-dispatcher-secret");
        const expected = process.env.PUSH_DISPATCH_SECRET;
        if (!expected || provided !== expected) return new Response("Unauthorized", { status: 401 });
        try {
          return Response.json(await atualizarMetaEquipe());
        } catch (error) {
          console.error("[bonus-meta]", error);
          return Response.json({ error: "Falha ao atualizar a meta da equipe" }, { status: 500 });
        }
      },
    },
  },
});
