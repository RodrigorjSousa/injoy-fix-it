import { redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buscarPermissaoBonificacao } from "@/lib/bonificacao";
import { buscarPermissaoPrevisao } from "@/lib/previsao-reforco";

export type TelaGestorCompartilhada =
  | "almoxarifado"
  | "estoque-geral"
  | "frigobar"
  | "bonificacao"
  | "check-in-digital"
  | "preventiva"
  | "previsao-carga";

type Role = "admin" | "gestor" | "funcionario" | "recepcao" | "camareira";

type AccessOptions =
  | { somenteGestor: true }
  | { somenteGestor?: false; tela: TelaGestorCompartilhada };

function negarAcesso(mensagem = "Acesso restrito aos gestores"): never {
  toast.error(mensagem);
  throw redirect({ to: "/" });
}

export async function requireGestor(options: AccessOptions = { somenteGestor: true }) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw redirect({ to: "/auth" });

  // Bonificação: quem decide é o banco (lista de acessos que o gestor edita).
  if (!options.somenteGestor && options.tela === "bonificacao") {
    let permissao;
    try {
      permissao = await buscarPermissaoBonificacao();
    } catch (e) {
      negarAcesso(e instanceof Error ? e.message : "Não foi possível verificar seu acesso.");
    }
    if (permissao.gestor || permissao.podeRegistrar)
      return { gestor: permissao.gestor, userId: auth.user.id };
    negarAcesso(
      "Seu login não está liberado na Bonificação. Peça ao gestor para liberar em Bonificação › Acessos.",
    );
  }

  // Previsão de Carga: quem decide é o banco (gestor, Recepção ou quem foi liberado em Equipe).
  if (!options.somenteGestor && options.tela === "previsao-carga") {
    let pode = false;
    try {
      pode = await buscarPermissaoPrevisao();
    } catch (e) {
      negarAcesso(e instanceof Error ? e.message : "Não foi possível verificar seu acesso.");
    }
    if (pode) return { gestor: false, userId: auth.user.id };
    negarAcesso("Seu login não está liberado na Previsão de Carga. Peça ao gestor para liberar em Equipe.");
  }

  const [{ data: roleRows, error: rolesError }, { data: funcionario, error: funcionarioError }] =
    await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
      supabase
        .from("funcionarios")
        .select("nome, categorias, telas_permitidas")
        .eq("user_id", auth.user.id)
        // Pode haver mais de um cadastro ligado ao mesmo login: usamos o primeiro
        // em vez de falhar (maybeSingle dá erro com 2 linhas).
        .order("nome")
        .limit(1)
        .maybeSingle(),
    ]);

  if (rolesError || funcionarioError) negarAcesso();

  const roles = new Set((roleRows ?? []).map((row) => row.role as Role));
  const gestor = roles.has("gestor") || roles.has("admin");
  if (gestor) return { gestor: true, userId: auth.user.id };
  if (options.somenteGestor) negarAcesso();

  const telas = funcionario?.telas_permitidas ?? null;
  if (telas?.includes(options.tela)) return { gestor: false, userId: auth.user.id };

  const categorias = funcionario?.categorias ?? [];
  const permitidoPorPapel =
    (options.tela === "almoxarifado" && roles.has("recepcao")) ||
    (options.tela === "preventiva" && categorias.includes("Ar condicionado"));

  if (permitidoPorPapel) return { gestor: false, userId: auth.user.id };
  negarAcesso();
}
