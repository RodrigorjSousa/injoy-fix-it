import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Send,
  Settings2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Badge } from "@/components/ui/badge";
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
import { currency } from "@/lib/financeiro";
import {
  abertosDaPessoa,
  liberadoNoMes,
  somaAdiantamentos,
  type Adiantamento,
} from "@/lib/adiantamentos";
import { mesAnterior } from "@/lib/bonificacao-pagamento";
import { baixarCsv, SETOR_LABEL } from "@/lib/ponto-export";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";
import {
  calcularFolha,
  csvFolha,
  type FolhaAjuste,
  type FolhaPessoaCfg,
  type LinhaFolha,
} from "@/lib/folha";
import { useDadosFolha, useLancarFolha, usePontoFolha } from "@/lib/folha-dados";
import { FolhaConfigDialog } from "./folha-config";
import { FolhaPessoaDialog, type RecalcularLinha } from "./folha-pessoa";
import { fmtHoras, mesLabel } from "./folha-util";

type Filtro = "todos" | "fixo" | "freelance";

const brl = (n: number) => currency.format(n);
const cel = (n: number) => (n ? brl(n) : "—");

/** Financeiro › Folha de pagamento: todos os funcionários e freelancers do mês numa tela só. */
export function FolhaPagamentoDialog({
  open,
  onClose,
  adiantamentos,
}: {
  open: boolean;
  onClose: () => void;
  adiantamentos: Adiantamento[];
}) {
  const [mes, setMes] = useState(() => mesAnterior(todaySP()));
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [semMovimento, setSemMovimento] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [regras, setRegras] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const q = useDadosFolha(mes);
  const ponto = usePontoFolha(mes);
  const lancar = useLancarFolha(mes);
  const dados = q.data;

  const entrada = useMemo(
    () =>
      dados
        ? {
            mes,
            config: dados.config,
            colaboradores: dados.colaboradores,
            pessoas: dados.pessoas,
            ajustes: dados.ajustes,
            dias: dados.dias,
            ponto: ponto.ponto,
            bonus: dados.bonus,
            feriados: dados.feriados,
            incluirSemMovimento: semMovimento,
          }
        : null,
    [dados, mes, ponto.ponto, semMovimento],
  );
  const resumo = useMemo(() => (entrada ? calcularFolha(entrada) : null), [entrada]);

  /** Recalcula uma pessoa com o cadastro/ajuste ainda não salvos (prévia do editor). */
  const recalcular: RecalcularLinha = (colaboradorId, cfg, ajuste, vales) => {
    if (!entrada) return null;
    const outros = (lista: { colaborador_id: string }[]) =>
      lista.filter((x) => x.colaborador_id !== colaboradorId);
    const r = calcularFolha({
      ...entrada,
      incluirSemMovimento: true,
      colaboradores: entrada.colaboradores
        .filter((c) => c.id === colaboradorId)
        .map((c) => ({ ...c, ...vales })),
      pessoas: [...(outros(entrada.pessoas) as FolhaPessoaCfg[]), cfg],
      ajustes: [...(outros(entrada.ajustes) as FolhaAjuste[]), ajuste],
    });
    return r.linhas[0] ?? null;
  };

  const adiantDe = (l: LinhaFolha) =>
    somaAdiantamentos(
      abertosDaPessoa(
        { funcionarioId: l.colaborador.funcionario_id, nome: l.colaborador.nome },
        adiantamentos,
      ).filter((a) => liberadoNoMes(a, mes)),
    );

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (resumo?.linhas ?? []).filter(
      (l) =>
        (filtro === "todos" || l.colaborador.vinculo === filtro) &&
        (!t || l.colaborador.nome.toLowerCase().includes(t)),
    );
  }, [resumo, filtro, busca]);
  const soma = (f: (l: LinhaFolha) => number) => linhas.reduce((s, l) => s + f(l), 0);
  const totalAdiant = soma(adiantDe);
  const linhaEditando = resumo?.linhas.find((l) => l.colaborador.id === editando) ?? null;

  const mudouDesdeLancamento =
    !!dados?.lancada &&
    !!resumo &&
    Math.abs(Number(dados.lancada.total) - resumo.totais.geral) >= 0.01;

  const exportarPdf = () => {
    if (!resumo) return;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(15);
    doc.text(`Folha de pagamento · ${mesLabel(mes)}`, 14, 15);
    doc.setFontSize(9);
    doc.text(
      `${resumo.totais.qtdFixos} fixo(s) ${brl(resumo.totais.fixos)} · ${resumo.totais.qtdFreelancers} freelancer(s) ${brl(resumo.totais.freelancers)} · Total ${brl(resumo.totais.geral)}`,
      14,
      21,
    );
    autoTable(doc, {
      startY: 25,
      styles: { fontSize: 7, cellPadding: 1.2 },
      headStyles: { fillColor: [15, 23, 42] },
      head: [
        [
          "Pessoa",
          "Base/plant.",
          "VT",
          "VR",
          "Bônus ind.",
          "Bônus grupo",
          "HE 100%",
          "HE 50% sáb.",
          "HE 50% hor.",
          "Noturno",
          "DSR",
          "Outros",
          "Descontos",
          "Total",
          "Adiant.",
          "A pagar",
        ],
      ],
      body: resumo.linhas.map((l) => {
        const ad = adiantDe(l);
        return [
          `${l.colaborador.nome}\n${l.colaborador.vinculo === "fixo" ? "Fixo" : "Freelancer"} · ${SETOR_LABEL[l.colaborador.setor] ?? l.colaborador.setor}`,
          cel(l.valores.base + l.valores.plantoes),
          cel(l.valores.vt),
          cel(l.valores.vr),
          cel(l.valores.bonusInd),
          cel(l.valores.bonusGrupo),
          cel(l.valores.he100) + (l.horas.he100 ? `\n${fmtHoras(l.horas.he100)}` : ""),
          cel(l.valores.he50Folga) + (l.horas.he50Folga ? `\n${fmtHoras(l.horas.he50Folga)}` : ""),
          cel(l.valores.he50Horario) +
            (l.horas.he50Horario ? `\n${fmtHoras(l.horas.he50Horario)}` : ""),
          cel(l.valores.noturno),
          cel(l.valores.dsr),
          cel(l.outrosProventos),
          l.descontos ? `- ${brl(l.descontos)}` : "—",
          brl(l.total),
          ad ? `- ${brl(ad)}` : "—",
          brl(Math.max(0, l.total - ad)),
        ];
      }),
      foot: [
        ["Total", "", "", "", "", "", "", "", "", "", "", "", "", brl(resumo.totais.geral), "", ""],
      ],
    });
    doc.save(`folha-${mes}.pdf`);
  };

  const executarLancamento = () => {
    if (!resumo) return;
    lancar.mutate(resumo, {
      onSuccess: (r) => {
        setConfirmar(false);
        const partes = [
          r.criados + r.atualizados
            ? `${r.criados + r.atualizados} salário(s)/extras lançados`
            : null,
          r.plantoes_atualizados ? `${r.plantoes_atualizados} plantão(ões) com preço novo` : null,
          r.beneficios?.criados + r.beneficios?.atualizados
            ? `${r.beneficios.criados + r.beneficios.atualizados} vale(s)`
            : null,
          r.cancelados ? `${r.cancelados} cancelado(s)` : null,
        ].filter(Boolean);
        toast.success(`Folha de ${mesLabel(mes)} lançada no Financeiro.`, {
          description: partes.join(" · ") || "Nada mudou.",
        });
        const pagos = r.ja_pagos + r.plantoes_ja_pagos + (r.beneficios?.ja_pagos ?? 0);
        if (pagos)
          toast.warning(
            `${pagos} item(ns) já estavam pagos e não foram alterados. Confira em Lançamentos.`,
            { duration: 10000 },
          );
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-[96vh] max-w-[min(98vw,1500px)] flex-col gap-3 overflow-y-auto p-4 sm:p-6 md:overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Users className="h-5 w-5 text-emerald-700" />
            Folha de pagamento
          </DialogTitle>
          <DialogDescription>
            Funcionários e freelancers do mês. Toque numa pessoa para conferir ou mudar qualquer
            valor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Mês</Label>
            <Input
              type="month"
              value={mes}
              onChange={(e) => e.target.value && setMes(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex rounded-lg border p-0.5">
            {(
              [
                ["todos", "Todos"],
                ["fixo", "Funcionários"],
                ["freelance", "Freelancers"],
              ] as [Filtro, string][]
            ).map(([v, r]) => (
              <button
                key={v}
                type="button"
                onClick={() => setFiltro(v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-semibold",
                  filtro === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="relative min-w-40 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pessoa"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <Switch checked={semMovimento} onCheckedChange={setSemMovimento} />
            Freelancers sem plantão
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setRegras(true)} disabled={!dados}>
              <Settings2 />
              Tabela e regras
            </Button>
            <Button
              variant="outline"
              disabled={!resumo}
              onClick={() => resumo && baixarCsv(csvFolha(resumo), `folha-${mes}.csv`)}
            >
              <FileSpreadsheet />
              Planilha
            </Button>
            <Button variant="outline" disabled={!resumo} onClick={exportarPdf}>
              <Download />
              PDF
            </Button>
            <Button
              disabled={!resumo || !!dados?.semMigracao || lancar.isPending}
              onClick={() => setConfirmar(true)}
            >
              {lancar.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              Lançar no Financeiro
            </Button>
          </div>
        </div>

        {dados?.semMigracao && (
          <Aviso tom="erro">
            As tabelas da folha ainda não estão no banco. Peça ao Lovable para aplicar a migração{" "}
            <b>0101_fin_folha_pagamento.sql</b>. Até lá dá para ver os valores, mas não salvar.
          </Aviso>
        )}
        {dados?.lancada && (
          <Aviso tom={mudouDesdeLancamento ? "alerta" : "ok"}>
            Lançada no Financeiro em{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              timeZone: "America/Sao_Paulo",
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(dados.lancada.lancado_em))}{" "}
            ({brl(Number(dados.lancada.total))}).
            {mudouDesdeLancamento &&
              " Os valores mudaram depois disso: lance de novo para atualizar."}
          </Aviso>
        )}
        {ponto.erro && (
          <Aviso tom="alerta">
            Não deu para ler o ponto ({ponto.erro}). Horas extras e noturno ficaram zerados.
          </Aviso>
        )}
        {dados?.bonusErro && (
          <Aviso tom="alerta">
            Não deu para ler a Bonificação ({dados.bonusErro}). As bonificações ficaram zeradas.
          </Aviso>
        )}

        {resumo && (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Resumo
              titulo={`Funcionários (${resumo.totais.qtdFixos})`}
              valor={resumo.totais.fixos}
            />
            <Resumo
              titulo={`Freelancers (${resumo.totais.qtdFreelancers})`}
              valor={resumo.totais.freelancers}
            />
            <Resumo titulo="Total da folha" valor={resumo.totais.geral} destaque />
            <Resumo
              titulo="Adiantamentos a descontar"
              valor={totalAdiant}
              detalhe="saem no pagamento, em Lançamentos"
            />
          </div>
        )}

        <div className="shrink-0 rounded-lg border md:min-h-0 md:flex-1 md:shrink md:overflow-auto">
          {q.isLoading || ponto.carregando ? (
            <div className="grid h-full min-h-48 place-items-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : q.isError ? (
            <div className="p-8 text-center">
              <p className="font-bold text-destructive">Não foi possível carregar a folha.</p>
              <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>
              <Button className="mt-3" onClick={() => q.refetch()}>
                Tentar de novo
              </Button>
            </div>
          ) : !linhas.length ? (
            <p className="p-10 text-center text-muted-foreground">Ninguém neste filtro.</p>
          ) : (
            <>
              {/* Celular: um cartão por pessoa */}
              <div className="space-y-2 p-2 md:hidden">
                {linhas.map((l) => (
                  <CartaoPessoa
                    key={l.colaborador.id}
                    l={l}
                    adiant={adiantDe(l)}
                    onClick={() => setEditando(l.colaborador.id)}
                  />
                ))}
              </div>
              {/* Computador: tabela */}
              <table className="hidden w-full min-w-[1350px] text-sm md:table">
                <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="sticky left-0 z-20 bg-slate-100 px-3 py-2 text-left">Pessoa</th>
                    <Th>Base / plantões</Th>
                    <Th>VT</Th>
                    <Th>VR</Th>
                    <Th>Bônus ind.</Th>
                    <Th>Bônus grupo</Th>
                    <Th>HE 100% dom/fer</Th>
                    <Th>HE 50% sábado</Th>
                    <Th>HE 50% horário</Th>
                    <Th>Noturno</Th>
                    <Th>DSR</Th>
                    <Th>Outros</Th>
                    <Th>Descontos</Th>
                    <Th>Adiant.</Th>
                    <Th className="sticky right-0 z-20 bg-emerald-100 text-emerald-800">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <LinhaTabela
                      key={l.colaborador.id}
                      l={l}
                      adiant={adiantDe(l)}
                      onClick={() => setEditando(l.colaborador.id)}
                    />
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-900 text-white">
                  <tr className="font-bold">
                    <td className="sticky left-0 bg-slate-900 px-3 py-2">
                      {linhas.length} pessoa(s)
                    </td>
                    <Td>{cel(soma((l) => l.valores.base + l.valores.plantoes))}</Td>
                    <Td>{cel(soma((l) => l.valores.vt))}</Td>
                    <Td>{cel(soma((l) => l.valores.vr))}</Td>
                    <Td>{cel(soma((l) => l.valores.bonusInd))}</Td>
                    <Td>{cel(soma((l) => l.valores.bonusGrupo))}</Td>
                    <Td>{cel(soma((l) => l.valores.he100))}</Td>
                    <Td>{cel(soma((l) => l.valores.he50Folga))}</Td>
                    <Td>{cel(soma((l) => l.valores.he50Horario))}</Td>
                    <Td>{cel(soma((l) => l.valores.noturno))}</Td>
                    <Td>{cel(soma((l) => l.valores.dsr))}</Td>
                    <Td>{cel(soma((l) => l.outrosProventos))}</Td>
                    <Td>{soma((l) => l.descontos) ? `− ${brl(soma((l) => l.descontos))}` : "—"}</Td>
                    <Td>{totalAdiant ? `− ${brl(totalAdiant)}` : "—"}</Td>
                    <Td className="sticky right-0 bg-slate-900 text-base">
                      {brl(soma((l) => l.total))}
                    </Td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
        {resumo && (
          <p className="text-[11px] text-muted-foreground">
            DSR deste mês: {resumo.diasUteis} dias úteis e {resumo.diasDescanso} domingos/feriados.
            Valores para pagamento; INSS, FGTS e IR do holerite oficial continuam com o contador.
          </p>
        )}

        {linhaEditando && dados && (
          <FolhaPessoaDialog
            linha={linhaEditando}
            mes={mes}
            semMigracao={dados.semMigracao}
            diasUteis={resumo?.diasUteis ?? 0}
            diasDescanso={resumo?.diasDescanso ?? 0}
            config={dados.config}
            recalcular={recalcular}
            onClose={() => setEditando(null)}
          />
        )}
        {regras && dados && (
          <FolhaConfigDialog
            config={dados.config}
            semMigracao={dados.semMigracao}
            onClose={() => setRegras(false)}
          />
        )}

        <Dialog
          open={confirmar}
          onOpenChange={(v) => !v && !lancar.isPending && setConfirmar(false)}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Lançar a folha de {mesLabel(mes)}?</DialogTitle>
              <DialogDescription>
                Total de {brl(resumo?.totais.geral ?? 0)} para {resumo?.linhas.length ?? 0}{" "}
                pessoa(s).
              </DialogDescription>
            </DialogHeader>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              <li>
                Um lançamento por funcionário em <b>Salários</b> (base, horas extras, noturno, DSR,
                bonificações e outros, já com os descontos).
              </li>
              <li>
                Vale transporte e vale refeição nos lançamentos de benefícios (substituem os do
                mês).
              </li>
              <li>
                O preço de cada plantão de freelancer vai para a Escala, e o lançamento de
                Freelancers (diárias) se atualiza sozinho — nada fica em dobro.
              </li>
              <li>O que já estiver pago não muda. Pode lançar de novo sempre que corrigir algo.</li>
              <li>Adiantamentos são descontados na hora de marcar como pago, em Lançamentos.</li>
            </ul>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setConfirmar(false)}
                disabled={lancar.isPending}
              >
                Voltar
              </Button>
              <Button onClick={executarLancamento} disabled={lancar.isPending}>
                {lancar.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Lançar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("whitespace-nowrap px-2 py-2 text-right", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn("whitespace-nowrap px-2 py-2 text-right tabular-nums", className)}>
      {children}
    </td>
  );
}

function Aviso({ tom, children }: { tom: "ok" | "alerta" | "erro"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        tom === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-900",
        tom === "alerta" && "border-amber-300 bg-amber-50 text-amber-900",
        tom === "erro" && "border-rose-300 bg-rose-50 text-rose-900",
      )}
    >
      {tom === "ok" ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <p>{children}</p>
    </div>
  );
}

function Resumo({
  titulo,
  valor,
  destaque,
  detalhe,
}: {
  titulo: string;
  valor: number;
  destaque?: boolean;
  detalhe?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        destaque ? "border-emerald-300 bg-emerald-50" : "bg-card",
      )}
    >
      <p className="text-xs font-semibold text-slate-500">{titulo}</p>
      <p className={cn("text-lg font-black tabular-nums", destaque && "text-emerald-800")}>
        {brl(valor)}
      </p>
      {detalhe && <p className="text-[11px] text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

function Valor({
  l,
  campo,
  horas,
}: {
  l: LinhaFolha;
  campo: keyof LinhaFolha["valores"];
  horas?: number;
}) {
  const v = l.valores[campo];
  const trocado = l.trocados.includes(campo);
  return (
    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
      <span className={cn(!v && "text-slate-300", trocado && "font-semibold text-amber-700")}>
        {cel(v)}
        {trocado && <span title="Valor trocado à mão"> ✎</span>}
      </span>
      {!!horas && <span className="block text-[11px] text-slate-500">{fmtHoras(horas)}</span>}
    </td>
  );
}

function Etiquetas({ l }: { l: LinhaFolha }) {
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      <Badge
        variant="outline"
        className={cn(
          "whitespace-nowrap px-1.5 py-0 text-[10px]",
          l.colaborador.vinculo === "fixo"
            ? "border-sky-200 bg-sky-50 text-sky-800"
            : "border-violet-200 bg-violet-50 text-violet-800",
        )}
      >
        {l.colaborador.vinculo === "fixo" ? "Fixo" : "Freelancer"}
      </Badge>
      {l.modo === "banco" && (
        <Badge
          variant="outline"
          className="whitespace-nowrap border-slate-300 px-1.5 py-0 text-[10px]"
        >
          Banco de horas{l.horas.noBanco ? ` +${fmtHoras(l.horas.noBanco)}` : ""}
        </Badge>
      )}
      {l.colaborador.vinculo === "freelance" && (
        <Badge variant="outline" className="whitespace-nowrap px-1.5 py-0 text-[10px]">
          {l.cfg.freela_modo === "mensal" ? "Valor cheio" : `${l.plantoes.length} plantão(ões)`}
        </Badge>
      )}
      {!!l.avisos.length && (
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-800"
          title={l.avisos.join("\n")}
        >
          <AlertTriangle className="mr-0.5 h-3 w-3" />
          Conferir
        </Badge>
      )}
    </span>
  );
}

function LinhaTabela({
  l,
  adiant,
  onClick,
}: {
  l: LinhaFolha;
  adiant: number;
  onClick: () => void;
}) {
  const basePlant = l.valores.base + l.valores.plantoes;
  return (
    <tr className="group cursor-pointer border-t hover:bg-emerald-50/50" onClick={onClick}>
      <td className="sticky left-0 min-w-44 bg-white px-3 py-2 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.15)] group-hover:bg-emerald-50">
        <p className="font-semibold text-slate-900">{l.colaborador.nome}</p>
        <p className="whitespace-nowrap text-[11px] text-slate-500">
          {SETOR_LABEL[l.colaborador.setor] ?? l.colaborador.setor} · {l.colaborador.unidade}
        </p>
        <Etiquetas l={l} />
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
        <span
          className={cn(
            !basePlant && "text-slate-300",
            (l.trocados.includes("base") || l.trocados.includes("plantoes")) &&
              "font-semibold text-amber-700",
          )}
        >
          {cel(basePlant)}
        </span>
        {!!l.plantoes.length && (
          <span className="block text-[11px] text-slate-500">{l.plantoes.length} plantão(ões)</span>
        )}
      </td>
      <Valor l={l} campo="vt" />
      <Valor l={l} campo="vr" />
      <Valor l={l} campo="bonusInd" />
      <Valor l={l} campo="bonusGrupo" />
      <Valor l={l} campo="he100" horas={l.horas.he100} />
      <Valor l={l} campo="he50Folga" horas={l.horas.he50Folga} />
      <Valor l={l} campo="he50Horario" horas={l.horas.he50Horario} />
      <Valor l={l} campo="noturno" horas={l.horas.noturnoReduzido} />
      <Valor l={l} campo="dsr" />
      <Td className={cn(!l.outrosProventos && "text-slate-300")}>{cel(l.outrosProventos)}</Td>
      <Td className={cn(l.descontos ? "text-rose-700" : "text-slate-300")}>
        {l.descontos ? `− ${brl(l.descontos)}` : "—"}
      </Td>
      <Td className={cn(adiant ? "text-amber-700" : "text-slate-300")}>
        {adiant ? `− ${brl(adiant)}` : "—"}
      </Td>
      <Td className="sticky right-0 bg-emerald-50 text-base font-black text-emerald-900 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)] group-hover:bg-emerald-100">
        {brl(l.total)}
      </Td>
    </tr>
  );
}

function CartaoPessoa({
  l,
  adiant,
  onClick,
}: {
  l: LinhaFolha;
  adiant: number;
  onClick: () => void;
}) {
  const itens: [string, number][] = (
    [
      ["Base", l.valores.base],
      ["Plantões", l.valores.plantoes],
      ["VT", l.valores.vt],
      ["VR", l.valores.vr],
      ["Bônus ind.", l.valores.bonusInd],
      ["Bônus grupo", l.valores.bonusGrupo],
      ["HE 100%", l.valores.he100],
      ["HE 50% sáb.", l.valores.he50Folga],
      ["HE 50% horário", l.valores.he50Horario],
      ["Noturno", l.valores.noturno],
      ["DSR", l.valores.dsr],
      ["Outros", l.outrosProventos],
      ["Descontos", -l.descontos],
    ] as [string, number][]
  ).filter(([, v]) => v);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border bg-white p-3 text-left shadow-sm active:bg-emerald-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{l.colaborador.nome}</p>
          <p className="text-xs text-slate-500">
            {SETOR_LABEL[l.colaborador.setor] ?? l.colaborador.setor} · {l.colaborador.unidade}
          </p>
          <Etiquetas l={l} />
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-emerald-800">{brl(l.total)}</p>
          {!!adiant && <p className="text-xs text-amber-700">adiant. − {brl(adiant)}</p>}
        </div>
      </div>
      {!!itens.length && (
        <div className="mt-2 flex flex-wrap gap-1">
          {itens.map(([r, v]) => (
            <span
              key={r}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px]",
                v < 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700",
              )}
            >
              {r} {v < 0 ? `− ${brl(-v)}` : brl(v)}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
