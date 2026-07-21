import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  employeeId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});

const BASE = "https://api.pontomais.com.br/external_api/v1";

async function tryEndpoint(url: string, token: string, method: "GET" | "POST" = "GET", body?: unknown) {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "access-token": token,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { url, method, status: res.status, ok: res.ok, snippet: text.slice(0, 4000) };
  } catch (e) {
    return { url, method, status: 0, ok: false, snippet: (e as Error).message };
  }
}

export const probePontomais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => schema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "gestor" || r.role === "admin")) {
      throw new Error("forbidden");
    }
    const token = (process.env.PONTOMAIS_API_TOKEN ?? "").trim().replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("no token");

    const eid = data.employeeId;
    const sd = data.startDate;
    const ed = data.endDate;

    const attempts = [
      // Various time_cards variations
      `${BASE}/time_cards?start_date=${sd}&end_date=${ed}&employee_id=${eid}`,
      `${BASE}/time_cards?start_date=${sd}&end_date=${ed}&employee_ids[]=${eid}`,
      `${BASE}/time_cards?start_date=${sd}&end_date=${ed}&employee_ids=${eid}&attributes=time_cards_entries`,
      `${BASE}/time_cards?start_date=${sd}&end_date=${ed}&employee_ids=${eid}&attributes=basic,time_cards_entries`,
      `${BASE}/time_cards?filter[start_date]=${sd}&filter[end_date]=${ed}&filter[employee_id]=${eid}`,
      `${BASE}/employees/${eid}/time_cards?start_date=${sd}&end_date=${ed}`,
      `${BASE}/time_card_control?start_date=${sd}&end_date=${ed}&employee_id=${eid}`,
      `${BASE}/time_card_control?start_date=${sd}&end_date=${ed}&employee_ids=${eid}`,
      `${BASE}/reports/time_cards?start_date=${sd}&end_date=${ed}&employee_id=${eid}`,
    ];

    type Result = { url: string; method: string; status: number; ok: boolean; snippet: string };
    const results: Result[] = [];
    for (const url of attempts) {
      results.push((await tryEndpoint(url, token, "GET")) as Result);
    }

    // POST report variants
    results.push(
      (await tryEndpoint(`${BASE}/reports/time_cards`, token, "POST", {
        report: { start_date: sd, end_date: ed, employee_id: eid, format: "json" },
      })) as Result,
    );

    return { results };
  });
