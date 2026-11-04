import { createFileRoute } from "@tanstack/react-router";
import { PainelWhatsapp } from "@/components/whatsapp/painel-whatsapp";

// Recepção › WhatsApp da assistente: conversas reais, rascunhos e simulador. Correções viram sugestão
// de lição para o gestor aprovar. Permissão: public.minha_permissao_whatsapp().usar (migração 0100).
export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp (assistente) | INJOY" }] }),
  component: () => (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-slate-50 pb-12 sm:-m-6 lg:-m-8">
      <PainelWhatsapp papel="recepcao" />
    </div>
  ),
});
