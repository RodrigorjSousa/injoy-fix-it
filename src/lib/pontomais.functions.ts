import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { atualizarMetaEquipe, syncPontomaisCore } from "./pontomais-sync.server";

const syncSchema = z.object({
  funcionarioIds: z.array(z.string().uuid()).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

async function exigirGestor(supabase: any, userId: string) {
  // RLS em user_roles limita ao próprio auth.uid()
  const { data: roles, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ok = (roles ?? []).some((r: { role: string }) => r.role === "gestor" || r.role === "admin");
  if (!ok) throw new Error("Apenas gestores podem sincronizar o ponto");
}

export const syncPontomais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => syncSchema.parse(input))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase, context.userId);
    const results = await syncPontomaisCore(data);
    return { ok: true, results };
  });

/** Gestor: busca o Pontomais do mês e recalcula atrasos/faltas da Meta da equipe. */
export const atualizarMetaEquipeAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestor(context.supabase, context.userId);
    return atualizarMetaEquipe();
  });
