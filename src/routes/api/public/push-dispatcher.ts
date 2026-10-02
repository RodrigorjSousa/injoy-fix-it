import { createFileRoute } from "@tanstack/react-router";
import { sendWebPush, type PushSubscriptionRow } from "@/lib/push-sender.server";

type EventKind = "chamado" | "recado_camareira" | "troca_turno" | "purchase_request" | "finance_due" | "escala_publicada" | "escala_alterada";
type Body = { event: EventKind; data: Record<string, unknown> };

function buildNotification(evt: Body): { title: string; body: string; url: string; tag: string } {
  const d = evt.data as Record<string, unknown>;
  switch (evt.event) {
    case "chamado":
      return {
        title: "🔧 Novo chamado",
        body: `${d.categoria ?? "Chamado"} — ${String(d.descricao ?? "").slice(0, 120)}`,
        url: `/painel`,
        tag: `chamado-${d.id}`,
      };
    case "recado_camareira": {
      const from = d.direction === "camareira_to_recepcao" ? "camareira" : "recepção";
      return {
        title: `💬 Recado da ${from}`,
        body: `Quarto ${d.room_number}: ${String(d.message ?? "").slice(0, 140)}`,
        url: d.direction === "camareira_to_recepcao" ? "/recepcao" : "/camareiras",
        tag: `recado-${d.id}`,
      };
    }
    case "troca_turno":
      return {
        title: "🔄 Troca de turno registrada",
        body: `${d.funcionario_saida ?? "?"} → ${d.funcionario_entrada ?? "?"}`,
        url: "/relatorios-turno",
        tag: `troca-${d.id}`,
      };
    case "purchase_request":
      return {
        title: "🛒 Nova solicitação de compra",
        body: `${d.quantity ?? ""} × ${d.item_name ?? ""} (${d.urgency ?? "normal"})`,
        url: "/almoxarifado",
        tag: `compra-${d.id}`,
      };
    case "finance_due":
      return {
        title: "Contas a vencer",
        body: `${d.count ?? 0} conta(s): ${d.due_today ?? 0} vencendo hoje e ${d.due_in_three_days ?? 0} em três dias.`,
        url: "/gestor/financeiro",
        tag: `financeiro-${d.date ?? "hoje"}`,
      };
    case "escala_publicada": {
      const date = String(d.competencia ?? "");
      const [year, month] = date.split("-");
      return { title: "📅 Escala publicada", body: `Sua escala de ${month}/${year} foi publicada.`, url: "/minha-escala", tag: `escala-${d.id}` };
    }
    case "escala_alterada":
      return { title: "📅 Sua escala mudou", body: `Dia ${String(d.data ?? "").split("-").reverse().slice(0, 2).join("/")}: ${d.antes ?? "—"} → ${d.depois ?? "—"}${d.motivo ? `, motivo: ${d.motivo}` : ""}.`, url: "/minha-escala", tag: `escala-dia-${d.id}` };
  }
}

async function targetsForEvent(evt: Body): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const d = evt.data as Record<string, unknown>;

  // Helper: user_ids com um papel
  const byRoles = async (roles: string[]) => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", roles as never);
    return (data ?? []).map((r) => r.user_id as string);
  };

  switch (evt.event) {
    case "chamado": {
      // Técnico designado + gestores/admin
      const ids = new Set<string>();
      if (d.responsavel_id) {
        const { data } = await supabaseAdmin
          .from("funcionarios")
          .select("user_id")
          .eq("id", d.responsavel_id as string)
          .maybeSingle();
        if (data?.user_id) ids.add(data.user_id as string);
      }
      (await byRoles(["admin", "gestor"])).forEach((u) => ids.add(u));
      return [...ids];
    }
    case "recado_camareira": {
      const roles =
        d.direction === "camareira_to_recepcao"
          ? ["recepcao", "admin", "gestor"]
          : ["camareira", "admin", "gestor"];
      return byRoles(roles);
    }
    case "troca_turno":
      return byRoles(["admin", "gestor", "recepcao"]);
    case "purchase_request":
      return byRoles(["admin", "gestor"]);
    case "finance_due":
      return byRoles(["admin", "gestor"]);
    case "escala_alterada":
      return typeof d.user_id === "string" ? [d.user_id] : [];
    case "escala_publicada": {
      const { data } = await supabaseAdmin
        .from("escala_colaboradores")
        .select("funcionario_id")
        .eq("setor", String(d.setor))
        .eq("ativo", true)
        .in("unidade", [String(d.unidade), "Ambas"]);
      const funcionarioIds = (data ?? []).map((row) => row.funcionario_id).filter((id): id is string => typeof id === "string");
      if (!funcionarioIds.length) return [];
      const { data: employees } = await supabaseAdmin.from("funcionarios").select("user_id").in("id", funcionarioIds);
      return (employees ?? []).map((row) => row.user_id).filter((id): id is string => typeof id === "string");
    }
  }
}

export const Route = createFileRoute("/api/public/push-dispatcher")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-dispatcher-secret");
        const expected = process.env.PUSH_DISPATCH_SECRET;
        if (!expected || secret !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: Body;
        try {
          payload = (await request.json()) as Body;
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (!payload?.event || !payload.data) {
          return new Response("Bad request", { status: 400 });
        }

        const userIds = await targetsForEvent(payload);
        if (userIds.length === 0) return Response.json({ sent: 0 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth_key, user_id")
          .in("user_id", userIds);

        if (!subs || subs.length === 0) return Response.json({ sent: 0 });

        const notif = buildNotification(payload);
        const jsonPayload = JSON.stringify({
          title: notif.title,
          body: notif.body,
          url: notif.url,
          tag: notif.tag,
        });

        const results = await Promise.allSettled(
          subs.map(async (s) => {
            const r = await sendWebPush(s as PushSubscriptionRow, jsonPayload);
            // Remove endpoints inválidos (410 Gone / 404)
            if (!r.ok && (r.status === 404 || r.status === 410)) {
              await supabaseAdmin
                .from("push_subscriptions")
                .delete()
                .eq("endpoint", (s as { endpoint: string }).endpoint);
            }
            return r;
          }),
        );

        const sent = results.filter(
          (r) => r.status === "fulfilled" && (r.value as { ok: boolean }).ok,
        ).length;
        return Response.json({ sent, total: subs.length });
      },
    },
  },
});
