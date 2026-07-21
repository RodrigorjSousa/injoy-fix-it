import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildPontomaisEmployeeMapByCpf,
  ensurePontomaisTokenConfigured,
  fetchPontomaisRegistrosByEmployeeId,
  sanitizePontomaisCpf,
} from "./pontomais.server";

const syncSchema = z.object({
  funcionarioIds: z.array(z.string().uuid()).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const syncPontomais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => syncSchema.parse(input))
  .handler(async ({ data, context }) => {
    ensurePontomaisTokenConfigured();

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

    let query = supabaseAdmin.from("funcionarios").select("id, nome, cpf, pontomais_employee_id");
    if (data.funcionarioIds && data.funcionarioIds.length > 0) {
      query = query.in("id", data.funcionarioIds);
    }
    const { data: funcionarios, error: fErr } = await query;
    if (fErr) throw new Error(fErr.message);

    let pontomaisByCpf: Awaited<ReturnType<typeof buildPontomaisEmployeeMapByCpf>> | null = null;

    const results: Array<{
      funcionario_id: string;
      nome: string;
      dias: number;
      error?: string;
    }> = [];

    for (const f of funcionarios ?? []) {
      try {
        const cleanCpf = sanitizePontomaisCpf((f as any).cpf ?? null);
        const storedEmployeeId =
          typeof (f as any).pontomais_employee_id === "string" &&
          (f as any).pontomais_employee_id.trim() !== ""
            ? (f as any).pontomais_employee_id.trim()
            : null;

        let employeeId = storedEmployeeId;
        if (!employeeId) {
          if (!cleanCpf) {
            throw new Error(
              "Funcionário sem CPF cadastrado. Preencha o CPF em Controle de Ponto.",
            );
          }

          if (!pontomaisByCpf) pontomaisByCpf = await buildPontomaisEmployeeMapByCpf();
          const pontomaisEmployee = pontomaisByCpf[cleanCpf];
          if (!pontomaisEmployee) {
            throw new Error(`CPF ${cleanCpf} não encontrado na base da Pontomais`);
          }

          employeeId = pontomaisEmployee.employeeId;

          const { error: updErr } = await supabaseAdmin
            .from("funcionarios")
            .update({ pontomais_employee_id: employeeId })
            .eq("id", f.id);
          if (updErr) {
            console.warn("[pontomais] falha ao salvar ID atualizado", updErr.message);
          }
        }

        const { byDate } = await fetchPontomaisRegistrosByEmployeeId({
          employeeId,
          cpf: cleanCpf,
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
