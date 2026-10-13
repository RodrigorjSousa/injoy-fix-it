import { useCanGoBack, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMe } from "@/lib/store";
import { destinoSemHistorico, mostraVoltar } from "@/lib/voltar";
import { cn } from "@/lib/utils";

/** Seta "Voltar" no topo de todas as telas (menos as iniciais). Volta à tela anterior do app ou ao início. */
export function BotaoVoltar({ className, compacto }: { className?: string; compacto?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const podeVoltar = useCanGoBack();
  const navigate = useNavigate();
  const { data: me } = useMe();
  if (!mostraVoltar(pathname)) return null;
  const voltar = () => {
    if (podeVoltar) router.history.back();
    else void navigate({ to: destinoSemHistorico(!!(me?.isGestor || me?.isAdmin)) });
  };
  return (
    <button
      type="button"
      onClick={voltar}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted print:hidden",
        compacto ? "h-10 w-10 shrink-0 justify-center" : "px-3 py-2",
        className,
      )}
      aria-label="Voltar para a tela anterior"
    >
      <ArrowLeft className={compacto ? "h-5 w-5" : "h-4 w-4"} />
      {!compacto && "Voltar"}
    </button>
  );
}
