import { useState } from "react";
import { Printer, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatarCnpj, formatarCpf } from "@/lib/cpf";
import { useMeusComprovantes, type Comprovante } from "@/lib/ponto-rep";

const dataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function linhas(c: Comprovante): [string, string][] {
  return [
    ["Empregador", c.empregador ?? "—"],
    [
      c.tipo_doc === 2 ? "CPF do empregador" : "CNPJ",
      c.documento ? (c.tipo_doc === 2 ? formatarCpf(c.documento) : formatarCnpj(c.documento)) : "—",
    ],
    ...(c.cno_caepf ? ([["CNO/CAEPF", c.cno_caepf]] as [string, string][]) : []),
    ["Local de prestação", c.local ?? c.unidade],
    ["Trabalhador", c.nome],
    ["CPF", formatarCpf(c.cpf)],
    ["Data e hora da marcação", dataHora(c.marcacao_em)],
    ["NSR", String(c.nsr).padStart(9, "0")],
    ["Registro do programa (INPI)", c.inpi ?? "em registro"],
    ["Código hash (SHA-256)", c.hash],
  ];
}

function imprimir(c: Comprovante) {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return;
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Comprovante NSR ${c.nsr}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:16px;color:#000}
h1{font-size:14px;text-align:center;margin:0 0 12px}p{margin:4px 0}b{display:block;font-size:10px;text-transform:uppercase}
.hash{word-break:break-all;font-family:monospace}</style></head><body>
<h1>Comprovante de Registro de Ponto do Trabalhador</h1>
${linhas(c)
  .map(
    ([k, v]) =>
      `<p><b>${esc(k)}</b><span class="${k.startsWith("Código") ? "hash" : ""}">${esc(v)}</span></p>`,
  )
  .join("")}
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

export function ComprovanteDetalhe({ c }: { c: Comprovante }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-center text-xs font-bold uppercase">
        Comprovante de Registro de Ponto do Trabalhador
      </p>
      <dl className="space-y-1.5">
        {linhas(c).map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] font-semibold uppercase text-slate-500">{k}</dt>
            <dd className={k.startsWith("Código") ? "break-all font-mono text-xs" : ""}>{v}</dd>
          </div>
        ))}
      </dl>
      <Button variant="outline" className="w-full gap-2" onClick={() => imprimir(c)}>
        <Printer className="h-4 w-4" />
        Imprimir ou salvar em PDF
      </Button>
    </div>
  );
}

/** Comprovantes das marcações oficiais dos últimos 7 dias (a lei exige ao menos 48 h). */
export function MeusComprovantes() {
  const q = useMeusComprovantes();
  const [aberto, setAberto] = useState<Comprovante | null>(null);
  if (!q.data?.length) return null;
  return (
    <Card className="space-y-2 p-4">
      <p className="flex items-center gap-2 text-sm font-bold">
        <Receipt className="h-4 w-4 text-emerald-600" />
        Comprovantes de ponto (últimos 7 dias)
      </p>
      <ul className="space-y-1 text-sm">
        {q.data.map((c) => (
          <li key={c.nsr} className="flex items-center justify-between gap-2">
            <span>
              {dataHora(c.marcacao_em)} · {c.unidade}
              <span className="text-xs text-slate-500"> · NSR {c.nsr}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setAberto(c)}>
              Ver
            </Button>
          </li>
        ))}
      </ul>
      <Dialog open={!!aberto} onOpenChange={(v) => !v && setAberto(null)}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comprovante</DialogTitle>
          </DialogHeader>
          {aberto && <ComprovanteDetalhe c={aberto} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
