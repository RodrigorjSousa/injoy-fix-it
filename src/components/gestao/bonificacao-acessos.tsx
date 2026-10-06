import { useMemo, useState } from "react";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useAcessosBonificacao,
  useDefinirAcessoBonificacao,
  type AcessoBonificacao,
} from "@/lib/bonificacao";

const PAPEL: Record<string, string> = {
  gestor: "Gestor",
  admin: "Admin",
  recepcao: "Recepção",
  camareira: "Camareira",
  funcionario: "Funcionário",
  professor: "Professor",
};

function LinhaAcesso({ a }: { a: AcessoBonificacao }) {
  const definir = useDefinirAcessoBonificacao();
  const salvar = (patch: Partial<Pick<AcessoBonificacao, "liberado" | "pode_editar" | "pode_excluir">>) => {
    const novo = { ...a, ...patch };
    // Ao liberar alguém pela primeira vez, já vem com "editar" ligado.
    if (patch.liberado && !a.liberado && patch.pode_editar === undefined) novo.pode_editar = true;
    definir.mutate(
      {
        userId: a.user_id,
        liberado: novo.liberado,
        podeEditar: novo.pode_editar,
        podeExcluir: novo.pode_excluir,
      },
      {
        onSuccess: () =>
          toast.success(
            novo.liberado ? `Acesso de ${a.nome} atualizado` : `${a.nome} não acessa mais a Bonificação`,
          ),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <tr className="border-t">
      <td className="p-2">
        <div className="font-medium">{a.nome}</div>
        <div className="text-[11px] text-muted-foreground">{a.email}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {a.papeis.map((p) => (
            <Badge key={p} variant="outline" className="px-1.5 py-0 text-[10px]">
              {PAPEL[p] ?? p}
            </Badge>
          ))}
        </div>
      </td>
      {a.gestor ? (
        <td colSpan={3} className="p-2 text-center text-xs text-muted-foreground">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
          Acesso total (gestor)
        </td>
      ) : (
        <>
          <td className="p-2 text-center">
            <Switch
              checked={a.liberado}
              disabled={definir.isPending}
              onCheckedChange={(v) => salvar({ liberado: v })}
              aria-label={`Liberar ${a.nome} para acessar e lançar`}
            />
          </td>
          <td className="p-2 text-center">
            <Switch
              checked={a.liberado && a.pode_editar}
              disabled={definir.isPending || !a.liberado}
              onCheckedChange={(v) => salvar({ pode_editar: v })}
              aria-label={`Permitir que ${a.nome} edite`}
            />
          </td>
          <td className="p-2 text-center">
            <Switch
              checked={a.liberado && a.pode_excluir}
              disabled={definir.isPending || !a.liberado}
              onCheckedChange={(v) => salvar({ pode_excluir: v })}
              aria-label={`Permitir que ${a.nome} exclua`}
            />
          </td>
        </>
      )}
    </tr>
  );
}

/** Gestor escolhe quem acessa, lança, edita e exclui avaliações da Bonificação. */
export function BonificacaoAcessos() {
  const q = useAcessosBonificacao();
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const todos = q.data ?? [];
    return t
      ? todos.filter((a) => a.nome.toLowerCase().includes(t) || (a.email ?? "").toLowerCase().includes(t))
      : todos;
  }, [q.data, busca]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Escolha quem pode abrir a Bonificação e lançar avaliações. A liberação vale para o{" "}
        <strong>login</strong> da pessoa e entra em vigor na hora (ela só precisa recarregar a página).
      </p>
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          className="pl-8"
        />
      </div>
      {q.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {!!lista.length && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Pessoa</th>
                <th className="p-2">Acessar e lançar</th>
                <th className="p-2">Editar</th>
                <th className="p-2">Excluir</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <LinhaAcesso key={a.user_id} a={a} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
