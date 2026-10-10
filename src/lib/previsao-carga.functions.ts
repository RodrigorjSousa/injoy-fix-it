import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const recalcularPrevisaoCarga = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ unidades: z.array(z.enum(["Botafogo", "Ipanema"])).min(1).max(2) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const gestor = !error && (roles ?? []).some((row) => row.role === "gestor" || row.role === "admin");
    if (!gestor) {
      // Recepção ou quem o gestor liberou na Previsão de Carga também pode atualizar.
      const { data: pode } = await (context.supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown }>)("minha_permissao_previsao_carga");
      if (pode !== true) throw new Error("Seu login não está liberado na Previsão de Carga");
    }
    const { calculateLoadForecast } = await import("@/lib/previsao-carga.server");
    return calculateLoadForecast(data.unidades);
  });