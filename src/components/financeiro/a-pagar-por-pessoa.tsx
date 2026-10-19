import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Users } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NomeCor } from "@/components/pessoa-cor";
import { currency, dateBR, STATUS, type Categoria, type FiltroUnidade, type FinConfig, type Lancamento } from "@/lib/financeiro";
import { csvPorPessoa, resumirPorPessoa } from "@/lib/financeiro-por-pessoa";

type Props = {
  open: boolean; onClose: () => void;
  lancamentos: Lancamento[]; categorias: Categoria[]; funcionarios: { id: string; nome: string }[];
  mes: string; unidade: FiltroUnidade; config: FinConfig | null;
};

function baixar(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = nome; a.click(); URL.revokeObjectURL(url);
}

export function APagarPorPessoa({ open, onClose, lancamentos, categorias, funcionarios, mes, unidade, config }: Props) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [mostrarPagos, setMostrarPagos] = useState(false);
  const r = useMemo(() => resumirPorPessoa({ lancamentos, categorias, funcionarios, mes, unidade, config }), [lancamentos, categorias, funcionarios, mes, unidade, config]);
  const linhas = mostrarPagos ? r.linhas : r.linhas.filter((l) => l.pendente > 0);
  const titulo = `A pagar por pessoa · ${mes.split("-").reverse().join("/")} · ${unidade}`;
  const pdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(titulo, 14, 16);
    autoTable(doc, { startY: 22, styles: { fontSize: 9 }, head: [["Pessoa", "A pagar", "Vencido", "Pendente", "Já pago"]],
      body: linhas.map((l) => [l.nome, currency.format(l.aPagar), currency.format(l.vencido), currency.format(l.pendente), currency.format(l.pago)]),
      foot: [["TOTAL", "", "", currency.format(r.totalPendente), currency.format(r.totalPago)]] });
    doc.save(`a-pagar-por-pessoa-${mes}.pdf`);
  };
  return <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{titulo}</DialogTitle>
        <DialogDescription>Soma dos lançamentos de cada pessoa (funcionário ou freelancer) no mês e unidade escolhidos na aba Lançamentos. Despesas canceladas não entram.</DialogDescription></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Total a pagar às pessoas</p><p className="text-2xl font-black">{currency.format(r.totalPendente)}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Já pago</p><p className="text-2xl font-black text-emerald-700">{currency.format(r.totalPago)}</p></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mostrarPagos} onChange={(e) => setMostrarPagos(e.target.checked)} />Mostrar também quem já está todo pago</label>
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => baixar(`a-pagar-por-pessoa-${mes}.csv`, new Blob([csvPorPessoa(r, (n) => currency.format(n))], { type: "text/csv;charset=utf-8" }))}><FileSpreadsheet className="mr-1 h-4 w-4" />Planilha</Button><Button size="sm" variant="outline" onClick={pdf}><Download className="mr-1 h-4 w-4" />PDF</Button></div>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Pessoa</TableHead><TableHead className="text-right">A pagar</TableHead><TableHead className="text-right">Vencido</TableHead><TableHead className="text-right">Pendente</TableHead><TableHead className="text-right">Já pago</TableHead></TableRow></TableHeader>
        <TableBody>
          {linhas.map((l) => <Fragment key={l.chave}>
            <TableRow className="cursor-pointer" onClick={() => setAberto(aberto === l.chave ? null : l.chave)}>
              <TableCell className="font-semibold"><span className="inline-flex items-center gap-1">{aberto === l.chave ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<NomeCor nome={l.nome} funcionarioId={l.chave.startsWith("n:") ? null : l.chave} /></span></TableCell>
              <TableCell className="text-right">{currency.format(l.aPagar)}</TableCell>
              <TableCell className={`text-right ${l.vencido > 0 ? "font-semibold text-destructive" : ""}`}>{currency.format(l.vencido)}</TableCell>
              <TableCell className="text-right font-bold">{currency.format(l.pendente)}</TableCell>
              <TableCell className="text-right text-emerald-700">{currency.format(l.pago)}</TableCell>
            </TableRow>
            {aberto === l.chave && <TableRow><TableCell colSpan={5} className="bg-muted/40">
              <div className="mb-2 flex flex-wrap gap-1">{l.porCategoria.map((c) => <Badge key={c.categoria} variant="outline">{c.categoria}: {currency.format(c.pendente)}{c.pago > 0 ? ` (+${currency.format(c.pago)} pago)` : ""}</Badge>)}</div>
              <ul className="space-y-0.5 text-xs">{l.itens.map((i) => <li key={i.id} className="flex justify-between gap-2"><span className="truncate">{i.descricao} <span className="text-muted-foreground">· {STATUS[i.status] ?? i.status}{i.vencimento ? ` · vence ${dateBR(i.vencimento)}` : ""}</span></span><span>{currency.format(i.valor)}</span></li>)}</ul>
            </TableCell></TableRow>}
          </Fragment>)}
          {!linhas.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nada a pagar a pessoas neste mês e unidade.</TableCell></TableRow>}
        </TableBody>
      </Table>
      {r.semPessoa.qtd > 0 && <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs">Há {r.semPessoa.qtd} despesa(s) pendente(s) somando {currency.format(r.semPessoa.pendente)} sem pessoa ligada (fornecedores, contas). Elas não entram no total acima.</p>}
    </DialogContent>
  </Dialog>;
}
