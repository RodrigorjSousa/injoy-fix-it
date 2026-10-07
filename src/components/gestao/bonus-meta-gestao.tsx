import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, RefreshCw, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CONFIG_PADRAO,
  SITUACAO_INFO,
  useAtualizarMetaAgora,
  useExcluirOcorrencia,
  useFuncionariosLista,
  useJustificarOcorrencia,
  useLancarOcorrencia,
  useMetaSituacao,
  useOcorrenciasMeta,
  usePrepararMeta,
  useRemoverParticipanteMeta,
  useSalvarConfigMeta,
  useSalvarParticipanteMeta,
  type MetaConfig,
  type SetorMeta,
  type MetaOcorrencia,
} from "@/lib/bonus-meta";
import { cn } from "@/lib/utils";

const erro = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));
const dataBR = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "—");

function ConfigMeta({ cfg }: { cfg: MetaConfig }) {
  const [form, setForm] = useState<MetaConfig>(cfg);
  useEffect(() => setForm(cfg), [cfg]);
  const salvar = useSalvarConfigMeta();
  const num = (k: keyof MetaConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Number(e.target.value) });
  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold">Regras da meta</h4>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /> Ativa
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><Label className="text-xs">Valor por pessoa (R$)</Label><Input type="number" min={0} value={form.valor_por_pessoa} onChange={num("valor_por_pessoa")} /></div>
        <div><Label className="text-xs">Nota mínima do setor</Label><Input type="number" step="0.1" min={0} max={10} value={form.nota_minima} onChange={num("nota_minima")} /></div>
        <div><Label className="text-xs">Tolerância (min)</Label><Input type="number" min={0} value={form.tolerancia_minutos} onChange={num("tolerancia_minutos")} /></div>
        <div><Label className="text-xs">Máx. de atrasos no mês</Label><Input type="number" min={0} value={form.max_atrasos} onChange={num("max_atrasos")} /></div>
      </div>
      <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate(form, { onSuccess: () => toast.success("Regras salvas"), onError: erro })}>
        Salvar regras
      </Button>
    </section>
  );
}

function Participantes() {
  const { data: meta } = useMetaSituacao();
  const { data: funcionarios = [] } = useFuncionariosLista();
  const salvar = useSalvarParticipanteMeta();
  const remover = useRemoverParticipanteMeta();
  const [novo, setNovo] = useState("");
  const [unidadeNovo, setUnidadeNovo] = useState("Botafogo");
  const [setorNovo, setSetorNovo] = useState<SetorMeta>("recepcao");
  const pessoas = meta?.pessoas ?? [];
  const disponiveis = funcionarios.filter((f) => !pessoas.some((p) => p.funcionario_id === f.id));

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <h4 className="font-bold">Participantes</h4>
      <p className="text-xs text-muted-foreground">
        Cada pessoa ganha pela nota do seu setor: Recepção → Funcionário; Camareiras e Manutenção → Limpeza (notas da
        unidade dela). Para quem atende as duas ("Ambas"), confira as duas
        unidades. Atraso e falta vêm do Pontomais (quem tem CPF lá) ou do ponto do app, comparados com a Escala.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr><th className="p-2 text-left">Pessoa</th><th className="p-2">Unidade</th><th className="p-2">Setor (nota)</th><th className="p-2">Atrasos</th><th className="p-2">Faltas</th><th className="p-2">Situação</th><th className="p-2" /></tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <tr key={p.funcionario_id} className={cn("border-t", !p.ativo && "opacity-50")}>
                <td className="p-2">
                  <div className="font-medium">{p.nome}</div>
                  <div className="text-[11px] text-muted-foreground">{p.pontomais ? "Pontomais" : "Ponto do app"}</div>
                </td>
                <td className="p-2">
                  <Select value={p.unidade} onValueChange={(v) => salvar.mutate({ funcionarioId: p.funcionario_id, unidade: v, ativo: p.ativo, setor: p.setor }, { onError: erro })}>
                    <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Botafogo">Botafogo</SelectItem>
                      <SelectItem value="Ipanema">Ipanema</SelectItem>
                      <SelectItem value="Ambas">Ambas</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-2">
                  <Select value={p.setor} onValueChange={(v) => salvar.mutate({ funcionarioId: p.funcionario_id, unidade: p.unidade, ativo: p.ativo, setor: v as SetorMeta }, { onError: erro })}>
                    <SelectTrigger className={cn("h-8 w-44", !p.setor_definido && "border-amber-400")}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recepcao">Recepção (Funcionário)</SelectItem>
                      <SelectItem value="camareiras">Camareiras / Manutenção (Limpeza)</SelectItem>
                    </SelectContent>
                  </Select>
                  {!p.setor_definido && <div className="text-[10px] text-amber-700">pela escala — confirme</div>}
                </td>
                <td className="p-2 text-center font-mono">{p.atrasos}</td>
                <td className="p-2 text-center font-mono">{p.faltas}</td>
                <td className="p-2 text-center"><Badge variant="outline" className={SITUACAO_INFO[p.situacao].classe}>{SITUACAO_INFO[p.situacao].rotulo}</Badge></td>
                <td className="p-2 text-right whitespace-nowrap">
                  <Switch checked={p.ativo} onCheckedChange={(v) => salvar.mutate({ funcionarioId: p.funcionario_id, unidade: p.unidade, ativo: v, setor: p.setor }, { onError: erro })} aria-label="Ativo" />
                  <Button variant="ghost" size="icon" aria-label={`Remover ${p.nome}`} onClick={() => confirm(`Remover ${p.nome} da meta?`) && remover.mutate(p.funcionario_id, { onError: erro })}>
                    <UserMinus className="h-4 w-4 text-rose-600" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Label className="text-xs">Adicionar funcionário</Label>
          <Select value={novo} onValueChange={setNovo}>
            <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
            <SelectContent>{disponiveis.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Select value={unidadeNovo} onValueChange={setUnidadeNovo}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Botafogo">Botafogo</SelectItem>
            <SelectItem value="Ipanema">Ipanema</SelectItem>
            <SelectItem value="Ambas">Ambas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={setorNovo} onValueChange={(v) => setSetorNovo(v as SetorMeta)}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recepcao">Recepção (Funcionário)</SelectItem>
            <SelectItem value="camareiras">Camareiras / Manutenção (Limpeza)</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="gap-1" disabled={!novo || salvar.isPending} onClick={() => salvar.mutate({ funcionarioId: novo, unidade: unidadeNovo, ativo: true, setor: setorNovo }, { onSuccess: () => { setNovo(""); toast.success("Participante incluído"); }, onError: erro })}>
          <Plus className="h-4 w-4" /> Incluir
        </Button>
      </div>
    </section>
  );
}

function LinhaOcorrencia({ o, nome }: { o: MetaOcorrencia; nome: string }) {
  const justificar = useJustificarOcorrencia();
  const excluir = useExcluirOcorrencia();
  const [motivo, setMotivo] = useState(o.motivo ?? "");
  return (
    <li className={cn("space-y-1.5 rounded-md border p-2 text-sm", o.justificada && "bg-muted/40")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong>{nome}</strong> · {dataBR(o.data)} ·{" "}
          <Badge variant="outline" className={o.tipo === "falta" ? "border-rose-300 text-rose-700" : "border-amber-300 text-amber-800"}>
            {o.tipo === "falta" ? "Falta" : `Atraso ${o.minutos ?? "?"} min`}
          </Badge>
        </span>
        <span className="text-xs text-muted-foreground">
          {o.tipo === "atraso" ? `previsto ${hhmm(o.hora_prevista)} · entrou ${hhmm(o.hora_entrada)} · ` : ""}
          {o.origem === "manual" ? "lançado à mão" : o.fonte ?? "automático"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo / justificativa (ex.: atestado)" className="h-8 max-w-xs text-xs" />
        <Button size="sm" variant={o.justificada ? "outline" : "default"} className="h-8 gap-1 text-xs" disabled={justificar.isPending}
          onClick={() => justificar.mutate({ id: o.id, justificada: !o.justificada, motivo }, { onSuccess: () => toast.success(o.justificada ? "Justificativa removida" : "Marcado como justificado"), onError: erro })}>
          <Check className="h-3.5 w-3.5" /> {o.justificada ? "Desfazer justificativa" : "Justificar"}
        </Button>
        {o.origem === "manual" && (
          <Button size="sm" variant="ghost" className="h-8 text-xs text-rose-600" onClick={() => confirm("Excluir esta ocorrência?") && excluir.mutate(o.id, { onError: erro })}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        {o.justificada && <span className="text-xs font-semibold text-emerald-700">Justificado — não conta</span>}
      </div>
    </li>
  );
}

function Ocorrencias() {
  const { data: meta } = useMetaSituacao();
  const { data: lista = [], isLoading, error } = useOcorrenciasMeta();
  const lancar = useLancarOcorrencia();
  const nomes = useMemo(() => new Map((meta?.pessoas ?? []).map((p) => [p.funcionario_id, p.nome])), [meta]);
  const [f, setF] = useState({ funcionarioId: "", data: "", tipo: "atraso" as "atraso" | "falta", minutos: "", motivo: "" });

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <h4 className="font-bold">Atrasos e faltas do mês</h4>
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {!isLoading && !lista.length && <p className="text-sm text-muted-foreground">Nenhum atraso ou falta registrado neste mês.</p>}
      <ul className="space-y-2">
        {lista.map((o) => <LinhaOcorrencia key={o.id} o={o} nome={nomes.get(o.funcionario_id) ?? "—"} />)}
      </ul>
      <div className="space-y-2 rounded-md bg-muted/40 p-2">
        <div className="text-xs font-bold uppercase text-muted-foreground">Lançar à mão</div>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={f.funcionarioId} onValueChange={(v) => setF({ ...f, funcionarioId: v })}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Pessoa" /></SelectTrigger>
            <SelectContent>{(meta?.pessoas ?? []).map((p) => <SelectItem key={p.funcionario_id} value={p.funcionario_id}>{p.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} className="w-40" />
          <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v as "atraso" | "falta" })}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="atraso">Atraso</SelectItem><SelectItem value="falta">Falta</SelectItem></SelectContent>
          </Select>
          {f.tipo === "atraso" && <Input type="number" min={1} placeholder="min" value={f.minutos} onChange={(e) => setF({ ...f, minutos: e.target.value })} className="w-20" />}
          <Input placeholder="Observação" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} className="w-48" />
          <Button size="sm" disabled={!f.funcionarioId || !f.data || lancar.isPending}
            onClick={() => lancar.mutate({ funcionarioId: f.funcionarioId, data: f.data, tipo: f.tipo, minutos: f.minutos ? Number(f.minutos) : null, motivo: f.motivo },
              { onSuccess: () => { setF({ ...f, data: "", minutos: "", motivo: "" }); toast.success("Ocorrência lançada"); }, onError: erro })}>
            Lançar
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Aba do gestor: Meta da equipe (regras, participantes, atrasos e faltas). */
export function BonusMetaGestao() {
  const { data: meta, isLoading, error } = useMetaSituacao();
  const atualizar = useAtualizarMetaAgora();
  const preparar = usePrepararMeta();
  const precisaPreparar = !!meta && meta.gestor && meta.pessoas.length === 0;
  useEffect(() => {
    if (precisaPreparar && preparar.isIdle) preparar.mutate(undefined, { onError: erro });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precisaPreparar]);

  if (isLoading) return <Loader2 className="mx-auto h-5 w-5 animate-spin" />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!meta)
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        O banco ainda não recebeu a migração da Meta da equipe. Peça ao Lovable para aplicar a migração 0034 e publique o app.
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Atualiza sozinho 3 vezes por dia. Use o botão para buscar agora.</p>
        <Button size="sm" variant="outline" className="gap-1" disabled={atualizar.isPending}
          onClick={() => atualizar.mutate(undefined, {
            onSuccess: (r) => {
              const falhas = r.pontomais.filter((x) => x.error);
              if (r.pontomaisErro) toast.warning(`Pontomais indisponível: ${r.pontomaisErro}. Recalculado só com o ponto do app.`);
              else if (falhas.length) toast.warning(`Atualizado, mas com erro no Pontomais para: ${falhas.map((x) => `${x.nome} (${x.error})`).join("; ")}`);
              else toast.success(`Atualizado: ${r.ocorrencias} ocorrência(s) no mês.`);
            },
            onError: erro,
          })}>
          <RefreshCw className={cn("h-4 w-4", atualizar.isPending && "animate-spin")} /> Atualizar do Pontomais agora
        </Button>
      </div>
      <ConfigMeta cfg={meta.config ?? CONFIG_PADRAO} />
      <Participantes />
      <Ocorrencias />
    </div>
  );
}
