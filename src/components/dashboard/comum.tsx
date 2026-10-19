import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useUnidade } from "@/lib/unidade-context";

export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const pct = (v: number | null | undefined, casas = 0) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;
export const num = (v: number | null | undefined, casas = 1) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas });

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const diaCurto = (d: number) => DIAS[d] ?? "";
export function dataCurta(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} ${DIAS[dia]}`;
}
export function horaCurta(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export const COR_UNIDADE = { Botafogo: "bg-blue-700", Ipanema: "bg-teal-700" } as const;

export function Secao({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-black uppercase text-slate-500">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function CabecalhoUnidade({ unidade, extra }: { unidade: "Botafogo" | "Ipanema"; extra?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className={cn("h-2.5 w-2.5 rounded-full", COR_UNIDADE[unidade])} />
        <h3 className="font-black text-slate-900">INJOY {unidade}</h3>
      </div>
      {extra}
    </div>
  );
}

export function Kpi({ rotulo, valor, sub, tom, onClick, to, unidade }: { rotulo: string; valor: ReactNode; sub?: ReactNode; tom?: "ruim" | "bom"; onClick?: () => void; to?: "/gestor/financeiro" | "/gestor/rendimento" | "/gestao" | "/bonificacao" | "/gestor/totem" | "/relatorio-operacoes"; unidade?: "Botafogo" | "Ipanema" }) {
  const { setUnidade } = useUnidade();
  const content = (
    <div className="w-full min-w-0 rounded-lg bg-muted px-3 py-2 text-left">
      <p className="whitespace-normal break-words text-[10px] font-bold uppercase text-slate-500">{rotulo}</p>
      <p className={cn("whitespace-normal break-words text-lg font-black text-slate-900", tom === "ruim" && "text-red-600", tom === "bom" && "text-emerald-700")}>{valor}</p>
      {sub && <p className="whitespace-normal break-words text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
  if (to) return <Button asChild variant="ghost" className="h-auto min-w-0 p-0"><Link to={to} onClick={() => { if (unidade) setUnidade(unidade); }}>{content}</Link></Button>;
  return onClick ? <Button variant="ghost" onClick={onClick} aria-label={rotulo} className="h-auto min-w-0 p-0">{content}</Button> : content;
}

export function Cartao({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)}>{children}</div>;
}

export function Erros({ lista }: { lista: string[] }) {
  if (!lista.length) return null;
  return (
    <ul className="space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
      {lista.map((e) => (
        <li key={e}>Não carregou · {e}</li>
      ))}
    </ul>
  );
}
