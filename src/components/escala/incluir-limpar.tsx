import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NomeCor } from "@/components/pessoa-cor";
import { isDuasUnidades, monthBounds, generatePatternMonthUnits, type EnginePattern } from "@/lib/escala-engine";
import { montarInclusao, selecionarParaLimpar } from "@/lib/escala-limpar";
import { useExcluirEscalaDias, useSalvarEscalaDias, type EscalaColaborador, type EscalaDia, type EscalaDiaInput, type EscalaSetor } from "@/lib/escala";

type Unit = "Botafogo" | "Ipanema";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const padraoAtivo = (c: EscalaColaborador) => c.escala_padroes?.find((p) => !p.vigente_ate) ?? null;
const br = (d: string) => d.split("-").reverse().join("/");

/** Inclui uma pessoa FIXA na escala: mês completo pelo padrão dela, ou mesclado (só alguns dias, sem mexer no resto). */
export function IncluirPessoaDialog({ open, preset, unit, sector, year, month, people, days, onClose, onSaveManual }: {
  open: boolean; preset: { date: string; unit: Unit } | null; unit: Unit | "Ambas"; sector: EscalaSetor; year: number; month: number;
  people: EscalaColaborador[]; days: EscalaDia[]; onClose: () => void; onSaveManual: (p: EscalaDiaInput[]) => void;
}) {
  const saveMany = useSalvarEscalaDias();
  const b = monthBounds(year, month);
  const fixos = people.filter((p) => p.ativo && p.vinculo === "fixo" && p.setor === sector && (unit === "Ambas" || p.unidade === "Ambas" || p.unidade === unit));
  const [pessoaId, setPessoaId] = useState("");
  const [modo, setModo] = useState<"completa" | "mesclada">(preset ? "mesclada" : "completa");
  const [inicio, setInicio] = useState(preset?.date ?? b.start);
  const [fim, setFim] = useState(preset?.date ?? b.start);
  const [somentePadrao, setSomentePadrao] = useState(!preset);
  const [entrada, setEntrada] = useState(""), [saida, setSaida] = useState("");
  const [unidadeEsc, setUnidadeEsc] = useState<Unit>(preset?.unit ?? (unit === "Ambas" ? "Botafogo" : unit));
  const pessoa = fixos.find((p) => p.id === pessoaId);
  const pt = pessoa ? padraoAtivo(pessoa) : null;
  const dividida = !!pt && isDuasUnidades(pt as EnginePattern);
  const unidadeFinal: Unit = pessoa && pessoa.unidade !== "Ambas" ? (pessoa.unidade as Unit) : unidadeEsc;
  const existentes = useMemo(() => days.filter((d) => d.colaborador_id === pessoaId).map((d) => ({ data: d.data, status: d.status, origem: d.origem })), [days, pessoaId]);
  const plano = useMemo(() => pessoa ? montarInclusao({ modo, pattern: pt as EnginePattern | null, ano: year, mes: month, inicio, fim, somentePadrao, existentes }) : [], [pessoa, modo, pt, year, month, inicio, fim, somentePadrao, existentes]);
  const trabalhos = plano.filter((p) => p.status === "trabalho").length;
  const semPadrao = modo === "completa" && !!pessoa && !pt;
  const faltaBase = modo === "completa" && !!pt && pt.tipo !== "5x2_fixo" && !pt.data_base;

  const mk = (c: EscalaColaborador, data: string, status: "trabalho" | "folga", origem: "gerado" | "manual", u: Unit): EscalaDiaInput => ({
    colaborador_id: c.id, unidade: u, setor: c.setor, data, turno: c.turno_padrao ?? "dia",
    hora_entrada: status === "folga" ? null : (entrada || pt?.hora_entrada || null), hora_saida: status === "folga" ? null : (saida || pt?.hora_saida || null),
    status, origem, substitui_colaborador_id: null, motivo: origem === "manual" ? "Incluído na escala pelo gestor" : null,
    modalidade_id: null, motivo_chamada: null, horas_contratadas: null, valor_combinado: null,
  });
  const incluir = async () => {
    if (!pessoa) return;
    if (modo === "mesclada") {
      if (!plano.length) return toast.error("Nenhum dia para incluir", { description: "Ela já trabalha nesses dias, ou o padrão manda folga (desmarque a opção do padrão)." });
      onSaveManual(plano.map((p) => mk(pessoa, p.data, "trabalho", "manual", unidadeFinal)));
      onClose();
      return;
    }
    try {
      let rows: EscalaDiaInput[];
      if (dividida && pt) {
        const manual = new Set(existentes.filter((e) => e.origem === "manual").map((e) => e.data));
        rows = generatePatternMonthUnits(pt as EnginePattern, year, month).filter((d) => !manual.has(d.data)).map((d) => mk(pessoa, d.data, d.status, "gerado", d.unidade));
      } else rows = plano.map((p) => mk(pessoa, p.data, p.status, "gerado", unidadeFinal));
      await saveMany.mutateAsync(rows);
      toast.success(`${pessoa.nome} incluída(o) no mês`, { description: `${rows.length} dias gravados pelo padrão; ajustes manuais foram preservados.` });
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível incluir"); }
  };
  return <Dialog key={preset ? `${preset.date}-${preset.unit}` : "geral"} open={open} onOpenChange={(v) => !v && onClose()}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Incluir pessoa fixa na escala</DialogTitle><DialogDescription>{MESES[month]} de {year}. Para freelancer ou plantão pago como extra, use o botão + Freelancer.</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1"><Label>Quem</Label>
          <Select value={pessoaId} onValueChange={(v) => { setPessoaId(v); setEntrada(""); setSaida(""); }}><SelectTrigger><SelectValue placeholder="Escolher funcionário fixo" /></SelectTrigger>
            <SelectContent>{fixos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome} · {p.unidade}</SelectItem>)}</SelectContent></Select>
          {fixos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum fixo ativo neste setor/unidade. Cadastre em Equipe.</p>}</div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={modo === "completa" ? "default" : "outline"} className="h-auto flex-col py-2" onClick={() => setModo("completa")}><span>Escala completa</span><span className="text-[11px] font-normal opacity-80">mês inteiro pelo padrão dela(e)</span></Button>
          <Button type="button" variant={modo === "mesclada" ? "default" : "outline"} className="h-auto flex-col py-2" onClick={() => setModo("mesclada")}><span>Mesclada</span><span className="text-[11px] font-normal opacity-80">só nos dias que eu escolher</span></Button>
        </div>
        {modo === "mesclada" && <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>De</Label><Input type="date" value={inicio} min={b.start} max={b.end} onChange={(e) => { setInicio(e.target.value); if (fim < e.target.value) setFim(e.target.value); }} /></div><div className="space-y-1"><Label>Até</Label><Input type="date" value={fim} min={inicio} max={b.end} onChange={(e) => setFim(e.target.value)} /></div></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={somentePadrao} onChange={(e) => setSomentePadrao(e.target.checked)} />Só nos dias em que o padrão dela(e) manda trabalhar</label>
        </div>}
        {pessoa && pessoa.unidade === "Ambas" && !dividida && <div className="space-y-1"><Label>Unidade</Label><Select value={unidadeEsc} onValueChange={(v) => setUnidadeEsc(v as Unit)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Botafogo">Botafogo</SelectItem><SelectItem value="Ipanema">Ipanema</SelectItem></SelectContent></Select></div>}
        <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Entrada</Label><Input type="time" value={entrada || pt?.hora_entrada?.slice(0, 5) || ""} onChange={(e) => setEntrada(e.target.value)} /></div><div className="space-y-1"><Label>Saída</Label><Input type="time" value={saida || pt?.hora_saida?.slice(0, 5) || ""} onChange={(e) => setSaida(e.target.value)} /></div></div>
        {semPadrao && <p className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs"><AlertTriangle className="h-4 w-4" />{pessoa?.nome} não tem padrão cadastrado. Defina em Equipe ou use "Mesclada".</p>}
        {faltaBase && <p className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs"><AlertTriangle className="h-4 w-4" />Falta a data-base do padrão em Equipe.</p>}
        {pessoa && !semPadrao && !faltaBase && <p className="text-xs text-muted-foreground">{modo === "completa" ? `Grava o mês de ${pessoa.nome} pelo padrão (${trabalhos} dias de trabalho). Dias já ajustados à mão ficam como estão.` : `Coloca ${pessoa.nome} para trabalhar em ${trabalhos} dia(s), de ${br(inicio)} a ${br(fim)}. O resto da escala não muda.`}</p>}
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!pessoa || semPadrao || faltaBase || saveMany.isPending} onClick={() => void incluir()}>Incluir na escala</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** Limpa a escala visível (mês, setor e unidade) inteira ou só de uma pessoa. */
export function LimparEscalaDialog({ open, onClose, days, people, rotulo, publicada }: {
  open: boolean; onClose: () => void; days: EscalaDia[]; people: EscalaColaborador[]; rotulo: string; publicada: boolean;
}) {
  const excluir = useExcluirEscalaDias();
  const [escopo, setEscopo] = useState<"tudo" | "pessoa">("tudo");
  const [pessoaId, setPessoaId] = useState("");
  const [incluirExtras, setIncluirExtras] = useState(false);
  const [texto, setTexto] = useState("");
  const comDias = people.filter((p) => days.some((d) => d.colaborador_id === p.id));
  const sel = selecionarParaLimpar(days, escopo === "tudo" ? { tipo: "tudo", incluirExtras } : { tipo: "pessoa", colaboradorId: pessoaId });
  const confirmado = escopo === "pessoa" || texto.trim().toUpperCase() === "LIMPAR";
  const apagar = async () => {
    try {
      for (let i = 0; i < sel.ids.length; i += 100) await excluir.mutateAsync(sel.ids.slice(i, i + 100));
      toast.success("Escala limpa", { description: `${sel.ids.length} dias apagados. Use "Gerar escala do mês" ou "Incluir pessoa" para refazer.` });
      setTexto(""); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível limpar"); }
  };
  return <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle className="text-destructive">Limpar escala</DialogTitle><DialogDescription>{rotulo}. Isso apaga os dias da escala; não dá para desfazer.</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2"><Button type="button" variant={escopo === "tudo" ? "default" : "outline"} onClick={() => setEscopo("tudo")}>Escala toda</Button><Button type="button" variant={escopo === "pessoa" ? "default" : "outline"} onClick={() => setEscopo("pessoa")}>Só de uma pessoa</Button></div>
        {escopo === "pessoa" && <Select value={pessoaId} onValueChange={setPessoaId}><SelectTrigger><SelectValue placeholder="Escolher pessoa" /></SelectTrigger><SelectContent>{comDias.map((p) => <SelectItem key={p.id} value={p.id}><NomeCor nome={p.nome} colaboradorId={p.id} /></SelectItem>)}</SelectContent></Select>}
        {escopo === "tudo" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={incluirExtras} onChange={(e) => setIncluirExtras(e.target.checked)} /><span>Apagar também os freelancers e extras já lançados <span className="block text-xs text-muted-foreground">Mexe nos valores a pagar no Financeiro. Deixe desmarcado para manter.</span></span></label>}
        <div className="rounded-md border bg-muted/40 p-3 text-sm">{escopo === "pessoa" && !pessoaId ? "Escolha a pessoa." : <>Vai apagar <b>{sel.ids.length}</b> dia(s): {sel.automaticos} automáticos, {sel.manuais} ajustes manuais{sel.extras ? `, ${sel.extras} plantão(ões) de extra/freelancer` : ""}.{sel.poupados > 0 && ` ${sel.poupados} extra(s) serão mantidos.`}</>}</div>
        {publicada && <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs"><AlertTriangle className="h-4 w-4" />Esta escala já foi publicada: os funcionários veem a mudança.</p>}
        {escopo === "tudo" && <div className="space-y-1"><Label>Para confirmar, digite LIMPAR</Label><Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="LIMPAR" /></div>}
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button variant="destructive" disabled={!sel.ids.length || !confirmado || excluir.isPending} onClick={() => void apagar()}>Limpar</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** Regra nacional da jornada 5x2 (EC 141/2026), para consulta ao montar a escala. */
export function RegraEscala5x2() {
  return <section className="rounded-lg border bg-muted/30 p-4 text-sm print:hidden" aria-label="Regra da escala 5x2">
    <h3 className="mb-2 font-bold">Regra nacional da escala 5x2 (Emenda Constitucional 141/2026)</h3>
    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
      <li>Promulgada em <b>16/10/2026</b>. Em até <b>60 dias</b> (por volta de <b>15/12/2026</b>) passa a valer a escala <b>5x2</b>: cinco dias de trabalho e <b>duas folgas remuneradas por semana</b>, com jornada de <b>42 horas semanais</b>.</li>
      <li>Depois de mais <b>12 meses</b> (cerca de 14 meses no total), a jornada cai para <b>40 horas semanais</b>, no máximo <b>8 horas por dia</b>. Na transição, as horas acima de 8 por dia podem ser distribuídas na semana (ex.: 8h24 em cinco dias).</li>
      <li><b>Sem redução de salário.</b> Hora trabalhada além da jornada é hora extra.</li>
      <li>As duas folgas contam em média por semana e devem ser concedidas <b>dentro do mesmo mês</b>. Escalas diferentes (6x1, 12x36, revezamento) só por <b>convenção ou acordo coletivo</b>, com compensação no mesmo mês.</li>
      <li>O texto não trata de hotelaria nem de turnos: confirme com o contador antes de mudar a 12x36 ou o revezamento.</li>
      <li>No app: o revezamento confere domingo sim/não, duas folgas por semana e sem sexta+sábado de folga juntas; o resumo mostra folgas e domingos de cada pessoa.</li>
    </ul>
    <p className="mt-2 text-xs text-muted-foreground">Resumo informativo baseado na cobertura da Agência Brasil (out/2026), não é parecer jurídico.</p>
  </section>;
}
