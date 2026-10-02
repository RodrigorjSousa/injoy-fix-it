import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/escala")({
  beforeLoad: () => { throw redirect({ to: "/gestor/escala", replace: true }); },
  head: () => ({ meta: [
    { title: "Escala de Funcionários — INJOY" },
    { name: "description", content: "A Escala agora está disponível na Área do Gestor." },
    { property: "og:title", content: "Escala de Funcionários — INJOY" },
    { property: "og:description", content: "A Escala agora está disponível na Área do Gestor." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});