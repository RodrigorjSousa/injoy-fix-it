import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ChevronRight, MapPin, User2, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORIAS,
  UNIDADES,
  useChamados,
  useExcluirChamado,
  useFuncionarios,
  useMe,
  type Categoria,
  type Status,
  type Unidade,
  type Chamado,
} from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/painel")({
  component: Painel,
});

const COLUNAS: { status: Status; label: string; tone: string }[] = [
  { status: "Aberto", label: "A Fazer", tone: "bg-destructive/10 text-destructive border-destructive/30" },
  { status: "Em Andamento", label: "Fazendo", tone: "bg-warning/15 text-warning-foreground border-warning/40" },
  { status: "Concluído", label: "Feito", tone: "bg-success/15 text-success border-success/30" },
];

function Painel() {
  const { data: me } = useMe();
  const { data: chamados = [], isLoading } = useChamados();
  const { data: funcionarios = [] } = useFuncionarios();
  const excluir = useExcluirChamado();
  const [unidade, setUnidade] = useState<Unidade | "todas">("todas");
  const [categoria, setCategoria] = useState<Categoria | "todas">("todas");

  const filtrados = useMemo(() => {
    return chamados.filter(
      (c) =>
        (unidade === "todas" || c.unidade === unidade) &&
        (categoria === "todas" || c.categoria === categoria),
    );
  }, [chamados, unidade, categoria]);

  const nomePor = (id: string | null) => funcionarios.find((f) => f.id === id)?.nome ?? "—";

  const handleDelete = (id: string) => {
    excluir.mutate(id, {
      onSuccess: () => toast.success("Chamado excluído"),
      onError: (e) => toast.error(e.message),
    });
  };


  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-3 rounded-full">
            {me?.isGestor ? "Painel de chamados" : "Meus chamados"}
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {me?.isGestor ? "Operação" : `Olá, ${me?.funcionario?.nome ?? "técnico"}`}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? "Carregando..." : `${filtrados.length} chamados visíveis`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={unidade} onValueChange={(v) => setUnidade(v as Unidade | "todas")}>
            <SelectTrigger className="w-[160px] bg-card"><SelectValue placeholder="Unidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas unidades</SelectItem>
              {UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoria} onValueChange={(v) => setCategoria(v as Categoria | "todas")}>
            <SelectTrigger className="w-[180px] bg-card"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas categorias</SelectItem>
              {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </header>

      <Tabs defaultValue="kanban" className="w-full">
        <TabsList>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="lista">Lista</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COLUNAS.map((col) => {
              const itens = filtrados.filter((c) => c.status === col.status);
              return (
                <div key={col.status} className="rounded-2xl bg-muted/40 p-3 min-h-[200px]">
                  <div className="flex items-center justify-between px-2 pb-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold border", col.tone)}>
                        {col.label}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">{itens.length}</span>
                  </div>
                  <div className="space-y-2">
                    {itens.length === 0 && (
                      <div className="text-xs text-muted-foreground px-2 py-6 text-center">Vazio</div>
                    )}
                    {itens.map((c) => (
                      <ChamadoCard key={c.id} c={c} responsavel={nomePor(c.responsavelId)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="lista" className="mt-4">
          <Card className="divide-y divide-border overflow-hidden p-0">
            {filtrados.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">Nenhum chamado encontrado</div>
            )}
            {filtrados.map((c) => (
              <Link
                key={c.id}
                to="/chamados/$id"
                params={{ id: c.id }}
                className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors"
              >
                <StatusDot status={c.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />{c.unidade}
                    <span>·</span>
                    <span>{c.categoria}</span>
                  </div>
                  <div className="font-medium truncate">{c.descricao}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <User2 className="h-3 w-3" />{nomePor(c.responsavelId)}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusDot({ status }: { status: Status }) {
  const cls =
    status === "Aberto" ? "bg-destructive" :
    status === "Em Andamento" ? "bg-warning" : "bg-success";
  return <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", cls)} />;
}

function ChamadoCard({ c, responsavel }: { c: Chamado; responsavel: string }) {
  return (
    <Link
      to="/chamados/$id"
      params={{ id: c.id }}
      className="block bg-card rounded-xl p-3 border border-border hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <Badge variant="outline" className="text-[10px] font-medium">{c.categoria}</Badge>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {new Date(c.criadoEm).toLocaleDateString("pt-BR")}
        </span>
      </div>
      <div className="text-sm font-medium line-clamp-2">{c.descricao}</div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{c.unidade}</span>
        <span className="truncate max-w-[140px]">{responsavel}</span>
      </div>
    </Link>
  );
}
