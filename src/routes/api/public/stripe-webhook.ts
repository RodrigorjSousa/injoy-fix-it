import { createFileRoute } from "@tanstack/react-router";

// Aviso do Stripe quando o hóspede paga o link (fatura). Um endpoint por unidade no painel do Stripe:
//   https://<app>/api/public/stripe-webhook?unidade=Botafogo   (segredo STRIPE_WEBHOOK_SECRET_BOTAFOGO)
//   https://<app>/api/public/stripe-webhook?unidade=Ipanema    (segredo STRIPE_WEBHOOK_SECRET_IPANEMA)
// Evento usado: invoice.paid. A assinatura é conferida; sem ela, nada é feito.
export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unidade = new URL(request.url).searchParams.get("unidade");
        if (unidade !== "Botafogo" && unidade !== "Ipanema") return new Response("unidade inválida", { status: 400 });
        const segredo = process.env[`STRIPE_WEBHOOK_SECRET_${unidade.toUpperCase()}`] ?? "";
        const corpo = await request.text();
        const { assinaturaValida } = await import("@/lib/reservas/stripe.server");
        if (!segredo || !(await assinaturaValida(corpo, request.headers.get("stripe-signature"), segredo))) {
          return new Response("assinatura inválida", { status: 400 });
        }
        let evento: { type?: string; data?: { object?: Record<string, unknown> } };
        try {
          evento = JSON.parse(corpo);
        } catch {
          return new Response("corpo inválido", { status: 400 });
        }
        if (evento.type !== "invoice.paid" || !evento.data?.object) return Response.json({ ok: true, ignorado: evento.type });
        try {
          const { linkPago } = await import("@/lib/reservas/cobranca-stripe.server");
          return Response.json({ ok: true, resultado: await linkPago(unidade, evento.data.object) });
        } catch (e) {
          console.error("[stripe-webhook]", e);
          return Response.json({ ok: false, erro: "falha ao processar" }, { status: 500 });
        }
      },
    },
  },
});
