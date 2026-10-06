import { descreverRevezamento, generatePatternMonthUnits, resolveRevezamento, type EnginePattern } from "@/lib/escala-engine";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Pencil, Plus, Trash2, Users, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useFuncionarios, useUsuariosComRoles } from "@/lib/store";
import {
  patternWorksOn, useAlternarEscalaColaborador, useEscalaColaboradores, useEscalaModalidades,
  useEscalaFeriados, useExcluirEscalaFeriado, useSalvarEscalaColaborador, useSalvarEscalaFeriado, useSalvarEscalaModalidade, type ColaboradorInput, type EscalaColaborador,
  type EscalaModalidade, type EscalaPadrao, type EscalaPadraoTipo, type EscalaSetor,
  type EscalaTurno, type EscalaUnidade, type EscalaVinculo, type FeriadoEscala, type ModalidadeMotivo,
} from "@/lib/escala";
import { useImportarEquipeLocal, type LegacyEscalaMember } from "@/lib/escala";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const SETORES: { value: EscalaSetor; label: string }[] = [{ value: "manutencao", label: "Manutenção" }, { value: "recepcao", label: "Recepção" }, { value: "camareiras", label: "Camareiras" }];
const formatMoney = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const activePattern = (c: EscalaColaborador) => c.escala_padroes?.find((p) => !p.vigente_ate) ?? null;
const patternLabel: Record<EscalaPadraoTipo, string> = { "12x36": "12x36", "5x2_fixo": "5x2 fixo", "5x2_revezamento": "5x2 revezamento", "6x1": "6x1" };

export function EquipeEscalaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const colaboradores = useEscalaColaboradores();
  const modalidades = useEscalaModalidades();
  const feriados = useEscalaFeriados();
  const usuarios = useUsuariosComRoles();
  const [editing, setEditing] = useState<EscalaColaborador | null | undefined>();
  const [editingModalidade, setEditingModalidade] = useState<EscalaModalidade | null | undefined>();
  const [editingFeriado, setEditingFeriado] = useState<FeriadoEscala | null | undefined>();
  const toggle = useAlternarEscalaColaborador();
  const grouped = useMemo(() => SETORES.map((setor) => ({ ...setor, people: (colaboradores.data ?? []).filter((c) => c.setor === setor.value) })), [colaboradores.data]);
  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Equipe da Escala</DialogTitle><DialogDescription>Cadastre a equipe, configure padrões contínuos e gerencie os valores dos freelancers.</DialogDescription></DialogHeader>
        <Tabs defaultValue="equipe">
          <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="equipe">Equipe</TabsTrigger><TabsTrigger value="valores">Freelancers</TabsTrigger><TabsTrigger value="feriados">Feriados</TabsTrigger></TabsList>
          <TabsContent value="equipe" className="space-y-4 pt-3">
            <div className="flex justify-end"><Button className="gap-2" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Adicionar colaborador</Button></div>
            {grouped.map((group) => <section key={group.value} className="space-y-2"><h3 className="text-sm font-semibold uppercase text-muted-foreground">{group.label} ({group.people.length})</h3>
              {group.people.length === 0 ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum colaborador.</p> : <div className="grid gap-2 md:grid-cols-2">{group.people.map((person) => { const p = activePattern(person); return <Card key={person.id} className={cn("p-3", !person.ativo && "opacity-60")}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-medium">{person.nome}</p><div className="mt-1 flex flex-wrap gap-1"><Badge className={person.vinculo === "fixo" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{person.vinculo === "fixo" ? "Fixo" : "Freelance"}</Badge><Badge variant="outline">{person.unidade}</Badge>{person.turno_padrao && <Badge variant="outline">{person.turno_padrao === "manha" ? "Manhã" : person.turno_padrao === "noite" ? "Noite" : "Dia"}</Badge>}</div><p className="mt-2 text-xs text-muted-foreground">{person.funcionario_id ? "Vinculado a Funcionários" : "Não vinculado"}{p ? ` · ${patternLabel[p.tipo]}` : person.vinculo === "fixo" ? " · padrão pendente" : ""}</p>{p && <p className="text-xs text-muted-foreground">{p.hora_entrada && p.hora_saida ? `${p.hora_entrada.slice(0,5)}–${p.hora_saida.slice(0,5)}` : "Horário pendente"}</p>}</div><div className="flex items-center gap-2"><Switch checked={person.ativo} onCheckedChange={(ativo) => toggle.mutate({ id: person.id, ativo }, { onError: () => toast.error("Não foi possível alterar o cadastro") })} aria-label={person.ativo ? "Desativar" : "Ativar"}/><Button size="icon" variant="ghost" onClick={() => setEditing(person)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button></div></div></Card>; })}</div>}
            </section>)}
          </TabsContent>
          <TabsContent value="valores" className="space-y-3 pt-3"><div className="flex justify-end"><Button className="gap-2" onClick={() => setEditingModalidade(null)}><Plus className="h-4 w-4" /> Nova modalidade</Button></div>
            {(modalidades.data ?? []).map((item) => <Card key={item.id} className={cn("flex items-center justify-between gap-3 p-3", !item.ativo && "opacity-60")}><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{item.nome}</p><Badge variant="outline">{item.unidade}</Badge></div><p className="text-sm text-muted-foreground">{item.horas} h · {formatMoney(Number(item.valor))}</p><p className="text-xs text-muted-foreground">Última alteração: {new Date(item.updated_at).toLocaleString("pt-BR")}{item.updated_by ? ` · ${usuarios.data?.find((u) => u.userId === item.updated_by)?.nome ?? "Gestor"}` : " · Cadastro inicial"}</p></div><Button size="icon" variant="ghost" onClick={() => setEditingModalidade(item)} aria-label="Editar modalidade"><Pencil className="h-4 w-4" /></Button></Card>)}
          </TabsContent>
          <TabsContent value="feriados" className="space-y-3 pt-3"><div className="flex justify-end"><Button className="gap-2" onClick={() => setEditingFeriado(null)}><Plus className="h-4 w-4" /> Adicionar feriado</Button></div><div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">{[2026,2027].map((year) => <section key={year}><h3 className="mb-2 text-sm font-semibold">{year}</h3><div className="grid gap-2 md:grid-cols-2">{(feriados.data ?? []).filter((f)=>f.data.startsWith(String(year))).map((f)=><Card key={f.id} className="flex items-center justify-between gap-2 p-3"><div><p className="text-sm font-medium">{new Date(`${f.data}T12:00:00`).toLocaleDateString("pt-BR")} · {f.nome}</p><p className="text-xs text-muted-foreground">{f.abrangencia === "nacional" ? "Nacional" : f.abrangencia === "estadual_RJ" ? "Estado do Rio" : "Cidade do Rio"}</p></div><Button size="icon" variant="ghost" onClick={()=>setEditingFeriado(f)} aria-label="Editar feriado"><Pencil className="h-4 w-4" /></Button></Card>)}</div></section>)}</div></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
    {editing !== undefined && <ColaboradorDialog initial={editing} onClose={() => setEditing(undefined)} />}
    {editingModalidade !== undefined && <ModalidadeDialog initial={editingModalidade} nextOrder={(modalidades.data?.length ?? 0) + 1} onClose={() => setEditingModalidade(undefined)} />}
    {editingFeriado !== undefined && <FeriadoDialog initial={editingFeriado} onClose={() => setEditingFeriado(undefined)} />}
  </>;
}

function ColaboradorDialog({ initial, onClose }: { initial: EscalaColaborador | null; onClose: () => void }) {
  const funcionarios = useFuncionarios(); const save = useSalvarEscalaColaborador(); const existing = initial ? activePattern(initial) : null;
  const [nome,setNome]=useState(initial?.nome ?? ""); const [funcionarioId,setFuncionarioId]=useState(initial?.funcionario_id ?? "none"); const [setor,setSetor]=useState<EscalaSetor>(initial?.setor ?? "recepcao"); const [unidade,setUnidade]=useState<EscalaUnidade>(initial?.unidade ?? "Ambas"); const [vinculo,setVinculo]=useState<EscalaVinculo>(initial?.vinculo ?? "fixo"); const [turno,setTurno]=useState<EscalaTurno>(initial?.turno_padrao ?? "dia"); const [telefone,setTelefone]=useState(initial?.telefone ?? "");
  const [tipo,setTipo]=useState<EscalaPadraoTipo>(existing?.tipo ?? "12x36"); const [entrada,setEntrada]=useState(existing?.hora_entrada?.slice(0,5) ?? ""); const [saida,setSaida]=useState(existing?.hora_saida?.slice(0,5) ?? ""); const [intervalo,setIntervalo]=useState(existing?.intervalo_minutos?.toString() ?? ""); const [base,setBase]=useState(existing?.data_base ?? ""); const [folgas,setFolgas]=useState<number[]>(existing?.folgas_fixas ?? []); const [folgaB,setFolgaB]=useState(existing?.folga_semana_b ?? 1);
  const [duas,setDuas]=useState(!!existing?.dias_ipanema?.length); const [diasIpa,setDiasIpa]=useState<number[]>(existing?.dias_ipanema ?? [2,4]); const [propBot,setPropBot]=useState(String(existing?.proporcao_botafogo ?? 12)); const [propIpa,setPropIpa]=useState(String(existing?.proporcao_ipanema ?? 10));
  const splitOn = vinculo === "fixo" && unidade === "Ambas" && duas && diasIpa.length > 0;
  useEffect(() => { const f = funcionarios.data?.find((item) => item.id === funcionarioId); if (f && !initial) setNome(f.nome); }, [funcionarioId, funcionarios.data, initial]);
  const preview = useMemo(() => { if (vinculo !== "fixo") return []; const start = base ? new Date(`${base}T00:00:00Z`) : new Date(); const p = { tipo, data_base: base || null, folgas_fixas: folgas, folga_semana_a: tipo === "5x2_revezamento" ? 0 : null, folga_semana_b: tipo === "5x2_revezamento" ? folgaB : null } as EscalaPadrao; return Array.from({length:28},(_,i)=>{ const d=new Date(start); d.setUTCDate(start.getUTCDate()+i); return { d, work: patternWorksOn(p,d) }; }); }, [base, folgaB, folgas, tipo, vinculo]);
  const submit = () => { if (!nome.trim()) return toast.error("Informe o nome"); if (vinculo === "fixo" && tipo === "5x2_fixo" && folgas.length !== 2) return toast.error("Marque exatamente dois dias de folga"); const needsBase = tipo === "12x36" || tipo === "5x2_revezamento" || tipo === "6x1"; const input: ColaboradorInput = { id: initial?.id, funcionario_id: funcionarioId === "none" ? null : funcionarioId, nome, setor, unidade, vinculo, turno_padrao: vinculo === "fixo" ? turno : null, telefone: telefone || null, ativo: initial?.ativo ?? true, ...(vinculo === "fixo" ? { padrao: { tipo, hora_entrada: entrada || null, hora_saida: saida || null, intervalo_minutos: intervalo ? Number(intervalo) : null, data_base: needsBase && base ? base : null, folgas_fixas: folgas, folga_semana_a: tipo === "5x2_revezamento" ? 0 : null, folga_semana_b: tipo === "5x2_revezamento" ? folgaB : null, dias_ipanema: splitOn ? diasIpa : null, proporcao_botafogo: splitOn && propBot ? Number(propBot) : null, proporcao_ipanema: splitOn && propIpa ? Number(propIpa) : null, vigente_desde: existing?.vigente_desde ?? new Date().toISOString().slice(0,10) } } : {}) }; save.mutate(input,{onSuccess:()=>{toast.success(initial?"Colaborador atualizado":"Colaborador adicionado");onClose();},onError:(e)=>toast.error(e instanceof Error?e.message:"Não foi possível salvar")}); };
  const toggleDay=(day:number)=>setFolgas((old)=>old.includes(day)?old.filter((d)=>d!==day):[...old,day].sort());
  return <Dialog open onOpenChange={(v)=>!v&&onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{initial?"Editar colaborador":"Adicionar colaborador"}</DialogTitle><DialogDescription>Dados exclusivos da Escala e padrão contínuo de trabalho.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
    <Field label="Funcionário vinculado"><Select value={funcionarioId} onValueChange={setFuncionarioId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não vinculado</SelectItem>{funcionarios.data?.map((f)=><SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent></Select></Field><Field label="Nome"><Input value={nome} onChange={(e)=>setNome(e.target.value)} /></Field>
    <Field label="Setor"><Select value={setor} onValueChange={(v)=>setSetor(v as EscalaSetor)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SETORES.map((s)=><SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></Field><Field label="Unidade"><Select value={unidade} onValueChange={(v)=>setUnidade(v as EscalaUnidade)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Botafogo","Ipanema","Ambas"].map((u)=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></Field>
    <Field label="Vínculo"><Select value={vinculo} onValueChange={(v)=>setVinculo(v as EscalaVinculo)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixo">Fixo</SelectItem><SelectItem value="freelance">Freelance</SelectItem></SelectContent></Select></Field><Field label="Telefone"><Input value={telefone} onChange={(e)=>setTelefone(e.target.value)} /></Field>
    {vinculo === "fixo" && <><Field label="Padrão"><Select value={tipo} onValueChange={(v)=>setTipo(v as EscalaPadraoTipo)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="12x36">12x36</SelectItem><SelectItem value="5x2_fixo">5x2 fixo</SelectItem><SelectItem value="5x2_revezamento">5x2 revezamento</SelectItem><SelectItem value="6x1">6x1</SelectItem></SelectContent></Select></Field><Field label="Turno padrão"><Select value={turno} onValueChange={(v)=>setTurno(v as EscalaTurno)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manha">Manhã</SelectItem><SelectItem value="noite">Noite</SelectItem><SelectItem value="dia">Dia</SelectItem></SelectContent></Select></Field>
      <Field label="Hora de entrada"><Input type="time" value={entrada} onChange={(e)=>setEntrada(e.target.value)} /></Field><Field label="Hora de saída"><Input type="time" value={saida} onChange={(e)=>setSaida(e.target.value)} /></Field><Field label="Intervalo (minutos)"><Input type="number" min="0" value={intervalo} onChange={(e)=>setIntervalo(e.target.value)} /></Field>
      {(tipo === "12x36" || tipo === "5x2_revezamento" || tipo === "6x1") && <Field label={tipo === "12x36" ? "Data em que trabalhou" : tipo === "5x2_revezamento" ? "Domingo em que folgou" : "Data conhecida de folga"}><Input type="date" value={base} onChange={(e)=>setBase(e.target.value)} /></Field>}
      {(tipo === "5x2_fixo" || tipo === "5x2_revezamento") && <div className="space-y-2 sm:col-span-2"><Label>{tipo === "5x2_fixo" ? "Dois dias de folga" : "Folga fixa semanal"}</Label><div className="flex flex-wrap gap-3">{DAYS.map((day,i)=><label key={day} className="flex items-center gap-1.5 text-sm"><Checkbox checked={folgas.includes(i)} onCheckedChange={()=>toggleDay(i)} />{day}</label>)}</div></div>}
      {tipo === "5x2_revezamento" && <Field label="Segunda folga quando trabalha domingo"><Select value={String(folgaB)} onValueChange={(v)=>setFolgaB(Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DAYS.map((d,i)=><SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent></Select></Field>}
      <div className="sm:col-span-2"><Label className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Prévia de 4 semanas</Label>{!base && (tipo === "12x36" || tipo === "5x2_revezamento" || tipo === "6x1") ? <p className="mt-2 text-sm text-muted-foreground">Informe a data-base para visualizar o ciclo.</p> : <div className="mt-2 grid grid-cols-7 gap-1">{preview.map(({d,work})=><div key={d.toISOString()} className={cn("rounded border p-1 text-center text-[10px]",work?"border-emerald-200 bg-emerald-50 text-emerald-800":"bg-muted text-muted-foreground")}><div>{DAYS[d.getUTCDay()]}</div><strong>{d.getUTCDate()}</strong><div>{work?"Trabalho":"Folga"}</div></div>)}</div>}</div>
      {unidade === "Ambas" && <div className="space-y-3 rounded-md border p-3 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={duas} onCheckedChange={(v)=>setDuas(v===true)} />Trabalha nas duas unidades (divide os dias entre Botafogo e Ipanema)</label>
        {duas && <>
          <div className="space-y-2"><Label>Dias da semana em Ipanema (os demais dias de trabalho são em Botafogo)</Label><div className="flex flex-wrap gap-3">{DAYS.map((day,i)=><label key={day} className="flex items-center gap-1.5 text-sm"><Checkbox checked={diasIpa.includes(i)} onCheckedChange={()=>setDiasIpa(old=>old.includes(i)?old.filter(d=>d!==i):[...old,i].sort())} />{day}</label>)}</div></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Dias em Botafogo (proporção)"><Input type="number" min="0" max="31" value={propBot} onChange={(e)=>setPropBot(e.target.value)} /></Field><Field label="Dias em Ipanema (proporção)"><Input type="number" min="0" max="31" value={propIpa} onChange={(e)=>setPropIpa(e.target.value)} /></Field></div>
          <p className="text-xs text-muted-foreground">O app segue os dias da semana e, no fim do mês, troca o mínimo de dias para chegar perto da proporção (ex.: 12 e 10). Deixe a proporção em branco para usar só os dias da semana. Folgas e dias na outra unidade não chamam freelancer.</p>
          {(() => { const now = new Date(); const pt: EnginePattern = { tipo, data_base: base || null, folgas_fixas: folgas, folga_semana_a: tipo === "5x2_revezamento" ? 0 : null, folga_semana_b: tipo === "5x2_revezamento" ? folgaB : null, dias_ipanema: diasIpa, proporcao_botafogo: propBot ? Number(propBot) : null, proporcao_ipanema: propIpa ? Number(propIpa) : null }; if (tipo !== "5x2_fixo" && !base) return null; const meses = [0,1,2].map((k)=>{ const y = now.getUTCFullYear() + Math.floor((now.getUTCMonth()+k)/12); const m = (now.getUTCMonth()+k)%12; const w = generatePatternMonthUnits(pt,y,m).filter(d=>d.status==="trabalho"); return { label: `${String(m+1).padStart(2,"0")}/${y}`, bot: w.filter(d=>d.unidade==="Botafogo").length, ipa: w.filter(d=>d.unidade==="Ipanema").length }; }); return <div className="grid grid-cols-3 gap-2 text-xs">{meses.map(x=><div key={x.label} className="rounded border bg-muted/40 p-2 text-center"><div className="font-medium">{x.label}</div><div>Botafogo {x.bot} · Ipanema {x.ipa}</div></div>)}</div>; })()}
        </>}
      </div>}
      {tipo === "5x2_revezamento" && (() => { const c = resolveRevezamento({ folgas_fixas: folgas, folga_semana_a: 0, folga_semana_b: folgaB }); return c.ajustado
        ? <div className="sm:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><p className="font-medium">Este cadastro quebra as regras: {c.problemasDoCadastro.join("; ")}.</p><p className="mt-1">A geração (e a prévia acima) usa as folgas válidas mais próximas. {descreverRevezamento(c)} Máximo de {c.maiorSequencia} dias seguidos.</p></div>
        : <p className="sm:col-span-2 text-xs text-muted-foreground">Regras ok: domingo sim, domingo não; sem folga sexta+sábado ou sábado+domingo; no máximo {c.maiorSequencia} dias seguidos de trabalho.</p>; })()}
    </>}
  </div><DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} disabled={save.isPending}>Salvar</Button></DialogFooter></DialogContent></Dialog>;
}
function Field({label,children}:{label:string;children:React.ReactNode}) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }

function ModalidadeDialog({ initial, nextOrder, onClose }: { initial: EscalaModalidade | null; nextOrder: number; onClose: () => void }) {
  const save=useSalvarEscalaModalidade(); const [nome,setNome]=useState(initial?.nome??""); const [motivo,setMotivo]=useState<ModalidadeMotivo>(initial?.motivo??"outro"); const [horas,setHoras]=useState(String(initial?.horas??8)); const [valor,setValor]=useState(String(initial?.valor??0)); const [unidade,setUnidade]=useState<EscalaUnidade>(initial?.unidade??"Ambas"); const [ativo,setAtivo]=useState(initial?.ativo??true);
  const submit=()=>{if(!nome.trim()||Number(horas)<=0||Number(valor)<0)return toast.error("Preencha nome, horas e valor"); save.mutate({id:initial?.id??"",nome,motivo,horas:Number(horas),valor:Number(valor),unidade,ativo,ordem:initial?.ordem??nextOrder},{onSuccess:()=>{toast.success("Modalidade salva");onClose();},onError:()=>toast.error("Não foi possível salvar")});};
  return <Dialog open onOpenChange={(v)=>!v&&onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5" /> {initial?"Editar modalidade":"Nova modalidade"}</DialogTitle><DialogDescription>O valor será copiado para cada plantão e não mudará retroativamente.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome"><Input value={nome} onChange={(e)=>setNome(e.target.value)} /></Field><Field label="Motivo"><Select value={motivo} onValueChange={(v)=>setMotivo(v as ModalidadeMotivo)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reforco_ocupacao">Reforço de ocupação</SelectItem><SelectItem value="cobertura_falta">Cobertura de falta</SelectItem><SelectItem value="outro">Outro</SelectItem></SelectContent></Select></Field><Field label="Horas"><Input type="number" min="0.5" step="0.5" value={horas} onChange={(e)=>setHoras(e.target.value)} /></Field><Field label="Valor (R$)"><Input type="number" min="0" step="0.01" value={valor} onChange={(e)=>setValor(e.target.value)} /></Field><Field label="Unidade"><Select value={unidade} onValueChange={(v)=>setUnidade(v as EscalaUnidade)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Botafogo","Ipanema","Ambas"].map((u)=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></Field><div className="flex items-end gap-2 pb-2"><Switch checked={ativo} onCheckedChange={setAtivo}/><Label>Ativa</Label></div></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} disabled={save.isPending}>Salvar</Button></DialogFooter></DialogContent></Dialog>;
}

function FeriadoDialog({ initial, onClose }: { initial: FeriadoEscala | null; onClose: () => void }) {
  const save=useSalvarEscalaFeriado(); const remove=useExcluirEscalaFeriado(); const [data,setData]=useState(initial?.data??""); const [nome,setNome]=useState(initial?.nome??""); const [abrangencia,setAbrangencia]=useState<FeriadoEscala["abrangencia"]>(initial?.abrangencia??"nacional");
  const submit=()=>{if(!data||!nome.trim())return toast.error("Informe data e nome");save.mutate({id:initial?.id??"",data,nome,abrangencia},{onSuccess:()=>{toast.success("Feriado salvo");onClose();},onError:()=>toast.error("Não foi possível salvar")});};
  return <Dialog open onOpenChange={(v)=>!v&&onClose()}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{initial?"Editar feriado":"Adicionar feriado"}</DialogTitle><DialogDescription>Cadastro informativo usado no planejamento da Escala.</DialogDescription></DialogHeader><div className="space-y-4"><Field label="Data"><Input type="date" value={data} onChange={(e)=>setData(e.target.value)} /></Field><Field label="Nome"><Input value={nome} onChange={(e)=>setNome(e.target.value)} /></Field><Field label="Abrangência"><Select value={abrangencia} onValueChange={(v)=>setAbrangencia(v as FeriadoEscala["abrangencia"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nacional">Nacional</SelectItem><SelectItem value="estadual_RJ">Estado do Rio</SelectItem><SelectItem value="municipal_Rio">Cidade do Rio</SelectItem></SelectContent></Select></Field></div><DialogFooter className="sm:justify-between">{initial?<Button variant="destructive" className="gap-2" onClick={()=>remove.mutate(initial.id,{onSuccess:()=>{toast.success("Feriado removido");onClose();}})}><Trash2 className="h-4 w-4" /> Excluir</Button>:<span/>}<div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Salvar</Button></div></DialogFooter></DialogContent></Dialog>;
}

const LEGACY_KEY = "injoy.escala.equipe.v1";
export function ImportarEquipeLocalPrompt() {
  const [legacy, setLegacy] = useState<LegacyEscalaMember[] | null>(null);
  const importer = useImportarEquipeLocal();
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LEGACY_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) setLegacy(parsed as LegacyEscalaMember[]);
      else window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      window.localStorage.removeItem(LEGACY_KEY);
    }
  }, []);
  const dismiss = () => { window.localStorage.removeItem(LEGACY_KEY); setLegacy(null); };
  const importNow = () => {
    if (!legacy) return;
    importer.mutate(legacy, {
      onSuccess: ({ imported, ignored }) => {
        window.localStorage.removeItem(LEGACY_KEY);
        setLegacy(null);
        toast.success(`${imported} cadastro(s) importado(s)`, { description: `${ignored} item(ns) já existiam ou foram ignorados.` });
      },
      onError: () => toast.error("Não foi possível importar. Os dados continuam salvos neste aparelho."),
    });
  };
  return <AlertDialog open={legacy !== null}>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Importar equipe salva neste aparelho?</AlertDialogTitle><AlertDialogDescription>Encontramos um cadastro antigo da Escala. Somente pessoas que ainda não existem serão adicionadas.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={dismiss}>Não importar</AlertDialogCancel><AlertDialogAction onClick={importNow} disabled={importer.isPending}>Importar equipe</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
  </AlertDialog>;
}
