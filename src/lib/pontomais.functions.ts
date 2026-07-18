import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchPontomaisRegistros } from "./pontomais.server";

const syncSchema = z.object({
  funcionarioIds: z.array(z.string().uuid()).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const syncPontomais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => syncSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is admin or gestor (RLS on user_roles scopes to auth.uid())
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesErr) throw new Error(rolesErr.message);
    const isAllowed = (roles ?? []).some(
      (r: { role: string }) => r.role === "gestor" || r.role === "admin",
    );
    if (!isAllowed) {
      throw new Error("Apenas gestores podem sincronizar o ponto");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin.from("funcionarios").select("id, nome, email, cpf");
    if (data.funcionarioIds && data.funcionarioIds.length > 0) {
      query = query.in("id", data.funcionarioIds);
    }
    const { data: funcionarios, error: fErr } = await query;
    if (fErr) throw new Error(fErr.message);

    const results: Array<{
      funcionario_id: string;
      nome: string;
      dias: number;
      error?: string;
    }> = [];

    for (const f of funcionarios ?? []) {
      try {
        const byDate = await fetchPontomaisRegistros({
          cpf: (f as any).cpf ?? null,
          email: f.email,
          startDate: data.startDate,
          endDate: data.endDate,
        });

        const rows = Object.entries(byDate).map(([date, reg]) => ({
          funcionario_id: f.id,
          data: date,
          entrada: reg.entrada ?? null,
          almoco_saida: reg.almoco_saida ?? null,
          almoco_retorno: reg.almoco_retorno ?? null,
          saida: reg.saida ?? null,
          ultima_atualizacao: new Date().toISOString(),
        }));

        if (rows.length > 0) {
          const { error: upErr } = await supabaseAdmin
            .from("registro_ponto_pontomais")
            .upsert(rows, { onConflict: "funcionario_id,data" });
          if (upErr) throw new Error(upErr.message);
        }

        results.push({ funcionario_id: f.id, nome: f.nome, dias: rows.length });
      } catch (err) {
        results.push({
          funcionario_id: f.id,
          nome: f.nome,
          dias: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { ok: true, results };
  });
