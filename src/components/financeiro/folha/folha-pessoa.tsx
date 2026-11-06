import { useMemo, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { currency, dateBR } from "@/lib/financeiro";
import {
  CAMPO_LABEL,
  DIAS_REFERENCIA_VR,
  VR_PADRAO,
  VT_DIA_PADRAO,
  type Campo,
  type ColaboradorFolha,
  type FolhaAjuste,
  type FolhaConfig,
  type FolhaPessoaCfg,
  type LinhaFolha,
} from "@/lib/folha";
import { useSalvarAjusteFolha, useSalvarPessoaFolha } from "@/lib/folha-dados";
import { BANCO_INICIO_PADRAO, type ModoBanco } from "@/lib/ponto-banco";
import { useSalvarBancoConfig } from "@/lib/ponto-gestao";
import { SETOR_LABEL } from "@/lib/ponto-export";
import { cn } from "@/lib/utils";
import { fmtHoras, lerValor, mesLabel, paraTexto } from "./folha-util";

export type RecalcularLinha = (
  colaboradorId: string,
  cfg: FolhaPessoaCfg,
  ajuste: FolhaAjuste,
  vales: Pick<ColaboradorFolha, "vale_alimentacao" | "vale_transporte_dia">,
) => LinhaFolha | null;

const brl = (n: number) => currency.format(n);

/** Texto que explica de onde veio cada valor. */
function detalhe(l: LinhaFolha, campo: Campo, uteis: number, descanso: number, cfg: FolhaConfig) {
  const hora = brl(l.valorHora);
  const vrMes =
    l.colaborador.vale_alimentacao != null ? Number(l.colaborador.vale_alimentacao) : VR_PADRAO;
  const vtDia =
    l.colaborador.vale_transporte_dia != null
      ? Number(l.colaborador.vale_transporte_dia)
      : VT_DIA_PADRAO;
  const banco = l.modo === "banco";
  switch (campo) {
    case "base":
      return l.calculado.base ? "Salário do cadastro" : "Cadastre o salário acima";
    case "plantoes": {
      if (!l.plantoes.length) return "Nenhum plantão no mês";
      if (l.colaborador.vinculo === "fixo")
        return `${l.plantoes.length} plantão(ões) extra(s) com valor da Escala`;
      if (l.cfg.freela_modo === "mensal")
        return `Valor cheio do mês (${l.plantoes.length} plantão(ões))`;
      const tab = l.plantoes.filter((p) => p.fonte === "tabela").length;
      return `${l.plantoes.length} plantão(ões): ${tab} pela tabela${tab < l.plantoes.length ? `, ${l.plantoes.length - tab} pelo valor combinado` : ""}`;
    }
    case "vt":
      return l.pagaVT ? `${l.diasVT} dia(s) de trabalho × ${brl(vtDia)}` : "Não paga neste mês";
    case "vr":
      if (!l.pagaVR) return "Não paga neste mês";
      return l.colaborador.vinculo === "fixo"
        ? "Valor do mês"
        : `${brl(vrMes)} ÷ ${DIAS_REFERENCIA_VR} × ${l.diasVT} dia(s)`;
    case "bonusInd":
      if (!l.pagaBonus) return "Não paga neste mês";
      return l.bonusMotivo ? `Perdeu: ${l.bonusMotivo}` : "Elogios (Bonificação › Pagamento)";
    case "bonusGrupo":
      if (!l.pagaBonus) return "Não paga neste mês";
      return l.bonusMotivo ? `Perdeu: ${l.bonusMotivo}` : "Meta do setor (Bonificação › Pagamento)";
    case "he100":
      return banco ? "No banco de horas" : `${fmtHoras(l.horas.he100)} × ${hora} × 2`;
    case "he50Folga":
      return banco ? "No banco de horas" : `${fmtHoras(l.horas.he50Folga)} × ${hora} × 1,5`;
    case "he50Horario":
      return banco ? "No banco de horas" : `${fmtHoras(l.horas.he50Horario)} × ${hora} × 1,5`;
    case "noturno":
      return `${fmtHoras(l.horas.noturnoReduzido)} (hora reduzida) × ${hora} × 20%`;
    case "dsr":
      return cfg.dsr_extras
        ? `Extras e noturno ÷ ${uteis} dias úteis × ${descanso} domingos/feriados`
        : "Desligado em Tabela e regras";
    case "descontoFaltas":
      if (banco) return "Vai para o banco de horas";
      return cfg.descontar_debitos
        ? `${fmtHoras(l.horas.debito)} de faltas/atrasos × ${hora}`
        : `Desligado em Tabela e regras${l.horas.debito ? ` (${fmtHoras(l.horas.debito)} no ponto)` : ""}`;
  }
}

export function FolhaPessoaDialog({
  linha,
  mes,
  semMigracao,
  diasUteis,
  diasDescanso,
  config,
  recalcular,
  onClose,
}: {
  linha: LinhaFolha;
  mes: string;
  semMigracao: boolean;
  diasUteis: number;
  diasDescanso: number;
  config: FolhaConfig;
  recalcular: RecalcularLinha;
  onClose: () => void;
}) {
  const c = linha.colaborador;
  const fixo = c.vinculo === "fixo";
  const salvarPessoa = useSalvarPessoaFolha();
  const salvarAjuste = useSalvarAjusteFolha(mes);
  const salvarModo = useSalvarBancoConfig();

  // Cadastro (todos os meses)
  const [salario, setSalario] = useState(paraTexto(linha.cfg.salario_base));
  const [divisor, setDivisor] = useState(paraTexto(linha.cfg.divisor));
  const [freelaModo, setFreelaModo] = useState(linha.cfg.freela_modo);
  const [freelaMensal, setFreelaMensal] = useState(paraTexto(linha.cfg.freela_valor_mensal));
  const [recebeVT, setRecebeVT] = useState(linha.cfg.recebe_vt ?? fixo);
  const [recebeVR, setRecebeVR] = useState(linha.cfg.recebe_vr ?? fixo);
  const [recebeBonus, setRecebeBonus] = useState(linha.cfg.recebe_bonus ?? fixo);
  const [vr, setVr] = useState(paraTexto(c.vale_alimentacao));
  const [vtDia, setVtDia] = useState(paraTexto(c.vale_transporte_dia));
  const [modo, setModo] = useState<ModoBanco>(linha.modo ?? "pagamento");

  // Este mês
  const aj = linha.ajuste;
  const [trocas, setTrocas] = useState<Partial<Record<Campo, string>>>(() =>
    Object.fromEntries(Object.entries(aj?.valores ?? {}).map(([k, v]) => [k, paraTexto(v)])),
  );
  const [pagarVT, setPagarVT] = useState<boolean | null>(aj?.pagar_vt ?? null);
  const [pagarVR, setPagarVR] = useState<boolean | null>(aj?.pagar_vr ?? null);
  const [pagarBonus, setPagarBonus] = useState<boolean | null>(aj?.pagar_bonus ?? null);
  const [outros, setOutros] = useState(paraTexto(aj?.outros_proventos || null));
  const [descontos, setDescontos] = useState(paraTexto(aj?.outros_descontos || null));
  const [obs, setObs] = useState(aj?.observacao ?? "");

  const padraoBool = (v: boolean) => (v === fixo ? null : v);
  const cfgNovo: FolhaPessoaCfg = {
    colaborador_id: c.id,
    salario_base: lerValor(salario),
    divisor: lerValor(divisor),
    freela_modo: freelaModo,
    freela_valor_mensal: lerValor(freelaMensal),
    recebe_vt: padraoBool(recebeVT),
    recebe_vr: padraoBool(recebeVR),
    recebe_bonus: padraoBool(recebeBonus),
  };
  const valoresTrocados = Object.fromEntries(
    Object.entries(trocas)
      .map(([k, t]) => [k, lerValor(t ?? "")])
      .filter(([, v]) => v != null),
  ) as Partial<Record<Campo, number>>;
  const ajusteNovo: FolhaAjuste = {
    colaborador_id: c.id,
    valores: valoresTrocados,
    pagar_vt: pagarVT,
    pagar_vr: pagarVR,
    pagar_bonus: pagarBonus,
    outros_proventos: Math.max(0, lerValor(outros) ?? 0),
    outros_descontos: Math.max(0, lerValor(descontos) ?? 0),
    observacao: obs.trim() || null,
  };
  const vales = { vale_alimentacao: lerValor(vr), vale_transporte_dia: lerValor(vtDia) };
  // Prévia ao vivo (o modo do ponto só muda ao salvar; a prévia usa o modo atual).
  const previa = useMemo(
    () => recalcular(c.id, cfgNovo, ajusteNovo, vales) ?? linha,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify([cfgNovo, ajusteNovo, vales])],
  );

  const campos: Campo[] = fixo
    ? [
        "base",
        ...(linha.plantoes.length ? (["plantoes"] as Campo[]) : []),
        "vt",
        "vr",
        "bonusInd",
        "bonusGrupo",
        "he100",
        "he50Folga",
        "he50Horario",
        "noturno",
        "dsr",
        "descontoFaltas",
      ]
    : ["plantoes", "vt", "vr", "bonusInd", "bonusGrupo"];

  const liga: Partial<Record<Campo, { v: boolean; set: (b: boolean) => void }>> = {
    vt: { v: previa.pagaVT, set: (b) => setPagarVT(b === recebeVT ? null : b) },
    vr: { v: previa.pagaVR, set: (b) => setPagarVR(b === recebeVR ? null : b) },
    bonusInd: { v: previa.pagaBonus, set: (b) => setPagarBonus(b === recebeBonus ? null : b) },
    bonusGrupo: { v: previa.pagaBonus, set: (b) => setPagarBonus(b === recebeBonus ? null : b) },
  };

  const salvando = salvarPessoa.isPending || salvarAjuste.isPending || salvarModo.isPending;
  const salvar = async () => {
    try {
      const mudouCadastro =
        JSON.stringify(cfgNovo) !== JSON.stringify({ ...linha.cfg, colaborador_id: c.id }) ||
        vales.vale_alimentacao !== (c.vale_alimentacao ?? null) ||
        vales.vale_transporte_dia !== (c.vale_transporte_dia ?? null);
      if (mudouCadastro) await salvarPessoa.mutateAsync({ cfg: cfgNovo, ...vales });
      await salvarAjuste.mutateAsync(ajusteNovo);
      if (fixo && modo !== (linha.modo ?? "pagamento"))
        await salvarModo.mutateAsync({
          colaboradorId: c.id,
          modo,
          inicio: linha.pontoInicio ?? BANCO_INICIO_PADRAO,
        });
      toast.success(`Folha de ${c.nome} salva.`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !salvando && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{c.nome}</DialogTitle>
          <DialogDescription>
            {fixo ? "Funcionário fixo" : "Freelancer"} · {SETOR_LABEL[c.setor] ?? c.setor} ·{" "}
            {c.unidade} · folha de {mesLabel(mes)}
          </DialogDescription>
        </DialogHeader>

        {!!previa.avisos.length && (
          <ul className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {previa.avisos.map((a) => (
              <li key={a}>• {a}</li>
            ))}
          </ul>
        )}

        <section className="space-y-3 rounded-xl border bg-slate-50 p-3">
          <p className="text-sm font-bold">Cadastro (vale para todos os meses)</p>
          {fixo ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo label="Salário base (R$)">
                <Input
                  inputMode="decimal"
                  value={salario}
                  onChange={(e) => setSalario(e.target.value)}
                  placeholder="0,00"
                />
              </Campo>
              <Campo label="Divisor de horas" dica={`Vazio = ${config.divisor_padrao}`}>
                <Input
                  inputMode="decimal"
                  value={divisor}
                  onChange={(e) => setDivisor(e.target.value)}
                  placeholder={String(config.divisor_padrao)}
                />
              </Campo>
              <Campo
                label="VT por dia (R$)"
                dica={`Vazio = ${brl(VT_DIA_PADRAO)} · 0 = não recebe`}
              >
                <Input
                  inputMode="decimal"
                  value={vtDia}
                  onChange={(e) => setVtDia(e.target.value)}
                  placeholder={paraTexto(VT_DIA_PADRAO)}
                />
              </Campo>
              <Campo label="VR do mês (R$)" dica={`Vazio = ${brl(VR_PADRAO)} · 0 = não recebe`}>
                <Input
                  inputMode="decimal"
                  value={vr}
                  onChange={(e) => setVr(e.target.value)}
                  placeholder={paraTexto(VR_PADRAO)}
                />
              </Campo>
              <div className="col-span-2 sm:col-span-4">
                <Label className="text-xs">Horas extras</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(
                    [
                      ["pagamento", "Pagar na folha"],
                      ["banco", "Banco de horas"],
                    ] as [ModoBanco, string][]
                  ).map(([v, r]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setModo(v)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-semibold",
                        modo === v ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  É a mesma escolha de Ponto › Banco de horas. No banco, as extras não entram na
                  folha
                  {linha.horas.noBanco
                    ? ` (este mês: ${fmtHoras(linha.horas.noBanco)} no banco)`
                    : ""}
                  .
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["plantao", "Por plantão (tabela)"],
                    ["mensal", "Valor cheio no mês"],
                  ] as ["plantao" | "mensal", string][]
                ).map(([v, r]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFreelaModo(v)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm font-semibold",
                      freelaModo === v ? "border-violet-600 bg-violet-600 text-white" : "bg-white",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {freelaModo === "mensal" && (
                  <Campo label="Valor cheio do mês (R$)" dica="Para quem é chamado muitas vezes">
                    <Input
                      inputMode="decimal"
                      value={freelaMensal}
                      onChange={(e) => setFreelaMensal(e.target.value)}
                      placeholder="0,00"
                    />
                  </Campo>
                )}
                <Campo label="VT por dia (R$)" dica={`Vazio = ${brl(VT_DIA_PADRAO)}`}>
                  <Input
                    inputMode="decimal"
                    value={vtDia}
                    onChange={(e) => setVtDia(e.target.value)}
                    placeholder={paraTexto(VT_DIA_PADRAO)}
                  />
                </Campo>
                <Campo label="VR do mês cheio (R$)" dica="Freelancer recebe proporcional aos dias">
                  <Input
                    inputMode="decimal"
                    value={vr}
                    onChange={(e) => setVr(e.target.value)}
                    placeholder={paraTexto(VR_PADRAO)}
                  />
                </Campo>
              </div>
              <div>
                <p className="text-xs font-semibold">Recebe todo mês (normalmente não):</p>
                <div className="mt-1 flex flex-wrap gap-4 text-sm">
                  <Marca v={recebeVT} set={setRecebeVT}>
                    Vale transporte
                  </Marca>
                  <Marca v={recebeVR} set={setRecebeVR}>
                    Vale refeição
                  </Marca>
                  <Marca v={recebeBonus} set={setRecebeBonus}>
                    Bonificação
                  </Marca>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-1">
          <p className="text-sm font-bold">Este mês</p>
          <p className="text-[11px] text-muted-foreground">
            Deixe em branco para usar o valor calculado. Digite um valor para trocar só neste mês.
          </p>
          <div className="divide-y rounded-xl border">
            {campos.map((campo) => {
              const sw = liga[campo];
              const desligado = sw && !sw.v;
              return (
                <div
                  key={campo}
                  className={cn(
                    "flex flex-wrap items-center gap-2 px-3 py-2",
                    desligado && "bg-slate-50",
                  )}
                >
                  {sw && (
                    <Checkbox
                      checked={sw.v}
                      onCheckedChange={(v) => sw.set(v === true)}
                      aria-label={`Pagar ${CAMPO_LABEL[campo]} neste mês`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-semibold", desligado && "text-slate-400")}>
                      {CAMPO_LABEL[campo]}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {detalhe(previa, campo, diasUteis, diasDescanso, config)}
                    </p>
                  </div>
                  <div className="w-36 text-right">
                    <Input
                      inputMode="decimal"
                      disabled={!!desligado}
                      className={cn(
                        "h-8 text-right",
                        trocas[campo] && "border-amber-400 bg-amber-50",
                      )}
                      value={trocas[campo] ?? ""}
                      onChange={(e) => setTrocas((t) => ({ ...t, [campo]: e.target.value }))}
                      placeholder={brl(previa.calculado[campo])}
                    />
                    {trocas[campo] ? (
                      <button
                        type="button"
                        className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-sky-700"
                        onClick={() => setTrocas((t) => ({ ...t, [campo]: "" }))}
                      >
                        <RotateCcw className="h-3 w-3" />
                        voltar a {brl(previa.calculado[campo])}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div className="grid gap-2 px-3 py-2 sm:grid-cols-2">
              <Campo label="Outros proventos (R$)" dica="Ex.: prêmio, acerto de mês anterior">
                <Input
                  inputMode="decimal"
                  value={outros}
                  onChange={(e) => setOutros(e.target.value)}
                  placeholder="0,00"
                />
              </Campo>
              <Campo label="Outros descontos (R$)" dica="Ex.: consumo, dano, vale pago por fora">
                <Input
                  inputMode="decimal"
                  value={descontos}
                  onChange={(e) => setDescontos(e.target.value)}
                  placeholder="0,00"
                />
              </Campo>
              <div className="sm:col-span-2">
                <Label className="text-xs">Observação</Label>
                <Textarea
                  rows={2}
                  value={obs}
                  maxLength={500}
                  onChange={(e) => setObs(e.target.value)}
                />
              </div>
            </div>
          </div>
        </section>

        {!!previa.plantoes.length && (
          <section className="rounded-xl border p-3">
            <p className="mb-1 text-sm font-bold">Plantões do mês</p>
            <ul className="space-y-0.5 text-sm">
              {previa.plantoes.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>
                    {dateBR(p.data)} · {p.unidade} ·{" "}
                    {p.horas != null ? `${p.horas} h` : "sem horas"} ·{" "}
                    <span
                      className={cn(
                        "text-xs",
                        p.fonte === "sem_preco" ? "text-rose-600" : "text-slate-500",
                      )}
                    >
                      {p.rotulo}
                    </span>
                    {p.fonte === "tabela" &&
                      p.valorCombinado != null &&
                      p.valorCombinado !== p.valor && (
                        <span className="text-xs text-amber-700">
                          {" "}
                          (na Escala: {brl(p.valorCombinado)})
                        </span>
                      )}
                  </span>
                  <span className="font-semibold tabular-nums">{brl(p.valor)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
          <span className="text-sm font-semibold text-emerald-900">
            Total {previa.descontos ? `(já com − ${brl(previa.descontos)} de descontos)` : ""}
          </span>
          <span className="text-2xl font-black text-emerald-900">{brl(previa.total)}</span>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || semMigracao}>
            {salvando ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  label,
  dica,
  children,
}: {
  label: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
      {dica && <p className="mt-0.5 text-[11px] text-muted-foreground">{dica}</p>}
    </div>
  );
}

function Marca({
  v,
  set,
  children,
}: {
  v: boolean;
  set: (b: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2">
      <Checkbox checked={v} onCheckedChange={(x) => set(x === true)} />
      {children}
    </label>
  );
}
