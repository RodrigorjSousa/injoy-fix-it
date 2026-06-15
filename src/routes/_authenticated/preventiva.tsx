import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Snowflake, MapPin, Calendar, Sparkles, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UNIDADES,
  actions,
  diasDesdeLimpeza,
  isAtivoLimpo,
  useStore,
  type Unidade,
} from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/preventiva")({
  component: Preventiva,
});

function Preventiva() {
  const ativos = useStore((s) => s.ativos);
  const [unidade, setUnidade] = useState<Unidade | "todas">("todas");

  const filtrados = ativos.filter((a) => unidade === "todas" || a.unidade === unidade);
  const sujos = filtrados.filter((a) => !isAtivoLimpo(a)).length;
  const limpos = filtrados.length - sujos;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-3 rounded-full">Manutenção preventiva</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Ar Condicionado</h1>
          <p className="text-muted-foreground mt-1">Controle de limpeza técnica periódica</p>
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
        <Stat label="Total" value={filtrados.length} tone="bg-primary/10 text-primary" />
        <Stat label="Em dia" value={limpos} tone="bg-success/15 text-success" />
        <Stat label="Requer limpeza" value={sujos} tone="bg-destructive/15 text-destructive" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.map((a) => {
          const limpo = isAtivoLimpo(a);
          const dias = diasDesdeLimpeza(a);
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
                  Última limpeza: {new Date(a.ultimaLimpeza).toLocaleDateString("pt-BR")}
                  <span className="text-foreground/70">({dias}d atrás)</span>
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
                    <><Sparkles className="h-3 w-3 mr-1" /> Sujo / Requer Limpeza</>
                  )}
                </Badge>
              </div>

              <Button
                variant={limpo ? "outline" : "default"}
                className="w-full"
                onClick={() => {
                  actions.registrarLimpeza(a.id);
                  toast.success("Limpeza registrada", { description: `${a.id} — ${a.localizacao}` });
                }}
              >
                Registrar Limpeza Técnica
              </Button>
            </Card>
          );
        })}
      </div>
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
