import { createFileRoute } from "@tanstack/react-router";
import { TotemApp } from "@/components/totem/totem-app";

// Tela do tablet fixo na unidade (auto check-in e check-out do hóspede).
// Fica FORA de /_authenticated: o tablet não tem login de funcionário e se
// identifica pelo token gerado no pareamento (Área do Gestor › Totem).
export const Route = createFileRoute("/totem")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "IN.JOY · Check-in" },
      { name: "robots", content: "noindex" },
      { name: "theme-color", content: "#0C5A64" },
    ],
  }),
  component: TotemApp,
});
