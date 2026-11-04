import { createFileRoute } from "@tanstack/react-router";
import { PainelWhatsapp } from "@/components/whatsapp/painel-whatsapp";

// Área do Gestor › WhatsApp da assistente. A tela fica em src/components/whatsapp/painel-whatsapp.tsx.
export const Route = createFileRoute("/_authenticated/gestor/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp (assistente) | Área do Gestor" }] }),
  component: () => <PainelWhatsapp papel="gestor" />,
});
