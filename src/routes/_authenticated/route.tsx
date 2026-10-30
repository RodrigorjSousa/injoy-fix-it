import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RecadosGestorParaMim } from "@/components/recados-gestor/recados-gestor-para-mim";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  // Recados do gestor para quem está logado aparecem no topo de qualquer tela.
  component: () => (
    <>
      <RecadosGestorParaMim />
      <Outlet />
    </>
  ),
});
