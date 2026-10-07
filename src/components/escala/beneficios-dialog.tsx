import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { calcularBeneficios, gerarCsvBeneficios, montarLancamentos, totaisBeneficios, VALE_ALIMENTACAO_PADRAO, VALE_TRANSPORTE_DIA_PADRAO, type BeneficioLinha } from "@/lib/escala-beneficios";
import { useLancarBeneficios, useSalvarBeneficioColaborador, type EscalaColaborador, type EscalaDia } from "@/lib/escala";

const SETOR: Record<string, string> = { manutencao: "Manutenção", recepcao: "Recepção", camareiras: "Camareiras" };
const money = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const KEY = "escala-beneficios-valores";
const GRADE = "grid grid-cols-[minmax(0,1fr)_2rem_5rem_5rem_5rem_5.5rem] gap-2";

export type ConfigBeneficios = { va: string; vt: string; separado: string };
export function lerConfigBeneficios(): ConfigBeneficios {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const j = JSON.parse(raw); return { va: String(j.va ?? VALE_ALIMENTACAO_PADRAO), vt: String(j.vt ?? VALE_TRANSPORTE_DIA_PADRAO), separado: String(j.separado ?? "") }; }
  } catch { /* sem armazenamento: usa o padrão */ }
  return { va: String(VALE_ALIMENTACAO_PADRAO), vt: String(VALE_TRANSPORTE_DIA_PADRAO), separado: "" };
}
export const numBeneficio = (s: string) => { const n = Number(s.replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; };

function CampoVale({ valor, padrao, titulo, onSalvar }: { valor: number | null | undefined; padrao: number; titulo: string; onSalvar: (v: number | null) => void }) {
  const [txt, setTxt] = useState(valor == null ? "" : String(valor).replace(".", ","));
  const [ultimo, setUltimo] = useState(valor);
  if (ultimo !== valor) { setUltimo(valor); setTxt(valor == null ? "" : String(valor).replace(".", ",")); }
  const confirmar = () => {
    const limpo = txt.trim();
    const novo = limpo === "" ? null : Number(limpo.replace(",", "."));
    if (novo !== null && (!Number.isFinite(novo) || novo < 0)) { setTxt(valor == null ? "" : String(valor).replace(".", ",")); return toast.error("Informe um valor válido"); }
    if ((novo ?? null) !== (valor ?? null)) onSalvar(novo);
  };
  return <Input aria-label={titulo} title={`${titulo} — deixe vazio para usar o padrão (${padrao.toFixed(2).replace(".", ",")}); 0 = não recebe`} className={`h-7 px-2 text-right text-xs ${valor != null ? "border-teal-400 bg-teal-50" : ""}`} inputMode="decimal" placeholder={padrao.toFixed(2).replace(".", ",")} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={confirmar} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />;
}

function baixar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click(); URL.revokeObjectURL(url);
}
function exportarPdf(linhas: BeneficioLinha[], label: string, va: number, vt: number) {  // va/vt = padrões do quadro
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const t = totaisBeneficios(linhas);
  doc.setFontSize(14); doc.text(`Vale alimentação e transporte · ${label}`, 12, 14);
  doc.setFontSize(8); doc.text(`Padrão: VA ${money(va)} por mês · VT ${money(vt)} por dia de trabalho (valores próprios por funcionário já aplicados) · só funcionários fixos`, 12, 19);
  autoTable(doc, {
    startY: 24, styles: { fontSize: 8 }, headStyles: { fillColor: [15, 118, 110] },
    head: [["Setor", "Funcionário", "Unidade", "Dias", "VA", "VT/dia", "VT", "Total"]],
    body: [...linhas.map((l) => [SETOR[l.setor] ?? l.setor, l.nome, l.unidade, String(l.dias), money(l.va), money(l.vtDia), money(l.vt), money(l.total)]), ["TOTAL", "", "", String(t.dias), money(t.va), "", money(t.vt), money(t.total)]],
    didParseCell: (d) => { if (d.row.index === linhas.length) d.cell.styles.fontStyle = "bold"; },
  });
  doc.save(`vale-alimentacao-transporte-${label.replace("/", "-")}.pdf`);
}

export function BeneficiosDialog({ open, onClose, people, days, start, end, label }: { open: boolean; onClose: () => void; people: EscalaColaborador[]; days: EscalaDia[]; start: string; end: string; label: string }) {
  const [valores, setValores] = useState(lerConfigBeneficios); const salvarVale = useSalvarBeneficioColaborador(); const lancar = useLancarBeneficios(); const [confirma, setConfirma] = useState(false);
  const num = numBeneficio;
  const set = (k: keyof ConfigBeneficios, v: string) => { const next = { ...valores, [k]: v }; setValores(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignora */ } };
  const donos = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const salvarPessoa = (id: string, campo: "vale_alimentacao" | "vale_transporte_dia", v: number | null) => { const p = donos.get(id); if (!p) return; salvarVale.mutate({ id, vale_alimentacao: p.vale_alimentacao ?? null, vale_transporte_dia: p.vale_transporte_dia ?? null, [campo]: v }, { onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar o valor") }); };
  const linhas = useMemo(() => calcularBeneficios(people, days, start, end, num(valores.va), num(valores.vt)), [people, days, start, end, valores]);
  const total = totaisBeneficios(linhas);
  const setores = [...new Set(linhas.map((l) => l.setor))];
  const semEscala = linhas.filter((l) => l.semEscala).map((l) => l.nome);
  const separado = num(valores.separado); const passou = separado > 0 && total.total > separado;
  const fazerLancamento = async () => {
    try {
      const r = await lancar.mutateAsync({ competencia: start, itens: montarLancamentos(linhas, label) });
      toast.success("Lançado no Financeiro", { description: `${r.criados} novos, ${r.atualizados} atualizados${r.ja_pagos ? `, ${r.ja_pagos} já pagos (não alterados)` : ""}${r.cancelados ? `, ${r.cancelados} cancelados` : ""}.` });
      setConfirma(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível lançar no Financeiro"); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Vale alimentação e transporte · {label}</DialogTitle>
          <DialogDescription>Só funcionários fixos ativos, de todos os setores e unidades. O VT conta os dias de trabalho e extra da escala; folga, férias, atestado e falta não contam. O VA é cheio todo mês. Os valores de cima são o padrão; para uma pessoa com valor diferente, digite nas colunas dela (campo verde = valor próprio; vazio = padrão; 0 = não recebe). Ficam salvos no cadastro dela.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label>Padrão: vale alimentação (mês)</Label><Input inputMode="decimal" value={valores.va} onChange={(e) => set("va", e.target.value)} /></div>
          <div className="space-y-1"><Label>Padrão: vale transporte (dia)</Label><Input inputMode="decimal" value={valores.vt} onChange={(e) => set("vt", e.target.value)} /></div>
          <div className="space-y-1"><Label>Valor separado no mês</Label><Input inputMode="decimal" placeholder="ex.: 3500" value={valores.separado} onChange={(e) => set("separado", e.target.value)} /></div>
        </div>
        {passou && <p className="rounded-md border border-red-300 bg-red-50 p-2 text-sm font-medium text-red-800">O total do mês ({money(total.total)}) passou do valor separado ({money(separado)}) em {money(total.total - separado)}.</p>}
        {separado > 0 && !passou && <p className="text-xs text-emerald-700">Dentro do valor separado: sobram {money(separado - total.total)}.</p>}
        <div className="space-y-4">
          {setores.map((s) => {
            const rows = linhas.filter((l) => l.setor === s); const t = totaisBeneficios(rows);
            return (
              <div key={s}>
                <h4 className="mb-1 text-sm font-semibold">{SETOR[s] ?? s}</h4>
                <div className={GRADE + " border-b pb-1 text-[11px] text-muted-foreground"}><span>Funcionário</span><span className="text-right">Dias</span><span className="text-right">VA do mês</span><span className="text-right">VT por dia</span><span className="text-right">VT</span><span className="text-right">Total</span></div>
                {rows.map((l) => (
                  <div key={l.id} className={GRADE + " items-center border-b py-1.5 text-xs"}>
                    <span className="truncate font-medium">{l.nome} <span className="font-normal text-muted-foreground">· {l.unidade}</span></span>
                    <span className="text-right">{l.dias}</span>
                    <CampoVale titulo={`VA de ${l.nome}`} valor={donos.get(l.id)?.vale_alimentacao} padrao={num(valores.va)} onSalvar={(v) => salvarPessoa(l.id, "vale_alimentacao", v)} />
                    <CampoVale titulo={`VT por dia de ${l.nome}`} valor={donos.get(l.id)?.vale_transporte_dia} padrao={num(valores.vt)} onSalvar={(v) => salvarPessoa(l.id, "vale_transporte_dia", v)} />
                    <span className="text-right">{money(l.vt)}</span><span className="text-right font-medium">{money(l.total)}</span>
                  </div>
                ))}
                <div className={GRADE + " py-1.5 text-xs font-semibold"}><span>Subtotal</span><span className="text-right">{t.dias}</span><span className="text-right">{money(t.va)}</span><span></span><span className="text-right">{money(t.vt)}</span><span className="text-right">{money(t.total)}</span></div>
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
        {semEscala.length > 0 && <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">Atenção: sem escala gerada neste mês (só o VA entrou, sem VT): <strong>{semEscala.join(", ")}</strong>. Gere a escala antes de fechar o mês.</p>}
        <p className="text-xs text-muted-foreground">Cálculo previsto com a escala como está hoje; se você mudar um dia, o valor se atualiza. Os valores acima ficam salvos só neste aparelho.</p>
        {confirma && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Lançar {money(total.total)} como despesa <strong>prevista</strong> no Financeiro (categorias Vale alimentação e Vale transporte, um lançamento por pessoa). Se você lançar de novo, os valores são atualizados; o que já estiver pago não muda.
          <div className="mt-2 flex gap-2"><Button size="sm" onClick={fazerLancamento} disabled={lancar.isPending}>{lancar.isPending ? "Lançando…" : "Confirmar lançamento"}</Button><Button size="sm" variant="outline" onClick={() => setConfirma(false)}>Cancelar</Button></div></div>}
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!linhas.length} onClick={() => baixar(`vale-alimentacao-transporte-${label.replace("/", "-")}.csv`, gerarCsvBeneficios(linhas, (x) => SETOR[x] ?? x), "text/csv;charset=utf-8")}>Baixar planilha (Excel)</Button>
            <Button variant="outline" disabled={!linhas.length} onClick={() => exportarPdf(linhas, label, num(valores.va), num(valores.vt))}>Baixar PDF</Button>
            <Button disabled={!linhas.length || total.total <= 0} onClick={() => setConfirma(true)}>Lançar no Financeiro</Button>
          </div>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
