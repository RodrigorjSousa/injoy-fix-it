import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEscalaFeriados, useMinhaEscala } from "@/lib/escala";
import { addCivilDays } from "@/lib/escala-engine";
import { todaySP } from "@/lib/tz";

const statusLabel: Record<string, string> = {
  trabalho: "Trabalho", folga: "Folga", falta: "Falta", atestado: "Atestado", ferias: "Férias", extra: "Plantão extra",
};

/** `recolhivel`: começa fechado e só mostra os dias quando a pessoa toca no título. */
export function MinhaEscalaCard({ dark = false, recolhivel = false }: { dark?: boolean; recolhivel?: boolean }) {
  const [aberto, setAberto] = useState(!recolhivel);
  const start = todaySP();
  const end = addCivilDays(start, 13);
  const query = useMinhaEscala(start, end);
  const holidayQuery = useEscalaFeriados();
  const items = query.data ?? [];
  const holidays = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
  return (
    <Card className={dark ? "border-white/10 bg-white/5 p-4 text-white" : "p-4"}>
      <div className={(aberto ? "mb-3 " : "") + "flex items-center justify-between gap-3"}>
        <button
          type="button"
          onClick={() => recolhivel && setAberto((v) => !v)}
          aria-expanded={aberto}
          className={recolhivel ? "flex flex-1 items-center gap-2 text-left" : "flex items-center gap-2 text-left cursor-default"}
        >
          <CalendarDays className="h-5 w-5 text-primary" />
          <div><h3 className="font-bold">Minha escala</h3><p className={dark ? "text-xs text-slate-400" : "text-xs text-muted-foreground"}>{recolhivel && !aberto ? "Toque para ver os próximos 14 dias" : "Próximos 14 dias"}</p></div>
          {recolhivel && <ChevronDown className={"ml-1 h-4 w-4 text-muted-foreground transition-transform" + (aberto ? " rotate-180" : "")} />}
        </button>
        <Link to="/minha-escala" className="flex items-center text-xs font-semibold text-primary">Ver mês<ChevronRight className="h-4 w-4" /></Link>
      </div>
      {!aberto ? null : query.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma escala publicada neste período.</p> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => <div key={item.id} className={dark ? "rounded-md border border-white/10 bg-slate-950/30 p-3" : "rounded-md border bg-muted/20 p-3"}>
            <div className="flex items-center justify-between gap-2"><strong className="text-sm">{item.data.split("-").reverse().join("/")} · {holidays.format(new Date(`${item.data}T12:00:00Z`))}</strong><span className="text-xs font-semibold">{statusLabel[item.status] ?? item.status}</span></div>
            <p className={dark ? "mt-1 text-xs text-slate-400" : "mt-1 text-xs text-muted-foreground"}>{item.unidade} · {item.turno}{item.hora_entrada ? ` · ${item.hora_entrada.slice(0, 5)}${item.hora_saida ? `–${item.hora_saida.slice(0, 5)}` : ""}` : ""}</p>
            {holidayQuery.data?.find((holiday) => holiday.data === item.data) && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-600"><Sparkles className="h-3 w-3"/>Feriado: {holidayQuery.data.find((holiday) => holiday.data === item.data)?.nome}</p>}
          </div>)}
        </div>
      )}
    </Card>
  );
}