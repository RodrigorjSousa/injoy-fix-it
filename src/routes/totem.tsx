import { createFileRoute } from "@tanstack/react-router";
import { TotemApp } from "@/components/totem/totem-app";

// Tela do tablet fixo na unidade (auto check-in e check-out do hóspede).
// Fica FORA de /_authenticated: o tablet não tem login de funcionário e se
// identifica pelo token gerado no pareamento (Área do Gestor › Totem).
export const Route = createFileRoute("/totem")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Injoy · Check-in" },
      { name: "robots", content: "noindex" },
      { name: "theme-color", content: "#26292B" },
    ],
    links: [{ rel: "preload", as: "image", href: "/totem/rio-por-do-sol.jpg" }],
  }),
  component: TotemApp,
});
