import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const adjustPreventiveLogDateSchema = z.object({
  logId: z.string().uuid(),
  executionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function assertCallerCanManageMaintenance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const canManage = (data ?? []).some(
    (row: { role: string }) => row.role === "admin" || row.role === "gestor",
  );

  if (!canManage) {
    throw new Error("Somente gestores ou administradores podem ajustar datas de manutenção.");
  }
}

export const adjustPreventiveLogDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => adjustPreventiveLogDateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageMaintenance(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: updated, error } = await supabaseAdmin
      .from("preventive_logs")
      .update({
        completed_at: `${data.executionDate}T12:00:00-03:00`,
      })
      .eq("id", data.logId)
      .select("id, completed_at, next_due_date")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Registro de manutenção não encontrado.");

    return updated;
  });