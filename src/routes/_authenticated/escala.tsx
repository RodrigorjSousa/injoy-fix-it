import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { NomeCor } from "@/components/pessoa-cor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addCivilDays, civilDow, civilRange, monthBounds } from "@/lib/escala-engine";
import { corComAlfa, useCorDe } from "@/lib/cores-equipe";
import { useLancarFreelancerRecepcao, useOpcoesEscalaRecepcao, usePainelEscalaRecepcao, useRemoverFreelancerRecepcao, type RecColab, type RecDia, type Unidade } from "@/lib/escala-recepcao";
import { requireGestor } from "@/lib/require-gestor";
import { useMe } from "@/lib/store";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/escala")({
  beforeLoad: () => requireGestor({ tela: "escala" }),
  head: () => ({ meta: [{ title: "Escala — INJOY" }] }),
  component: EscalaRecepcao,
});

const SETOR = { recepcao: "Recepção", camareiras: "Camareiras", manutencao: "Manutenção" } as const;
const SETORES = ["recepcao", "camareiras", "manutencao"] as const;
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const hh = (v: string | null) => (v ? v.slice(0, 5) : "");

function EscalaRecepcao() {
  const { data: me } = useMe();
  const hoje = todaySP();
  const [unidade, setUnidade] = useState<Unidade>("Botafogo");
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoje.slice(5, 7)) - 1);
  const [lancar, setLancar] = useState<string | null>(null);
  const b = monthBounds(ano, mes);
  const painel = usePainelEscalaRecepcao(b.start, b.end);
  const hojeAmanha = usePainelEscalaRecepcao(hoje, addCivilDays(hoje, 1));
  const remover = useRemoverFreelancerRecepcao();
  const corDe = useCorDe();
  const colabs = useMemo(() => new Map((painel.data?.colaboradores ?? hojeAmanha.data?.colaboradores ?? []).map((c) => [c.id, c])), [painel.data, hojeAmanha.data]);
  const doDia = (dias: RecDia[], data: string, setor?: RecColab["setor"]) =>
    dias.filter((d) => d.data === data && d.unidade === unidade && (!setor || d.setor === setor) && (d.status === "trabalho" || d.status === "extra"));
  const confirmaRemover = (d: RecDia) => {
    const nome = colabs.get(d.colaborador_id)?.nome ?? "freelancer";
    if (!confirm(`Remover ${nome} de ${d.data.split("-").reverse().join("/")}?`)) return;
    remover.mutate(d.id, { onSuccess: () => toast.success("Freelancer removido"), onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível remover") });
  };
  const chip = (d: RecDia) => {
    const c = colabs.get(d.colaborador_id);
    const cor = corDe({ colaboradorId: d.colaborador_id, nome: c?.nome });
    return <div key={d.id} className="flex items-center justify-between gap-1 rounded border px-1.5 py-1 text-[11px]" style={cor ? { backgroundColor: corComAlfa(cor, 0.16), borderColor: cor, borderLeftWidth: 4, borderStyle: d.extra ? "dashed" : "solid" } : undefined}>
      <span className="min-w-0 truncate font-medium">{c?.nome ?? "—"}{d.extra && <span className="ml-1 font-normal text-muted-foreground">freelancer</span>}</span>
      <span className="flex shrink-0 items-center gap-1 text-muted-foreground">{hh(d.hora_entrada)}{d.hora_saida ? `–${hh(d.hora_saida)}` : ""}{d.removivel && <button type="button" aria-label="Remover freelancer" onClick={() => confirmaRemover(d)} className="rounded p-0.5 hover:bg-black/10"><X className="h-3 w-3" /></button>}</span>
    </div>;
  };
  const dias = painel.data?.dias ?? [];
  const datas = civilRange(b.start, b.end);
  const lead = civilDow(b.start);
  const nav = (delta: number) => { const d = new Date(Date.UTC(ano, mes + delta, 1)); setAno(d.getUTCFullYear()); setMes(d.getUTCMonth()); };
  const diaCard = (data: string, titulo: string) => {
    const base = hojeAmanha.data?.dias ?? [];
    return <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between"><h3 className="font-black text-slate-900">{titulo} <span className="text-xs font-normal text-muted-foreground">{data.split("-").reverse().slice(0, 2).join("/")}</span></h3><Button size="sm" variant="outline" onClick={() => setLancar(data)}><Plus className="mr-1 h-3 w-3" />Freelancer</Button></div>
      {SETORES.map((s) => {
        if (s === "recepcao" && unidade === "Ipanema") return <div key={s}><p className="text-xs font-bold uppercase text-slate-500">{SETOR[s]}</p><p className="text-xs text-blue-700">Ipanema é administrada pela recepção de Botafogo.</p></div>;
        const rows = doDia(base, data, s);
        return <div key={s} className="space-y-1"><p className="text-xs font-bold uppercase text-slate-500">{SETOR[s]}</p>{rows.length ? rows.map(chip) : <p className="text-xs text-muted-foreground">Ninguém escalado</p>}</div>;
      })}
    </Card>;
  };
  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-xl font-black"><CalendarDays className="h-5 w-5 text-blue-700" />Escala</h1>
        <p className="text-xs text-muted-foreground">Veja o plantão e lance freelancers. Publicar e gerar a escala do mês é só com o gestor.</p></div>
      <div className="flex gap-2">{(["Botafogo", "Ipanema"] as Unidade[]).map((u) => <Button key={u} size="sm" variant={unidade === u ? "default" : "outline"} onClick={() => setUnidade(u)}>{u}</Button>)}</div>
    </div>
    {(me?.isGestor || me?.isAdmin) && <p className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-xs"><ShieldAlert className="h-4 w-4" />Você é gestor: a escala completa fica em <Link to="/gestor/escala" search={{ reforcoData: undefined, reforcoUnidade: undefined }} className="font-semibold underline">Área do Gestor › Escala</Link>.</p>}
    {hojeAmanha.error && <p className="text-sm text-destructive">{hojeAmanha.error instanceof Error ? hojeAmanha.error.message : "Erro ao carregar"}</p>}
    <div className="grid gap-3 md:grid-cols-2">{diaCard(hoje, "Hoje")}{diaCard(addCivilDays(hoje, 1), "Amanhã")}</div>
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between"><h3 className="font-black">{MESES[mes]} {ano} · {unidade}</h3><div className="flex gap-1"><Button size="icon" variant="outline" aria-label="Mês anterior" onClick={() => nav(-1)}><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" aria-label="Próximo mês" onClick={() => nav(1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
      {painel.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-7 bg-muted/50 text-center text-[11px] font-semibold uppercase text-muted-foreground">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="p-2">{d}</div>)}</div>
        <div className="grid grid-cols-7">{Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} className="min-h-24 border-l border-t bg-muted/20" />)}
          {datas.map((data) => <div key={data} className={cn("min-h-24 border-l border-t p-1", data === hoje && "bg-blue-50")}>
            <div className="mb-1 flex items-center justify-between"><span className="text-[11px] font-semibold">{data.slice(-2)}</span>{data >= hoje && <button type="button" aria-label="Incluir freelancer" onClick={() => setLancar(data)} className="rounded p-0.5 text-muted-foreground hover:bg-muted"><Plus className="h-3 w-3" /></button>}</div>
            <div className="space-y-1">{doDia(dias, data).map(chip)}</div>
          </div>)}</div>
      </div>}
    </Card>
    <LancarDialog data={lancar} unidade={unidade} onClose={() => setLancar(null)} />
  </div>;
}

function LancarDialog({ data, unidade, onClose }: { data: string | null; unidade: Unidade; onClose: () => void }) {
  const opcoes = useOpcoesEscalaRecepcao(unidade);
  const lancar = useLancarFreelancerRecepcao();
  const [pessoa, setPessoa] = useState(""), [modalidade, setModalidade] = useState(""), [entrada, setEntrada] = useState(""), [msg, setMsg] = useState("");
  const mods = opcoes.data?.modalidades ?? [];
  const mod = mods.find((m) => m.id === modalidade) ?? mods[0];
  const free = opcoes.data?.freelancers ?? [];
  return <Dialog key={data ? `${data}-${unidade}` : "none"} open={!!data} onOpenChange={(v) => !v && onClose()}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Incluir freelancer</DialogTitle><DialogDescription>{unidade} · {data?.split("-").reverse().join("/")}</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1"><Label>Freelancer</Label>
          <Select value={pessoa} onValueChange={(v) => { setPessoa(v); const h = free.find((f) => f.id === v)?.hora_entrada; if (h) setEntrada(h); }}>
            <SelectTrigger><SelectValue placeholder={opcoes.isLoading ? "Carregando…" : "Selecionar"} /></SelectTrigger>
            <SelectContent>{free.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome} · {SETOR[f.setor]}</SelectItem>)}</SelectContent>
          </Select>
          {!opcoes.isLoading && free.length === 0 && <p className="text-xs text-muted-foreground">Nenhum freelancer cadastrado nesta unidade. Peça ao gestor para cadastrar em Equipe.</p>}</div>
        <div className="space-y-1"><Label>Tipo do plantão</Label><div className="grid gap-2">{mods.map((m) => <Button key={m.id} type="button" variant={mod?.id === m.id ? "default" : "outline"} className="justify-start" onClick={() => setModalidade(m.id)}>{m.nome} · {m.horas} h</Button>)}</div></div>
        <div className="space-y-1"><Label>Entrada</Label><Input type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} /></div>
        <div className="space-y-1"><Label>Observação</Label><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ex.: muitos gerais hoje" /></div>
        <Badge variant="outline">O valor segue o combinado do gestor para este tipo.</Badge>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={!data || !pessoa || !mod || lancar.isPending} onClick={() => data && mod && lancar.mutate({ unidade, data, colaboradorId: pessoa, modalidadeId: mod.id, horaEntrada: entrada, mensagem: msg }, { onSuccess: () => { toast.success("Freelancer incluído na escala"); onClose(); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível incluir") })}>Incluir</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
