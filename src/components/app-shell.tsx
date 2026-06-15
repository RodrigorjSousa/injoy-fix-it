import { Link, useRouterState } from "@tanstack/react-router";
import { PlusCircle, LayoutGrid, Snowflake, Settings, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Novo Chamado", icon: PlusCircle, exact: true },
  { to: "/painel", label: "Painel", icon: LayoutGrid },
  { to: "/preventiva", label: "Preventiva AC", icon: Snowflake },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-6 py-6 flex items-center gap-3 border-b border-sidebar-border">
          <div className="h-10 w-10 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center">
            <Wrench className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold tracking-tight">Manutenção</div>
            <div className="text-xs text-sidebar-foreground/70">INJOY Hotéis</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            const active = isActive(item.to, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 text-xs text-sidebar-foreground/50 border-t border-sidebar-border">
          v1.0 · Mockup local
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
          <Wrench className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-tight">Manutenção INJOY</div>
          <div className="text-[11px] text-muted-foreground leading-tight">Gestão predial</div>
        </div>
      </header>

      {/* Main */}
      <main className="lg:pl-64 pb-24 lg:pb-0">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-6 lg:py-10">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-border">
        <div className="grid grid-cols-4">
          {nav.map((item) => {
            const active = isActive(item.to, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "scale-110")} />
                <span className="truncate max-w-[72px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
