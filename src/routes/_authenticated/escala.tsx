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
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

// ---------- Data ----------
const RECEPCAO_MANHA = ["Mayara Fagundes", "Júlia Cristine"];
const RECEPCAO_NOITE = ["Lucivaldo", "Mathaus Ramos"];

const MANUTENCAO_FIXO = "CRISTIANO";

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

// ---------- Page ----------
function EscalaPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

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
          <WhatsAppButton mesLabel={label} />
        </div>

        <Tabs defaultValue="recepcao" className="mt-6">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
            <TabsTrigger value="manutencao">Manutenção</TabsTrigger>
            <TabsTrigger value="recepcao">Recepção</TabsTrigger>
            <TabsTrigger value="camareiras">Camareiras</TabsTrigger>
          </TabsList>

          <TabsContent value="manutencao" className="mt-5">
            <ManutencaoTab
              year={year}
              month={month}
              setYear={setYear}
              setMonth={setMonth}
            />
          </TabsContent>

          <TabsContent value="recepcao" className="mt-5">
            <RecepcaoTab
              year={year}
              month={month}
              setYear={setYear}
              setMonth={setMonth}
            />
          </TabsContent>

          <TabsContent value="camareiras" className="mt-5">
            <CamareirasTab
              year={year}
              month={month}
              setYear={setYear}
              setMonth={setMonth}
            />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

// ---------- Shared: month switcher ----------
function MonthSwitcher({
  year,
  month,
  setYear,
  setMonth,
}: {
  year: number;
  month: number;
  setYear: (v: number) => void;
  setMonth: (v: number) => void;
}) {
  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m);
    setYear(y);
  };
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => changeMonth(-1)}
        aria-label="Mês anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm font-medium">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="truncate">
          {MONTHS[month]} / {year}
        </span>
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={() => changeMonth(1)}
        aria-label="Próximo mês"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function CalendarGrid({
  year,
  month,
  renderDay,
}: {
  year: number;
  month: number;
  renderDay: (day: number, key: string) => React.ReactNode;
}) {
  const totalDays = daysInMonth(year, month);
  const firstDow = new Date(year, month, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="grid grid-cols-7 bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (d === null) {
            return (
              <div
                key={i}
                className="min-h-[110px] bg-muted/20 border-t border-l"
              />
            );
          }
          const k = keyOf(year, month, d);
          return (
            <div
              key={i}
              className="min-h-[110px] border-t border-l p-2 flex flex-col gap-1.5 text-xs"
            >
              <div className="text-[11px] font-semibold text-muted-foreground">
                {String(d).padStart(2, "0")}
              </div>
              {renderDay(d, k)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- WhatsApp ----------
function WhatsAppButton({ mesLabel }: { mesLabel: string }) {
  const [open, setOpen] = useState(false);
  const preview = useMemo(
    () =>
      `*Escala INJOY — ${mesLabel}*\n\n` +
      `🔧 *Manutenção*\n- CRISTIANO (escala 6x1)\n\n` +
      `🛎️ *Recepção*\n- Manhã: Mayara / Júlia (alternado)\n- Noite: Lucivaldo / Mathaus (alternado)\n\n` +
      `🛏️ *Camareiras*\n- Ipanema: MARIA (Fixa 6x1), CRISTINA (Freelance)\n- Botafogo: GLEIDIANE / RAQUEL (12x24 alternado), LUCIENE (Freelance)\n\n` +
      `_Enviado automaticamente pelo painel INJOY._`,
    [mesLabel],
  );

  return (
    <>
      <Button
        className="gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white"
        onClick={() => setOpen(true)}
      >
        <MessageCircle className="h-4 w-4" /> Enviar via WhatsApp
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Prévia do envio — WhatsApp</DialogTitle>
            <DialogDescription>
              Confira a mensagem antes de compartilhar com a equipe.
            </DialogDescription>
          </DialogHeader>
          <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed font-sans max-h-80 overflow-auto">
            {preview}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-[#25D366] hover:bg-[#1ebe57] text-white gap-2"
              onClick={() => {
                const url = `https://wa.me/?text=${encodeURIComponent(preview)}`;
                window.open(url, "_blank");
                setOpen(false);
              }}
            >
              <MessageCircle className="h-4 w-4" /> Compartilhar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- Manutenção Tab (6x1) ----------
type DiaManut = { status: "trabalho" | "folga" | "falta"; nome: string; motivo?: string };
type EscalaManut = Record<string, DiaManut>;

function ManutencaoTab({
  year,
  month,
  setYear,
  setMonth,
}: {
  year: number;
  month: number;
  setYear: (v: number) => void;
  setMonth: (v: number) => void;
}) {
  const [escala, setEscala] = useState<EscalaManut>({});
  const [editing, setEditing] = useState<{ date: string; dia: DiaManut } | null>(null);

  const gerar = () => {
    const totalDays = daysInMonth(year, month);
    const next: EscalaManut = {};
    // 6x1: work 6 days, off 1, restart. Start cycle at day 1.
    for (let d = 1; d <= totalDays; d++) {
      const idx = (d - 1) % 7;
      next[keyOf(year, month, d)] = {
        status: idx === 6 ? "folga" : "trabalho",
        nome: MANUTENCAO_FIXO,
      };
    }
    setEscala(next);
    toast.success("Escala automática gerada", {
      description: `${MANUTENCAO_FIXO} — 6x1 em ${MONTHS[month]}/${year}.`,
    });
  };

  const salvar = (patch: Partial<DiaManut>) => {
    if (!editing) return;
    setEscala((prev) => ({
      ...prev,
      [editing.date]: { ...editing.dia, ...patch },
    }));
    toast.success("Plantão atualizado");
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher
          year={year}
          month={month}
          setYear={setYear}
          setMonth={setMonth}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 gap-1">
            <Wrench className="h-3 w-3" /> {MANUTENCAO_FIXO} — 6x1
          </Badge>
          <Button onClick={gerar} className="gap-2">
            <Sparkles className="h-4 w-4" /> Gerar Escala Automática
          </Button>
        </div>
      </div>

      <CalendarGrid
        year={year}
        month={month}
        renderDay={(_d, k) => {
          const dia = escala[k];
          if (!dia)
            return (
              <span className="text-[11px] italic text-muted-foreground/70">—</span>
            );
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
                isFalta
                  ? "bg-rose-50 border-rose-200"
                  : "bg-emerald-50 border-emerald-200",
              )}
            >
              <div className="flex min-w-0 items-center gap-1">
                <Wrench
                  className={cn(
                    "h-3 w-3",
                    isFalta ? "text-rose-600" : "text-emerald-600",
                  )}
                />
                <span className="truncate text-[11px] font-medium">
                  {isFalta ? "Falta" : dia.nome}
                </span>
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
        onSave={salvar}
      />
    </div>
  );
}

function EditManutDialog({
  open,
  onOpenChange,
  data,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: { date: string; dia: DiaManut } | null;
  onSave: (patch: Partial<DiaManut>) => void;
}) {
  const [status, setStatus] = useState<DiaManut["status"]>("trabalho");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (data) {
      setStatus(data.dia.status);
      setMotivo(data.dia.motivo ?? "");
    }
  }, [data]);

  if (!data) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const [y, m, d] = data.date.split("-");
  const dataFmt = `${d}/${m}/${y}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar dia — Manutenção</DialogTitle>
          <DialogDescription>
            Registre faltas ou altere o dia de folga de {MANUTENCAO_FIXO}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Badge variant="secondary" className="text-sm">
            <CalendarDays className="h-3 w-3 mr-1" /> {dataFmt}
          </Badge>
          <div className="space-y-2">
            <Label>Situação do dia</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as DiaManut["status"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trabalho">Trabalho</SelectItem>
                <SelectItem value="folga">Folga</SelectItem>
                <SelectItem value="falta">Falta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: atestado, troca de folga..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onSave({ status, motivo })}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Recepção Tab ----------
function RecepcaoTab({
  year,
  month,
  setYear,
  setMonth,
}: {
  year: number;
  month: number;
  setYear: (v: number) => void;
  setMonth: (v: number) => void;
}) {
  const [escala, setEscala] = useState<Escala>({});
  const [editing, setEditing] = useState<
    | { date: string; turno: Turno; current: string }
    | null
  >(null);

  const totalDays = daysInMonth(year, month);

  const gerar = () => {
    const next: Escala = {};
    for (let d = 1; d <= totalDays; d++) {
      const k = keyOf(year, month, d);
      next[k] = {
        manha: RECEPCAO_MANHA[(d - 1) % 2],
        noite: RECEPCAO_NOITE[(d - 1) % 2],
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
    toast.success("Plantão atualizado", {
      description: motivo ? `Motivo: ${motivo}` : undefined,
    });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher
          year={year}
          month={month}
          setYear={setYear}
          setMonth={setMonth}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1">
            <Sun className="h-3 w-3" /> Manhã
          </Badge>
          <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100 gap-1">
            <Moon className="h-3 w-3" /> Noite
          </Badge>
          <Button onClick={gerar} className="gap-2">
            <Sparkles className="h-4 w-4" /> Gerar Escala Automática
          </Button>
        </div>
      </div>

      <CalendarGrid
        year={year}
        month={month}
        renderDay={(_d, k) => {
          const dia = escala[k];
          if (!dia)
            return (
              <span className="text-[11px] italic text-muted-foreground/70">—</span>
            );
          return (
            <>
              <PlantaoRow
                icon={<Sun className="h-3 w-3 text-amber-600" />}
                nome={dia.manha}
                onEdit={() =>
                  setEditing({ date: k, turno: "manha", current: dia.manha })
                }
                tone="bg-amber-50 border-amber-200"
              />
              <PlantaoRow
                icon={<Moon className="h-3 w-3 text-indigo-600" />}
                nome={dia.noite}
                onEdit={() =>
                  setEditing({ date: k, turno: "noite", current: dia.noite })
                }
                tone="bg-indigo-50 border-indigo-200"
              />
            </>
          );
        }}
      />

      <EditPlantaoDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        data={editing}
        options={editing?.turno === "manha" ? RECEPCAO_MANHA : RECEPCAO_NOITE}
        onSave={salvarEdicao}
      />
    </div>
  );
}

function PlantaoRow({
  icon,
  nome,
  onEdit,
  tone,
}: {
  icon: React.ReactNode;
  nome: string;
  onEdit: () => void;
  tone: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-1 rounded-md border px-1.5 py-1 transition-colors",
        tone,
      )}
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
  open,
  onOpenChange,
  data,
  options,
  onSave,
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
    if (data) {
      setNome(data.current);
      setMotivo("");
    }
  }, [data]);

  if (!data) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const [y, m, d] = data.date.split("-");
  const dataFmt = `${d}/${m}/${y}`;
  const turnoLabel = data.turno === "manha" ? "Manhã" : "Noite";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar plantão</DialogTitle>
          <DialogDescription>
            Selecione um substituto para a data e turno abaixo.
          </DialogDescription>
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
              {data.turno === "manha" ? (
                <Sun className="h-3 w-3 mr-1" />
              ) : (
                <Moon className="h-3 w-3 mr-1" />
              )}
              {turnoLabel}
            </Badge>
          </div>

          <div className="space-y-2">
            <Label>Funcionário</Label>
            <Select value={nome} onValueChange={setNome}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onSave(nome, motivo)} disabled={!nome}>
            Salvar alteração
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Camareiras Tab ----------
type CamTipo = "Fixa" | "Freelance";
type Camareira = { nome: string; tipo: CamTipo };
type Unidade = "ipanema" | "botafogo";

const IPANEMA_FIXAS = ["MARIA"];
const IPANEMA_FREE = ["CRISTINA"];
const BOTAFOGO_FIXAS = ["GLEIDIANE MENDES", "RAQUEL"];
const BOTAFOGO_FREE = ["LUCIENE CERQUEIRA"];

const IPANEMA: Camareira[] = [
  { nome: "MARIA", tipo: "Fixa" },
  { nome: "CRISTINA", tipo: "Freelance" },
];
const BOTAFOGO: Camareira[] = [
  { nome: "GLEIDIANE MENDES", tipo: "Fixa" },
  { nome: "RAQUEL", tipo: "Fixa" },
  { nome: "LUCIENE CERQUEIRA", tipo: "Freelance" },
];

type DiaCam = { nome: string; tipo: CamTipo } | null;
type EscalaCam = Record<
  Unidade,
  Record<string, { titular: DiaCam; extras: { nome: string; tipo: CamTipo }[] }>
>;

function CamareirasTab({
  year,
  month,
  setYear,
  setMonth,
}: {
  year: number;
  month: number;
  setYear: (v: number) => void;
  setMonth: (v: number) => void;
}) {
  const [escala, setEscala] = useState<EscalaCam>({ ipanema: {}, botafogo: {} });
  const [editing, setEditing] = useState<
    | { unidade: Unidade; date: string; current: DiaCam }
    | null
  >(null);
  const [addingFree, setAddingFree] = useState<
    | { unidade: Unidade; date: string }
    | null
  >(null);

  const gerar = () => {
    const totalDays = daysInMonth(year, month);
    const next: EscalaCam = { ipanema: {}, botafogo: {} };
    for (let d = 1; d <= totalDays; d++) {
      const k = keyOf(year, month, d);
      // Ipanema: MARIA 6x1
      const idx6x1 = (d - 1) % 7;
      next.ipanema[k] = {
        titular:
          idx6x1 === 6 ? null : { nome: "MARIA", tipo: "Fixa" },
        extras: [],
      };
      // Botafogo: GLEIDIANE / RAQUEL alternado
      next.botafogo[k] = {
        titular: {
          nome: BOTAFOGO_FIXAS[(d - 1) % 2],
          tipo: "Fixa",
        },
        extras: [],
      };
    }
    setEscala(next);
    toast.success("Escala de camareiras gerada", {
      description: `${MONTHS[month]}/${year} — Ipanema (6x1) e Botafogo (12x24).`,
    });
  };

  const salvarEdicao = (nome: string, tipo: CamTipo, motivo: string) => {
    if (!editing) return;
    setEscala((prev) => {
      const uni = prev[editing.unidade];
      const cur = uni[editing.date] ?? { titular: null, extras: [] };
      return {
        ...prev,
        [editing.unidade]: {
          ...uni,
          [editing.date]: { ...cur, titular: { nome, tipo } },
        },
      };
    });
    toast.success("Camareira atualizada", {
      description: motivo || undefined,
    });
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
          [addingFree.date]: {
            ...cur,
            extras: [...cur.extras, { nome, tipo: "Freelance" }],
          },
        },
      };
    });
    toast.success("Plantão de freelancer adicionado", {
      description: nome,
    });
    setAddingFree(null);
  };

  const editingOptions =
    editing?.unidade === "ipanema"
      ? [...IPANEMA_FIXAS, ...IPANEMA_FREE]
      : [...BOTAFOGO_FIXAS, ...BOTAFOGO_FREE];
  const editingTipo = (nome: string): CamTipo => {
    const free =
      editing?.unidade === "ipanema" ? IPANEMA_FREE : BOTAFOGO_FREE;
    return free.includes(nome) ? "Freelance" : "Fixa";
  };
  const addingOptions =
    addingFree?.unidade === "ipanema" ? IPANEMA_FREE : BOTAFOGO_FREE;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher
          year={year}
          month={month}
          setYear={setYear}
          setMonth={setMonth}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            Fixa
          </Badge>
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            Freelance
          </Badge>
          <Button onClick={gerar} className="gap-2">
            <Sparkles className="h-4 w-4" /> Gerar Escala Automática
          </Button>
        </div>
      </div>

      {/* Team legend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UnidadeColuna titulo="Unidade Ipanema" camareiras={IPANEMA} cor="from-rose-500/15 to-rose-500/0 border-rose-500/30" />
        <UnidadeColuna titulo="Unidade Botafogo" camareiras={BOTAFOGO} cor="from-sky-500/15 to-sky-500/0 border-sky-500/30" />
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
        />
        <UnidadeCalendario
          titulo="Botafogo"
          unidade="botafogo"
          year={year}
          month={month}
          escala={escala.botafogo}
          onEdit={(date, current) => setEditing({ unidade: "botafogo", date, current })}
          onAdd={(date) => setAddingFree({ unidade: "botafogo", date })}
        />
      </div>

      {/* Edit dialog */}
      <Dialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar camareira</DialogTitle>
            <DialogDescription>
              Substitua a titular do dia (ex.: falta, imprevisto).
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <EditCamForm
              date={editing.date}
              current={editing.current}
              options={editingOptions}
              getTipo={editingTipo}
              onCancel={() => setEditing(null)}
              onSave={salvarEdicao}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add freelancer dialog */}
      <Dialog
        open={!!addingFree}
        onOpenChange={(v) => !v && setAddingFree(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar plantão</DialogTitle>
            <DialogDescription>
              Aloque uma freelancer para cobrir o dia.
            </DialogDescription>
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
  titulo,
  unidade,
  year,
  month,
  escala,
  onEdit,
  onAdd,
}: {
  titulo: string;
  unidade: Unidade;
  year: number;
  month: number;
  escala: Record<string, { titular: DiaCam; extras: { nome: string; tipo: CamTipo }[] }>;
  onEdit: (date: string, current: DiaCam) => void;
  onAdd: (date: string) => void;
}) {
  const tone =
    unidade === "ipanema"
      ? "from-rose-500/10 to-transparent border-rose-500/30"
      : "from-sky-500/10 to-transparent border-sky-500/30";
  return (
    <Card className={cn("p-3 bg-gradient-to-br border", tone)}>
      <div className="mb-3 flex items-center gap-2">
        <BedDouble className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold uppercase tracking-wide">
          {titulo}
        </h3>
      </div>
      <CalendarGrid
        year={year}
        month={month}
        renderDay={(_d, k) => {
          const dia = escala[k];
          if (!dia)
            return (
              <span className="text-[11px] italic text-muted-foreground/70">—</span>
            );
          return (
            <>
              {dia.titular ? (
                <CamRow
                  cam={dia.titular}
                  onEdit={() => onEdit(k, dia.titular)}
                />
              ) : (
                <div className="flex items-center justify-center rounded-md border border-dashed bg-muted/40 px-1.5 py-1 text-[11px] font-medium text-muted-foreground">
                  Folga
                </div>
              )}
              {dia.extras.map((e, i) => (
                <CamRow
                  key={`${e.nome}-${i}`}
                  cam={e}
                  onEdit={() => onEdit(k, e)}
                />
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
  cam,
  onEdit,
}: {
  cam: { nome: string; tipo: CamTipo };
  onEdit: () => void;
}) {
  const tone =
    cam.tipo === "Fixa"
      ? "bg-emerald-50 border-emerald-200"
      : "bg-amber-50 border-amber-200";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-1 rounded-md border px-1.5 py-1 transition-colors",
        tone,
      )}
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
  date,
  current,
  options,
  getTipo,
  onCancel,
  onSave,
}: {
  date: string;
  current: DiaCam;
  options: string[];
  getTipo: (nome: string) => CamTipo;
  onCancel: () => void;
  onSave: (nome: string, tipo: CamTipo, motivo: string) => void;
}) {
  const [nome, setNome] = useState(current?.nome ?? "");
  const [motivo, setMotivo] = useState("");
  const [y, m, d] = date.split("-");
  return (
    <>
      <div className="space-y-4">
        <Badge variant="secondary" className="text-sm">
          <CalendarDays className="h-3 w-3 mr-1" /> {d}/{m}/{y}
        </Badge>
        <div className="space-y-2">
          <Label>Camareira</Label>
          <Select value={nome} onValueChange={setNome}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o} — {getTipo(o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Motivo (opcional)</Label>
          <Textarea
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: falta da titular, cobertura..."
          />
        </div>
      </div>
      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          disabled={!nome}
          onClick={() => onSave(nome, getTipo(nome), motivo)}
        >
          Salvar
        </Button>
      </DialogFooter>
    </>
  );
}

function AddFreeForm({
  date,
  options,
  onCancel,
  onSave,
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
            <SelectTrigger>
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={!nome} onClick={() => onSave(nome)}>
          Adicionar
        </Button>
      </DialogFooter>
    </>
  );
}

function UnidadeColuna({
  titulo,
  cor,
  camareiras,
}: {
  titulo: string;
  cor: string;
  camareiras: Camareira[];
}) {
  return (
    <Card className={cn("p-4 bg-gradient-to-br border", cor)}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground mb-3">
        {titulo}
      </h3>
      <ul className="space-y-2">
        {camareiras.map((c) => (
          <li
            key={c.nome}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/80 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-8 w-8 shrink-0 rounded-full bg-muted grid place-items-center text-xs font-semibold text-muted-foreground">
                {c.nome.charAt(0)}
              </div>
              <span className="truncate text-sm font-medium">{c.nome}</span>
              <Badge
                className={cn(
                  "text-[10px]",
                  c.tipo === "Fixa"
                    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                    : "bg-amber-100 text-amber-800 hover:bg-amber-100",
                )}
              >
                {c.tipo}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// unused import guard
void X;
