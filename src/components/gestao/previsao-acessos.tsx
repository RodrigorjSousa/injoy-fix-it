// Gestor escolhe quem vê a Previsão de Carga (fora da Área do Gestor).
import { Eye, EyeOff, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAcessosPrevisao, useDefinirAcessoPrevisao, type AcessoPrevisao } from "@/lib/previsao-reforco";

const ORIGEM: Record<AcessoPrevisao["origem"], string> = {
  gestor: "Gestor (sempre vê)",
  liberado: "Liberado por você",
  bloqueado: "Bloqueado por você",
  recepcao: "Padrão: Recepção",
  equipe: "Liberado em Equipe",
  sem_acesso: "Não vê",
};
const PAPEL: Record<string, string> = { recepcao: "Recepção", camareira: "Camareira", funcionario: "Técnico", gestor: "Gestor", admin: "Admin" };

export function PrevisaoAcessos() {
  const q = useAcessosPrevisao();
  const definir = useDefinirAcessoPrevisao();
  const mudar = (a: AcessoPrevisao, liberado: boolean | null) =>
    definir.mutate(
      { userId: a.user_id, liberado },
      {
        onSuccess: () =>
          toast.success(liberado === null ? `${a.nome}: voltou ao padrão` : liberado ? `${a.nome} agora vê a Previsão de Carga` : `${a.nome} não vê mais a Previsão de Carga`),
        onError: (e) => toast.error(e.message),
      },
    );
  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-black">
          <ShieldCheck className="h-5 w-5 text-teal-600" /> Quem vê a Previsão de Carga
        </h2>
        <p className="text-sm text-slate-500">
          Ligue para liberar, desligue para tirar. A Recepção já vê por padrão. A pessoa vê o item "Previsão de Carga" no menu ao
          reabrir o app.
        </p>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : q.error ? (
        <p className="text-sm text-red-600">{(q.error as Error).message}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {(q.data ?? []).map((a) => (
            <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  {a.ve ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-slate-400" />}
                  {a.nome}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.papeis.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[10px]">
                      {PAPEL[p] ?? p}
                    </Badge>
                  ))}
                  <span className="text-[11px] text-slate-500">{ORIGEM[a.origem]}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(a.origem === "liberado" || a.origem === "bloqueado") && (
                  <Button size="sm" variant="ghost" title="Voltar ao padrão" disabled={definir.isPending} onClick={() => mudar(a, null)}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                <Switch
                  checked={a.ve}
                  disabled={a.gestor || definir.isPending}
                  onCheckedChange={(v) => mudar(a, v)}
                  aria-label={`Previsão de Carga para ${a.nome}`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
