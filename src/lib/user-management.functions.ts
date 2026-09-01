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

/**
 * Substitui o funcionário que ocupa uma vaga (ex.: Cristiano -> Flavio),
 * mantendo o MESMO registro em `funcionarios`. Assim todas as tarefas,
 * chamados, categorias e telas vinculadas ao antigo passam automaticamente
 * para o novo, sem mexer na programação.
 */
export const adminSubstituirFuncionario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        funcionarioId: z.string().uuid(),
        nome: z.string().trim().min(2).max(120),
        email: emailSchema,
        password: passwordSchema.optional(),
        desativarAntigo: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCallerIsManager(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: func, error: fErr } = await supabaseAdmin
      .from("funcionarios")
      .select("id, nome, email, user_id, categorias, telas_permitidas")
      .eq("id", data.funcionarioId)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!func) throw new Error("Funcionário não encontrado");

    const antigoUserId: string | null = func.user_id;
    const novoEmail = data.email;

    // Papéis atuais (recepcao/camareira/funcionario/...) para replicar
    let rolesAntigas: string[] = [];
    if (antigoUserId) {
      const { data: rr } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", antigoUserId);
      rolesAntigas = (rr ?? []).map((r: { role: string }) => r.role);
    }

    // Localizar ou criar a conta do novo funcionário
    let novoUserId: string | null = null;
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .limit(1)
      .maybeSingle();
    void existing;

    const { data: listed, error: lErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (lErr) throw new Error(lErr.message);
    const match = (listed?.users ?? []).find(
      (u: { id: string; email?: string | null }) =>
        (u.email ?? "").toLowerCase() === novoEmail,
    );

    if (match) {
      novoUserId = match.id;
      if (data.password) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(novoUserId, {
          password: data.password,
          email_confirm: true,
        });
        if (error) throw new Error(error.message);
      }
    } else {
      if (!data.password) {
        throw new Error("Defina uma senha inicial para o novo funcionário");
      }
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: novoEmail,
        password: data.password,
        email_confirm: true,
        user_metadata: { nome: data.nome },
      });
      if (cErr) throw new Error(cErr.message);
      novoUserId = created?.user?.id ?? null;
    }

    // Desvincular o antigo antes de assumir o e-mail/vaga
    await supabaseAdmin
      .from("funcionarios")
      .update({ user_id: null })
      .eq("id", func.id);

    if (data.desativarAntigo && antigoUserId && antigoUserId !== novoUserId) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", antigoUserId);
      await supabaseAdmin.auth.admin.deleteUser(antigoUserId).catch(() => undefined);
    }

    // O novo assume a mesma vaga (mesmo id => mantém tarefas e vínculos)
    const { error: upErr } = await supabaseAdmin
      .from("funcionarios")
      .update({ nome: data.nome, email: novoEmail, user_id: novoUserId })
      .eq("id", func.id);
    if (upErr) throw new Error(upErr.message);

    if (novoUserId) {
      await supabaseAdmin
        .from("profiles")
        .upsert({ id: novoUserId, nome: data.nome }, { onConflict: "id" });

      const desejadas = new Set(rolesAntigas.length ? rolesAntigas : ["funcionario"]);
      for (const role of desejadas) {
        await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: novoUserId, role }, { onConflict: "user_id,role" });
      }
    }

    // Atualiza atribuições atuais que guardam o nome em texto
    await supabaseAdmin
      .from("ativos_ar")
      .update({ tecnico: data.nome })
      .eq("tecnico_id", func.id);
    await supabaseAdmin
      .from("chamados")
      .update({ responsavel_nome: data.nome })
      .eq("responsavel_id", func.id)
      .neq("status", "Concluído");

    return { ok: true as const, anteriores: { nome: func.nome, email: func.email } };
  });
