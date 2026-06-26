import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { PlusCircle, LayoutGrid, Snowflake, Settings, LogOut, MessageSquare, ConciergeBell } from "lucide-react";
import { cn } from "@/lib/utils";
import injoyLogo from "@/assets/injoy-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/lib/store";

type NavItem = { to: string; label: string; icon: typeof PlusCircle; exact?: boolean; show?: (me: ReturnType<typeof useMe>["data"]) => boolean };
const podeCriar = (me: ReturnType<typeof useMe>["data"]) =>
  !!me && (me.isGestor || me.isAdmin || me.isRecepcao || me.isCamareira);
const ehStaff = (me: ReturnType<typeof useMe>["data"]) => !!me && (me.isGestor || me.isAdmin);
const podeRecepcao = (me: ReturnType<typeof useMe>["data"]) =>
  !!me && (me.isGestor || me.isAdmin || me.isRecepcao);
const ALL_NAV: NavItem[] = [
  { to: "/", label: "Novo Chamado", icon: PlusCircle, exact: true, show: podeCriar },
  { to: "/painel", label: "Painel", icon: LayoutGrid },
  { to: "/recepcao", label: "Recepção", icon: ConciergeBell, show: podeRecepcao },
  { to: "/preventiva", label: "Preventiva AC", icon: Snowflake },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/configuracoes", label: "Configurações", icon: Settings, show: ehStaff },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const nav = ALL_NAV.filter((n) => !n.show || n.show(me));

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };


  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-6 py-6 flex items-center gap-3 border-b border-sidebar-border">
          <div className="h-11 w-11 rounded-xl bg-white shadow-sm overflow-hidden grid place-items-center">
            <img src={injoyLogo.url} alt="INJOY" className="h-9 w-9 object-contain" />
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
        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sair</span>
          </button>
          <div className="px-3 pt-3 text-xs text-sidebar-foreground/50">v1.0</div>
        </div>

      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-white shadow-sm overflow-hidden grid place-items-center">
          <img src={injoyLogo.url} alt="INJOY" className="h-8 w-8 object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm leading-tight">Manutenção INJOY</div>
          <div className="text-[11px] text-muted-foreground leading-tight">Gestão predial</div>
        </div>
        <button
          onClick={handleSignOut}
          aria-label="Sair"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <LogOut className="h-5 w-5" />
        </button>

      </header>

      {/* Main */}
      <main className="lg:pl-64 pb-24 lg:pb-0">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-6 lg:py-10">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-border">
        <div className={cn("grid", nav.length <= 2 ? "grid-cols-2" : nav.length === 3 ? "grid-cols-3" : nav.length === 4 ? "grid-cols-4" : nav.length === 5 ? "grid-cols-5" : "grid-cols-6")}>
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
