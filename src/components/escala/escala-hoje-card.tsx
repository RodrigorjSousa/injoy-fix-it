import { useMemo } from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEscalaColaboradores, useEscalaDias } from "@/lib/escala";
import { addCivilDays } from "@/lib/escala-engine";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

const sectors = ["recepcao", "camareiras", "manutencao"] as const;
const labels = { recepcao: "Recepção", camareiras: "Camareiras", manutencao: "Manutenção" };

export function EscalaHojeCard() {
  const today = todaySP();
  const tomorrow = addCivilDays(today, 1);
  const daysQuery = useEscalaDias(today, tomorrow);
  const peopleQuery = useEscalaColaboradores();
  const people = peopleQuery.data ?? [];
  const days = daysQuery.data ?? [];
  const rows = useMemo(() => ["Botafogo", "Ipanema"].flatMap((unit) => sectors.map((sector) => {
    const todayRows = days.filter((d) => d.data === today && d.unidade === unit && d.setor === sector && ["trabalho", "extra"].includes(d.status));
    const tomorrowRows = days.filter((d) => d.data === tomorrow && d.unidade === unit && d.setor === sector && ["trabalho", "extra"].includes(d.status));
    return { unit, sector, todayRows, uncovered: todayRows.length === 0 || tomorrowRows.length === 0 };
  })), [days, today, tomorrow]);
  const personName = (id: string) => people.find((person) => person.id === id)?.nome ?? "Equipe";
  return <section className="space-y-3"><div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-blue-700"/><h2 className="text-xs font-black uppercase text-slate-500">Hoje</h2></div><div className="grid gap-3 lg:grid-cols-2">{["Botafogo", "Ipanema"].map((unit) => <Card key={unit} className="p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-black text-slate-900">{unit}</h3>{rows.some((row) => row.unit === unit && row.uncovered) && <span className="flex items-center gap-1 text-xs font-bold text-red-700"><AlertTriangle className="h-4 w-4"/>Cobertura pendente</span>}</div><div className="space-y-2">{rows.filter((row) => row.unit === unit).map((row) => <div key={row.sector} className={cn("rounded-md border p-3", row.uncovered && "border-red-200 bg-red-50")}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase text-slate-500">{labels[row.sector]}</span><span className="text-xs text-slate-500">{row.todayRows.map((d) => d.turno).join(" · ") || "Sem escala"}</span></div><p className="mt-1 text-sm font-semibold text-slate-900">{row.todayRows.map((d) => personName(d.colaborador_id)).join(", ") || "Ninguém escalado hoje"}</p>{row.uncovered && <p className="mt-1 text-xs font-semibold text-red-700">Confira a cobertura de hoje e amanhã.</p>}</div>)}</div></Card>)}</div></section>;
}