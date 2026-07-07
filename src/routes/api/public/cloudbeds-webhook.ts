import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cloudbeds-Signature",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/public/cloudbeds-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      GET: async () =>
        json({ ok: true, endpoint: "cloudbeds-webhook", accepts: "POST" }),

      POST: async ({ request }) => {
        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const event: string =
          payload?.event ?? payload?.type ?? payload?.eventType ?? "";

        if (event && event !== "reservation_checked_out") {
          return json({ ok: true, ignored: true, event });
        }

        const r = payload?.reservation ?? payload?.data ?? payload ?? {};
        const quarto = String(
          r.room ?? r.room_number ?? r.roomNumber ?? r.unit ?? r.quarto ?? "",
        ).trim();

        if (!quarto) {
          return json({ error: "Missing room number" }, 400);
        }

        const hospede: string =
          r.guest_name ?? r.guestName ?? r.hospede ?? r.guest?.name ?? "";
        const pax: number = Number(
          r.pax ?? r.guests ?? r.adults ?? r.num_guests ?? 1,
        );
        const dataSaida: string | null =
          r.check_out ?? r.checkout ?? r.checkOut ?? r.departure ?? r.dataSaida ?? null;
        const pagamentoPendente: boolean = Boolean(
          r.payment_pending ?? r.paymentPending ?? r.balance_due ?? r.pagamentoPendente,
        );
        const documentoPendente: boolean = Boolean(
          r.document_pending ?? r.documentPending ?? r.missing_documents ?? r.documentoPendente,
        );
        const unidade: string | null =
          r.property ?? r.property_name ?? r.unidade ?? null;
        const reservationId: string | null =
          r.reservation_id ?? r.reservationId ?? r.id ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const row = {
          reservation_id: reservationId,
          quarto,
          hospede: hospede || null,
          pax: Number.isFinite(pax) ? pax : 1,
          data_saida: dataSaida,
          pagamento_pendente: pagamentoPendente,
          documento_pendente: documentoPendente,
          status_limpeza: "Pendente",
          unidade,
          raw_payload: payload,
        };

        const query = reservationId
          ? supabaseAdmin
              .from("housekeeping_tasks")
              .upsert(row, { onConflict: "reservation_id" })
          : supabaseAdmin.from("housekeeping_tasks").insert(row);

        const { data, error } = await query.select().single();

        if (error) {
          console.error("[cloudbeds-webhook] insert error", error);
          return json({ error: error.message }, 500);
        }

        return json({ ok: true, task: data });
      },
    },
  },
});
