import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(6).max(200);

/**
 * Primeiro acesso: um funcionário pré-cadastrado pelo gestor
 * define sua própria senha na tela de login.
 * Só funciona se existir um registro em `funcionarios` com esse email
 * E o user ainda não existir em auth.users.
 */
export const firstTimeSetPassword = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ email: emailSchema, password: passwordSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: func, error: fErr } = await supabaseAdmin
      .from("funcionarios")
      .select("id, nome, email, user_id")
      .eq("email", data.email)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!func) {
      throw new Error(
        "Email não cadastrado. Solicite ao gestor que cadastre seu email antes do primeiro acesso.",
      );
    }
    if (func.user_id) {
      throw new Error(
        "Este email já possui conta. Use a opção 'Entrar' ou peça ao gestor para redefinir sua senha.",
      );
    }

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome: func.nome },
    });
    if (cErr || !created?.user) throw new Error(cErr?.message ?? "Falha ao criar usuário");

    return { ok: true as const };
  });

async function assertCallerIsManager(
  supabase: Awaited<ReturnType<typeof requireSupabaseAuth.server>> extends { supabase: infer S }
    ? S
    : never,
  userId: string,
) {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertCallerIsManager(context.supabase as any, context.userId);

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
