import { createFileRoute } from "@tanstack/react-router";
import { requireGestor } from "@/lib/require-gestor";
import { ErrorState, friendlyError } from "@/components/ui/data-state";
import { ReservasTela } from "@/components/reservas/reservas-tela";

// Tela RESERVAS: reservas com saldo em aberto que a recepção deve cobrar no Cloudbeds.
// Quem vê é decidido pelo banco (public.minha_permissao_reservas). Ver docs/projeto-injoy/07-recepcao.md.
export const Route = createFileRoute("/_authenticated/reservas")({
  beforeLoad: () => requireGestor({ tela: "reservas" }),
  component: ReservasTela,
  errorComponent: ({ error, reset }) => (
    <div className="p-6">
      <ErrorState title="Falha ao abrir as Reservas" description={friendlyError(error)} onRetry={reset} />
    </div>
  ),
});
