import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings, Trash2, Trophy } from "lucide-react";
import type { Unidade } from "@/lib/store";
import { useMe } from "@/lib/store";
import {
  calcularValor,
  formatBRL,
  useConfigBonificacao,
  useCriarRegistroBonificacao,
  useExcluirRegistroBonificacao,
  useRegistrosBonificacaoMes,
  useSalvarConfigBonificacao,
} from "@/lib/bonificacao";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unidade: Unidade;
};

export function BonificacaoPanelModal({ open, onOpenChange, unidade }: Props) {
  const { data: me } = useMe();
  const isAdminGestor = Boolean(me?.isAdmin || me?.isGestor);
  const { data: cfg } = useConfigBonificacao();
  const { data: registros = [] } = useRegistrosBonificacaoMes(unidade);

  const total = useMemo(
    () => registros.reduce((sum, r) => sum + Number(r.valor_calculado), 0),
    [registros],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-emerald-500" />
            Painel de Bonificação · INJOY {unidade}
          </DialogTitle>
          <DialogDescription>
            Registro e gestão das avaliações dos hóspedes para bonificação da recepção.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Saldo do Mês
            </p>
            <p
              className={cn(
                "text-2xl font-black",
                total >= 0 ? "text-emerald-600" : "text-red-600",
              )}
            >
              {formatBRL(total)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {registros.length} avaliação{registros.length === 1 ? "" : "s"}
          </p>
        </div>

        <Tabs defaultValue="registrar" className="mt-2">
          <TabsList className={cn("grid w-full", isAdminGestor ? "grid-cols-3" : "grid-cols-2")}>
            <TabsTrigger value="registrar">Registrar</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            {isAdminGestor && (
              <TabsTrigger value="config">
                <Settings className="h-4 w-4 mr-1" /> Configurações
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="registrar" className="mt-4">
            <FormRegistro unidade={unidade} />
          </TabsContent>

          <TabsContent value="historico" className="mt-4">
            <HistoricoTabela registros={registros} podeExcluir={isAdminGestor} />
          </TabsContent>

          {isAdminGestor && (
            <TabsContent value="config" className="mt-4">
              <ConfiguracoesForm cfg={cfg ?? null} />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Formulário ------------------------------- */

function FormRegistro({ unidade }: { unidade: Unidade }) {
  const { data: cfg } = useConfigBonificacao();
  const criar = useCriarRegistroBonificacao();
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [nome, setNome] = useState("");
  const [notaFunc, setNotaFunc] = useState("");
  const [notaGeral, setNotaGeral] = useState("");
  const [obs, setObs] = useState("");
  const [elogio, setElogio] = useState(false);

  const preview = useMemo(() => {
    if (!cfg) return 0;
    const nf = Number(notaFunc);
    const ng = Number(notaGeral);
    if (!Number.isFinite(nf) || !Number.isFinite(ng)) return 0;
    if (notaFunc === "" || notaGeral === "") return 0;
    return calcularValor(nf, ng, elogio, cfg);
  }, [cfg, notaFunc, notaGeral, elogio]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    const nf = Number(notaFunc);
    const ng = Number(notaGeral);
    if (!nome.trim()) return toast.error("Informe o nome do hóspede");
    if (!Number.isFinite(nf) || nf < 0 || nf > 10) return toast.error("Nota funcionários inválida (0-10)");
    if (!Number.isFinite(ng) || ng < 0 || ng > 10) return toast.error("Nota geral inválida (0-10)");
    const valor = calcularValor(nf, ng, elogio, cfg);
    try {
      await criar.mutateAsync({
        data,
        nome_hospede: nome.trim(),
        nota_funcionarios: nf,
        nota_geral: ng,
        observacao: obs.trim() || null,
        teve_elogio: elogio,
        valor_calculado: valor,
        unidade,
      });
      toast.success(`Avaliação registrada · ${formatBRL(valor)}`);
      setNome("");
      setNotaFunc("");
      setNotaGeral("");
      setObs("");
      setElogio(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bonif-data">Data</Label>
          <Input id="bonif-data" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bonif-nome">Nome do Hóspede</Label>
          <Input
            id="bonif-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: João Silva"
            maxLength={120}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bonif-nf">Nota Funcionários (0–10)</Label>
          <Input
            id="bonif-nf"
            type="number"
            inputMode="decimal"
            min={0}
            max={10}
            step="0.5"
            value={notaFunc}
            onChange={(e) => setNotaFunc(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bonif-ng">Nota Geral (0–10)</Label>
          <Input
            id="bonif-ng"
            type="number"
            inputMode="decimal"
            min={0}
            max={10}
            step="0.5"
            value={notaGeral}
            onChange={(e) => setNotaGeral(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="bonif-elogio" checked={elogio} onCheckedChange={(v) => setElogio(v === true)} />
        <Label htmlFor="bonif-elogio" className="cursor-pointer text-sm">
          Teve elogio nominal?
        </Label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bonif-obs">Observação</Label>
        <Textarea
          id="bonif-obs"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Detalhes da avaliação (opcional)"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
        <span className="text-xs uppercase font-bold tracking-wide text-muted-foreground">
          Valor previsto
        </span>
        <span
          className={cn(
            "text-lg font-black",
            preview >= 0 ? "text-emerald-600" : "text-red-600",
          )}
        >
          {formatBRL(preview)}
        </span>
      </div>

      <Button type="submit" className="w-full" disabled={criar.isPending || !cfg}>
        {criar.isPending ? "Registrando..." : "Registrar Avaliação"}
      </Button>
    </form>
  );
}

/* -------------------------------- Histórico ------------------------------- */

function HistoricoTabela({
  registros,
  podeExcluir,
}: {
  registros: ReturnType<typeof useRegistrosBonificacaoMes>["data"];
  podeExcluir: boolean;
}) {
  const excluir = useExcluirRegistroBonificacao();
  const list = registros ?? [];

  if (list.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhuma avaliação registrada neste mês.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-2 text-left">Data</th>
            <th className="p-2 text-left">Hóspede</th>
            <th className="p-2 text-center">Func.</th>
            <th className="p-2 text-center">Geral</th>
            <th className="p-2 text-center">Elogio</th>
            <th className="p-2 text-right">Valor</th>
            {podeExcluir && <th className="p-2" />}
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const positivo = Number(r.valor_calculado) >= 0;
            return (
              <tr key={r.id} className="border-t">
                <td className="p-2 whitespace-nowrap">
                  {new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR")}
                </td>
                <td className="p-2">
                  <div className="font-medium">{r.nome_hospede}</div>
                  {r.observacao && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{r.observacao}</div>
                  )}
                </td>
                <td className="p-2 text-center font-mono font-bold">{Number(r.nota_funcionarios)}</td>
                <td className="p-2 text-center font-mono font-bold">{Number(r.nota_geral)}</td>
                <td className="p-2 text-center">{r.teve_elogio ? "⭐" : "—"}</td>
                <td className="p-2 text-right">
                  <Badge
                    className={cn(
                      "font-mono",
                      positivo ? "bg-emerald-600 hover:bg-emerald-600" : "bg-red-600 hover:bg-red-600",
                    )}
                  >
                    {formatBRL(Number(r.valor_calculado))}
                  </Badge>
                </td>
                {podeExcluir && (
                  <td className="p-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Excluir este registro?")) excluir.mutate(r.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------ Configurações ----------------------------- */

function ConfiguracoesForm({ cfg }: { cfg: import("@/lib/bonificacao").ConfigBonificacao | null }) {
  const salvar = useSalvarConfigBonificacao();
  const [n10, setN10] = useState("");
  const [n9, setN9] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [ve, setVe] = useState("");

  useMemo(() => {
    if (cfg) {
      setN10(String(cfg.valor_nota_10));
      setN9(String(cfg.valor_nota_9));
      setP1(String(cfg.penalidade_1_ruim));
      setP2(String(cfg.penalidade_2_ruins));
      setVe(String(cfg.valor_elogio));
    }
  }, [cfg]);

  if (!cfg) {
    return <p className="text-sm text-muted-foreground">Carregando configuração...</p>;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    try {
      await salvar.mutateAsync({
        id: cfg.id,
        valor_nota_10: Number(n10),
        valor_nota_9: Number(n9),
        penalidade_1_ruim: Number(p1),
        penalidade_2_ruins: Number(p2),
        valor_elogio: Number(ve),
      });
      toast.success("Regras atualizadas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    }
  }

  const campos: Array<{ id: string; label: string; hint: string; value: string; set: (v: string) => void }> = [
    { id: "n10", label: "Valor Nota 10 (ambas positivas)", hint: "Ex.: 40", value: n10, set: setN10 },
    { id: "n9", label: "Valor Nota 9 (ambas positivas)", hint: "Ex.: 20", value: n9, set: setN9 },
    { id: "p1", label: "Penalidade 1 nota ruim", hint: "Ex.: -20", value: p1, set: setP1 },
    { id: "p2", label: "Penalidade 2 notas ruins", hint: "Ex.: -40", value: p2, set: setP2 },
    { id: "ve", label: "Bônus por elogio nominal", hint: "Ex.: 20", value: ve, set: setVe },
  ];

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Notas ≥ 9 são positivas · Notas ≤ 8 são negativas. Ajuste os valores conforme a regra atual.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {campos.map((c) => (
          <div key={c.id} className="space-y-1.5">
            <Label htmlFor={c.id}>{c.label}</Label>
            <Input
              id={c.id}
              type="number"
              step="1"
              value={c.value}
              onChange={(e) => c.set(e.target.value)}
              placeholder={c.hint}
              required
            />
          </div>
        ))}
      </div>
      <Button type="submit" disabled={salvar.isPending}>
        {salvar.isPending ? "Salvando..." : "Salvar regras"}
      </Button>
    </form>
  );
}
