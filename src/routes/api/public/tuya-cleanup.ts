import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron de limpeza automática de senhas Tuya.
 *
 * Roda periodicamente (agendado via pg_cron a cada 15 min) e revoga na Tuya
 * TODAS as senhas temporárias de quarto (Zigbee) cujo período já expirou e
 * que ainda não foram marcadas como revogadas em `tuya_password_logs`.
 *
 * As senhas fixas de portão/vidro (categoria WiFi "mk") NÃO são tocadas — elas
 * são trocadas manualmente pela recepção via app Tuya Smart + Gestão.
 */
export const Route = createFileRoute("/api/public/tuya-cleanup")({
  server: {
    handlers: {
      POST: async () => {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY!;

        const nowIso = new Date().toISOString();

        // 1) Buscar logs cujo período de estadia terminou e ainda não foram revogados.
        const listRes = await fetch(
          `${SUPABASE_URL}/rest/v1/tuya_password_logs?select=id,room_number,unidade,senha_ids,device_ids,saida&revoked_at=is.null&saida=lt.${encodeURIComponent(nowIso)}&order=saida.asc&limit=200`,
          {
            headers: {
              apikey: SERVICE_ROLE,
              Authorization: `Bearer ${SERVICE_ROLE}`,
            },
          },
        );
        if (!listRes.ok) {
          return new Response(
            JSON.stringify({ error: "list_failed", detail: await listRes.text() }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        const rows = (await listRes.json()) as Array<{
          id: string;
          room_number: string;
          unidade: string | null;
          senha_ids: Record<string, string | number> | null;
          device_ids: string[] | null;
          saida: string;
        }>;

        let processed = 0;
        let revoked = 0;
        const errors: Array<{ id: string; reason: string }> = [];

        for (const row of rows) {
          processed++;
          const items = Object.entries(row.senha_ids ?? {})
            .filter(([, pid]) => pid && String(pid) !== "senha_fixa")
            .map(([deviceId, passwordId]) => ({ deviceId, passwordId }));

          if (items.length === 0) {
            // Nada a revogar (só tinha senhas fixas). Marcar log como revogado
            // por expiração para não reaparecer nos próximos ciclos.
            await fetch(
              `${SUPABASE_URL}/rest/v1/tuya_password_logs?id=eq.${row.id}`,
              {
                method: "PATCH",
                headers: {
                  apikey: SERVICE_ROLE,
                  Authorization: `Bearer ${SERVICE_ROLE}`,
                  "Content-Type": "application/json",
                  Prefer: "return=minimal",
                },
                body: JSON.stringify({
                  revoked_at: nowIso,
                  revoked_by_name: "cron:auto",
                  revoke_reason: "expirada:sem_senha_temporaria",
                }),
              },
            );
            continue;
          }

          // 2) Chamar tuya-password action=revoke via anon key (edge function pública)
          const revRes = await fetch(
            `${SUPABASE_URL}/functions/v1/tuya-password`,
            {
              method: "POST",
              headers: {
                apikey: ANON_KEY,
                Authorization: `Bearer ${ANON_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                action: "revoke",
                items,
                roomNumber: row.room_number,
                unidade: row.unidade,
              }),
            },
          );

          if (!revRes.ok) {
            errors.push({ id: row.id, reason: `revoke_http_${revRes.status}` });
            continue;
          }

          const revData = await revRes.json().catch(() => ({}));
          const allOk = Array.isArray(revData?.revokes)
            && revData.revokes.every((r: { success: boolean }) => r.success);

          await fetch(
            `${SUPABASE_URL}/rest/v1/tuya_password_logs?id=eq.${row.id}`,
            {
              method: "PATCH",
              headers: {
                apikey: SERVICE_ROLE,
                Authorization: `Bearer ${SERVICE_ROLE}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify({
                revoked_at: nowIso,
                revoked_by_name: "cron:auto",
                revoke_reason: allOk ? "expirada:auto" : "expirada:parcial",
              }),
            },
          );
          if (allOk) revoked++;
          else errors.push({ id: row.id, reason: "revoke_partial" });
        }

        return new Response(
          JSON.stringify({ success: true, processed, revoked, errors }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
