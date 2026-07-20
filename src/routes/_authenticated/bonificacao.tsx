import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BonificacaoPanelModal } from "@/components/gestao/bonificacao-panel-modal";
import { useUnidade } from "@/lib/unidade-context";

export const Route = createFileRoute("/_authenticated/bonificacao")({
  component: BonificacaoPage,
});

function BonificacaoPage() {
  const navigate = useNavigate();
  const { unidade } = useUnidade();
  return (
    <BonificacaoPanelModal
      open
      onOpenChange={(v) => {
        if (!v) navigate({ to: "/gestao" });
      }}
      unidade={unidade}
    />
  );
}
