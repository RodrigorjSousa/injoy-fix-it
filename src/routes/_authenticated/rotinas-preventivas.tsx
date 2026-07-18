import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Paintbrush,
  Sparkles,
  Brush,
  Wind,
  Droplets,
  Leaf,
  Grid3x3,
  Home,
  MapPin,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  AlertTriangle,
  Plus,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { supabase } from "@/integrations/supabase/client";
import { UNIDADES, useMe, type Unidade } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/rotinas-preventivas")({
  head: () => ({
    meta: [
      { title: "Rotinas Preventivas — INJOY" },
      { name: "description", content: "Controle de rotinas preventivas de manutenção do hotel." },
    ],
  }),
  component: RotinasPreventivasPage,
});

type RotinaConfig = {
  id: string;
  titulo: string;
  frequencia_dias: number;
  escopo_unidade: "Ambas" | "Botafogo" | "Ipanema";
  checklist: string[];
};

type RotinaLocal = {
  id: string;
  rotina_config_id: string;
  nome_local: string;
  unidade: Unidade;
  ultima_execucao: string | null;
  ultimo_tecnico: string | null;
};

type Item = {
  local: RotinaLocal;
  config: RotinaConfig;
};

function iconForTitle(t: string) {
  const s = t.toLowerCase();
  if (s.includes("pintura")) return Paintbrush;
  if (s.includes("rejunte")) return Grid3x3;
  if (s.includes("jardim") || s.includes("pátio")) return Leaf;
  if (s.includes("ralo")) return Droplets;
  if (s.includes("trilho") || s.includes("janela")) return Wind;
  if (s.includes("quarto")) return Home;
  return Brush;
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function proximaData(iso: string | null, freq: number): Date | null {
  if (!iso) return null;
  return new Date(new Date(iso).getTime() + freq * 86_400_000);
}

function isEmDia(iso: string | null, freq: number): boolean {
  const p = proximaData(iso, freq);
  if (!p) return false;
  return p.getTime() > Date.now();
}

function RotinasPreventivasPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isAdminOrGestor = !!(me?.isAdmin || me?.isGestor);

  const [unidade, setUnidade] = useState<Unidade | "todas">("todas");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "em_dia" | "atrasados">("todos");
  const [selecionado, setSelecionado] = useState<Item | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [obs, setObs] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [novoLocal, setNovoLocal] = useState<{ configId: string; nome: string; unidade: Unidade }>({
    configId: "",
    nome: "",
    unidade: "Botafogo",
  });

  const configsQ = useQuery({
    queryKey: ["rotinas_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotinas_config" as never)
        .select("*")
        .order("titulo");
      if (error) throw error;
      return (data ?? []) as RotinaConfig[];
    },
  });

  const locaisQ = useQuery({
    queryKey: ["rotinas_locais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotinas_locais" as never)
        .select("*")
        .order("nome_local");
      if (error) throw error;
      return (data ?? []) as RotinaLocal[];
    },
  });

  const registrar = useMutation({
    mutationFn: async (input: {
      item: Item;
      tecnico: string;
      observacoes: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("rotinas_historico" as never).insert({
        rotina_local_id: input.item.local.id,
        tecnico: input.tecnico,
        observacoes: input.observacoes || null,
        registrado_por: u.user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rotinas_locais"] });
      qc.invalidateQueries({ queryKey: ["rotinas_historico"] });
    },
  });

  const criarLocal = useMutation({
    mutationFn: async (input: { configId: string; nome: string; unidade: Unidade }) => {
      const { error } = await supabase.from("rotinas_locais" as never).insert({
        rotina_config_id: input.configId,
        nome_local: input.nome,
        unidade: input.unidade,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rotinas_locais"] }),
  });

  const excluirLocal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rotinas_locais" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rotinas_locais"] }),
  });

  const configs = configsQ.data ?? [];
  const locais = locaisQ.data ?? [];

  const itens: Item[] = useMemo(() => {
    const map = new Map(configs.map((c) => [c.id, c]));
    return locais
      .map((l) => {
        const c = map.get(l.rotina_config_id);
        return c ? { local: l, config: c } : null;
      })
      .filter((x): x is Item => !!x);
  }, [configs, locais]);

  const porUnidade = itens.filter((i) => unidade === "todas" || i.local.unidade === unidade);
  const emDia = porUnidade.filter((i) => isEmDia(i.local.ultima_execucao, i.config.frequencia_dias)).length;
  const atrasados = porUnidade.length - emDia;

  const filtrados = porUnidade.filter((i) => {
    const ok = isEmDia(i.local.ultima_execucao, i.config.frequencia_dias);
    if (filtroStatus === "em_dia") return ok;
    if (filtroStatus === "atrasados") return !ok;
    return true;
  });

  const totalChecks = selecionado?.config.checklist.length ?? 0;
  const marcados = useMemo(() => Object.values(checks).filter(Boolean).length, [checks]);
  const podeConfirmar = tecnico.trim().length > 0 && marcados === totalChecks;

  const TECNICO_PADRAO = "Rodrigo Sousa - CFT 09413001707";

  function abrir(item: Item) {
    setSelecionado(item);
    setChecks({});
    setObs("");
    setTecnico(TECNICO_PADRAO);
  }

  function confirmar() {
    if (!selecionado || !podeConfirmar) return;
    registrar.mutate(
      { item: selecionado, tecnico: tecnico.trim(), observacoes: obs.trim() },
      {
        onSuccess: () => {
          toast.success("Execução registrada", {
            description: `${selecionado.config.titulo} — ${selecionado.local.nome_local}`,
          });
          setSelecionado(null);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function salvarNovoLocal() {
    if (!novoLocal.configId || !novoLocal.nome.trim()) {
      toast.error("Selecione uma rotina e informe o nome do local");
      return;
    }
    criarLocal.mutate(
      { configId: novoLocal.configId, nome: novoLocal.nome.trim(), unidade: novoLocal.unidade },
      {
        onSuccess: () => {
          toast.success("Local adicionado");
          setNovoLocal({ configId: "", nome: "", unidade: "Botafogo" });
          setAddOpen(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge variant="secondary" className="mb-3 rounded-full">
              Manutenção · Rotinas Preventivas
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Rotinas Preventivas</h1>
            <p className="text-muted-foreground mt-1">
              {configsQ.isLoading || locaisQ.isLoading
                ? "Carregando..."
                : "Controle de rotinas periódicas de conservação e limpeza"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdminOrGestor && (
              <Button variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar local
              </Button>
            )}
            <Select value={unidade} onValueChange={(v) => setUnidade(v as Unidade | "todas")}>
              <SelectTrigger className="w-[180px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas unidades</SelectItem>
                {UNIDADES.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat
            label="Total de itens"
            value={porUnidade.length}
            tone="bg-primary/10 text-primary"
            border="border-2 border-primary/60"
            activeBorder="border-primary"
            active={filtroStatus === "todos"}
            onClick={() => setFiltroStatus("todos")}
          />
          <Stat
            label="Em dia"
            value={emDia}
            tone="bg-success/15 text-success"
            border="border-2 border-success/60"
            activeBorder="border-success"
            active={filtroStatus === "em_dia"}
            onClick={() => setFiltroStatus("em_dia")}
          />
          <Stat
            label="Requer revisão"
            value={atrasados}
            tone="bg-destructive/15 text-destructive"
            border="border-2 border-destructive/60"
            activeBorder="border-destructive"
            active={filtroStatus === "atrasados"}
            onClick={() => setFiltroStatus("atrasados")}
          />
        </div>

        {filtrados.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {porUnidade.length === 0
              ? isAdminOrGestor
                ? 'Nenhum local cadastrado. Use "Adicionar local" para começar.'
                : "Nenhum local cadastrado ainda."
              : "Nenhum item neste filtro."}
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((it) => {
            const ok = isEmDia(it.local.ultima_execucao, it.config.frequencia_dias);
            const dias = diasDesde(it.local.ultima_execucao);
            const prox = proximaData(it.local.ultima_execucao, it.config.frequencia_dias);
            const Icon = iconForTitle(it.config.titulo);
            return (
              <Card key={it.local.id} className="p-4 space-y-3 relative overflow-hidden">
                <span
                  className={cn(
                    "absolute top-4 right-4 h-3.5 w-3.5 rounded-full ring-4",
                    ok
                      ? "bg-success ring-success/20"
                      : "bg-destructive ring-destructive/20 animate-pulse",
                  )}
                  aria-hidden
                />
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "h-11 w-11 rounded-xl grid place-items-center shrink-0",
                      ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 pr-6">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">
                      {it.config.titulo}
                    </div>
                    <div className="font-semibold truncate">{it.local.nome_local}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {it.local.unidade}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    Realizado:{" "}
                    <span className="text-foreground font-medium">
                      {it.local.ultima_execucao
                        ? new Date(it.local.ultima_execucao).toLocaleDateString("pt-BR")
                        : "—"}
                    </span>
                    {dias !== null && <span className="text-foreground/70">({dias}d atrás)</span>}
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span>Técnico:</span>
                    <span className="text-foreground font-medium">
                      {it.local.ultimo_tecnico ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    {ok ? (
                      <Calendar className="h-3.5 w-3.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    )}
                    Próxima:{" "}
                    <span className={cn("font-medium", ok ? "text-foreground" : "text-destructive")}>
                      {prox ? prox.toLocaleDateString("pt-BR") : "Imediata"}
                    </span>
                    <span className="text-foreground/60">
                      (máx. {it.config.frequencia_dias} dias)
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-semibold",
                      ok
                        ? "bg-success/10 text-success border-success/30"
                        : "bg-destructive/10 text-destructive border-destructive/30",
                    )}
                  >
                    {ok ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Em dia
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3 mr-1" /> Revisar
                      </>
                    )}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant={ok ? "outline" : "default"}
                    className="flex-1"
                    onClick={() => abrir(it)}
                  >
                    <ClipboardCheck className="h-4 w-4 mr-2" />
                    Checklist & Registrar
                  </Button>
                  {isAdminOrGestor && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Excluir "${it.local.nome_local}"?`)) {
                          excluirLocal.mutate(it.local.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Modal: registrar execução */}
        <Dialog open={!!selecionado} onOpenChange={(o) => !o && setSelecionado(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                Registrar execução
              </DialogTitle>
              <DialogDescription>
                {selecionado && (
                  <>
                    <strong>{selecionado.config.titulo}</strong> · {selecionado.local.nome_local} —{" "}
                    {selecionado.local.unidade}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {selecionado && selecionado.config.checklist.length > 0 && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Checklist obrigatório</span>
                    <Badge variant={marcados === totalChecks ? "default" : "secondary"}>
                      {marcados}/{totalChecks} itens
                    </Badge>
                  </div>
                  <div className="space-y-2 rounded-lg border bg-card/40 p-3">
                    {selecionado.config.checklist.map((item, idx) => {
                      const key = `${idx}-${item}`;
                      return (
                        <label
                          key={key}
                          htmlFor={`chk-${idx}`}
                          className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <Checkbox
                            id={`chk-${idx}`}
                            checked={!!checks[key]}
                            onCheckedChange={(v) =>
                              setChecks((c) => ({ ...c, [key]: v === true }))
                            }
                            className="mt-0.5"
                          />
                          <div className="text-sm font-medium leading-tight">{item}</div>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rp-tecnico">Técnico responsável *</Label>
                  <Input
                    id="rp-tecnico"
                    value={tecnico}
                    onChange={(e) => setTecnico(e.target.value)}
                    placeholder="Nome do técnico"
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
                  <Label>Data de execução</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                    {new Date().toLocaleDateString("pt-BR")}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rp-obs">Observações</Label>
                <Textarea
                  id="rp-obs"
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Anotações, itens trocados, recomendações..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelecionado(null)}>
                Cancelar
              </Button>
              <Button onClick={confirmar} disabled={!podeConfirmar || registrar.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirmar & registrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: adicionar local */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar local a uma rotina</DialogTitle>
              <DialogDescription>
                Vincule um novo local (ex: Quarto 101, Corredor 1º Andar) a uma rotina existente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Rotina</Label>
                <Select
                  value={novoLocal.configId}
                  onValueChange={(v) => setNovoLocal((s) => ({ ...s, configId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a rotina" />
                  </SelectTrigger>
                  <SelectContent>
                    {configs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.titulo} · {c.frequencia_dias}d
                        {c.escopo_unidade !== "Ambas" ? ` · ${c.escopo_unidade}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nl-nome">Nome do local</Label>
                <Input
                  id="nl-nome"
                  value={novoLocal.nome}
                  onChange={(e) => setNovoLocal((s) => ({ ...s, nome: e.target.value }))}
                  placeholder="Ex: Quarto 101, Corredor 1º Andar"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Select
                  value={novoLocal.unidade}
                  onValueChange={(v) => setNovoLocal((s) => ({ ...s, unidade: v as Unidade }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={salvarNovoLocal} disabled={criarLocal.isPending}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  tone,
  border,
  activeBorder,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: string;
  border?: string;
  activeBorder?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left transition-all",
        onClick &&
          "hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl",
      )}
    >
      <Card
        className={cn(
          "p-4 h-full",
          border,
          active && activeBorder,
          active && "shadow-md",
        )}
      >
        <div
          className={cn(
            "inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold mb-2",
            tone,
          )}
        >
          {label}
        </div>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
      </Card>
    </button>
  );
}
