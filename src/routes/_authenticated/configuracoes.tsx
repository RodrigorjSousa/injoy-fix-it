import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, UserPlus, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CATEGORIAS, actions, useStore, type Categoria } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: Configuracoes,
});

function Configuracoes() {
  const funcionarios = useStore((s) => s.funcionarios);
  const [nome, setNome] = useState("");
  const [selecionadas, setSelecionadas] = useState<Categoria[]>([]);

  const toggle = (c: Categoria) =>
    setSelecionadas((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const adicionar = () => {
    if (!nome.trim() || selecionadas.length === 0) {
      toast.error("Informe o nome e pelo menos uma categoria");
      return;
    }
    actions.adicionarFuncionario(nome.trim(), selecionadas);
    toast.success(`${nome} cadastrado`);
    setNome("");
    setSelecionadas([]);
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Badge variant="secondary" className="mb-3 rounded-full">Configurações</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Equipe</h1>
          <p className="text-muted-foreground mt-1">Cadastre técnicos e suas especialidades</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm("Restaurar dados de demonstração?")) {
              actions.resetSeed();
              toast.success("Dados restaurados");
            }
          }}
        >
          <RotateCcw className="h-4 w-4 mr-1" /> Resetar
        </Button>
      </header>

      <Card className="p-5 space-y-5">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Novo funcionário</h2>
        </div>

        <div className="space-y-2">
          <Label htmlFor="nome">Nome</Label>
          <Input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Maria Silva"
          />
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

        <Button onClick={adicionar} className="w-full sm:w-auto">Cadastrar funcionário</Button>
      </Card>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Funcionários cadastrados</h2>
        <div className="space-y-2">
          {funcionarios.map((f) => (
            <Card key={f.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{f.nome}</div>
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
                    actions.removerFuncionario(f.id);
                    toast.success("Funcionário removido");
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
    </div>
  );
}
