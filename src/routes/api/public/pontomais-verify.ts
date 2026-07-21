import { createFileRoute } from "@tanstack/react-router";
import { fetchPontomaisRegistrosByEmployeeId } from "@/lib/pontomais.server";

export const Route = createFileRoute("/api/public/pontomais-verify")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("secret") !== process.env.CRON_SHARED_SECRET) {
          return new Response("forbidden", { status: 401 });
        }
        const employeeId = url.searchParams.get("employeeId") ?? "";
        const startDate = url.searchParams.get("startDate") ?? "";
        const endDate = url.searchParams.get("endDate") ?? "";
        const result = await fetchPontomaisRegistrosByEmployeeId({
          employeeId,
          startDate,
          endDate,
        });
        return new Response(JSON.stringify(result, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
