import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Snowflake, MapPin, Calendar, Sparkles, CheckCircle2, ClipboardCheck, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UNIDADES,
  diasDesdeLimpeza,
  proximaLimpeza,
  isAtivoLimpo,
  useAtivos,
  useRegistrarLimpeza,
  type AtivoAr,
  type Unidade,
} from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/preventiva")({
  component: Preventiva,
});

/** PMOC — itens mínimos exigidos pela Lei nº 13.589/2018 e Portaria 3.523/98 MS. */
const PMOC_ITENS: { id: string; label: string; descricao: string }[] = [
  { id: "filtros", label: "Limpeza/higienização de filtros de ar", descricao: "Lavagem e desinfecção dos filtros" },
  { id: "serpentinas", label: "Limpeza das serpentinas (evaporadora/condensadora)", descricao: "Remoção de pó, mofo e biofilme" },
  { id: "bandeja", label: "Limpeza da bandeja de condensado", descricao: "Eliminação de água parada e sujidade" },
  { id: "dreno", label: "Verificação e desobstrução do dreno", descricao: "Escoamento livre sem vazamentos" },
  { id: "gabinete", label: "Limpeza do gabinete e gaxetas", descricao: "Inspeção visual e higienização externa" },
  { id: "ventilador", label: "Inspeção do ventilador e correias", descricao: "Ruído, vibração e balanceamento" },
  { id: "gas", label: "Verificação de pressão/carga de gás refrigerante", descricao: "Pressões de alta e baixa dentro da faixa" },
  { id: "eletrica", label: "Inspeção elétrica (cabos, contatores, aterramento)", descricao: "Sem aquecimento, oxidação ou folga" },
  { id: "termico", label: "Aferição de temperatura de insuflamento e retorno", descricao: "Delta T conforme especificação" },
  { id: "qualidade", label: "Avaliação da qualidade do ar ambiente", descricao: "Ausência de odores e contaminantes visíveis" },
];

function Preventiva() {
  const { data: ativos = [], isLoading } = useAtivos();
  const registrar = useRegistrarLimpeza();
  const [unidade, setUnidade] = useState<Unidade | "todas">("todas");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "limpos" | "sujos">("todos");
  const [ativoSelecionado, setAtivoSelecionado] = useState<AtivoAr | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [obs, setObs] = useState("");
  const [tecnico, setTecnico] = useState("");

  const porUnidade = ativos.filter((a) => unidade === "todas" || a.unidade === unidade);
  const sujos = porUnidade.filter((a) => !isAtivoLimpo(a)).length;
  const limpos = porUnidade.length - sujos;
  const filtrados = porUnidade.filter((a) => {
    if (filtroStatus === "limpos") return isAtivoLimpo(a);
    if (filtroStatus === "sujos") return !isAtivoLimpo(a);
    return true;
  });

  const totalCheck = PMOC_ITENS.length;
  const marcados = useMemo(() => Object.values(checks).filter(Boolean).length, [checks]);
  const tudoOk = marcados === totalCheck && tecnico.trim().length > 0;

  function abrirChecklist(a: AtivoAr) {
    setAtivoSelecionado(a);
    setChecks({});
    setObs("");
    setTecnico("");
  }

  function confirmar() {
    if (!ativoSelecionado || !tudoOk) return;
    registrar.mutate(
      { ativoId: ativoSelecionado.id, tecnico: tecnico.trim() || null },
      {
        onSuccess: () => {
          toast.success("Limpeza PMOC registrada", {
            description: `${ativoSelecionado.localizacao} — ${tecnico}`,
          });
          setAtivoSelecionado(null);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-3 rounded-full">Manutenção preventiva · PMOC</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Ar Condicionado</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? "Carregando..." : "Controle de limpeza técnica em conformidade com o PMOC"}
          </p>
        </div>
        <Select value={unidade} onValueChange={(v) => setUnidade(v as Unidade | "todas")}>
          <SelectTrigger className="w-[180px] bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas unidades</SelectItem>
            {UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat
          label="Total"
          value={porUnidade.length}
          tone="bg-primary/10 text-primary"
          active={filtroStatus === "todos"}
          onClick={() => setFiltroStatus("todos")}
        />
        <Stat
          label="Em dia"
          value={limpos}
          tone="bg-success/15 text-success"
          active={filtroStatus === "limpos"}
          onClick={() => setFiltroStatus("limpos")}
        />
        <Stat
          label="Requer limpeza"
          value={sujos}
          tone="bg-destructive/15 text-destructive"
          active={filtroStatus === "sujos"}
          onClick={() => setFiltroStatus("sujos")}
        />
      </div>

      {filtrados.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum aparelho neste filtro.
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.map((a) => {
          const limpo = isAtivoLimpo(a);
          const dias = diasDesdeLimpeza(a);
          const proxima = proximaLimpeza(a);
          const vencida = proxima ? proxima.getTime() < Date.now() : true;
          return (
            <Card key={a.id} className="p-4 space-y-3 relative overflow-hidden">
              <span
                className={cn(
                  "absolute top-4 right-4 h-3.5 w-3.5 rounded-full ring-4",
                  limpo
                    ? "bg-success ring-success/20"
                    : "bg-destructive ring-destructive/20 animate-pulse",
                )}
                aria-hidden
              />
              <div className="flex items-start gap-3">
                <div className={cn(
                  "h-11 w-11 rounded-xl grid place-items-center shrink-0",
                  limpo ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                )}>
                  <Snowflake className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 pr-6">
                  <div className="font-mono text-[11px] text-muted-foreground">{a.id}</div>
                  <div className="font-semibold truncate">{a.localizacao}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />{a.unidade}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Realizado:{" "}
                  <span className="text-foreground font-medium">
                    {a.ultimaLimpeza
                      ? new Date(a.ultimaLimpeza).toLocaleDateString("pt-BR")
                      : "—"}
                  </span>
                  {dias !== null && (
                    <span className="text-foreground/70">({dias}d atrás)</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="i">Técnico:</span>
                  <span className="text-foreground font-medium">
                    {a.tecnico ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  {vencida ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <Calendar className="h-3.5 w-3.5" />
                  )}
                  Próxima:{" "}
                  <span className={cn("font-medium", vencida ? "text-destructive" : "text-foreground")}>
                    {proxima ? proxima.toLocaleDateString("pt-BR") : "Imediata"}
                  </span>
                  <span className="text-foreground/60">(máx. 90 dias)</span>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-semibold",
                    limpo
                      ? "bg-success/10 text-success border-success/30"
                      : "bg-destructive/10 text-destructive border-destructive/30",
                  )}
                >
                  {limpo ? (
                    <><CheckCircle2 className="h-3 w-3 mr-1" /> Limpo</>
                  ) : (
                    <><Sparkles className="h-3 w-3 mr-1" /> Sujo</>
                  )}
                </Badge>
              </div>


              <Button
                variant={limpo ? "outline" : "default"}
                className="w-full"
                onClick={() => abrirChecklist(a)}
              >
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Checklist PMOC & Registrar
              </Button>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!ativoSelecionado} onOpenChange={(o) => !o && setAtivoSelecionado(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Checklist de Verificação PMOC
            </DialogTitle>
            <DialogDescription>
              {ativoSelecionado && (
                <>
                  <span className="font-mono">{ativoSelecionado.id}</span> · {ativoSelecionado.localizacao} — {ativoSelecionado.unidade}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Conformidade com Lei nº 13.589/2018 — Plano de Manutenção, Operação e Controle</span>
              <Badge variant={marcados === totalCheck ? "default" : "secondary"}>
                {marcados}/{totalCheck} itens
              </Badge>
            </div>

            <div className="space-y-2 rounded-lg border bg-card/40 p-3">
              {PMOC_ITENS.map((item) => (
                <label
                  key={item.id}
                  htmlFor={`pmoc-${item.id}`}
                  className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <Checkbox
                    id={`pmoc-${item.id}`}
                    checked={!!checks[item.id]}
                    onCheckedChange={(v) =>
                      setChecks((c) => ({ ...c, [item.id]: v === true }))
                    }
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight">{item.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{item.descricao}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pmoc-tecnico">Técnico responsável *</Label>
                <input
                  id="pmoc-tecnico"
                  className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={tecnico}
                  onChange={(e) => setTecnico(e.target.value)}
                  onClick={() => {
                    if (!tecnico) setTecnico("Rodrigo Sousa - CFT 09413001707");
                  }}
                  placeholder="Clique para preencher: Rodrigo Sousa - CFT 09413001707"
                />
                <button
                  type="button"
                  onClick={() => setTecnico("Rodrigo Sousa - CFT 09413001707")}
                  className="text-xs text-primary hover:underline"
                >
                  Usar: Rodrigo Sousa — CFT 09413001707
                </button>
              </div>
              <div className="space-y-1.5">
                <Label>Data da verificação</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                  {new Date().toLocaleDateString("pt-BR")}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pmoc-obs">Observações técnicas</Label>
              <Textarea
                id="pmoc-obs"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Anomalias, peças trocadas, recomendações..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAtivoSelecionado(null)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!tudoOk || registrar.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirmar conformidade & registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className="p-4">
      <div className={cn("inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold mb-2", tone)}>
        {label}
      </div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
    </Card>
  );
}
