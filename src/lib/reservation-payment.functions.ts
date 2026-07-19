import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PROPERTY = z.enum(["Ipanema", "Botafogo"]);
const METHODS = ["PIX", "Cartão de Crédito", "Cartão de Débito", "Dinheiro"] as const;
const METHOD = z.enum(METHODS);

// Mapa dos métodos exibidos no app -> paymentType aceito pelo Cloudbeds.
// Referência: POST /postPayment (v1.2) — valores tipicamente aceitos:
// "cash", "credit", "debit", "pix" (PIX é reconhecido no marketplace BR).
const METHOD_TO_CLOUDBEDS: Record<(typeof METHODS)[number], string> = {
  "PIX": "pix",
  "Cartão de Crédito": "credit",
  "Cartão de Débito": "debit",
  "Dinheiro": "cash",
};

const inputSchema = z.object({
  property: PROPERTY,
  reservationId: z.string().trim().min(1),
  guestName: z.string().trim().min(1),
  amount: z.number().positive().max(999999.99),
  paymentMethod: METHOD,
  receivedBy: z.string().trim().min(1),
});

/**
 * Registra um pagamento de reserva recebido no balcão:
 * 1) Envia baixa ao Cloudbeds via /postPayment.
 * 2) Persiste em public.reservation_payments para fechamento de caixa.
 */
export const postReservationPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    const allowed =
      roleSet.has("recepcao") || roleSet.has("gestor") || roleSet.has("admin");
    if (!allowed) throw new Error("Sem permissão para receber pagamentos");

    const { cloudbedsFetch } = await import("@/lib/cloudbeds/client.server");
    const property = data.property.toLowerCase() as "ipanema" | "botafogo";

    // POST /postPayment — Cloudbeds v1.2
    const body = new URLSearchParams({
      reservationID: data.reservationId,
      amount: data.amount.toFixed(2),
      type: METHOD_TO_CLOUDBEDS[data.paymentMethod],
      // Descrição amigável para aparecer no folio
      description: `Pagamento no balcão (${data.paymentMethod}) — ${data.receivedBy}`,
    });

    const res = await cloudbedsFetch(property, `/postPayment`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const rawText = await res.text().catch(() => "");
    let parsed: Record<string, unknown> = {};
    try {
      parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      // resposta não-JSON
    }
    const json = parsed as { success?: boolean; message?: string };
    const cloudbedsResponse = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;

    if (!res.ok || json.success === false) {
      throw new Error(
        (json.message as string) ||
          `Cloudbeds recusou o pagamento (${res.status}). Verifique se a reserva ainda tem saldo devedor.`,
      );
    }

    const { error: insErr, data: inserted } = await supabase
      .from("reservation_payments")
      .insert({
        property: data.property,
        reservation_id: data.reservationId,
        guest_name: data.guestName,
        amount: data.amount,
        payment_method: data.paymentMethod,
        received_by: data.receivedBy,
        received_by_user_id: userId,
        cloudbeds_response: json,
      })
      .select("id, created_at")
      .single();

    if (insErr) {
      // Cloudbeds já aceitou — logamos mas não bloqueamos o fluxo do balcão.
      console.error("[reservation-payment] falha ao gravar auditoria:", insErr);
    }

    return {
      ok: true,
      cloudbedsResponse: json,
      paymentId: inserted?.id ?? null,
      createdAt: inserted?.created_at ?? null,
    };
  });

// Totais de recebimento no balcão para fechamento de caixa
const totalsSchema = z.object({
  property: PROPERTY,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getReservationPaymentsTotals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => totalsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!(roleSet.has("gestor") || roleSet.has("admin"))) {
      throw new Error("Sem permissão");
    }

    const fromISO = `${data.from}T00:00:00-03:00`;
    const toISO = `${data.to}T23:59:59-03:00`;

    const { data: rows, error } = await supabase
      .from("reservation_payments")
      .select("amount, payment_method, created_at, guest_name, received_by")
      .eq("property", data.property)
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const totals = { PIX: 0, "Cartão de Crédito": 0, "Cartão de Débito": 0, Dinheiro: 0 } as Record<
      string,
      number
    >;
    let total = 0;
    for (const r of rows ?? []) {
      const v = Number(r.amount) || 0;
      total += v;
      if (totals[r.payment_method] !== undefined) totals[r.payment_method] += v;
    }
    return { total, totals, count: (rows ?? []).length, rows: rows ?? [] };
  });
