import { useEffect, useState } from "react";
import { Download, Share, Plus, X, Smartphone, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import injoyLogo from "@/assets/injoy-logo.png.asset.json";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "android" | "ios" | "other";

const DISMISS_KEY = "injoy:pwa-install-dismissed-at";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari expõe navigator.standalone
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return !!mql || !!iosStandalone;
}

export function PwaInstallPrompt() {
  const [mounted, setMounted] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPlatform(detectPlatform());

    // Dismiss recente?
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) {
        const ts = Number(raw);
        if (!Number.isNaN(ts) && Date.now() - ts < DISMISS_TTL_MS) {
          setHidden(true);
        }
      }
    } catch {
      // ignore
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setHidden(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mounted) return null;
  if (hidden) return null;
  if (isStandalone()) return null;
  if (platform === "other") return null; // só em mobile
  // Ocultar dentro do app nativo (Capacitor)
  if (typeof window !== "undefined" && (window as unknown as { Capacitor?: unknown }).Capacitor) {
    return null;
  }

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setHidden(true);
    setExpanded(false);
  };

  const triggerNativePrompt = async () => {
    if (!deferredPrompt) {
      setExpanded(true);
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") {
      setHidden(true);
    }
  };

  return (
    <>
      {/* Barra flutuante compacta (acima do bottom nav no mobile) */}
      <div
        className={cn(
          "lg:hidden fixed inset-x-0 z-40",
          "bottom-[calc(env(safe-area-inset-bottom)+72px)]",
          "px-3",
        )}
        role="region"
        aria-label="Instalar aplicativo"
      >
        <div className="mx-auto max-w-md rounded-2xl border border-primary/20 bg-card/95 backdrop-blur shadow-lg overflow-hidden">
          <div className="flex items-center gap-3 p-3">
            <div className="relative shrink-0">
              <div className="h-11 w-11 rounded-xl bg-white shadow-sm grid place-items-center overflow-hidden">
                <img src={injoyLogo.url} alt="INJOY" className="h-9 w-9 object-contain" />
              </div>
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground grid place-items-center shadow">
                <Sparkles className="h-2.5 w-2.5" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight truncate">
                Instalar app INJOY
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Acesso rápido, tela cheia e ícone na tela inicial.
              </p>
            </div>
            <button
              type="button"
              onClick={() => (platform === "android" ? triggerNativePrompt() : setExpanded(true))}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold shadow-sm hover:opacity-90 transition"
            >
              Instalar
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dispensar"
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal de instruções passo a passo */}
      {expanded && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-full max-w-md bg-card text-card-foreground rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header com gradiente */}
            <div className="relative bg-gradient-to-br from-primary to-primary/70 text-primary-foreground px-6 pt-6 pb-8">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Fechar"
                className="absolute top-3 right-3 p-1.5 rounded-full bg-white/15 hover:bg-white/25 transition"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-white shadow-md grid place-items-center overflow-hidden">
                  <img src={injoyLogo.url} alt="INJOY" className="h-11 w-11 object-contain" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs opacity-90">
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>Manutenção INJOY</span>
                  </div>
                  <h2 className="text-xl font-bold leading-tight mt-0.5">
                    Instale na tela inicial
                  </h2>
                </div>
              </div>
              <p className="text-sm opacity-90 mt-3">
                Abra em tela cheia como um app nativo, com ícone próprio e carregamento
                mais rápido.
              </p>
            </div>

            {/* Instruções por plataforma */}
            <div className="px-6 py-5 max-h-[65vh] overflow-y-auto">
              {platform === "android" ? (
                <AndroidSteps hasNativePrompt={!!deferredPrompt} onInstall={triggerNativePrompt} />
              ) : (
                <IosSteps />
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={dismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition"
              >
                Não mostrar por 7 dias
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="inline-flex items-center rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-muted transition"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Step({
  n,
  title,
  children,
  icon,
}: {
  n: number;
  title: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center font-bold text-sm">
        {n}
      </div>
      <div className="flex-1 pt-0.5">
        <p className="text-sm font-semibold flex items-center gap-2">
          {title}
          {icon}
        </p>
        {children && <div className="text-xs text-muted-foreground mt-1">{children}</div>}
      </div>
    </li>
  );
}

function InlineIcon({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <span
      aria-label={label}
      className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-muted text-foreground mx-1 align-middle"
    >
      {children}
    </span>
  );
}

function AndroidSteps({
  hasNativePrompt,
  onInstall,
}: {
  hasNativePrompt: boolean;
  onInstall: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 text-[11px] font-semibold">
          Android · Chrome
        </span>
      </div>

      {hasNativePrompt && (
        <button
          type="button"
          onClick={onInstall}
          className="w-full mb-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm font-semibold shadow-sm hover:opacity-90 transition"
        >
          <Download className="h-4 w-4" />
          Instalar agora
        </button>
      )}

      <ol className="space-y-4">
        <Step n={1} title="Abra o menu do Chrome">
          Toque nos três pontinhos
          <InlineIcon label="menu">
            <span className="text-xs leading-none tracking-tighter">⋮</span>
          </InlineIcon>
          no canto superior direito do navegador.
        </Step>
        <Step n={2} title='Escolha "Instalar app" ou "Adicionar à tela inicial"'>
          A opção pode aparecer com o ícone <InlineIcon label="download"><Download className="h-3.5 w-3.5" /></InlineIcon>.
          Se não aparecer, use "Adicionar à tela inicial".
        </Step>
        <Step n={3} title="Confirme a instalação">
          Toque em <b>Instalar</b>. O ícone da INJOY aparece na sua tela inicial e o app
          abre em tela cheia, sem a barra do navegador.
        </Step>
      </ol>

      <p className="mt-5 text-[11px] text-muted-foreground leading-relaxed">
        Não vê a opção? Verifique se está usando o Chrome (não o app do Facebook/Instagram)
        e se a página é <b>injoyhoteis.lovable.app</b>.
      </p>
    </div>
  );
}

function IosSteps() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 px-2.5 py-1 text-[11px] font-semibold">
          iPhone / iPad · Safari
        </span>
      </div>

      <ol className="space-y-4">
        <Step n={1} title="Abra no Safari">
          O botão de instalar só funciona no <b>Safari</b>. Se abriu em outro navegador,
          copie o link e cole no Safari.
        </Step>
        <Step
          n={2}
          title="Toque no botão Compartilhar"
          icon={
            <InlineIcon label="compartilhar">
              <Share className="h-3.5 w-3.5" />
            </InlineIcon>
          }
        >
          Fica na barra inferior (iPhone) ou superior (iPad) do Safari.
        </Step>
        <Step
          n={3}
          title='Escolha "Adicionar à Tela de Início"'
          icon={
            <InlineIcon label="adicionar">
              <Plus className="h-3.5 w-3.5" />
            </InlineIcon>
          }
        >
          Role a lista de ações até encontrar essa opção.
        </Step>
        <Step n={4} title='Toque em "Adicionar"'>
          O ícone da INJOY aparece na tela inicial. Abra por lá para usar em tela cheia.
        </Step>
      </ol>

      <p className="mt-5 text-[11px] text-muted-foreground leading-relaxed">
        Dica: no iOS, apps instalados via Safari têm sessão separada da do navegador —
        entre com sua conta na primeira vez que abrir.
      </p>
    </div>
  );
}
