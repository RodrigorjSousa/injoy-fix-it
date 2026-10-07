import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calcularBeneficios, totaisBeneficios, VALE_ALIMENTACAO_PADRAO, VALE_TRANSPORTE_DIA_PADRAO } from "@/lib/escala-beneficios";
import type { EscalaColaborador, EscalaDia } from "@/lib/escala";

const SETOR: Record<string, string> = { manutencao: "Manutenção", recepcao: "Recepção", camareiras: "Camareiras" };
const money = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const KEY = "escala-beneficios-valores";

function lerValores(): { va: string; vt: string } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const j = JSON.parse(raw); return { va: String(j.va ?? VALE_ALIMENTACAO_PADRAO), vt: String(j.vt ?? VALE_TRANSPORTE_DIA_PADRAO) }; }
  } catch { /* sem armazenamento: usa o padrão */ }
  return { va: String(VALE_ALIMENTACAO_PADRAO), vt: String(VALE_TRANSPORTE_DIA_PADRAO) };
}

export function BeneficiosDialog({ open, onClose, people, days, start, end, label }: { open: boolean; onClose: () => void; people: EscalaColaborador[]; days: EscalaDia[]; start: string; end: string; label: string }) {
  const [valores, setValores] = useState(lerValores);
  const num = (s: string) => { const n = Number(s.replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const set = (k: "va" | "vt", v: string) => { const next = { ...valores, [k]: v }; setValores(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignora */ } };
  const linhas = useMemo(() => calcularBeneficios(people, days, start, end, num(valores.va), num(valores.vt)), [people, days, start, end, valores]);
  const total = totaisBeneficios(linhas);
  const setores = [...new Set(linhas.map((l) => l.setor))];
  const semEscala = linhas.filter((l) => l.semEscala).map((l) => l.nome);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Vale alimentação e transporte · {label}</DialogTitle>
          <DialogDescription>Só funcionários fixos ativos, de todos os setores e unidades. O VT conta os dias de trabalho e extra da escala; folga, férias, atestado e falta não contam. O VA é cheio todo mês.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Vale alimentação (por mês)</Label><Input inputMode="decimal" value={valores.va} onChange={(e) => set("va", e.target.value)} /></div>
          <div className="space-y-1"><Label>Vale transporte (por dia)</Label><Input inputMode="decimal" value={valores.vt} onChange={(e) => set("vt", e.target.value)} /></div>
        </div>
        <div className="space-y-4">
          {setores.map((s) => {
            const rows = linhas.filter((l) => l.setor === s); const t = totaisBeneficios(rows);
            return (
              <div key={s}>
                <h4 className="mb-1 text-sm font-semibold">{SETOR[s] ?? s}</h4>
                <div className="grid grid-cols-[1fr_repeat(4,minmax(0,5.5rem))] gap-2 border-b pb-1 text-[11px] text-muted-foreground"><span>Funcionário</span><span className="text-right">Dias</span><span className="text-right">VA</span><span className="text-right">VT</span><span className="text-right">Total</span></div>
                {rows.map((l) => (
                  <div key={l.id} className="grid grid-cols-[1fr_repeat(4,minmax(0,5.5rem))] gap-2 border-b py-1.5 text-xs">
                    <span className="truncate font-medium">{l.nome} <span className="font-normal text-muted-foreground">· {l.unidade}</span></span>
                    <span className="text-right">{l.dias}</span><span className="text-right">{money(l.va)}</span><span className="text-right">{money(l.vt)}</span><span className="text-right font-medium">{money(l.total)}</span>
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_repeat(4,minmax(0,5.5rem))] gap-2 py-1.5 text-xs font-semibold"><span>Subtotal</span><span className="text-right">{t.dias}</span><span className="text-right">{money(t.va)}</span><span className="text-right">{money(t.vt)}</span><span className="text-right">{money(t.total)}</span></div>
              </div>
            );
          })}
          {!linhas.length && <p className="text-sm text-muted-foreground">Nenhum funcionário fixo ativo.</p>}
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/40 p-3 text-center text-sm">
          <div><div className="text-[11px] text-muted-foreground">Vale alimentação</div><strong>{money(total.va)}</strong></div>
          <div><div className="text-[11px] text-muted-foreground">Vale transporte ({total.dias} dias)</div><strong>{money(total.vt)}</strong></div>
          <div><div className="text-[11px] text-muted-foreground">Total a separar no mês</div><strong className="text-base">{money(total.total)}</strong></div>
        </div>
        {semEscala.length > 0 && <p className="text-xs text-amber-700">Sem escala gerada neste mês (só o VA entrou): {semEscala.join(", ")}.</p>}
        <p className="text-xs text-muted-foreground">Cálculo previsto com a escala como está hoje; se você mudar um dia, o valor se atualiza. Os valores acima ficam salvos só neste aparelho.</p>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
