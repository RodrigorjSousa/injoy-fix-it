import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarDays, FileBarChart2, Pencil, Settings, Trash2, Trophy } from "lucide-react";
import type { Unidade } from "@/lib/store";
import { useMe } from "@/lib/store";
import {
  calcularValor,
  formatBRL,
  useConfigBonificacao,
  useCriarRegistroBonificacao,
  useExcluirRegistroBonificacao,
  useEditarRegistroBonificacao,
  useRegistrosBonificacaoMes,
  useRegistrosBonificacaoPorMes,
  useSalvarConfigBonificacao,
  type ConfigBonificacao,
  type RegistroBonificacao,
} from "@/lib/bonificacao";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unidade: Unidade;
};

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function BonificacaoPanelModal({ open, onOpenChange, unidade }: Props) {
  const { data: me } = useMe();
  const isAdminGestor = Boolean(me?.isAdmin || me?.isGestor);
  const { data: cfg, isError: isConfigError, refetch: refetchConfig } = useConfigBonificacao();
  const { data: registrosMes = [], isError, refetch } = useRegistrosBonificacaoMes(unidade);

  const totais = useMemo(() => ({
    recepcao: registrosMes.filter((r) => r.setor === "recepcao"),
    camareiras: registrosMes.filter((r) => r.setor === "camareiras"),
  }), [registrosMes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-emerald-500" />
            Painel de Bonificação · INJOY {unidade}
          </DialogTitle>
          <DialogDescription>
            Avaliações e saldos da Recepção e de Camareiras / Manutenção.
          </DialogDescription>
        </DialogHeader>

        {isError && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <span>Não foi possível carregar as avaliações.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
          </div>
        )}
        {isConfigError && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <span>Não foi possível carregar as regras de cálculo.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => refetchConfig()}>Tentar novamente</Button>
          </div>
        )}

        <Tabs defaultValue="mes" className="mt-2">
          <TabsList className={cn("grid w-full", isAdminGestor ? "grid-cols-3" : "grid-cols-1")}>
            <TabsTrigger value="mes">
              <CalendarDays className="h-4 w-4 mr-1" /> Mês Vigente
            </TabsTrigger>
            {isAdminGestor && (
              <TabsTrigger value="relatorios">
                <FileBarChart2 className="h-4 w-4 mr-1" /> Relatórios
              </TabsTrigger>
            )}
            {isAdminGestor && (
              <TabsTrigger value="regras">
                <Settings className="h-4 w-4 mr-1" /> Regras
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="mes" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SaldoBanner total={totais.recepcao.reduce((s, r) => s + Number(r.valor_calculado), 0)} count={totais.recepcao.length} titulo="Recepção · saldo do mês" />
              <SaldoBanner total={totais.camareiras.reduce((s, r) => s + Number(r.valor_calculado), 0)} count={totais.camareiras.length} titulo="Camareiras / Manutenção · saldo do mês" />
            </div>
            <FormRegistro unidade={unidade} />
            <div>
              <h3 className="text-sm font-bold mb-2 uppercase tracking-wide text-muted-foreground">
                Avaliações deste mês
              </h3>
              <HistoricoTabela registros={registrosMes} podeExcluir={isAdminGestor} unidade={unidade} />
            </div>
          </TabsContent>

          {isAdminGestor && (
            <TabsContent value="relatorios" className="mt-4">
              <RelatoriosTab unidade={unidade} />
            </TabsContent>
          )}

          {isAdminGestor && (
            <TabsContent value="regras" className="mt-4">
              <ConfiguracoesForm cfg={cfg ?? null} />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Banner ---------------------------------- */

function SaldoBanner({ total, count, titulo }: { total: number; count?: number; titulo: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {titulo}
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
      {count !== undefined && <p className="text-xs text-muted-foreground">
        {count} avaliação{count === 1 ? "" : "s"}
      </p>}
    </div>
  );
}

/* ------------------------------- Formulário ------------------------------- */

function FormRegistro({ unidade }: { unidade: Unidade }) {
  const { data: cfg } = useConfigBonificacao();
  const criar = useCriarRegistroBonificacao();
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [nome, setNome] = useState("");
  const [notaFuncionarios, setNotaFuncionarios] = useState("");
  const [notaLimpeza, setNotaLimpeza] = useState("");
  const [notaGeral, setNotaGeral] = useState("");
  const [obs, setObs] = useState("");
  const [elogio, setElogio] = useState(false);

  const preview = useMemo(() => {
    if (!cfg) return { recepcao: 0, camareiras: 0 };
    const nf = Number(notaFuncionarios);
    const nl = Number(notaLimpeza);
    const ng = Number(notaGeral);
    return {
      recepcao: notaFuncionarios !== "" && notaGeral !== "" && Number.isFinite(nf) && Number.isFinite(ng) ? calcularValor(nf, ng, elogio, cfg) : 0,
      camareiras: notaLimpeza !== "" && notaGeral !== "" && Number.isFinite(nl) && Number.isFinite(ng) ? calcularValor(nl, ng, elogio, cfg) : 0,
    };
  }, [cfg, notaFuncionarios, notaLimpeza, notaGeral, elogio]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    const nf = Number(notaFuncionarios);
    const nl = Number(notaLimpeza);
    const ng = Number(notaGeral);
    if (!nome.trim()) return toast.error("Informe o nome do hóspede");
    if (notaFuncionarios === "" || !Number.isFinite(nf) || nf < 0 || nf > 10) return toast.error("Nota dos funcionários inválida (0-10)");
    if (notaLimpeza === "" || !Number.isFinite(nl) || nl < 0 || nl > 10) return toast.error("Nota de limpeza inválida (0-10)");
    if (notaGeral === "" || !Number.isFinite(ng) || ng < 0 || ng > 10) return toast.error("Nota geral inválida (0-10)");
    try {
      await criar.mutateAsync({
        data,
        nome_hospede: nome.trim(),
        nota_funcionarios: nf,
        nota_limpeza: nl,
        nota_geral: ng,
        observacao: obs.trim() || null,
        teve_elogio: elogio,
        unidade,
      });
      toast.success("Avaliação registrada para Recepção e Camareiras / Manutenção");
      setNome("");
      setNotaFuncionarios("");
      setNotaLimpeza("");
      setNotaGeral("");
      setObs("");
      setElogio(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border p-4">
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
            value={notaFuncionarios}
            onChange={(e) => setNotaFuncionarios(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bonif-nl">Nota Limpeza (0–10)</Label>
          <Input
            id="bonif-nl"
            type="number"
            inputMode="decimal"
            min={0}
            max={10}
            step="0.5"
            value={notaLimpeza}
            onChange={(e) => setNotaLimpeza(e.target.value)}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SaldoBanner total={preview.recepcao} titulo="Valor previsto · Recepção" />
        <SaldoBanner total={preview.camareiras} titulo="Valor previsto · Camareiras / Manutenção" />
      </div>

      <Button type="submit" className="w-full" disabled={criar.isPending || !cfg}>
        {criar.isPending ? "Salvando..." : "Salvar Avaliação"}
      </Button>
    </form>
  );
}

/* -------------------------------- Relatórios ------------------------------ */

function RelatoriosTab({ unidade }: { unidade: Unidade }) {
  const now = new Date();
  const [ano, setAno] = useState<number>(now.getFullYear());
  const [mes, setMes] = useState<number>(now.getMonth());

  const anos = useMemo(() => {
    const atual = now.getFullYear();
    return [atual, atual - 1, atual - 2, atual - 3];
  }, [now]);

  const { data: registros = [], isLoading, isError, refetch } = useRegistrosBonificacaoPorMes(unidade, ano, mes);
  const recepcao = registros.filter((r) => r.setor === "recepcao");
  const camareiras = registros.filter((r) => r.setor === "camareiras");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Mês</Label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((nome, idx) => (
                <SelectItem key={idx} value={String(idx)}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ano</Label>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SaldoBanner total={recepcao.reduce((s, r) => s + Number(r.valor_calculado), 0)} count={recepcao.length} titulo={`Recepção · ${MESES[mes]}/${ano}`} />
        <SaldoBanner total={camareiras.reduce((s, r) => s + Number(r.valor_calculado), 0)} count={camareiras.length} titulo={`Camareiras / Manutenção · ${MESES[mes]}/${ano}`} />
      </div>

      {isError ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <span>Não foi possível carregar este relatório.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <HistoricoTabela registros={registros} podeExcluir={true} unidade={unidade} />
      )}
    </div>
  );
}

/* -------------------------------- Histórico ------------------------------- */

function HistoricoTabela({
  registros,
  podeExcluir,
  unidade,
}: {
  registros: RegistroBonificacao[] | undefined;
  podeExcluir: boolean;
  unidade: Unidade;
}) {
  const excluir = useExcluirRegistroBonificacao();
  const list = registros ?? [];
  const [editando, setEditando] = useState<RegistroBonificacao | null>(null);
  const avaliacoes = useMemo(() => {
    const grupos = new Map<string, { recepcao?: RegistroBonificacao; camareiras?: RegistroBonificacao }>();

    for (const registro of list) {
      const chave = registro.avaliacao_id ?? registro.id;
      const grupo = grupos.get(chave) ?? {};
      if (registro.setor === "camareiras") grupo.camareiras = registro;
      else grupo.recepcao = registro;
      grupos.set(chave, grupo);
    }

    return Array.from(grupos.values());
  }, [list]);

  if (list.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhuma avaliação registrada neste período.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {editando && (
        <section className="rounded-lg border bg-background p-4 space-y-3" aria-label="Editar avaliação">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold">Editar avaliação · {unidade}</h4>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditando(null)}>Cancelar</Button>
          </div>
          <EditarAvaliacao key={editando.id} registro={editando} par={list.find((r) => r.avaliacao_id && r.avaliacao_id === editando.avaliacao_id && r.id !== editando.id)} unidade={unidade} onSaved={() => setEditando(null)} />
        </section>
      )}
      <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-2 text-left">Data</th>
            <th className="p-2 text-left">Hóspede</th>
            <th className="p-2 text-center">Setor</th>
            <th className="p-2 text-center">Geral</th>
            <th className="p-2 text-center">Elogio</th>
            <th className="p-2 text-right">Valor</th>
            {podeExcluir && <th className="p-2" />}
          </tr>
        </thead>
        <tbody>
          {avaliacoes.map((grupo) => {
            const recepcao = grupo.recepcao;
            const camareiras = grupo.camareiras;
            const r = recepcao ?? camareiras;
            if (!r) return null;
            return (
              <tr key={r.avaliacao_id ?? r.id} className="border-t align-top">
                <td className="p-2 whitespace-nowrap">
                  {new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR")}
                </td>
                <td className="p-2">
                  <div className="font-medium">{r.nome_hospede}</div>
                  {recepcao?.observacao && <div className="text-xs text-muted-foreground">Recepção: {recepcao.observacao}</div>}
                  {camareiras?.observacao && <div className="text-xs text-muted-foreground">Limpeza: {camareiras.observacao}</div>}
                </td>
                <td className="p-2 text-center">
                  <div className="space-y-2">
                    {recepcao && (
                      <div>
                        <div className="font-medium">Recepção</div>
                        <div className="font-mono text-xs font-bold text-muted-foreground">Funcionários: {Number(recepcao.nota_funcionarios)}</div>
                      </div>
                    )}
                    {camareiras && (
                      <div>
                        <div className="font-medium">Camareiras / Manutenção</div>
                        <div className="font-mono text-xs font-bold text-muted-foreground">Limpeza: {Number(camareiras.nota_limpeza)}</div>
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-2 text-center font-mono font-bold">{Number(r.nota_geral)}</td>
                <td className="p-2 text-center">{r.teve_elogio ? "⭐" : "—"}</td>
                <td className="p-2 text-right">
                  <div className="flex flex-col items-end gap-2">
                    {[recepcao, camareiras].map((registro) => registro && (
                      <Badge
                        key={registro.id}
                        className={cn(
                          "font-mono",
                          Number(registro.valor_calculado) >= 0
                            ? "bg-emerald-600 hover:bg-emerald-600"
                            : "bg-red-600 hover:bg-red-600",
                        )}
                      >
                        {formatBRL(Number(registro.valor_calculado))}
                      </Badge>
                    ))}
                  </div>
                </td>
                {podeExcluir && (
                   <td className="p-2 text-right whitespace-nowrap">
                      <Button type="button" variant="ghost" size="icon" title={`Editar avaliação de ${r.nome_hospede}`} aria-label={`Editar avaliação de ${r.nome_hospede}`} onClick={() => setEditando(r)}>
                       <Pencil className="h-4 w-4" />
                     </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                       title={`Excluir avaliação de ${r.nome_hospede}`}
                       aria-label={`Excluir avaliação de ${r.nome_hospede}`}
                      onClick={() => {
                        if (confirm("Excluir esta avaliação dos dois setores?")) {
                          excluir.mutate({ id: r.id, avaliacaoId: r.avaliacao_id });
                        }
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
    </div>
  );
}

function EditarAvaliacao({ registro, par, unidade, onSaved }: {
  registro: RegistroBonificacao;
  par?: RegistroBonificacao;
  unidade: Unidade;
  onSaved: () => void;
}) {
  const editar = useEditarRegistroBonificacao();
  const recepcao = registro.setor === "recepcao" ? registro : par?.setor === "recepcao" ? par : undefined;
  const limpeza = registro.setor === "camareiras" ? registro : par?.setor === "camareiras" ? par : undefined;
  const [data, setData] = useState(registro.data);
  const [nome, setNome] = useState(registro.nome_hospede);
  const [notaFuncionarios, setNotaFuncionarios] = useState(recepcao ? String(recepcao.nota_funcionarios) : "");
  const [notaLimpeza, setNotaLimpeza] = useState(limpeza?.nota_limpeza == null ? "" : String(limpeza.nota_limpeza));
  const [notaGeral, setNotaGeral] = useState(String(registro.nota_geral));
  const [obsRecepcao, setObsRecepcao] = useState(recepcao?.observacao ?? "");
  const [obsLimpeza, setObsLimpeza] = useState(limpeza?.observacao ?? "");
  const [elogio, setElogio] = useState(registro.teve_elogio);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const nf = Number(notaFuncionarios), nl = Number(notaLimpeza), ng = Number(notaGeral);
    if (!data || !nome.trim()) return toast.error("Informe a data e o nome do hóspede.");
    if ([notaFuncionarios, notaLimpeza, notaGeral].some((v) => v.trim() === "") ||
        [nf, nl, ng].some((v) => !Number.isFinite(v) || v < 0 || v > 10)) {
      return toast.error("Informe as três notas entre 0 e 10.");
    }
    try {
      await editar.mutateAsync({ registro_id: registro.id, data, nome_hospede: nome.trim(),
        nota_funcionarios: nf, nota_limpeza: nl, nota_geral: ng,
        observacao_recepcao: obsRecepcao.trim(), observacao_limpeza: obsLimpeza.trim(),
        teve_elogio: elogio, unidade });
      toast.success("Avaliação atualizada nos dois setores.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar a avaliação.");
    }
  }

  return <form onSubmit={salvar} className="space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1"><Label htmlFor="editar-data">Data</Label><Input id="editar-data" type="date" value={data} onChange={(e) => setData(e.target.value)} required /></div>
      <div className="space-y-1"><Label htmlFor="editar-nome">Nome do Hóspede</Label><Input id="editar-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required /></div>
      <div className="space-y-1"><Label htmlFor="editar-nf">Nota Funcionários (0–10)</Label><Input id="editar-nf" type="number" inputMode="decimal" min={0} max={10} step="0.5" value={notaFuncionarios} onChange={(e) => setNotaFuncionarios(e.target.value)} required /></div>
      <div className="space-y-1"><Label htmlFor="editar-nl">Nota Limpeza (0–10)</Label><Input id="editar-nl" type="number" inputMode="decimal" min={0} max={10} step="0.5" value={notaLimpeza} onChange={(e) => setNotaLimpeza(e.target.value)} required /></div>
      <div className="space-y-1"><Label htmlFor="editar-ng">Nota Geral (0–10)</Label><Input id="editar-ng" type="number" inputMode="decimal" min={0} max={10} step="0.5" value={notaGeral} onChange={(e) => setNotaGeral(e.target.value)} required /></div>
    </div>
    <div className="flex items-center gap-2"><Checkbox id="editar-elogio" checked={elogio} onCheckedChange={(v) => setElogio(v === true)} /><Label htmlFor="editar-elogio">Teve elogio nominal?</Label></div>
    <div className="space-y-1"><Label htmlFor="editar-obs-recepcao">Comentário · Recepção</Label><Textarea id="editar-obs-recepcao" value={obsRecepcao} onChange={(e) => setObsRecepcao(e.target.value)} maxLength={500} rows={2} /></div>
    <div className="space-y-1"><Label htmlFor="editar-obs-limpeza">Comentário · Camareiras / Manutenção</Label><Textarea id="editar-obs-limpeza" value={obsLimpeza} onChange={(e) => setObsLimpeza(e.target.value)} maxLength={500} rows={2} /></div>
    <Button type="submit" className="w-full" disabled={editar.isPending}>{editar.isPending ? "Salvando..." : "Salvar alterações"}</Button>
  </form>;
}

/* ------------------------------ Configurações ----------------------------- */

function ConfiguracoesForm({ cfg }: { cfg: ConfigBonificacao | null }) {
  const salvar = useSalvarConfigBonificacao();
  const [n10, setN10] = useState("");
  const [n9, setN9] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [ve, setVe] = useState("");

  useEffect(() => {
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
