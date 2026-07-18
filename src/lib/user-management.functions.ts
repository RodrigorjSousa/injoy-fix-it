import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(6).max(200);

/**
 * Fluxo de primeiro acesso desabilitado por segurança.
 *
 * Anteriormente qualquer pessoa que soubesse o e-mail de um funcionário
 * pré-cadastrado poderia criar a conta e definir a senha (account takeover),
 * já que a posse do e-mail não era verificada.
 *
 * O gestor/admin agora define a senha inicial via
 * `adminSetFuncionarioCredentials` e a comunica ao funcionário. Se for
 * necessário reativar o autoatendimento no futuro, exija OTP/magic link
 * enviado ao próprio e-mail como prova de posse antes de criar o usuário.
 */
export const firstTimeSetPassword = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ email: emailSchema, password: passwordSchema }).parse(input),
  )
  .handler(async () => {
    throw new Error(
      "Primeiro acesso indisponível. Peça ao gestor para cadastrar sua senha inicial.",
    );
  });


// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertCallerIsManager(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin") && !roles.includes("gestor")) {
    throw new Error("Apenas gestores ou administradores podem alterar senhas");
  }
}

/**
 * Gestor/admin define ou redefine a senha (e opcionalmente o email) de um funcionário.
 * Se o funcionário ainda não tem conta, cria uma nova.
 */
export const adminSetFuncionarioCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        password: passwordSchema,
        email: emailSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCallerIsManager(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: func, error: fErr } = await supabaseAdmin
      .from("funcionarios")
      .select("id, nome, email, user_id")
      .eq("id", data.funcionarioId)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!func) throw new Error("Funcionário não encontrado");

    const targetEmail = (data.email ?? func.email).toLowerCase();

    if (func.user_id) {
      const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(func.user_id, {
        password: data.password,
        email: targetEmail,
        email_confirm: true,
      });
      if (uErr) throw new Error(uErr.message);
      if (targetEmail !== func.email) {
        await supabaseAdmin
          .from("funcionarios")
          .update({ email: targetEmail })
          .eq("id", func.id);
      }
      return { ok: true as const, created: false };
    }

    // Sem user vinculado — criar conta agora
    const { error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: targetEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome: func.nome },
    });
    if (cErr) throw new Error(cErr.message);
    if (targetEmail !== func.email) {
      await supabaseAdmin
        .from("funcionarios")
        .update({ email: targetEmail })
        .eq("id", func.id);
    }
    return { ok: true as const, created: true };
  });
