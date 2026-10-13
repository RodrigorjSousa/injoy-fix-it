// Reforços de limpeza vistos pelo gestor: os lançados pela Recepção (freelancer + valor, já na escala)
// e pedidos antigos do fluxo de autorização. O gestor edita (resumo dos plantões) ou exclui.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing, Edit3, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlantoesDialog, type AlvoPlantoes } from "@/components/escala/plantoes-freelancer";
import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_PEDIDO,
  useExcluirReforco,
  usePedidosReforco,
  type PedidoReforco,
} from "@/lib/previsao-reforco";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

const dataCurta = (v: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${v}T12:00:00Z`));
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function usePedidosPendentes() {
  const q = usePedidosReforco();
  return (q.data ?? []).filter((p) => p.status === "pendente");
}

type DiaEscala = {
  id: string;
  colaborador_id: string;
  unidade: "Botafogo" | "Ipanema";
  data: string;
  valor_combinado: number | null;
  hora_entrada: string | null;
  hora_saida: string | null;
};

/** Plantões ligados aos lançamentos (valor e horário atuais, já com as correções do gestor). */
function useDiasDosLancamentos(ids: string[]) {
  return useQuery({
    queryKey: ["plantoes-freelancer", "lancamentos", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Map<string, DiaEscala>> => {
      const { data, error } = await supabase
        .from("escala_dias")
        .select("id,colaborador_id,unidade,data,valor_combinado,hora_entrada,hora_saida")
        .in("id", ids);
      if (error) throw new Error(error.message);
      return new Map(((data ?? []) as DiaEscala[]).map((d) => [d.id, d]));
    },
  });
}

export function PedidosReforcoGestor() {
  const q = usePedidosReforco();
  const excluir = useExcluirReforco();
  const [alvo, setAlvo] = useState<AlvoPlantoes | null>(null);
  const hoje = todaySP();
  const lista = (q.data ?? [])
    .filter((p) => p.data >= hoje)
    .sort((a, b) => a.data.localeCompare(b.data) || a.unidade.localeCompare(b.unidade));
  const lancados = lista.filter((p) => p.status === "lancado");
  const antigos = lista.filter((p) => p.status !== "lancado");
  const dias = useDiasDosLancamentos(
    lancados.map((p) => p.escala_dia_id).filter((x): x is string => !!x),
  );

  const apagar = (p: PedidoReforco) => {
    const texto =
      p.status === "lancado" && p.escala_dia_id
        ? `Excluir o reforço de ${p.freelancer_nome ?? "freelancer"} em ${dataCurta(p.data)}? O plantão sai da escala e do Financeiro.`
        : `Excluir o pedido de ${p.unidade} em ${dataCurta(p.data)}?`;
    if (!confirm(texto)) return;
    excluir.mutate(p.id, {
      onSuccess: () => toast.success("Reforço excluído"),
      onError: (e) => toast.error(e.message),
    });
  };

  if (q.isLoading) return null;
  if (q.error)
    return (
      <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Reforços: {(q.error as Error).message}
      </Card>
    );
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-black">
        <BellRing className="h-5 w-5 text-amber-600" /> Reforços lançados pela Recepção
        {lancados.length > 0 && (
          <span className="rounded-full bg-teal-700 px-2 py-0.5 text-xs font-black text-white">
            {lancados.length}
          </span>
        )}
      </h2>
      {dias.error && (
        <p className="text-xs text-red-700">Plantões: {(dias.error as Error).message}</p>
      )}
      {!lista.length ? (
        <Card className="p-4 text-sm text-slate-500">Nenhum reforço para os próximos dias.</Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {lancados.map((p) => {
            const d = p.escala_dia_id ? dias.data?.get(p.escala_dia_id) : undefined;
            return (
              <Card
                key={p.id}
                className={cn("space-y-1 border p-3 text-sm", STATUS_PEDIDO.lancado.cls)}
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="capitalize">
                    {p.unidade} · {dataCurta(p.data)}
                  </strong>
                  <span className="text-xs font-black">
                    {d
                      ? brl.format(Number(d.valor_combinado ?? 0))
                      : p.escala_dia_id
                        ? "…"
                        : "fora da escala"}
                  </span>
                </div>
                <p>
                  <b>{p.freelancer_nome ?? "Freelancer"}</b>
                  {d
                    ? ` · ${d.hora_entrada?.slice(0, 5) ?? "--:--"}–${d.hora_saida?.slice(0, 5) ?? "--:--"}`
                    : ""}{" "}
                  · lançado por {p.solicitado_nome ?? "—"} em{" "}
                  {new Date(p.solicitado_em).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                {p.mensagem && <p className="text-xs">"{p.mensagem}"</p>}
                {!p.escala_dia_id && (
                  <p className="text-xs">O plantão já foi removido da escala.</p>
                )}
                <div className="flex gap-2 pt-1">
                  {d && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setAlvo({
                          colaboradorId: d.colaborador_id,
                          unidade: d.unidade,
                          mes: d.data.slice(0, 7),
                        })
                      }
                    >
                      <Edit3 className="mr-1.5 h-4 w-4" /> Editar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-700"
                    disabled={excluir.isPending}
                    onClick={() => apagar(p)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
                  </Button>
                </div>
              </Card>
            );
          })}
          {antigos.map((p) => (
            <Card
              key={p.id}
              className={cn("space-y-1 border p-3 text-sm", STATUS_PEDIDO[p.status].cls)}
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="capitalize">
                  {p.unidade} · {dataCurta(p.data)}
                </strong>
                <span className="text-xs font-black">
                  Pedido antigo · {STATUS_PEDIDO[p.status].txt}
                </span>
              </div>
              <p className="text-xs">
                Pedido por {p.solicitado_nome ?? "—"}
                {p.decidido_nome
                  ? ` · ${p.status === "autorizado" ? "autorizado" : "respondido"} por ${p.decidido_nome}`
                  : ""}
                {p.mensagem ? ` · "${p.mensagem}"` : ""}
              </p>
              <div className="flex gap-2 pt-1">
                {p.status === "autorizado" && (
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/gestor/escala"
                      search={{ reforcoData: p.data, reforcoUnidade: p.unidade }}
                    >
                      <UserPlus className="mr-1.5 h-4 w-4" /> Lançar freelancer na escala
                    </Link>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-700"
                  disabled={excluir.isPending}
                  onClick={() => apagar(p)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <PlantoesDialog alvo={alvo} onClose={() => setAlvo(null)} />
    </section>
  );
}
