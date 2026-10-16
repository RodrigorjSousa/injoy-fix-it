// Botões da tela Reservas que mexem com dinheiro: Cobrar agora, Enviar link, Pgto. no check-in e
// Lançar no Cloudbeds. Toda conferência é feita no servidor (cobranca-stripe.server.ts), nunca no navegador.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: unknown }; userId: string };

/** Mesma regra do banco que libera a tela (public.minha_permissao_reservas). */
async function quemPode(ctx: Ctx) {
  const rpc = ctx.supabase.rpc as (fn: string) => Promise<{ data: { ve?: boolean } | null; error: { message: string } | null }>;
  const { data, error } = await rpc.call(ctx.supabase, "minha_permissao_reservas");
  if (error) throw new Error(error.message);
  if (!data?.ve) throw new Error("Seu login não está liberado nas Reservas.");
  const { nomeDoUsuario } = await import("./cobranca-stripe.server");
  return { userId: ctx.userId, nome: await nomeDoUsuario(ctx.userId) };
}

const id = z.string().uuid();
const valor = z.number().positive().max(999_999.99);

/** Abre a janela de cobrança: saldo de agora, cartões liberados e bloqueios. Não cobra nada. */
export const prepararCobranca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ linhaId: id }).parse(i))
  .handler(async ({ data, context }) => {
    await quemPode(context as unknown as Ctx);
    const { conferirTudo } = await import("./cobranca-stripe.server");
    return conferirTudo(data.linhaId, null);
  });

export const cobrarAgoraFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ linhaId: id, valorConfirmado: valor, cartaoId: z.string().min(3).max(100) }).parse(i))
  .handler(async ({ data, context }) => {
    const quem = await quemPode(context as unknown as Ctx);
    const { cobrarAgora } = await import("./cobranca-stripe.server");
    return cobrarAgora(data.linhaId, data.valorConfirmado, data.cartaoId, quem);
  });

export const enviarLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ linhaId: id, valorConfirmado: valor }).parse(i))
  .handler(async ({ data, context }) => {
    const quem = await quemPode(context as unknown as Ctx);
    const { enviarLink } = await import("./cobranca-stripe.server");
    return enviarLink(data.linhaId, data.valorConfirmado, quem);
  });

export const pagamentoNoCheckinFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ linhaId: id }).parse(i))
  .handler(async ({ data, context }) => {
    const quem = await quemPode(context as unknown as Ctx);
    const { pagamentoNoCheckin } = await import("./cobranca-stripe.server");
    return pagamentoNoCheckin(data.linhaId, quem);
  });

export const relancarNoCloudbedsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ tentativaId: id }).parse(i))
  .handler(async ({ data, context }) => {
    await quemPode(context as unknown as Ctx);
    const { relancarNoCloudbeds } = await import("./cobranca-stripe.server");
    return relancarNoCloudbeds(data.tentativaId);
  });
