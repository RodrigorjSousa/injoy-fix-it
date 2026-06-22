import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, UserPlus, Mail, CheckCircle2, AlertCircle, ShieldCheck, ShieldOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CATEGORIAS,
  useAdicionarFuncionario,
  useFuncionarios,
  useMe,
  useRemoverFuncionario,
  useUsuariosComRoles,
  useTornarGestor,
  useRemoverGestor,
  type Categoria,
} from "@/lib/store";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: Configuracoes,
});

function Configuracoes() {
  const { data: me } = useMe();
  const { data: funcionarios = [] } = useFuncionarios();
  const adicionar = useAdicionarFuncionario();
  const remover = useRemoverFuncionario();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [selecionadas, setSelecionadas] = useState<Categoria[]>([]);

  // Apenas gestores e administradores
  if (me && !me.isGestor && !me.isAdmin) return <Navigate to="/painel" replace />;

  const toggle = (c: Categoria) =>
    setSelecionadas((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const submitar = () => {
    if (!nome.trim() || !email.trim() || selecionadas.length === 0) {
      toast.error("Preencha nome, email e ao menos uma categoria");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("Email inválido");
      return;
    }
    adicionar.mutate(
      { nome: nome.trim(), email: email.trim(), categorias: selecionadas },
      {
        onSuccess: () => {
          toast.success(`${nome} cadastrado`, {
            description: "Quando criar conta com este email, será vinculado automaticamente.",
          });
          setNome("");
          setEmail("");
          setSelecionadas([]);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <header>
        <Badge variant="secondary" className="mb-3 rounded-full">Configurações</Badge>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Equipe</h1>
        <p className="text-muted-foreground mt-1">
          Cadastre técnicos com email. Quando criarem conta com esse email, recebem automaticamente acesso aos chamados atribuídos.
        </p>
      </header>

      <Card className="p-5 space-y-5">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Novo funcionário</h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria Silva" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email de acesso</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@injoy.com.br"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Categorias atendidas</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CATEGORIAS.map((c) => {
              const checked = selecionadas.includes(c);
              return (
                <label
                  key={c}
                  className="flex items-center gap-2 rounded-lg border bg-background p-3 cursor-pointer hover:border-primary/40"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(c)} />
                  <span className="text-sm">{c}</span>
                </label>
              );
            })}
          </div>
        </div>

        <Button onClick={submitar} className="w-full sm:w-auto" disabled={adicionar.isPending}>
          {adicionar.isPending ? "Salvando..." : "Cadastrar funcionário"}
        </Button>
      </Card>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Funcionários cadastrados</h2>
        <div className="space-y-2">
          {funcionarios.map((f) => (
            <Card key={f.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{f.nome}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3 w-3" /> {f.email}
                  {f.userId ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="h-3 w-3" /> Conta vinculada
                    </span>
                  ) : (
                    <span className="ml-2 inline-flex items-center gap-1 text-warning-foreground">
                      <AlertCircle className="h-3 w-3" /> Aguardando cadastro
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {f.categorias.map((c) => (
                    <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                  ))}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(`Remover ${f.nome}?`)) {
                    remover.mutate(f.id, {
                      onSuccess: () => toast.success("Funcionário removido"),
                      onError: (e) => toast.error(e.message),
                    });
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </Card>
          ))}
          {funcionarios.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum funcionário cadastrado.</p>
          )}
        </div>
      </section>

      {me?.isAdmin && <GestoresAdmin />}
    </div>
  );
}

function GestoresAdmin() {
  const { data: usuarios = [], isLoading } = useUsuariosComRoles();
  const tornar = useTornarGestor();
  const remover = useRemoverGestor();

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-lg">Gestores (administrador)</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Promova ou remova gestores do sistema. Administradores não aparecem nesta lista.
      </p>
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {usuarios
          .filter((u) => !u.isAdmin)
          .map((u) => (
            <Card key={u.userId} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{u.nome}</div>
                <div className="mt-1">
                  {u.isGestor ? (
                    <Badge className="text-[10px]">Gestor</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Funcionário</Badge>
                  )}
                </div>
              </div>
              {u.isGestor ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    remover.mutate(u.userId, {
                      onSuccess: () => toast.success(`${u.nome} não é mais gestor`),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                  disabled={remover.isPending}
                >
                  <ShieldOff className="h-4 w-4 mr-1" /> Remover gestor
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() =>
                    tornar.mutate(u.userId, {
                      onSuccess: () => toast.success(`${u.nome} agora é gestor`),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                  disabled={tornar.isPending}
                >
                  <ShieldCheck className="h-4 w-4 mr-1" /> Tornar gestor
                </Button>
              )}
            </Card>
          ))}
        {!isLoading && usuarios.filter((u) => !u.isAdmin).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum usuário cadastrado.</p>
        )}
      </div>
    </section>
  );
}
