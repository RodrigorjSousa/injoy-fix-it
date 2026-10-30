import { createFileRoute } from "@tanstack/react-router";
import { sendWebPush, type PushSubscriptionRow } from "@/lib/push-sender.server";
import { duracaoChamado } from "@/lib/chamado-tempo";
import { juntar, usuariosDaRecepcao, usuariosDasCamareiras } from "@/lib/push-destinatarios";

type EventKind =
  | "chamado"
  | "chamado_designado"
  | "chamado_concluido"
  | "chamado_atrasado"
  | "teste"
  | "recado_camareira"
  | "troca_turno"
  | "purchase_request"
  | "finance_due"
  | "escala_publicada"
  | "escala_alterada"
  | "previsao_carga"
  | "previsao_reforco"
  | "previsao_reforco_resposta"
  | "ponto_pendente"
  | "ponto_atestado"
  | "ponto_atestado_resposta"
  | "reservas_cobranca"
  | "recado_gestor";
type Body = { event: EventKind; data: Record<string, unknown> };

function buildNotification(evt: Body): { title: string; body: string; url: string; tag: string; urgente?: boolean } {
  const d = evt.data as Record<string, unknown>;
  switch (evt.event) {
    case "chamado":
      return {
        title: `🔧 Novo chamado${d.unidade ? ` · ${d.unidade}` : ""}`,
        body: `${d.categoria ?? "Chamado"} — ${String(d.descricao ?? "").slice(0, 120)}`,
        url: d.id ? `/chamados/${d.id}` : `/painel`,
        tag: `chamado-${d.id}`,
      };
    case "chamado_designado":
      return {
        title: "🔧 Chamado designado para você",
        body: `${d.categoria ?? "Chamado"} — ${String(d.descricao ?? "").slice(0, 120)}`,
        url: d.id ? `/chamados/${d.id}` : "/painel",
        tag: `chamado-designado-${d.id}`,
      };
    case "chamado_concluido": {
      const levou = duracaoChamado(d.aberto_em as string, d.concluido_em as string);
      return {
        title: `✅ Chamado finalizado${d.unidade ? ` · ${d.unidade}` : ""}`,
        body: `${String(d.descricao ?? "").slice(0, 100)} — fechado${d.concluido_por_nome ? ` por ${d.concluido_por_nome}` : ""}${levou ? ` · levou ${levou}` : ""}.`,
        url: d.id ? `/chamados/${d.id}` : "/painel",
        tag: `chamado-concluido-${d.id}`,
      };
    }
    case "chamado_atrasado": {
      const dias = Number(d.dias_aberto ?? 3);
      return {
        title: `🚨 URGENTE · chamado atrasado${d.unidade ? ` · ${d.unidade}` : ""}`,
        body: `Aberto há ${dias} dias e ainda não concluído (prazo: 3 dias). ${String(d.descricao ?? "").slice(0, 100)}${d.responsavel_nome ? ` · Resp.: ${d.responsavel_nome}` : ""}`,
        url: d.id ? `/chamados/${d.id}` : "/painel",
        tag: `chamado-atrasado-${d.id}`,
        urgente: true,
      };
    }
    case "teste":
      return {
        title: "✅ Notificações funcionando",
        body: "Este aparelho vai receber os avisos do INJOY.",
        url: "/",
        tag: `teste-${Date.now()}`,
      };
    case "recado_gestor": {
      const msg = String(d.mensagem ?? "");
      return {
        title: `📢 Recado do gestor${d.gestor_nome ? ` (${d.gestor_nome})` : ""}`,
        body: msg.length > 160 ? `${msg.slice(0, 157)}…` : msg,
        url: "/",
        tag: `recado-gestor-${d.id}`,
        urgente: true,
      };
    }
    case "recado_camareira": {
      const paraRecepcao = d.direction === "camareira_to_recepcao" || d.direction === "to_recepcao";
      const from = paraRecepcao ? "camareira" : "recepção";
      return {
        title: `💬 Recado da ${from}${d.property ? ` · ${d.property}` : ""}`,
        body: `Quarto ${d.room_number}: ${String(d.message ?? "").slice(0, 140)}`,
        url: paraRecepcao ? "/recepcao" : "/camareiras",
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
    case "previsao_carga":
      return {
        title: d.nivel === "vermelho" ? "Reforço necessário" : "Atenção à carga de limpeza",
        body: `${d.unidade} · ${d.data}: ${d.gerais ?? 0} gerais e carga de ${d.ocupacao_pct ?? 0}%.`,
        url: "/gestor/previsao-carga",
        tag: `previsao-${d.unidade}-${d.data}-${d.tipo}`,
      };
    case "previsao_reforco":
      if (d.lancado)
        return {
          title: "Reforço lançado na limpeza",
          body: `${d.nome ?? "Recepção"} lançou ${d.freelancer ?? "freelancer"} · ${d.unidade} ${String(d.data ?? "").split("-").reverse().join("/")}${d.valor != null ? ` · ${Number(d.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}${d.mensagem ? `: ${String(d.mensagem).slice(0, 100)}` : ""}. Toque para conferir ou corrigir.`,
          url: "/gestor/previsao-carga",
          tag: `reforco-${d.id}`,
        };
      return {
        title: "Pedido de reforço na limpeza",
        body: `${d.nome ?? "Recepção"} pede freelancer · ${d.unidade} ${String(d.data ?? "").split("-").reverse().join("/")}${d.ocupacao_pct != null ? ` (carga ${d.ocupacao_pct}%)` : ""}${d.mensagem ? `: ${String(d.mensagem).slice(0, 100)}` : ""}. Toque para autorizar.`,
        url: "/gestor/previsao-carga",
        tag: `reforco-${d.id}`,
      };
    case "previsao_reforco_resposta":
      return {
        title: d.autorizado ? "Reforço autorizado" : "Reforço não autorizado",
        body: `${d.unidade} ${String(d.data ?? "").split("-").reverse().join("/")}${d.autorizado ? ": pode chamar o freelancer." : "."}${d.resposta ? ` ${String(d.resposta).slice(0, 100)}` : ""}`,
        url: "/previsao-carga",
        tag: `reforco-resposta-${d.id}`,
      };
    case "ponto_pendente":
      return {
        title: "Ponto com pendência",
        body: `${d.nome ?? "Colaborador"} · ${({ entrada: "entrada", saida_almoco: "saída para almoço", volta_almoco: "volta do almoço", saida: "saída" } as Record<string, string>)[String(d.tipo)] ?? "batida"} em ${d.unidade ?? ""} precisa de conferência.`,
        url: "/gestor/ponto",
        tag: `ponto-${d.id}`,
      };
    case "ponto_atestado":
      return {
        title: "Atestado médico recebido",
        body: `${d.nome ?? "Colaborador"} enviou atestado de ${String(d.data_inicio ?? "")
          .split("-")
          .reverse()
          .join(
            "/",
          )}${d.data_fim && d.data_fim !== d.data_inicio ? ` a ${String(d.data_fim).split("-").reverse().join("/")}` : ""}. Confira e aprove.`,
        url: "/gestor/ponto",
        tag: `atestado-${d.id}`,
      };
    case "ponto_atestado_resposta":
      return {
        title: d.aprovado ? "Atestado aprovado" : "Atestado recusado",
        body: d.aprovado
          ? "Seu atestado foi aprovado pelo gestor."
          : `Seu atestado foi recusado${d.resposta ? `: ${String(d.resposta).slice(0, 120)}` : "."}`,
        url: "/ponto",
        tag: `atestado-resposta-${d.id}`,
      };
    case "reservas_cobranca": {
      const qtd = Number(d.quantidade ?? 0);
      const total = Number(d.total ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return {
        title: qtd === 1 ? "💳 Reserva para cobrar" : `💳 ${qtd} reservas para cobrar`,
        body: `${qtd === 1 && d.hospede ? `${d.hospede} · ` : ""}${d.unidades ?? ""} · ${total} em aberto. Toque para ver a lista.`,
        url: "/reservas",
        tag: `reservas-cobranca-${d.data ?? "hoje"}`,
      };
    }
    case "escala_publicada": {
      const date = String(d.competencia ?? "");
      const [year, month] = date.split("-");
      return {
        title: "📅 Escala publicada",
        body: `Sua escala de ${month}/${year} foi publicada.`,
        url: "/minha-escala",
        tag: `escala-${d.id}`,
      };
    }
    case "escala_alterada":
      return {
        title: "📅 Sua escala mudou",
        body: `Dia ${String(d.data ?? "")
          .split("-")
          .reverse()
          .slice(0, 2)
          .join(
            "/",
          )}: ${d.antes ?? "—"} → ${d.depois ?? "—"}${d.motivo ? `, motivo: ${d.motivo}` : ""}.`,
        url: "/minha-escala",
        tag: `escala-dia-${d.id}`,
      };
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

  // Recepção = papel recepcao OU tela Recepção liberada no cadastro (mesma regra do menu).
  const recepcao = async () => {
    const [{ data: papeis }, { data: funcs }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").eq("role", "recepcao" as never),
      supabaseAdmin.from("funcionarios").select("user_id, telas_permitidas"),
    ]);
    return usuariosDaRecepcao(
      (papeis ?? []) as { user_id: string | null; role: string }[],
      (funcs ?? []) as { user_id: string | null; telas_permitidas: string[] | null }[],
    );
  };

  // Camareiras = papel camareira OU tela Camareiras liberada no cadastro.
  const camareiras = async () => {
    const [{ data: papeis }, { data: funcs }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").eq("role", "camareira" as never),
      supabaseAdmin.from("funcionarios").select("user_id, telas_permitidas"),
    ]);
    return usuariosDasCamareiras(
      (papeis ?? []) as { user_id: string | null; role: string }[],
      (funcs ?? []) as { user_id: string | null; telas_permitidas: string[] | null }[],
    );
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
      // Recepção acompanha o Painel: sabe quando um quarto tem chamado aberto.
      (await recepcao()).forEach((u) => ids.add(u));
      return [...ids];
    }
    case "chamado_designado": {
      if (!d.responsavel_id) return [];
      const { data } = await supabaseAdmin
        .from("funcionarios")
        .select("user_id")
        .eq("id", d.responsavel_id as string)
        .maybeSingle();
      return data?.user_id ? [data.user_id as string] : [];
    }
    case "chamado_concluido":
      // Quem abriu o chamado + a recepção (quarto liberado). O banco não manda quando quem
      // abriu foi quem fechou; aí só a recepção recebe.
      return juntar(
        typeof d.criado_por === "string" && d.criado_por !== d.concluido_por ? [d.criado_por] : [],
        await recepcao(),
      ).filter((u) => u !== d.concluido_por);
    case "chamado_atrasado": {
      // Técnico responsável (em caráter de urgência) + gestores, que acompanham o atraso.
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
    case "teste":
      return typeof d.user_id === "string" ? [d.user_id] : [];
    case "recado_gestor":
      // Lista resolvida no envio (setores, todos ou pessoas escolhidas).
      return Array.isArray(d.destinatarios)
        ? (d.destinatarios as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
    case "recado_camareira": {
      const paraRecepcao = d.direction === "camareira_to_recepcao" || d.direction === "to_recepcao";
      if (paraRecepcao) return juntar(await recepcao(), await byRoles(["admin", "gestor"]));
      return juntar(await camareiras(), await byRoles(["admin", "gestor"]));
    }
    case "troca_turno":
      return juntar(await recepcao(), await byRoles(["admin", "gestor"]));
    case "purchase_request":
      return byRoles(["admin", "gestor"]);
    case "finance_due":
    case "previsao_carga":
    case "ponto_pendente":
    case "ponto_atestado":
      return byRoles(["admin", "gestor"]);
    case "previsao_reforco":
      return byRoles(["admin", "gestor"]);
    case "reservas_cobranca": {
      // Quem vê a tela Reservas (gestor/admin e liberados) — regra única no banco.
      const { data } = await supabaseAdmin.rpc("reservas_destinatarios" as never);
      const lista = Array.isArray(data) ? (data as unknown[]) : [];
      const liberados = lista
        .map((x) => (typeof x === "string" ? x : (x as Record<string, unknown>)?.reservas_destinatarios))
        .filter((id): id is string => typeof id === "string");
      // A recepção é quem cobra: recebe sempre o aviso de reservas.
      return juntar(liberados, await recepcao());
    }
    case "previsao_reforco_resposta":
    case "ponto_atestado_resposta":
    case "escala_alterada":
      return typeof d.user_id === "string" ? [d.user_id] : [];
    case "escala_publicada": {
      const { data } = await supabaseAdmin
        .from("escala_colaboradores")
        .select("funcionario_id")
        .eq("setor", String(d.setor))
        .eq("ativo", true)
        .in("unidade", [String(d.unidade), "Ambas"]);
      const funcionarioIds = (data ?? [])
        .map((row) => row.funcionario_id)
        .filter((id): id is string => typeof id === "string");
      if (!funcionarioIds.length) return [];
      const { data: employees } = await supabaseAdmin
        .from("funcionarios")
        .select("user_id")
        .in("id", funcionarioIds);
      return (employees ?? [])
        .map((row) => row.user_id)
        .filter((id): id is string => typeof id === "string");
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
          urgente: notif.urgente === true,
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
        // Log para conferir no painel do Lovable quando alguém disser que não chegou.
        const falhas = results
          .map((r) => (r.status === "fulfilled" ? (r.value.ok ? null : `${r.value.status}`) : "erro"))
          .filter(Boolean);
        console.log(
          `[push] ${payload.event}: ${sent}/${subs.length} aparelho(s) de ${userIds.length} pessoa(s)${falhas.length ? ` · falhas: ${falhas.join(",")}` : ""}`,
        );
        return Response.json({ sent, total: subs.length });
      },
    },
  },
});
