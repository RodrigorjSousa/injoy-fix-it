import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
        content: "Gestão de escalas mensais de recepção, manutenção e camareiras.",
      },
    ],
  }),
  component: EscalaPage,
});

// ---------- Data ----------
const RECEPCAO_MANHA = ["Mayara Fagundes", "Júlia Cristine"];
const RECEPCAO_NOITE = ["Lucivaldo", "Mathaus Ramos"];
const MANUTENCAO = ["Carlos (Elétrica)", "Roberto (Hidráulica)", "André (AC)"];

type Turno = "manha" | "noite";
type Escala = Record<string, { manha: string; noite: string }>; // key: yyyy-mm-dd

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

function EscalaPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m);
    setYear(y);
  };

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
        {/* Card header */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
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
              <span className="truncate">{label}</span>
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

          <div className="flex flex-wrap items-center gap-2 justify-end">
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
        </div>

        <Tabs defaultValue="recepcao" className="mt-6">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
            <TabsTrigger value="manutencao">Manutenção</TabsTrigger>
            <TabsTrigger value="recepcao">Recepção</TabsTrigger>
            <TabsTrigger value="camareiras">Camareiras</TabsTrigger>
          </TabsList>

          <TabsContent value="manutencao" className="mt-5">
            <ManutencaoTab year={year} month={month} />
          </TabsContent>

          <TabsContent value="recepcao" className="mt-5">
            <RecepcaoTab year={year} month={month} />
          </TabsContent>

          <TabsContent value="camareiras" className="mt-5">
            <CamareirasTab />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

// ---------- WhatsApp ----------
function WhatsAppButton({ mesLabel }: { mesLabel: string }) {
  const [open, setOpen] = useState(false);
  const preview = useMemo(
    () =>
      `*Escala INJOY — ${mesLabel}*\n\n` +
      `🔧 *Manutenção*\n- Plantão sob demanda\n\n` +
      `🛎️ *Recepção*\n- Manhã: Mayara / Júlia (alternado)\n- Noite: Lucivaldo / Mathaus (alternado)\n\n` +
      `🛏️ *Camareiras*\n- Ipanema: MARIA (Fixa), CRISTINA (Freelance)\n- Botafogo: GLEIDIANE (Fixa), RAQUEL (Fixa), LUCIENE (Freelance)\n\n` +
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

// ---------- Manutenção Tab ----------
function ManutencaoTab({ year, month }: { year: number; month: number }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      Plantão de manutenção sob demanda para {MONTHS[month]}/{year}. Configure conforme necessidade.
    </div>
  );
}

// ---------- Recepção Tab ----------
function RecepcaoTab({ year, month }: { year: number; month: number }) {
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

  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

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
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 gap-1">
            <Sun className="h-3 w-3" /> Manhã: alternância diária
          </Badge>
          <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100 gap-1">
            <Moon className="h-3 w-3" /> Noite: alternância diária
          </Badge>
        </div>
        <Button onClick={gerar} className="gap-2">
          <Sparkles className="h-4 w-4" /> Gerar Escala Automática
        </Button>
      </div>

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
              return <div key={i} className="min-h-[110px] bg-muted/20 border-t border-l" />;
            }
            const k = keyOf(year, month, d);
            const dia = escala[k];
            return (
              <div
                key={i}
                className="min-h-[110px] border-t border-l p-2 flex flex-col gap-1.5 text-xs"
              >
                <div className="text-[11px] font-semibold text-muted-foreground">
                  {String(d).padStart(2, "0")}
                </div>
                {dia ? (
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
                ) : (
                  <span className="text-[11px] italic text-muted-foreground/70">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

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

  // sync when open
  useMemo(() => {
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
type Camareira = { nome: string; tipo: "Fixa" | "Freelance" };
const IPANEMA: Camareira[] = [
  { nome: "MARIA", tipo: "Fixa" },
  { nome: "CRISTINA", tipo: "Freelance" },
];
const BOTAFOGO: Camareira[] = [
  { nome: "GLEIDIANE MENDES", tipo: "Fixa" },
  { nome: "RAQUEL", tipo: "Fixa" },
  { nome: "LUCIENE CERQUEIRA", tipo: "Freelance" },
];

function CamareirasTab() {
  const [addOpen, setAddOpen] = useState<Camareira | null>(null);
  const [dia, setDia] = useState("");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <UnidadeColuna
        titulo="Unidade Ipanema"
        cor="from-rose-500/15 to-rose-500/0 border-rose-500/30"
        camareiras={IPANEMA}
        onAdd={setAddOpen}
      />
      <UnidadeColuna
        titulo="Unidade Botafogo"
        cor="from-sky-500/15 to-sky-500/0 border-sky-500/30"
        camareiras={BOTAFOGO}
        onAdd={setAddOpen}
      />

      <Dialog
        open={!!addOpen}
        onOpenChange={(v) => {
          if (!v) {
            setAddOpen(null);
            setDia("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar plantão</DialogTitle>
            <DialogDescription>
              Inclua uma data pontual de trabalho para {addOpen?.nome}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Data do plantão</Label>
            <input
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddOpen(null);
                setDia("");
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={!dia}
              onClick={() => {
                toast.success("Plantão adicionado", {
                  description: `${addOpen?.nome} — ${dia}`,
                });
                setAddOpen(null);
                setDia("");
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UnidadeColuna({
  titulo,
  cor,
  camareiras,
  onAdd,
}: {
  titulo: string;
  cor: string;
  camareiras: Camareira[];
  onAdd: (c: Camareira) => void;
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
            {c.tipo === "Freelance" && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1"
                onClick={() => onAdd(c)}
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar Plantão
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// unused import guard (keeps X available if legend added later)
void X;
