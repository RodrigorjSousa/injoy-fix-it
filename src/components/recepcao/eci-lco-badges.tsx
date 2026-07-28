import { LogIn, LogOut } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface EciLcoBadgesProps {
  eci?: boolean | null;
  lco?: boolean | null;
  compact?: boolean;
  className?: string;
}

/**
 * Badges de bloqueio temporário do Cloudbeds:
 * - ECI (Early Check-In): hóspede pode entrar antes do horário padrão.
 * - LCO (Late Check-Out): hóspede pode sair depois do horário padrão.
 * NÃO é bloqueio de manutenção.
 */
export function EciLcoBadges({ eci, lco, compact = false, className }: EciLcoBadgesProps) {
  if (!eci && !lco) return null;

  const size = compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]";
  const iconSize = compact ? 10 : 12;

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("inline-flex items-center gap-1", className)}>
        {eci ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="status"
                aria-label="Early Check-In liberado"
                className={cn(
                  "inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white font-black uppercase tracking-wider shadow-sm ring-1 ring-emerald-700/40",
                  size,
                )}
              >
                <LogIn size={iconSize} strokeWidth={3} className="shrink-0" />
                ECI
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-emerald-600 text-white border-emerald-700">
              Early Check-In: hóspede pode entrar antes do horário padrão.
            </TooltipContent>
          </Tooltip>
        ) : null}
        {lco ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="status"
                aria-label="Late Check-Out liberado"
                className={cn(
                  "inline-flex items-center gap-1 rounded-md bg-indigo-600 text-white font-black uppercase tracking-wider shadow-sm ring-1 ring-indigo-700/40",
                  size,
                )}
              >
                <LogOut size={iconSize} strokeWidth={3} className="shrink-0" />
                LCO
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-indigo-600 text-white border-indigo-700">
              Late Check-Out: hóspede pode sair depois do horário padrão.
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
