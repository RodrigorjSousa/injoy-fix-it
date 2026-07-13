import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { PlusCircle, LayoutGrid, Snowflake, LogOut, MessageSquare, ConciergeBell, BedDouble, Wrench, LayoutDashboard, ShieldCheck, ChevronDown, BarChart3, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import injoyLogo from "@/assets/injoy-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/lib/store";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

type Unidade = "Botafogo" | "Ipanema";
const UNIDADES: Unidade[] = ["Botafogo", "Ipanema"];
const UNIDADE_STORAGE_KEY = "injoy:unidade-ativa";

type Me = ReturnType<typeof useMe>["data"];
type NavChild = { to: string; label: string; icon: typeof PlusCircle; exact?: boolean };
type NavItem = {
  to?: string;
  label: string;
  icon: typeof PlusCircle;
  exact?: boolean;
  show?: (me: Me) => boolean;
  children?: NavChild[];
};

// admin = gestor OR admin role (mantém acesso dos gestores existentes)
const isAdmin = (me: Me) => !!me && (me.isGestor || me.isAdmin);
const isTecnicoAC = (me: Me) =>
  !!me && me.isFuncionario && !!me.funcionario?.categorias?.includes("Ar condicionado");

// Abas condicionais por papel
const podeRecepcao = (me: Me) => isAdmin(me) || !!me?.isRecepcao;
const podeCamareira = (me: Me) => isAdmin(me) || !!me?.isCamareira;
const podePreventiva = (me: Me) => isAdmin(me) || isTecnicoAC(me);

const ALL_NAV: NavItem[] = [
  // Comuns a todos
  { to: "/servicos", label: "Serviços", icon: Wrench },
  { to: "/painel", label: "Painel", icon: LayoutGrid },
  // Condicionais
  { to: "/recepcao", label: "Recepção", icon: ConciergeBell, show: podeRecepcao },
  { to: "/camareiras", label: "Camareiras", icon: BedDouble, show: podeCamareira },
  { to: "/preventiva", label: "Preventiva AC", icon: Snowflake, show: podePreventiva },
  // Comum a todos
  { to: "/chat", label: "Chat", icon: MessageSquare },
  // Somente admin
  {
    label: "ADMINISTRADOR",
    icon: ShieldCheck,
    show: isAdmin,
    children: [
      { to: "/dashboard", label: "DASHBOARD", icon: LayoutDashboard },
      { to: "/gestao", label: "GESTÃO", icon: BarChart3 },
      { to: "/configuracoes", label: "EQUIPE", icon: PlusCircle },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const nav = ALL_NAV.filter((n) => !n.show || n.show(me));

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const groupActive = (item: NavItem) =>
    !!item.children?.some((c) => isActive(c.to, c.exact));

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isGroupOpen = (item: NavItem) =>
    openGroups[item.label] ?? groupActive(item);

  const toggleGroup = (label: string, defaultOpen: boolean) =>
    setOpenGroups((s) => ({ ...s, [label]: !(s[label] ?? defaultOpen) }));

  // Flat list for mobile bottom nav (children promoted)
  const mobileNav: NavChild[] = nav.flatMap((n) =>
    n.children
      ? n.children.map((c) => ({ ...c }))
      : n.to
      ? [{ to: n.to, label: n.label, icon: n.icon, exact: n.exact }]
      : [],
  );

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
          <span className="text-xl font-bold tracking-wider text-sidebar-foreground">INJOY</span>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const Icon = item.icon;
            if (item.children) {
              const gActive = groupActive(item);
              const open = isGroupOpen(item);
              return (
                <div key={item.label}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.label, gActive)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                      gActive
                        ? "text-sidebar-foreground"
                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate flex-1 text-left">{item.label}</span>
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
                    />
                  </button>
                  {open && (
                    <div className="mt-1 ml-3 pl-3 border-l border-sidebar-border space-y-1">
                      {item.children.map((c) => {
                        const active = isActive(c.to, c.exact);
                        const CIcon = c.icon;
                        return (
                          <Link
                            key={c.to}
                            to={c.to}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                              active
                                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80",
                            )}
                          >
                            <CIcon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{c.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            const active = isActive(item.to!, item.exact);
            return (
              <Link
                key={item.to}
                to={item.to!}
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
          <span className="text-lg font-bold tracking-wider">INJOY</span>
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
        <div className={cn("grid", mobileNav.length <= 2 ? "grid-cols-2" : mobileNav.length === 3 ? "grid-cols-3" : mobileNav.length === 4 ? "grid-cols-4" : mobileNav.length === 5 ? "grid-cols-5" : mobileNav.length === 6 ? "grid-cols-6" : mobileNav.length === 7 ? "grid-cols-7" : "grid-cols-8")}>
          {mobileNav.map((item) => {
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

      <PwaInstallPrompt />
    </div>
  );
}
