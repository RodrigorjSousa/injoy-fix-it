import { createFileRoute } from "@tanstack/react-router";

const BASE = "https://api.pontomais.com.br/external_api/v1";

async function tryEndpoint(url: string, token: string, method: "GET" | "POST" = "GET", body?: unknown) {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "access-token": token },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { url, method, status: res.status, ok: res.ok, snippet: text.slice(0, 6000) };
  } catch (e) {
    return { url, method, status: 0, ok: false, snippet: (e as Error).message };
  }
}

export const Route = createFileRoute("/api/public/pontomais-probe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        if (secret !== process.env.CRON_SHARED_SECRET) {
          return new Response("forbidden", { status: 401 });
        }
        const token = (process.env.PONTOMAIS_API_TOKEN ?? "").trim().replace(/^Bearer\s+/i, "");
        if (!token) return new Response("no token", { status: 500 });

        const eid = url.searchParams.get("employeeId") ?? "";
        const sd = url.searchParams.get("startDate") ?? "";
        const ed = url.searchParams.get("endDate") ?? "";

        const attempts = [
          `${BASE}/time_cards?start_date=${sd}&end_date=${ed}&employee_id=${eid}`,
          `${BASE}/time_cards?start_date=${sd}&end_date=${ed}&employee_ids[]=${eid}`,
          `${BASE}/time_cards?start_date=${sd}&end_date=${ed}&employee_ids=${eid}&attributes=basic,time_cards_entries`,
          `${BASE}/time_cards?filter[start_date]=${sd}&filter[end_date]=${ed}&filter[employee_id]=${eid}`,
          `${BASE}/employees/${eid}/time_cards?start_date=${sd}&end_date=${ed}`,
          `${BASE}/time_card_control?start_date=${sd}&end_date=${ed}&employee_id=${eid}`,
          `${BASE}/reports/time_cards?start_date=${sd}&end_date=${ed}&employee_id=${eid}`,
          `${BASE}/time_cards?start_date=${sd}&end_date=${ed}`,
        ];

        const results: unknown[] = [];
        for (const u of attempts) results.push(await tryEndpoint(u, token, "GET"));

        results.push(
          await tryEndpoint(`${BASE}/reports/time_cards`, token, "POST", {
            report: { start_date: sd, end_date: ed, employee_id: eid, format: "json" },
          }),
        );

        return new Response(JSON.stringify({ results }, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
