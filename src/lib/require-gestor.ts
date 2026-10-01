import { redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type TelaGestorCompartilhada =
  | "almoxarifado"
  | "estoque-geral"
  | "frigobar"
  | "bonificacao"
  | "check-in-digital"
  | "preventiva";

type Role = "admin" | "gestor" | "funcionario" | "recepcao" | "camareira";

type AccessOptions =
  | { somenteGestor: true }
  | { somenteGestor?: false; tela: TelaGestorCompartilhada };

function negarAcesso(): never {
  toast.error("Acesso restrito aos gestores");
  throw redirect({ to: "/" });
}

export async function requireGestor(options: AccessOptions = { somenteGestor: true }) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw redirect({ to: "/auth" });

  const [{ data: roleRows, error: rolesError }, { data: funcionario, error: funcionarioError }] =
    await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
      supabase
        .from("funcionarios")
        .select("nome, categorias, telas_permitidas")
        .eq("user_id", auth.user.id)
        .maybeSingle(),
    ]);

  if (rolesError || funcionarioError) negarAcesso();

  const roles = new Set((roleRows ?? []).map((row) => row.role as Role));
  const gestor = roles.has("gestor") || roles.has("admin");
  if (gestor) return { gestor: true, userId: auth.user.id };
  if (options.somenteGestor) negarAcesso();

  const telas = funcionario?.telas_permitidas ?? null;
  if (telas?.includes(options.tela)) return { gestor: false, userId: auth.user.id };

  const nome = funcionario?.nome?.trim() ?? "";
  const categorias = funcionario?.categorias ?? [];
  const permitidoPorPapel =
    (options.tela === "almoxarifado" && roles.has("recepcao")) ||
    (options.tela === "estoque-geral" && (roles.has("recepcao") || roles.has("camareira") || roles.has("funcionario"))) ||
    (options.tela === "preventiva" && categorias.includes("Ar condicionado")) ||
    (options.tela === "bonificacao" && /(^|\s)mayara(\s|$)/i.test(nome));

  if (permitidoPorPapel) return { gestor: false, userId: auth.user.id };
  negarAcesso();
}
