import { useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FolhaConfig } from "@/lib/folha";
import { useSalvarConfigFolha } from "@/lib/folha-dados";
import { lerValor, paraTexto } from "./folha-util";

type Faixa = { rotulo: string; horas: string; valor: string };

/** Tabela de preço dos freelancers e regras gerais da folha. */
export function FolhaConfigDialog({
  config,
  semMigracao,
  onClose,
}: {
  config: FolhaConfig;
  semMigracao: boolean;
  onClose: () => void;
}) {
  const salvar = useSalvarConfigFolha();
  const [faixas, setFaixas] = useState<Faixa[]>(() =>
    config.tabela_freela.map((f) => ({
      rotulo: f.rotulo,
      horas: paraTexto(f.horas),
      valor: paraTexto(f.valor),
    })),
  );
  const [divisor, setDivisor] = useState(paraTexto(config.divisor_padrao));
  const [dsr, setDsr] = useState(config.dsr_extras);
  const [descontar, setDescontar] = useState(config.descontar_debitos);
  const [diaPag, setDiaPag] = useState(String(config.dia_pagamento));

  const mudar = (i: number, campo: keyof Faixa, v: string) =>
    setFaixas((fs) => fs.map((f, j) => (j === i ? { ...f, [campo]: v } : f)));

  const gravar = () => {
    const tabela = faixas
      .filter((f) => f.horas.trim() || f.valor.trim())
      .map((f) => ({
        rotulo: f.rotulo.trim() || `Plantão ${f.horas.trim()} h`,
        horas: lerValor(f.horas) ?? 0,
        valor: lerValor(f.valor) ?? -1,
      }));
    if (tabela.some((f) => !(f.horas > 0 && f.horas <= 24)))
      return toast.error("Informe as horas de cada linha (entre 1 e 24).");
    if (tabela.some((f) => f.valor < 0)) return toast.error("Informe o valor de cada linha.");
    if (new Set(tabela.map((f) => f.horas)).size !== tabela.length)
      return toast.error("Há duas linhas com as mesmas horas.");
    const div = lerValor(divisor);
    if (!div || div <= 0) return toast.error("Divisor inválido.");
    const dia = Number(diaPag);
    if (!Number.isInteger(dia) || dia < 1 || dia > 28)
      return toast.error("Dia de pagamento entre 1 e 28.");
    salvar.mutate(
      {
        tabela_freela: tabela.sort((a, b) => a.horas - b.horas),
        divisor_padrao: div,
        dsr_extras: dsr,
        descontar_debitos: descontar,
        dia_pagamento: dia,
      },
      {
        onSuccess: () => {
          toast.success("Tabela e regras salvas.");
          onClose();
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !salvar.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Tabela e regras da folha</DialogTitle>
          <DialogDescription>
            Valem para todos os meses que ainda não foram pagos.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <p className="text-sm font-bold">Preço do plantão do freelancer</p>
          <p className="text-[11px] text-muted-foreground">
            O plantão é pago pelo valor da linha com as mesmas horas. Quem é chamado muitas vezes
            pode ter um valor cheio no mês (no cadastro da pessoa).
          </p>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_5rem_7rem_2rem] gap-2 text-xs font-semibold text-slate-500">
              <span>Nome</span>
              <span>Horas</span>
              <span>Valor (R$)</span>
              <span />
            </div>
            {faixas.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_7rem_2rem] items-center gap-2">
                <Input
                  value={f.rotulo}
                  onChange={(e) => mudar(i, "rotulo", e.target.value)}
                  placeholder="Plantão 8 h"
                />
                <Input
                  inputMode="decimal"
                  value={f.horas}
                  onChange={(e) => mudar(i, "horas", e.target.value)}
                  placeholder="8"
                />
                <Input
                  inputMode="decimal"
                  value={f.valor}
                  onChange={(e) => mudar(i, "valor", e.target.value)}
                  placeholder="150,00"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remover linha"
                  onClick={() => setFaixas((fs) => fs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFaixas((fs) => [...fs, { rotulo: "", horas: "", valor: "" }])}
            >
              <Plus />
              Adicionar linha
            </Button>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border bg-slate-50 p-3">
          <p className="text-sm font-bold">Funcionários fixos</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Divisor de horas do mês</Label>
              <Input
                inputMode="decimal"
                value={divisor}
                onChange={(e) => setDivisor(e.target.value)}
              />
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                220 para 44 h/semana. Valor da hora = salário ÷ divisor.
              </p>
            </div>
            <div>
              <Label className="text-xs">Dia do pagamento (mês seguinte)</Label>
              <Input
                inputMode="numeric"
                value={diaPag}
                onChange={(e) => setDiaPag(e.target.value)}
              />
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Vencimento dos lançamentos de salário.
              </p>
            </div>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={dsr} onCheckedChange={setDsr} />
            <span>
              <b>Calcular DSR sobre horas extras e noturno</b>
              <span className="block text-[11px] text-muted-foreground">
                Reflexo no descanso semanal (Súmula 172 do TST): extras ÷ dias úteis × domingos e
                feriados.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={descontar} onCheckedChange={setDescontar} />
            <span>
              <b>Descontar faltas e atrasos do ponto</b>
              <span className="block text-[11px] text-muted-foreground">
                Só para quem está em "pagar na folha". Deixe desligado enquanto alguém ainda não
                bate o ponto pelo app, para não descontar dia sem registro.
              </span>
            </span>
          </label>
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button onClick={gravar} disabled={salvar.isPending || semMigracao}>
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
