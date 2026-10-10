// Pedidos de reforço feitos pela Recepção, para o gestor autorizar ou negar.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellRing, CheckCircle2, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { STATUS_PEDIDO, useDecidirReforco, usePedidosReforco, type PedidoReforco } from "@/lib/previsao-reforco";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

const dataCurta = (v: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${v}T12:00:00Z`));

export function usePedidosPendentes() {
  const q = usePedidosReforco();
  return (q.data ?? []).filter((p) => p.status === "pendente");
}

export function PedidosReforcoGestor() {
  const q = usePedidosReforco();
  const hoje = todaySP();
  const lista = (q.data ?? []).filter((p) => p.data >= hoje);
  const pendentes = lista.filter((p) => p.status === "pendente");
  const decididos = lista.filter((p) => p.status !== "pendente").slice(0, 6);
  if (q.isLoading) return null;
  if (q.error)
    return <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">Pedidos de reforço: {(q.error as Error).message}</Card>;
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-black">
        <BellRing className="h-5 w-5 text-amber-600" /> Pedidos de reforço da Recepção
        {pendentes.length > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-black text-white">{pendentes.length}</span>}
      </h2>
      {!lista.length ? (
        <Card className="p-4 text-sm text-slate-500">Nenhum pedido para os próximos dias.</Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {pendentes.map((p) => (
            <PedidoPendente key={p.id} p={p} />
          ))}
          {decididos.map((p) => (
            <Card key={p.id} className={cn("space-y-1 border p-3 text-sm", STATUS_PEDIDO[p.status].cls)}>
              <div className="flex items-center justify-between gap-2">
                <strong className="capitalize">
                  {p.unidade} · {dataCurta(p.data)}
                </strong>
                <span className="text-xs font-black">{STATUS_PEDIDO[p.status].txt}</span>
              </div>
              <p className="text-xs">
                Pedido por {p.solicitado_nome ?? "—"} · {p.status === "autorizado" ? "autorizado" : "negado"} por {p.decidido_nome ?? "—"}
                {p.resposta ? ` · "${p.resposta}"` : ""}
              </p>
              {p.status === "autorizado" && (
                <Button asChild size="sm" variant="outline">
                  <Link to="/gestor/escala" search={{ reforcoData: p.data, reforcoUnidade: p.unidade }}>
                    <UserPlus className="mr-1.5 h-4 w-4" /> Lançar freelancer na escala
                  </Link>
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function PedidoPendente({ p }: { p: PedidoReforco }) {
  const decidir = useDecidirReforco();
  const [resposta, setResposta] = useState("");
  const responder = (autorizar: boolean) =>
    decidir.mutate(
      { id: p.id, autorizar, resposta },
      {
        onSuccess: () => toast.success(autorizar ? "Reforço autorizado. A Recepção foi avisada." : "Pedido negado. A Recepção foi avisada."),
        onError: (e) => toast.error(e.message),
      },
    );
  return (
    <Card className={cn("space-y-2 border-2 p-3", p.nivel === "vermelho" ? "border-red-400 bg-red-50" : "border-amber-400 bg-amber-50")}>
      <div className="flex items-center justify-between gap-2">
        <strong className="capitalize">
          {p.unidade} · {dataCurta(p.data)}
        </strong>
        <span className="text-xs font-black uppercase">
          {p.nivel ?? "—"}
          {p.ocupacao_pct != null ? ` · carga ${Math.round(Number(p.ocupacao_pct))}%` : ""}
          {p.gerais != null ? ` · ${p.gerais} gerais` : ""}
        </span>
      </div>
      <p className="text-sm">
        <b>{p.solicitado_nome ?? "Recepção"}</b> pediu reforço em{" "}
        {new Date(p.solicitado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        {p.mensagem ? `: "${p.mensagem}"` : "."}
      </p>
      <Input value={resposta} onChange={(e) => setResposta(e.target.value)} placeholder="Resposta (opcional), ex.: chamar 1 freelancer das 8h às 16h" />
      <div className="flex gap-2">
        <Button size="sm" disabled={decidir.isPending} onClick={() => responder(true)}>
          <CheckCircle2 className="mr-1.5 h-4 w-4" /> Autorizar
        </Button>
        <Button size="sm" variant="outline" disabled={decidir.isPending} onClick={() => responder(false)}>
          <XCircle className="mr-1.5 h-4 w-4" /> Negar
        </Button>
      </div>
    </Card>
  );
}
