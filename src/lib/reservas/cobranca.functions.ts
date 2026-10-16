import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Botão "Atualizar agora" da tela Reservas: recalcula a lista da unidade na hora. */
export const atualizarCobrancasAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ unidade: z.enum(["Botafogo", "Ipanema"]) }).parse(input))
  .handler(async ({ data, context }) => {
    // Mesma regra do banco que decide o menu e a tela.
    const rpc = context.supabase.rpc as unknown as (
      fn: string,
    ) => Promise<{ data: { ve?: boolean } | null; error: { message: string } | null }>;
    const { data: perm, error } = await rpc.call(context.supabase, "minha_permissao_reservas");
    if (error) throw new Error(error.message);
    if (!perm?.ve) throw new Error("Seu login não está liberado nas Reservas.");

    const { sincronizarCobrancas } = await import("./cobranca-sync.server");
    const { resultados } = await sincronizarCobrancas([data.unidade]);
    const r = resultados[0];
    if (!r?.ok) throw new Error(r?.erro ?? "Cloudbeds não respondeu. A lista continua com os últimos dados.");
    return r;
  });
