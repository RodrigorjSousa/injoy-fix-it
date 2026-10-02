import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BonificacaoPanelModal } from "@/components/gestao/bonificacao-panel-modal";
import { useUnidade } from "@/lib/unidade-context";
import { useMe } from "@/lib/store";

import { requireGestor } from "@/lib/require-gestor";

export const Route = createFileRoute("/_authenticated/bonificacao")({
  beforeLoad: () => requireGestor({ tela: "bonificacao" }),
  head: () => ({
    meta: [
      { title: "Bonificação | INJOY Hotéis" },
       { name: "description", content: "Bonificações da Recepção e de Camareiras / Manutenção por avaliações de hóspedes." },
      { property: "og:title", content: "Bonificação | INJOY Hotéis" },
       { property: "og:description", content: "Bonificações da Recepção e de Camareiras / Manutenção por avaliações de hóspedes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BonificacaoPage,
});

function BonificacaoPage() {
  const navigate = useNavigate();
  const { unidade } = useUnidade();
  const { data: me } = useMe();
  // Fechar o painel: gestor volta para a Gestão; demais funcionários para a tela inicial
  const destino = me?.isAdmin || me?.isGestor ? "/gestao" : "/";
  return (
    <BonificacaoPanelModal
      open
      onOpenChange={(v) => {
        if (!v) navigate({ to: destino });
      }}
      unidade={unidade}
    />
  );
}
