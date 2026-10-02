import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { usePessoasPonto, useSalvarPessoaPonto, type PessoaPonto } from "@/lib/ponto";

const SETOR: Record<PessoaPonto["setor"], string> = {
  manutencao: "Manutenção",
  recepcao: "Recepção",
  camareiras: "Camareiras",
};

type Filtro = "participam" | "fora" | "inativos";

const VAZIO: Omit<PessoaPonto, "id"> = {
  nome: "",
  setor: "camareiras",
  unidade: "Botafogo",
  vinculo: "fixo",
  telefone: null,
  funcionario_id: null,
  ativo: true,
  ponto_habilitado: true,
};

export function PessoasPonto() {
  const q = usePessoasPonto();
  const salvar = useSalvarPessoaPonto();
  const [filtro, setFiltro] = useState<Filtro>("participam");
  const [editando, setEditando] = useState<(Omit<PessoaPonto, "id"> & { id?: string }) | null>(
    null,
  );

  const listas = useMemo(() => {
    const todas = q.data?.pessoas ?? [];
    return {
      participam: todas.filter((p) => p.ativo && p.ponto_habilitado),
      fora: todas.filter((p) => p.ativo && !p.ponto_habilitado),
      inativos: todas.filter((p) => !p.ativo),
    };
  }, [q.data]);

  if (q.isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (q.error) return <p className="text-sm text-rose-600">{(q.error as Error).message}</p>;

  const funcionarioNome = (id: string | null) =>
    q.data?.funcionarios.find((f) => f.id === id)?.nome ?? null;

  const alternar = (
    p: PessoaPonto,
    campo: "ponto_habilitado" | "ativo",
    valor: boolean,
    msg: string,
  ) =>
    salvar.mutate(
      { ...p, [campo]: valor },
      { onSuccess: () => toast.success(msg), onError: (e) => toast.error((e as Error).message) },
    );

  const lista = listas[filtro];
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["participam", `Batem ponto (${listas.participam.length})`],
              ["fora", `Fora do ponto (${listas.fora.length})`],
              ["inativos", `Desligados (${listas.inativos.length})`],
            ] as [Filtro, string][]
          ).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={filtro === k ? "default" : "outline"}
              onClick={() => setFiltro(k)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button className="gap-2" onClick={() => setEditando({ ...VAZIO })}>
          <Plus className="h-4 w-4" />
          Incluir pessoa
        </Button>
      </Card>

      <p className="text-xs text-muted-foreground">
        A lista é a mesma da Equipe da Escala. "Fora do ponto" continua na escala, mas não bate
        ponto no app. "Desligados" saem da escala e do ponto (o histórico é mantido).
      </p>

      {!lista.length ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Ninguém nesta lista.</Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {lista.map((p) => (
            <Card key={p.id} className={cn("space-y-2 p-3", !p.ativo && "opacity-70")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.nome}</p>
                  <p className="text-xs text-slate-500">
                    {SETOR[p.setor]} · {p.unidade}
                    {p.telefone ? ` · ${p.telefone}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {funcionarioNome(p.funcionario_id)
                      ? `Usuário do app: ${funcionarioNome(p.funcionario_id)}`
                      : p.vinculo === "fixo"
                        ? "Sem usuário no app — bate ponto pela recepção"
                        : "Bate ponto pela recepção"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge className={p.vinculo === "fixo" ? "bg-emerald-600" : "bg-amber-500"}>
                    {p.vinculo === "fixo" ? "Fixo" : "Freelancer"}
                  </Badge>
                  {p.ativo && p.ponto_habilitado && (
                    <Badge
                      variant="outline"
                      className={p.cadastro_facial ? "" : "border-amber-400 text-amber-700"}
                    >
                      {p.cadastro_facial ? "rosto ok" : "sem rosto"}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => setEditando(p)}
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
                {p.ativo ? (
                  <>
                    <label className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={p.ponto_habilitado}
                        onCheckedChange={(v) =>
                          alternar(
                            p,
                            "ponto_habilitado",
                            v,
                            v ? `${p.nome} incluído(a) no ponto` : `${p.nome} retirado(a) do ponto`,
                          )
                        }
                      />
                      Bate ponto
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-rose-600"
                      onClick={() => {
                        if (
                          !confirm(
                            `Desligar ${p.nome}? Sai da escala e do ponto; o histórico fica guardado.`,
                          )
                        )
                          return;
                        alternar(p, "ativo", false, `${p.nome} desligado(a)`);
                      }}
                    >
                      <UserX className="h-4 w-4" />
                      Desligar
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => alternar(p, "ativo", true, `${p.nome} reativado(a)`)}
                  >
                    <UserCheck className="h-4 w-4" />
                    Reativar
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editando && (
        <PessoaDialog
          pessoa={editando}
          funcionarios={q.data?.funcionarios ?? []}
          salvando={salvar.isPending}
          onClose={() => setEditando(null)}
          onSave={(p) =>
            salvar.mutate(p, {
              onSuccess: () => {
                toast.success(p.id ? "Pessoa atualizada" : `${p.nome} incluído(a)`);
                setEditando(null);
              },
              onError: (e) => toast.error((e as Error).message),
            })
          }
        />
      )}
    </div>
  );
}

function PessoaDialog({
  pessoa,
  funcionarios,
  salvando,
  onClose,
  onSave,
}: {
  pessoa: Omit<PessoaPonto, "id"> & { id?: string };
  funcionarios: { id: string; nome: string; user_id: string | null }[];
  salvando: boolean;
  onClose: () => void;
  onSave: (p: Omit<PessoaPonto, "id"> & { id?: string }) => void;
}) {
  const [f, setF] = useState(pessoa);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{f.id ? "Editar pessoa" : "Incluir pessoa"}</DialogTitle>
          <DialogDescription>Vale para a escala e para o ponto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Vínculo</Label>
              <Select
                value={f.vinculo}
                onValueChange={(v) => setF({ ...f, vinculo: v as PessoaPonto["vinculo"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixo">Fixo</SelectItem>
                  <SelectItem value="freelance">Freelancer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Setor</Label>
              <Select
                value={f.setor}
                onValueChange={(v) => setF({ ...f, setor: v as PessoaPonto["setor"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="camareiras">Camareiras</SelectItem>
                  <SelectItem value="recepcao">Recepção</SelectItem>
                  <SelectItem value="manutencao">Manutenção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select
                value={f.unidade}
                onValueChange={(v) => setF({ ...f, unidade: v as PessoaPonto["unidade"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Botafogo">Botafogo</SelectItem>
                  <SelectItem value="Ipanema">Ipanema</SelectItem>
                  <SelectItem value="Ambas">Ambas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={f.telefone ?? ""}
                onChange={(e) => setF({ ...f, telefone: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Usuário do app (para bater ponto no próprio celular)</Label>
            <Select
              value={f.funcionario_id ?? "nenhum"}
              onValueChange={(v) => setF({ ...f, funcionario_id: v === "nenhum" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Sem usuário — bate ponto pela recepção</SelectItem>
                {funcionarios.map((fu) => (
                  <SelectItem key={fu.id} value={fu.id}>
                    {fu.nome}
                    {fu.user_id ? "" : " (sem login)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={f.ponto_habilitado}
              onCheckedChange={(v) => setF({ ...f, ponto_habilitado: v })}
            />
            Bate ponto no app
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={salvando || !f.nome.trim()} onClick={() => onSave(f)}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
