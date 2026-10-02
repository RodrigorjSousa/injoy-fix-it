import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const recalcularPrevisaoCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ unidades: z.array(z.enum(["Botafogo", "Ipanema"])).min(1).max(2) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (error || !(roles ?? []).some((row) => row.role === "gestor" || row.role === "admin")) throw new Error("Acesso restrito aos gestores");
    const { calculateLoadForecast } = await import("@/lib/previsao-carga.server");
    return calculateLoadForecast(data.unidades);
  });