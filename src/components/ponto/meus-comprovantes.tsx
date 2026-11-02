import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { baixarBase64 } from "@/lib/baixar-arquivo";
import { comprovantePdfPonto } from "@/lib/ponto-assinatura.functions";
import { FileDown, Loader2, Printer, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dataHoraComprovante, linhasComprovante, type Comprovante } from "@/lib/comprovante-ponto";
import { useMeusComprovantes } from "@/lib/ponto-rep";

const dataHora = dataHoraComprovante;

const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const linhas = linhasComprovante;

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

function BotaoPdfAssinado({ nsr }: { nsr: number }) {
  const gerar = useServerFn(comprovantePdfPonto);
  const [baixando, setBaixando] = useState(false);
  const baixar = async () => {
    setBaixando(true);
    try {
      const r = await gerar({ data: { nsr: Number(nsr) } });
      baixarBase64(r.pdfBase64, r.nome, "application/pdf");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBaixando(false);
    }
  };
  return (
    <Button className="w-full gap-2" onClick={baixar} disabled={baixando}>
      {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      Baixar PDF assinado
    </Button>
  );
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
      <BotaoPdfAssinado nsr={c.nsr} />
      <Button variant="ghost" className="w-full gap-2" onClick={() => imprimir(c)}>
        <Printer className="h-4 w-4" />
        Imprimir
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
