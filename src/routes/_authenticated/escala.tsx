import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileDown,
  MessageCircle,
  Pencil,
  Plus,
  Sparkles,
  Sun,
  Moon,
  Wrench,
  BedDouble,
  Users,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/escala")({
  head: () => ({
    meta: [
      { title: "Escala de Funcionários — INJOY" },
      {
        name: "description",
        content:
          "Gestão de escalas mensais de recepção, manutenção e camareiras.",
      },
    ],
  }),
  component: EscalaPage,
});

/* ============================================================
   Equipe dinâmica (CRUD) — persistida em localStorage
   ============================================================ */
export type Setor = "manutencao" | "recepcao" | "camareiras";
export type UnidadeEq = "ipanema" | "botafogo" | "todas";
export type TipoContrato = "Fixo" | "Freelance";
export type TurnoRec = "manha" | "noite";

export interface Funcionario {
  id: string;
  nome: string;
  setor: Setor;
  unidade: UnidadeEq;
  tipo: TipoContrato;
  turno?: TurnoRec; // apenas recepção
}

const STORAGE_KEY = "injoy.escala.equipe.v1";

const SEED: Funcionario[] = [
  // Manutenção
  { id: "m-cristiano", nome: "CRISTIANO", setor: "manutencao", unidade: "todas", tipo: "Fixo" },
  // Recepção — Manhã
  { id: "r-mayara", nome: "Mayara Fagundes", setor: "recepcao", unidade: "todas", tipo: "Fixo", turno: "manha" },
  { id: "r-julia", nome: "Júlia Cristine", setor: "recepcao", unidade: "todas", tipo: "Fixo", turno: "manha" },
  // Recepção — Noite
  { id: "r-lucivaldo", nome: "Lucivaldo", setor: "recepcao", unidade: "todas", tipo: "Fixo", turno: "noite" },
  { id: "r-mathaus", nome: "Mathaus Ramos", setor: "recepcao", unidade: "todas", tipo: "Fixo", turno: "noite" },
  // Camareiras — Ipanema
  { id: "c-maria", nome: "MARIA", setor: "camareiras", unidade: "ipanema", tipo: "Fixo" },
  { id: "c-cristina", nome: "CRISTINA", setor: "camareiras", unidade: "ipanema", tipo: "Freelance" },
  // Camareiras — Botafogo
  { id: "c-gleidiane", nome: "GLEIDIANE MENDES", setor: "camareiras", unidade: "botafogo", tipo: "Fixo" },
  { id: "c-raquel", nome: "RAQUEL", setor: "camareiras", unidade: "botafogo", tipo: "Fixo" },
  { id: "c-luciene", nome: "LUCIENE CERQUEIRA", setor: "camareiras", unidade: "botafogo", tipo: "Freelance" },
];

function loadEquipe(): Funcionario[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
      return SEED;
    }
    return JSON.parse(raw) as Funcionario[];
  } catch {
    return SEED;
  }
}
function saveEquipe(list: Funcionario[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function useEquipe() {
  const [equipe, setEquipe] = useState<Funcionario[]>(SEED);
  useEffect(() => {
    setEquipe(loadEquipe());
  }, []);
  const persist = (list: Funcionario[]) => {
    setEquipe(list);
    saveEquipe(list);
  };
  const upsert = (f: Funcionario) => {
    const exists = equipe.some((e) => e.id === f.id);
    persist(exists ? equipe.map((e) => (e.id === f.id ? f : e)) : [...equipe, f]);
  };
  const remove = (id: string) => persist(equipe.filter((e) => e.id !== id));
  return { equipe, upsert, remove };
}

const SETOR_LABEL: Record<Setor, string> = {
  manutencao: "Manutenção",
  recepcao: "Recepção",
  camareiras: "Camareiras",
};

/* ============================================================
   Shared helpers
   ============================================================ */
type Turno = "manha" | "noite";
type Escala = Record<string, { manha: string; noite: string }>;

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function keyOf(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ============================================================
   Page
   ============================================================ */
function EscalaPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [manageOpen, setManageOpen] = useState(false);

  const { equipe, upsert, remove } = useEquipe();
  const label = `${MONTHS[month]} / ${year}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="secondary" className="mb-2 rounded-full">
            <CalendarDays className="h-3 w-3 mr-1" /> Gestão
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Escala de Funcionários
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize turnos e plantões da equipe INJOY.
          </p>
        </div>
      </header>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            className="gap-2 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            onClick={() =>
              toast.success("Gerando PDF da escala mensal...", {
                description: `Relatório de ${label} pronto para impressão.`,
              })
            }
          >
            <FileDown className="h-4 w-4" /> Exportar PDF
          </Button>
          <WhatsAppButton mesLabel={label} equipe={equipe} />
          <Button
            variant="outline"
            className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
            onClick={() => setManageOpen(true)}
          >
            <Users className="h-4 w-4" /> Gerenciar Equipe
          </Button>
        </div>

        <Tabs defaultValue="recepcao" className="mt-6">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
            <TabsTrigger value="manutencao">Manutenção</TabsTrigger>
            <TabsTrigger value="recepcao">Recepção</TabsTrigger>
            <TabsTrigger value="camareiras">Camareiras</TabsTrigger>
          </TabsList>

          <TabsContent value="manutencao" className="mt-5">
            <ManutencaoTab year={year} month={month} setYear={setYear} setMonth={setMonth} equipe={equipe} />
          </TabsContent>

          <TabsContent value="recepcao" className="mt-5">
            <RecepcaoTab year={year} month={month} setYear={setYear} setMonth={setMonth} equipe={equipe} />
          </TabsContent>

          <TabsContent value="camareiras" className="mt-5">
            <CamareirasTab year={year} month={month} setYear={setYear} setMonth={setMonth} equipe={equipe} />
          </TabsContent>
        </Tabs>
      </Card>

      <ManageTeamDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        equipe={equipe}
        onUpsert={upsert}
        onRemove={remove}
      />
    </div>
  );
}

/* ============================================================
   Manage Team Dialog (CRUD)
   ============================================================ */
function ManageTeamDialog({
  open,
  onOpenChange,
  equipe,
  onUpsert,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  equipe: Funcionario[];
  onUpsert: (f: Funcionario) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState<Funcionario | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<Setor, Funcionario[]> = { manutencao: [], recepcao: [], camareiras: [] };
    equipe.forEach((f) => g[f.setor].push(f));
    return g;
  }, [equipe]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (f: Funcionario) => {
    setEditing(f);
    setFormOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Gerenciar Equipe
            </DialogTitle>
            <DialogDescription>
              Cadastre, edite ou remova funcionários. As escalas automáticas usam esta lista.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Adicionar Funcionário
            </Button>
          </div>

          <div className="space-y-5 mt-2">
            {(Object.keys(grouped) as Setor[]).map((setor) => (
              <section key={setor} className="space-y-2">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  {setor === "manutencao" && <Wrench className="h-4 w-4" />}
                  {setor === "recepcao" && <Sun className="h-4 w-4" />}
                  {setor === "camareiras" && <BedDouble className="h-4 w-4" />}
                  {SETOR_LABEL[setor]}
                  <span className="text-xs font-normal text-muted-foreground/70">
                    ({grouped[setor].length})
                  </span>
                </h4>
                {grouped[setor].length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-3 py-2 rounded-md border border-dashed">
                    Nenhum funcionário cadastrado neste setor.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {grouped[setor].map((f) => (
                      <li
                        key={f.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2 flex-wrap">
                          <div className="h-8 w-8 shrink-0 rounded-full bg-muted grid place-items-center text-xs font-semibold text-muted-foreground">
                            {f.nome.charAt(0)}
                          </div>
                          <span className="truncate text-sm font-medium">{f.nome}</span>
                          <Badge
                            className={cn(
                              "text-[10px]",
                              f.tipo === "Fixo"
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                : "bg-amber-100 text-amber-800 hover:bg-amber-100",
                            )}
                          >
                            {f.tipo}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {f.unidade}
                          </Badge>
                          {f.turno && (
                            <Badge variant="outline" className="text-[10px] capitalize gap-1">
                              {f.turno === "manha" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                              {f.turno === "manha" ? "Manhã" : "Noite"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEdit(f)}
                            aria-label="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            onClick={() => {
                              onRemove(f.id);
                              toast.success(`${f.nome} removido(a)`);
                            }}
                            aria-label="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <FuncionarioFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        onSave={(f) => {
          onUpsert(f);
          toast.success(editing ? "Funcionário atualizado" : "Funcionário adicionado", {
            description: f.nome,
          });
          setFormOpen(false);
        }}
      />
    </>
  );
}

function FuncionarioFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Funcionario | null;
  onSave: (f: Funcionario) => void;
}) {
  const [nome, setNome] = useState("");
  const [setor, setSetor] = useState<Setor>("recepcao");
  const [unidade, setUnidade] = useState<UnidadeEq>("todas");
  const [tipo, setTipo] = useState<TipoContrato>("Fixo");
  const [turno, setTurno] = useState<TurnoRec>("manha");

  useEffect(() => {
    if (open) {
      setNome(initial?.nome ?? "");
      setSetor(initial?.setor ?? "recepcao");
      setUnidade(initial?.unidade ?? "todas");
      setTipo(initial?.tipo ?? "Fixo");
      setTurno(initial?.turno ?? "manha");
    }
  }, [open, initial]);

  const submit = () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do funcionário");
      return;
    }
    const f: Funcionario = {
      id: initial?.id ?? `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nome: nome.trim(),
      setor,
      unidade,
      tipo,
      ...(setor === "recepcao" ? { turno } : {}),
    };
    onSave(f);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar funcionário" : "Adicionar funcionário"}</DialogTitle>
          <DialogDescription>
            Dados usados na geração automática de escala.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="space-y-2">
            <Label>Setor</Label>
            <Select value={setor} onValueChange={(v) => setSetor(v as Setor)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manutencao">Manutenção</SelectItem>
                <SelectItem value="recepcao">Recepção</SelectItem>
                <SelectItem value="camareiras">Camareiras</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={unidade} onValueChange={(v) => setUnidade(v as UnidadeEq)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ipanema">Ipanema</SelectItem>
                  <SelectItem value="botafogo">Botafogo</SelectItem>
                  <SelectItem value="todas">Todas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de contrato</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoContrato)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Fixo">Fixo</SelectItem>
                  <SelectItem value="Freelance">Freelance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {setor === "recepcao" && (
            <div className="space-y-2">
              <Label>Turno</Label>
              <Select value={turno} onValueChange={(v) => setTurno(v as TurnoRec)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manha">Manhã</SelectItem>
                  <SelectItem value="noite">Noite</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Month switcher & calendar grid
   ============================================================ */
function MonthSwitcher({
  year, month, setYear, setMonth,
}: {
  year: number; month: number; setYear: (v: number) => void; setMonth: (v: number) => void;
}) {
  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} aria-label="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm font-medium">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="truncate">{MONTHS[month]} / {year}</span>
      </div>
      <Button variant="outline" size="icon" onClick={() => changeMonth(1)} aria-label="Próximo mês">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function CalendarGrid({
  year, month, renderDay, onDayDrop,
}: {
  year: number; month: number; renderDay: (day: number, key: string) => React.ReactNode;
  onDayDrop?: (key: string, e: React.DragEvent) => void;
}) {
  const totalDays = daysInMonth(year, month);
  const firstDow = new Date(year, month, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  const [dragOver, setDragOver] = useState<string | null>(null);
  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="grid grid-cols-7 bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="px-2 py-2 text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="min-h-[110px] bg-muted/20 border-t border-l" />;
          const k = keyOf(year, month, d);
          const isOver = dragOver === k;
          return (
            <div
              key={i}
              className={cn(
                "min-h-[110px] border-t border-l p-2 flex flex-col gap-1.5 text-xs transition-colors",
                isOver && "bg-primary/10 ring-2 ring-inset ring-primary/40",
              )}
              onDragOver={onDayDrop ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(k); } : undefined}
              onDragLeave={onDayDrop ? () => setDragOver((cur) => (cur === k ? null : cur)) : undefined}
              onDrop={onDayDrop ? (e) => { e.preventDefault(); setDragOver(null); onDayDrop(k, e); } : undefined}
            >
              <div className="text-[11px] font-semibold text-muted-foreground">{String(d).padStart(2, "0")}</div>
              {renderDay(d, k)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   WhatsApp
   ============================================================ */
function WhatsAppButton({ mesLabel, equipe }: { mesLabel: string; equipe: Funcionario[] }) {
  const buildMessage = () => {
    const manut = equipe.filter((f) => f.setor === "manutencao");
    const recManha = equipe.filter((f) => f.setor === "recepcao" && f.turno === "manha");
    const recNoite = equipe.filter((f) => f.setor === "recepcao" && f.turno === "noite");
    const camIpa = equipe.filter((f) => f.setor === "camareiras" && f.unidade === "ipanema");
    const camBot = equipe.filter((f) => f.setor === "camareiras" && f.unidade === "botafogo");

    const fmt = (list: Funcionario[]) =>
      list.length ? list.map((f) => `- ${f.nome} (${f.tipo})`).join("\n") : "- —";

    return (
      `*Escala INJOY — ${mesLabel}*\n\n` +
      `🔧 Manutenção (6x1):\n${fmt(manut)}\n\n` +
      `🛎️ Recepção:\nManhã (alternado):\n${fmt(recManha)}\nNoite (alternado):\n${fmt(recNoite)}\n\n` +
      `🛏️ Camareiras:\nIpanema:\n${fmt(camIpa)}\nBotafogo:\n${fmt(camBot)}\n\n` +
      `_Enviado automaticamente pelo painel INJOY._`
    );
  };

  const textoCodificado = encodeURIComponent(buildMessage());

  return (
    <a
      href={`https://wa.me/?text=${textoCodificado}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#1ebe57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
    >
      <MessageCircle className="h-4 w-4" /> Enviar via WhatsApp
    </a>
  );
}

/* ============================================================
   Manutenção Tab (6x1)
   ============================================================ */
type DiaManut = { status: "trabalho" | "folga" | "falta"; nome: string; motivo?: string };
type EscalaManut = Record<string, DiaManut>;

function ManutencaoTab({
  year, month, setYear, setMonth, equipe,
}: {
  year: number; month: number; setYear: (v: number) => void; setMonth: (v: number) => void; equipe: Funcionario[];
}) {
  const manutList = equipe.filter((f) => f.setor === "manutencao");
  const substitutos = manutList.map((f) => f.nome);
  const titular = manutList[0]?.nome ?? null;

  const [escala, setEscala] = useState<EscalaManut>({});
  const [editing, setEditing] = useState<{ date: string; dia: DiaManut } | null>(null);

  const gerar = () => {
    if (!titular) {
      toast.error("Cadastre ao menos um funcionário na Manutenção");
      return;
    }
    const totalDays = daysInMonth(year, month);
    const next: EscalaManut = {};
    for (let d = 1; d <= totalDays; d++) {
      const idx = (d - 1) % 7;
      next[keyOf(year, month, d)] = {
        status: idx === 6 ? "folga" : "trabalho",
        nome: titular,
      };
    }
    setEscala(next);
    toast.success("Escala automática gerada", {
      description: `${titular} — 6x1 em ${MONTHS[month]}/${year}.`,
    });
  };

  const salvar = (patch: Partial<DiaManut>) => {
    if (!editing) return;
    setEscala((prev) => ({ ...prev, [editing.date]: { ...editing.dia, ...patch } }));
    toast.success("Plantão atualizado");
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher year={year} month={month} setYear={setYear} setMonth={setMonth} />
        <div className="flex flex-wrap items-center gap-2">
          {titular ? (
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 gap-1">
              <Wrench className="h-3 w-3" /> {titular} — 6x1
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Sem funcionário cadastrado</Badge>
          )}
          <Button onClick={gerar} className="gap-2" disabled={!titular}>
            <Sparkles className="h-4 w-4" /> Gerar Escala Automática
          </Button>
        </div>
      </div>

      <CalendarGrid
        year={year}
        month={month}
        renderDay={(_d, k) => {
          const dia = escala[k];
          if (!dia) return <span className="text-[11px] italic text-muted-foreground/70">—</span>;
          if (dia.status === "folga")
            return (
              <div className="flex items-center justify-center rounded-md border border-dashed bg-muted/40 px-1.5 py-2 text-[11px] font-medium text-muted-foreground">
                Folga
              </div>
            );
          const isFalta = dia.status === "falta";
          return (
            <div
              className={cn(
                "flex items-center justify-between gap-1 rounded-md border px-1.5 py-1 transition-colors",
                isFalta ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200",
              )}
            >
              <div className="flex min-w-0 items-center gap-1">
                <Wrench className={cn("h-3 w-3", isFalta ? "text-rose-600" : "text-emerald-600")} />
                <span className="truncate text-[11px] font-medium">{isFalta ? "Falta" : dia.nome}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditing({ date: k, dia })}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-white hover:text-foreground transition"
                aria-label="Editar dia"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          );
        }}
      />

      <EditManutDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        data={editing}
        substitutos={substitutos}
        onSave={salvar}
      />
    </div>
  );
}

function EditManutDialog({
  open, onOpenChange, data, substitutos, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: { date: string; dia: DiaManut } | null;
  substitutos: string[];
  onSave: (patch: Partial<DiaManut>) => void;
}) {
  const [status, setStatus] = useState<DiaManut["status"]>("trabalho");
  const [motivo, setMotivo] = useState("");
  const [nome, setNome] = useState("");

  useEffect(() => {
    if (data) {
      setStatus(data.dia.status);
      setMotivo(data.dia.motivo ?? "");
      setNome(data.dia.nome);
    }
  }, [data]);

  if (!data) {
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent /></Dialog>;
  }
  const [y, m, d] = data.date.split("-");
  const dataFmt = `${d}/${m}/${y}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar dia — Manutenção</DialogTitle>
          <DialogDescription>Registre faltas, folgas ou substituto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Badge variant="secondary" className="text-sm">
            <CalendarDays className="h-3 w-3 mr-1" /> {dataFmt}
          </Badge>
          <div className="space-y-2">
            <Label>Situação do dia</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as DiaManut["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="trabalho">Trabalho</SelectItem>
                <SelectItem value="folga">Folga</SelectItem>
                <SelectItem value="falta">Falta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {status === "trabalho" && substitutos.length > 1 && (
            <div className="space-y-2">
              <Label>Funcionário</Label>
              <Select value={nome} onValueChange={setNome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {substitutos.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: atestado, troca de folga..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave({ status, motivo, nome })}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Recepção Tab
   ============================================================ */
function ConfirmDropDialog({
  open, onOpenChange, onSwap, onRecalc,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSwap: () => void;
  onRecalc: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Como deseja aplicar esta alteração na escala?</DialogTitle>
          <DialogDescription>
            Escolha entre trocar apenas os dois dias envolvidos ou recalcular
            o restante do mês, mantendo a regra de “dia sim, dia não”.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onSwap}>
            Trocar apenas estes dias
          </Button>
          <Button onClick={onRecalc}>
            Recalcular o restante do mês
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecepcaoTab({
  year, month, setYear, setMonth, equipe,
}: {
  year: number; month: number; setYear: (v: number) => void; setMonth: (v: number) => void; equipe: Funcionario[];
}) {
  const manhaList = equipe.filter((f) => f.setor === "recepcao" && f.turno === "manha").map((f) => f.nome);
  const noiteList = equipe.filter((f) => f.setor === "recepcao" && f.turno === "noite").map((f) => f.nome);

  const [escala, setEscala] = useState<Escala>({});
  const [editing, setEditing] = useState<{ date: string; turno: Turno; current: string } | null>(null);

  const gerar = () => {
    if (manhaList.length < 1 || noiteList.length < 1) {
      toast.error("Cadastre funcionários de manhã e noite na Recepção");
      return;
    }
    const totalDays = daysInMonth(year, month);
    const next: Escala = {};
    for (let d = 1; d <= totalDays; d++) {
      const k = keyOf(year, month, d);
      next[k] = {
        manha: manhaList[(d - 1) % manhaList.length],
        noite: noiteList[(d - 1) % noiteList.length],
      };
    }
    setEscala(next);
    toast.success("Escala automática gerada", {
      description: `Turnos alternados para ${MONTHS[month]}/${year}.`,
    });
  };

  const salvarEdicao = (nome: string, motivo: string) => {
    if (!editing) return;
    setEscala((prev) => ({
      ...prev,
      [editing.date]: {
        ...(prev[editing.date] ?? { manha: "", noite: "" }),
        [editing.turno]: nome,
      },
    }));
    toast.success("Plantão atualizado", { description: motivo || undefined });
    setEditing(null);
  };

  const [pendingDrop, setPendingDrop] = useState<
    { srcDate: string; dstDate: string; turno: Turno } | null
  >(null);

  const handleDayDrop = (dstDate: string, e: React.DragEvent) => {
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    let payload: { kind: string; date: string; turno: Turno } | null = null;
    try { payload = JSON.parse(raw); } catch { return; }
    if (!payload || payload.kind !== "rec") return;
    if (payload.date === dstDate) return;
    setPendingDrop({ srcDate: payload.date, dstDate, turno: payload.turno });
  };

  const applySwap = () => {
    if (!pendingDrop) return;
    const { srcDate, dstDate, turno } = pendingDrop;
    setEscala((prev) => {
      const src = prev[srcDate] ?? { manha: "", noite: "" };
      const dst = prev[dstDate] ?? { manha: "", noite: "" };
      const srcName = src[turno];
      if (!srcName) return prev;
      return {
        ...prev,
        [srcDate]: { ...src, [turno]: dst[turno] },
        [dstDate]: { ...dst, [turno]: srcName },
      };
    });
    toast.success("Plantão movido", {
      description: `Turno da ${pendingDrop.turno === "manha" ? "manhã" : "noite"} — troca aplicada.`,
    });
    setPendingDrop(null);
  };

  const applyRecalc = () => {
    if (!pendingDrop) return;
    const { srcDate, dstDate, turno } = pendingDrop;
    const list = turno === "manha" ? manhaList : noiteList;
    setEscala((prev) => {
      const src = prev[srcDate] ?? { manha: "", noite: "" };
      const srcName = src[turno];
      if (!srcName) return prev;
      const otherName = list.find((n) => n !== srcName) ?? srcName;
      const dstDay = parseInt(dstDate.slice(-2), 10);
      const totalDays = daysInMonth(year, month);
      const next = { ...prev };
      for (let d = dstDay; d <= totalDays; d++) {
        const k = keyOf(year, month, d);
        const offset = d - dstDay;
        const name = offset % 2 === 0 ? srcName : otherName;
        const cur = next[k] ?? { manha: "", noite: "" };
        next[k] = { ...cur, [turno]: name };
      }
      return next;
    });
    toast.success("Escala recalculada", {
      description: `Regra dia sim, dia não aplicada a partir de ${dstDate.slice(-2)} até o fim do mês.`,
    });
    setPendingDrop(null);
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher year={year} month={month} setYear={setYear} setMonth={setMonth} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1">
            <Sun className="h-3 w-3" /> Manhã ({manhaList.length})
          </Badge>
          <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100 gap-1">
            <Moon className="h-3 w-3" /> Noite ({noiteList.length})
          </Badge>
          <Button onClick={gerar} className="gap-2">
            <Sparkles className="h-4 w-4" /> Gerar Escala Automática
          </Button>
        </div>
      </div>

      <CalendarGrid
        year={year}
        month={month}
        onDayDrop={handleDayDrop}
        renderDay={(_d, k) => {
          const dia = escala[k];
          if (!dia) return <span className="text-[11px] italic text-muted-foreground/70">—</span>;
          const makeDrag = (turno: Turno) => (e: React.DragEvent) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("application/json", JSON.stringify({ kind: "rec", date: k, turno }));
          };
          return (
            <>
              <PlantaoRow
                icon={<Sun className="h-3 w-3 text-amber-600" />}
                nome={dia.manha}
                onEdit={() => setEditing({ date: k, turno: "manha", current: dia.manha })}
                tone="bg-amber-50 border-amber-200"
                onDragStart={dia.manha ? makeDrag("manha") : undefined}
              />
              <PlantaoRow
                icon={<Moon className="h-3 w-3 text-indigo-600" />}
                nome={dia.noite}
                onEdit={() => setEditing({ date: k, turno: "noite", current: dia.noite })}
                tone="bg-indigo-50 border-indigo-200"
                onDragStart={dia.noite ? makeDrag("noite") : undefined}
              />
            </>
          );
        }}
      />

      <EditPlantaoDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        data={editing}
        options={editing?.turno === "manha" ? manhaList : noiteList}
        onSave={salvarEdicao}
      />

      <ConfirmDropDialog
        open={!!pendingDrop}
        onOpenChange={(v) => !v && setPendingDrop(null)}
        onSwap={applySwap}
        onRecalc={applyRecalc}
      />
    </div>
  );
}

function PlantaoRow({
  icon, nome, onEdit, tone, onDragStart,
}: {
  icon: React.ReactNode; nome: string; onEdit: () => void; tone: string;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const draggable = !!onDragStart && !!nome;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-1 rounded-md border px-1.5 py-1 transition-all",
        tone,
        draggable && "cursor-grab active:cursor-grabbing hover:shadow-sm hover:-translate-y-[1px]",
      )}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="flex min-w-0 items-center gap-1">
        {icon}
        <span className="truncate text-[11px] font-medium">{nome}</span>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-white hover:text-foreground transition"
        aria-label="Editar plantão"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

function EditPlantaoDialog({
  open, onOpenChange, data, options, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: { date: string; turno: Turno; current: string } | null;
  options: string[];
  onSave: (nome: string, motivo: string) => void;
}) {
  const [nome, setNome] = useState<string>("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (data) { setNome(data.current); setMotivo(""); }
  }, [data]);

  if (!data) {
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent /></Dialog>;
  }
  const [y, m, d] = data.date.split("-");
  const dataFmt = `${d}/${m}/${y}`;
  const turnoLabel = data.turno === "manha" ? "Manhã" : "Noite";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar plantão</DialogTitle>
          <DialogDescription>Selecione um substituto para a data e turno abaixo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-sm">
              <CalendarDays className="h-3 w-3 mr-1" /> {dataFmt}
            </Badge>
            <Badge
              className={cn(
                "text-sm",
                data.turno === "manha"
                  ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                  : "bg-indigo-100 text-indigo-800 hover:bg-indigo-100",
              )}
            >
              {data.turno === "manha" ? <Sun className="h-3 w-3 mr-1" /> : <Moon className="h-3 w-3 mr-1" />}
              {turnoLabel}
            </Badge>
          </div>

          <div className="space-y-2">
            <Label>Funcionário</Label>
            <Select value={nome} onValueChange={setNome}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {options.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum funcionário disponível</div>
                ) : options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Motivo da alteração (opcional)</Label>
            <Textarea
              placeholder="Ex.: folga, atestado, troca de turno..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave(nome, motivo)} disabled={!nome}>Salvar alteração</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Camareiras Tab
   ============================================================ */
type CamTipo = "Fixa" | "Freelance";
type UnidadeCam = "ipanema" | "botafogo";
type DiaCam = { nome: string; tipo: CamTipo } | null;
type EscalaCam = Record<
  UnidadeCam,
  Record<string, { titular: DiaCam; extras: { nome: string; tipo: CamTipo }[] }>
>;

const contratoToCam = (t: TipoContrato): CamTipo => (t === "Fixo" ? "Fixa" : "Freelance");

function CamareirasTab({
  year, month, setYear, setMonth, equipe,
}: {
  year: number; month: number; setYear: (v: number) => void; setMonth: (v: number) => void; equipe: Funcionario[];
}) {
  const camAll = equipe.filter((f) => f.setor === "camareiras");
  const byUnidade = (u: UnidadeCam) => camAll.filter((f) => f.unidade === u);
  const fixasOf = (u: UnidadeCam) => byUnidade(u).filter((f) => f.tipo === "Fixo");
  const freeOf = (u: UnidadeCam) => byUnidade(u).filter((f) => f.tipo === "Freelance");

  const [escala, setEscala] = useState<EscalaCam>({ ipanema: {}, botafogo: {} });
  const [editing, setEditing] = useState<{ unidade: UnidadeCam; date: string; current: DiaCam } | null>(null);
  const [addingFree, setAddingFree] = useState<{ unidade: UnidadeCam; date: string } | null>(null);

  const gerar = () => {
    const ipaFixas = fixasOf("ipanema");
    const botFixas = fixasOf("botafogo");
    if (ipaFixas.length === 0 && botFixas.length === 0) {
      toast.error("Cadastre camareiras fixas para gerar a escala");
      return;
    }
    const totalDays = daysInMonth(year, month);
    const next: EscalaCam = { ipanema: {}, botafogo: {} };
    for (let d = 1; d <= totalDays; d++) {
      const k = keyOf(year, month, d);
      // Ipanema: primeira fixa em 6x1
      const ipaTit = ipaFixas[0];
      const idx6x1 = (d - 1) % 7;
      next.ipanema[k] = {
        titular: ipaTit && idx6x1 !== 6 ? { nome: ipaTit.nome, tipo: "Fixa" } : null,
        extras: [],
      };
      // Botafogo: alternância diária entre fixas
      const botTit = botFixas.length > 0 ? botFixas[(d - 1) % botFixas.length] : null;
      next.botafogo[k] = {
        titular: botTit ? { nome: botTit.nome, tipo: "Fixa" } : null,
        extras: [],
      };
    }
    setEscala(next);
    toast.success("Escala de camareiras gerada", {
      description: `${MONTHS[month]}/${year} — Ipanema (6x1) e Botafogo (12x24).`,
    });
  };

  const salvarEdicao = (unidade: UnidadeCam, nome: string, tipo: CamTipo, motivo: string) => {
    if (!editing) return;
    setEscala((prev) => {
      const uni = prev[unidade];
      const cur = uni[editing.date] ?? { titular: null, extras: [] };
      return {
        ...prev,
        [unidade]: { ...uni, [editing.date]: { ...cur, titular: { nome, tipo } } },
      };
    });
    toast.success("Camareira atualizada", { description: motivo || undefined });
    setEditing(null);
  };

  const adicionarFree = (nome: string) => {
    if (!addingFree) return;
    setEscala((prev) => {
      const uni = prev[addingFree.unidade];
      const cur = uni[addingFree.date] ?? { titular: null, extras: [] };
      return {
        ...prev,
        [addingFree.unidade]: {
          ...uni,
          [addingFree.date]: { ...cur, extras: [...cur.extras, { nome, tipo: "Freelance" }] },
        },
      };
    });
    toast.success("Plantão de freelancer adicionado", { description: nome });
    setAddingFree(null);
  };

  const handleCamDrop = (unidade: UnidadeCam) => (dstDate: string, e: React.DragEvent) => {
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    let payload: { kind: string; unidade: UnidadeCam; date: string } | null = null;
    try { payload = JSON.parse(raw); } catch { return; }
    if (!payload || payload.kind !== "cam") return;
    if (payload.unidade !== unidade) {
      toast.error("Não é possível mover entre unidades diferentes");
      return;
    }
    const srcDate = payload.date;
    if (srcDate === dstDate) return;
    setEscala((prev) => {
      const uni = prev[unidade];
      const src = uni[srcDate] ?? { titular: null, extras: [] };
      const dst = uni[dstDate] ?? { titular: null, extras: [] };
      if (!src.titular) return prev;
      return {
        ...prev,
        [unidade]: {
          ...uni,
          [srcDate]: { ...src, titular: dst.titular },
          [dstDate]: { ...dst, titular: src.titular },
        },
      };
    });
    toast.success("Camareira movida", { description: "Troca aplicada entre os dias." });
  };


  const editingUnidade = editing?.unidade;
  const editingOptions = editingUnidade
    ? byUnidade(editingUnidade).map((f) => ({ nome: f.nome, tipo: contratoToCam(f.tipo) }))
    : [];
  const addingOptions = addingFree ? freeOf(addingFree.unidade).map((f) => f.nome) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher year={year} month={month} setYear={setYear} setMonth={setMonth} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Fixa</Badge>
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Freelance</Badge>
          <Button onClick={gerar} className="gap-2">
            <Sparkles className="h-4 w-4" /> Gerar Escala Automática
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UnidadeColuna titulo="Unidade Ipanema" camareiras={byUnidade("ipanema")} cor="from-rose-500/15 to-rose-500/0 border-rose-500/30" />
        <UnidadeColuna titulo="Unidade Botafogo" camareiras={byUnidade("botafogo")} cor="from-sky-500/15 to-sky-500/0 border-sky-500/30" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <UnidadeCalendario
          titulo="Ipanema"
          unidade="ipanema"
          year={year}
          month={month}
          escala={escala.ipanema}
          onEdit={(date, current) => setEditing({ unidade: "ipanema", date, current })}
          onAdd={(date) => setAddingFree({ unidade: "ipanema", date })}
          onDayDrop={handleCamDrop("ipanema")}
        />
        <UnidadeCalendario
          titulo="Botafogo"
          unidade="botafogo"
          year={year}
          month={month}
          escala={escala.botafogo}
          onEdit={(date, current) => setEditing({ unidade: "botafogo", date, current })}
          onAdd={(date) => setAddingFree({ unidade: "botafogo", date })}
          onDayDrop={handleCamDrop("botafogo")}
        />
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar camareira</DialogTitle>
            <DialogDescription>Substitua a titular do dia (ex.: falta, imprevisto).</DialogDescription>
          </DialogHeader>
          {editing && (
            <EditCamForm
              date={editing.date}
              current={editing.current}
              options={editingOptions}
              onCancel={() => setEditing(null)}
              onSave={(nome, tipo, motivo) => salvarEdicao(editing.unidade, nome, tipo, motivo)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!addingFree} onOpenChange={(v) => !v && setAddingFree(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar plantão</DialogTitle>
            <DialogDescription>Aloque uma freelancer para cobrir o dia.</DialogDescription>
          </DialogHeader>
          {addingFree && (
            <AddFreeForm
              date={addingFree.date}
              options={addingOptions}
              onCancel={() => setAddingFree(null)}
              onSave={adicionarFree}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UnidadeCalendario({
  titulo, unidade, year, month, escala, onEdit, onAdd, onDayDrop,
}: {
  titulo: string;
  unidade: UnidadeCam;
  year: number;
  month: number;
  escala: Record<string, { titular: DiaCam; extras: { nome: string; tipo: CamTipo }[] }>;
  onEdit: (date: string, current: DiaCam) => void;
  onAdd: (date: string) => void;
  onDayDrop?: (key: string, e: React.DragEvent) => void;
}) {
  const tone = unidade === "ipanema"
    ? "from-rose-500/10 to-transparent border-rose-500/30"
    : "from-sky-500/10 to-transparent border-sky-500/30";
  return (
    <Card className={cn("p-3 bg-gradient-to-br border", tone)}>
      <div className="mb-3 flex items-center gap-2">
        <BedDouble className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold uppercase tracking-wide">{titulo}</h3>
      </div>
      <CalendarGrid
        year={year}
        month={month}
        onDayDrop={onDayDrop}
        renderDay={(_d, k) => {
          const dia = escala[k];
          if (!dia) return <span className="text-[11px] italic text-muted-foreground/70">—</span>;
          const makeDrag = () => (e: React.DragEvent) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("application/json", JSON.stringify({ kind: "cam", unidade, date: k }));
          };
          return (
            <>
              {dia.titular ? (
                <CamRow cam={dia.titular} onEdit={() => onEdit(k, dia.titular)} onDragStart={makeDrag()} />
              ) : (
                <div className="flex items-center justify-center rounded-md border border-dashed bg-muted/40 px-1.5 py-1 text-[11px] font-medium text-muted-foreground">
                  Folga
                </div>
              )}
              {dia.extras.map((e, i) => (
                <CamRow key={`${e.nome}-${i}`} cam={e} onEdit={() => onEdit(k, e)} />
              ))}
              <button
                type="button"
                onClick={() => onAdd(k)}
                className="flex items-center justify-center gap-1 rounded-md border border-dashed px-1.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition"
              >
                <Plus className="h-3 w-3" /> Plantão
              </button>
            </>
          );
        }}
      />
    </Card>
  );
}

function CamRow({
  cam, onEdit, onDragStart,
}: {
  cam: { nome: string; tipo: CamTipo };
  onEdit: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const tone = cam.tipo === "Fixa" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200";
  const draggable = !!onDragStart;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-1 rounded-md border px-1.5 py-1 transition-all",
        tone,
        draggable && "cursor-grab active:cursor-grabbing hover:shadow-sm hover:-translate-y-[1px]",
      )}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate text-[11px] font-medium">{cam.nome}</span>
        <Badge
          className={cn(
            "text-[9px] px-1 py-0",
            cam.tipo === "Fixa"
              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
              : "bg-amber-100 text-amber-800 hover:bg-amber-100",
          )}
        >
          {cam.tipo}
        </Badge>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-white hover:text-foreground transition"
        aria-label="Editar camareira"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

function EditCamForm({
  date, current, options, onCancel, onSave,
}: {
  date: string;
  current: DiaCam;
  options: { nome: string; tipo: CamTipo }[];
  onCancel: () => void;
  onSave: (nome: string, tipo: CamTipo, motivo: string) => void;
}) {
  const [nome, setNome] = useState(current?.nome ?? "");
  const [motivo, setMotivo] = useState("");
  const [y, m, d] = date.split("-");
  const getTipo = (n: string): CamTipo => options.find((o) => o.nome === n)?.tipo ?? "Fixa";
  return (
    <>
      <div className="space-y-4">
        <Badge variant="secondary" className="text-sm">
          <CalendarDays className="h-3 w-3 mr-1" /> {d}/{m}/{y}
        </Badge>
        <div className="space-y-2">
          <Label>Camareira</Label>
          <Select value={nome} onValueChange={setNome}>
            <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma disponível</div>
              ) : options.map((o) => (
                <SelectItem key={o.nome} value={o.nome}>{o.nome} — {o.tipo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Motivo (opcional)</Label>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: falta da titular, cobertura..." />
        </div>
      </div>
      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button disabled={!nome} onClick={() => onSave(nome, getTipo(nome), motivo)}>Salvar</Button>
      </DialogFooter>
    </>
  );
}

function AddFreeForm({
  date, options, onCancel, onSave,
}: {
  date: string;
  options: string[];
  onCancel: () => void;
  onSave: (nome: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [y, m, d] = date.split("-");
  return (
    <>
      <div className="space-y-4">
        <Badge variant="secondary" className="text-sm">
          <CalendarDays className="h-3 w-3 mr-1" /> {d}/{m}/{y}
        </Badge>
        <div className="space-y-2">
          <Label>Freelancer</Label>
          <Select value={nome} onValueChange={setNome}>
            <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma freelancer cadastrada</div>
              ) : options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button disabled={!nome} onClick={() => onSave(nome)}>Adicionar</Button>
      </DialogFooter>
    </>
  );
}

function UnidadeColuna({
  titulo, cor, camareiras,
}: {
  titulo: string; cor: string; camareiras: Funcionario[];
}) {
  return (
    <Card className={cn("p-4 bg-gradient-to-br border", cor)}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground mb-3">{titulo}</h3>
      {camareiras.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Nenhuma camareira cadastrada.</p>
      ) : (
        <ul className="space-y-2">
          {camareiras.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/80 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-8 w-8 shrink-0 rounded-full bg-muted grid place-items-center text-xs font-semibold text-muted-foreground">
                  {c.nome.charAt(0)}
                </div>
                <span className="truncate text-sm font-medium">{c.nome}</span>
                <Badge
                  className={cn(
                    "text-[10px]",
                    c.tipo === "Fixo"
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                      : "bg-amber-100 text-amber-800 hover:bg-amber-100",
                  )}
                >
                  {c.tipo === "Fixo" ? "Fixa" : "Freelance"}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
