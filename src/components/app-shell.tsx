import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { PlusCircle, LayoutGrid, Snowflake, LogOut, MessageSquare, ConciergeBell, BedDouble, Wrench, LayoutDashboard, ShieldCheck, ChevronDown, BarChart3, Building2, MoreHorizontal, ClipboardList, Package, GlassWater, Cog } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import injoyLogo from "@/assets/injoy-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/lib/store";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { useUnidade } from "@/lib/unidade-context";
import type { Unidade } from "@/lib/store";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

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
  { to: "/manutencao", label: "Manutenção", icon: Cog },
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
      { to: "/painel", label: "PAINEL", icon: LayoutGrid },
      { to: "/dashboard", label: "DASHBOARD", icon: LayoutDashboard },
      { to: "/gestao", label: "GESTÃO", icon: BarChart3 },
      { to: "/relatorio-operacoes", label: "LAVANDERIA", icon: ClipboardList },
      { to: "/almoxarifado", label: "ALMOXARIFADO", icon: Package },
      { to: "/frigobar", label: "FRIGOBAR", icon: GlassWater },
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

  // Flat list for mobile bottom nav — apenas abas operacionais (máx 5).
  // Abas de administrador (Dashboard/Gestão/Equipe) ficam ocultas no mobile.
  const MOBILE_ALLOWED = new Set(["/servicos", "/manutencao", "/recepcao", "/camareiras", "/chat"]);
  const mobileNav: NavChild[] = nav
    .flatMap((n) =>
      n.children
        ? [] // grupos admin não vão para o bottom nav do celular
        : n.to
        ? [{ to: n.to, label: n.label, icon: n.icon, exact: n.exact }]
        : [],
    )
    .filter((item) => MOBILE_ALLOWED.has(item.to))
    .slice(0, 4);

  // Unidade ativa vinda do contexto global
  const { unidade, setUnidade, unidades: UNIDADES } = useUnidade();

  // Sheet "Mais" (mobile) — links administrativos
  const [maisOpen, setMaisOpen] = useState(false);
  const adminGroup = ALL_NAV.find((n) => n.label === "ADMINISTRADOR");
  const showMais = isAdmin(me) && !!adminGroup?.children?.length;

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
        <Link
          to="/"
          className="px-6 py-6 flex items-center gap-3 border-b border-sidebar-border cursor-pointer hover:opacity-80 transition-all"
        >
          <div className="h-11 w-11 rounded-xl bg-white shadow-sm overflow-hidden grid place-items-center">
            <img src={injoyLogo.url} alt="INJOY" className="h-9 w-9 object-contain" />
          </div>
          <span className="text-xl font-bold tracking-wider text-sidebar-foreground">INJOY</span>
        </Link>

        <div className="px-4 pt-4 pb-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 mb-1.5 flex items-center gap-1.5">
            <Building2 className="h-3 w-3" />
            Unidade
          </label>
          <div className="relative">
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value as Unidade)}
              className="w-full appearance-none rounded-lg bg-sidebar-accent/40 border border-sidebar-border text-sidebar-foreground text-sm font-medium px-3 py-2 pr-8 cursor-pointer hover:bg-sidebar-accent/70 transition-colors focus:outline-none focus:ring-2 focus:ring-sidebar-primary/40"
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u} className="bg-sidebar text-sidebar-foreground">
                  {u}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/60" />
          </div>
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
        <Link to="/" className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-all">
          <div className="h-10 w-10 rounded-lg bg-white shadow-sm overflow-hidden grid place-items-center">
            <img src={injoyLogo.url} alt="INJOY" className="h-8 w-8 object-contain" />
          </div>
          <span className="text-lg font-bold tracking-wider">INJOY</span>
        </Link>
        <div className="min-w-0 flex-1 flex items-center gap-2">

          <div className="relative">
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value as Unidade)}
              aria-label="Unidade"
              className="appearance-none rounded-md bg-muted/60 border border-border text-foreground text-xs font-medium pl-6 pr-6 py-1.5 cursor-pointer hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <Building2 className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          </div>
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
        <div
          className={cn(
            "grid",
            (() => {
              const total = mobileNav.length + (showMais ? 1 : 0);
              return total <= 2
                ? "grid-cols-2"
                : total === 3
                  ? "grid-cols-3"
                  : total === 4
                    ? "grid-cols-4"
                    : "grid-cols-5";
            })(),
          )}
        >
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
          {showMais && (
            <button
              type="button"
              onClick={() => setMaisOpen(true)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                maisOpen ? "text-primary" : "text-muted-foreground",
              )}
              aria-label="Mais opções"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="truncate max-w-[72px]">Mais</span>
            </button>
          )}
        </div>
      </nav>

      {/* Mais — gaveta com links administrativos (mobile) */}
      {showMais && (
        <Sheet open={maisOpen} onOpenChange={setMaisOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Administrador
              </SheetTitle>
              <SheetDescription>
                Acesso rápido às telas de gestão e configuração.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-1">
              {adminGroup?.children?.map((c) => {
                const active = isActive(c.to, c.exact);
                const CIcon = c.icon;
                return (
                  <Link
                    key={c.to}
                    to={c.to}
                    onClick={() => setMaisOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40 hover:bg-muted text-foreground",
                    )}
                  >
                    <CIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{c.label}</span>
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <PwaInstallPrompt />
    </div>
  );
}
