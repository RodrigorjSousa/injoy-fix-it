import { BellOff } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NaoPerturbeBadgeProps {
  active: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Indicador visual "NÃO PERTURBE ATIVADO" para cards de quartos.
 * Renderiza null quando `active` é falso.
 */
export function NaoPerturbeBadge({ active, compact = false, className }: NaoPerturbeBadgeProps) {
  if (!active) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="status"
            aria-label="Não Perturbe ativado"
            className={cn(
              "inline-flex items-center gap-1 rounded-md bg-red-600 text-white font-black uppercase tracking-wider shadow-sm ring-1 ring-red-700/40 animate-pulse",
              compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]",
              className,
            )}
          >
            <BellOff
              size={compact ? 10 : 12}
              strokeWidth={3}
              className="shrink-0"
            />
            {compact ? "NP" : "NÃO PERTURBE"}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-red-600 text-white border-red-700">
          Faxina bloqueada para este quarto hoje.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
