import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { routeTree } from "./routeTree.gen";
import { isStaleChunkError, recoverStaleChunk } from "./lib/chunk-recovery";
import { reportLovableError } from "./lib/lovable-error-reporting";
import { Button } from "./components/ui/button";

// The router's own catch boundary checks whether the thrown value is truthy.
// A rejected route that throws undefined therefore needs an outer boundary.
class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isStaleChunkError(error)) recoverStaleChunk();
    reportLovableError(error ?? new Error("Erro desconhecido ao abrir a página"), {
      boundary: "app_router",
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Não foi possível abrir esta página</h1>
          <p className="mt-2 text-sm text-muted-foreground">Tente atualizar a página ou volte ao início.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Atualizar</Button>
            <Button variant="outline" onClick={() => window.location.assign("/")}>Voltar ao início</Button>
          </div>
        </div>
      </main>
    );
  }
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    Wrap: ({ children }) => <AppErrorBoundary>{children}</AppErrorBoundary>,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
