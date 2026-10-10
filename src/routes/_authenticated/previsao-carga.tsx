import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Gauge, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Bloco, SERVICOS, contarServicosPrevistos, useQuartosServico } from "@/components/gestao/servicos-quartos";
import { requireGestor } from "@/lib/require-gestor";
import { usePrevisaoCarga, useRecalcularPrevisao, type ForecastRow } from "@/lib/previsao-carga";
import {
  STATUS_PEDIDO,
  pedidoDoDia,
  useCancelarReforco,
  usePedidosReforco,
  usePedirReforco,
  type PedidoReforco,
} from "@/lib/previsao-reforco";
import { useMe } from "@/lib/store";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/previsao-carga")({
  beforeLoad: () => requireGestor({ tela: "previsao-carga" }),
  component: Page,
  head: () => ({ meta: [{ title: "Previsão de Carga | INJOY Hotéis" }] }),
});

const NIVEL = {
  verde: { txt: "Normal", cls: "border-emerald-200 bg-emerald-50" },
  amarelo: { txt: "Atenção", cls: "border-amber-300 bg-amber-50" },
  vermelho: { txt: "Sobrecarga", cls: "border-red-300 bg-red-50" },
} as const;

const dataCurta = (v: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${v}T12:00:00Z`));

function Page() {
  const previsao = usePrevisaoCarga();
  const recalcular = useRecalcularPrevisao();
  const pedidos = usePedidosReforco();
  const [pedindo, setPedindo] = useState<ForecastRow | null>(null);
  const hoje = todaySP();
  const grupos = useMemo(
    () =>
      (["Botafogo", "Ipanema"] as const).map((u) => ({
        unidade: u,
        dias: (previsao.data ?? []).filter((r) => r.unidade === u && r.data >= hoje).slice(0, 7),
      })),
    [previsao.data, hoje],
  );
  const atualizar = () =>
    recalcular.mutate(["Botafogo", "Ipanema"], {
      onSuccess: () => toast.success("Previsão atualizada com o Cloudbeds"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar"),
    });

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="secondary" className="mb-2">
            <Gauge className="mr-1 h-3 w-3" /> Operação
          </Badge>
          <h1 className="text-2xl font-black">Previsão de Carga</h1>
          <p className="mt-1 text-sm text-slate-500">
            Serviços de limpeza previstos pelo Cloudbeds e a equipe escalada. Viu sobrecarga? Avise o gestor para autorizar
            freelancer.
          </p>
        </div>
        <Button onClick={atualizar} disabled={recalcular.isPending}>
          <RefreshCw className={cn("mr-2 h-4 w-4", recalcular.isPending && "animate-spin")} /> Atualizar agora
        </Button>
      </header>

      {previsao.error && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar a previsão: {(previsao.error as Error).message}
        </Card>
      )}

      {grupos.map((g) => (
        <UnidadeSecao key={g.unidade} unidade={g.unidade} dias={g.dias} pedidos={pedidos.data} onPedir={setPedindo} carregando={previsao.isLoading} />
      ))}

      <PedirDialog row={pedindo} onClose={() => setPedindo(null)} />
    </div>
  );
}

function UnidadeSecao({
  unidade,
  dias,
  pedidos,
  onPedir,
  carregando,
}: {
  unidade: "Botafogo" | "Ipanema";
  dias: ForecastRow[];
  pedidos: PedidoReforco[] | undefined;
  onPedir: (r: ForecastRow) => void;
  carregando: boolean;
}) {
  const quartos = useQuartosServico(unidade);
  const totalQuartos = (quartos.data ?? []).filter((q) => q.condition !== "maintenance").length;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-black">{unidade}</h2>
      {!dias.length ? (
        <Card className="p-6 text-sm text-slate-500">{carregando ? "Carregando…" : "Previsão ainda não calculada. Clique em Atualizar agora."}</Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {dias.map((row) => (
            <DiaCard key={row.id} row={row} totalQuartos={totalQuartos} pedido={pedidoDoDia(pedidos, unidade, row.data)} onPedir={() => onPedir(row)} />
          ))}
        </div>
      )}
    </section>
  );
}

function DiaCard({ row, totalQuartos, pedido, onPedir }: { row: ForecastRow; totalQuartos: number; pedido: PedidoReforco | null; onPedir: () => void }) {
  const { data: me } = useMe();
  const cancelar = useCancelarReforco();
  const c = contarServicosPrevistos(row, totalQuartos);
  const nivel = NIVEL[row.nivel];
  const podeCancelar = pedido?.status === "pendente" && (pedido.solicitado_por === me?.userId || me?.isGestor || me?.isAdmin);
  return (
    <Card className={cn("space-y-3 p-4", nivel.cls)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="capitalize">{dataCurta(row.data)}</strong>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-black uppercase">
          {nivel.txt} · carga {Math.round(Number(row.ocupacao_carga_pct))}%
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SERVICOS.map((s) => (
          <Bloco key={s.key} s={s} valor={c[s.key]} pequeno />
        ))}
      </div>
      <p className="text-xs font-semibold text-slate-700">
        {row.qtd_checkins} chegadas · {row.qtd_checkouts} saídas · {row.camareiras_escaladas} camareira(s) na escala
        {row.freelancers_escalados > 0 ? ` + ${row.freelancers_escalados} freelancer(s)` : ""}
        {row.chegada_mais_cedo ? ` · 1ª chegada ${row.chegada_mais_cedo.slice(0, 5)}` : ""}
      </p>

      {pedido ? (
        <div className={cn("space-y-1 rounded-lg border p-2 text-xs", STATUS_PEDIDO[pedido.status].cls)}>
          <p className="flex items-center gap-1 font-black">
            {pedido.status === "autorizado" ? <CheckCircle2 className="h-4 w-4" /> : pedido.status === "negado" ? <XCircle className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
            {STATUS_PEDIDO[pedido.status].txt}
          </p>
          <p>
            Pedido por {pedido.solicitado_nome ?? "—"} em{" "}
            {new Date(pedido.solicitado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            {pedido.mensagem ? ` · "${pedido.mensagem}"` : ""}
          </p>
          {pedido.decidido_nome && (
            <p>
              {pedido.status === "autorizado" ? "Autorizado" : "Respondido"} por {pedido.decidido_nome}
              {pedido.resposta ? `: "${pedido.resposta}"` : ""}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            {podeCancelar && (
              <Button size="sm" variant="outline" disabled={cancelar.isPending} onClick={() => cancelar.mutate(pedido.id, { onError: (e) => toast.error(e.message) })}>
                Cancelar pedido
              </Button>
            )}
            {pedido.status === "negado" && (
              <Button size="sm" variant="outline" onClick={onPedir}>
                Pedir de novo
              </Button>
            )}
          </div>
        </div>
      ) : row.freelancers_escalados > 0 ? (
        <p className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" /> Reforço já escalado
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {row.nivel !== "verde" ? (
            <p className="flex items-center gap-1 text-xs font-bold text-red-700">
              <AlertTriangle className="h-4 w-4" /> Possível sobrecarga
            </p>
          ) : (
            <span />
          )}
          <Button size="sm" variant={row.nivel === "verde" ? "outline" : "default"} onClick={onPedir}>
            <BellRing className="mr-1.5 h-4 w-4" /> Avisar gestor / pedir reforço
          </Button>
        </div>
      )}
    </Card>
  );
}

function PedirDialog({ row, onClose }: { row: ForecastRow | null; onClose: () => void }) {
  const pedir = usePedirReforco();
  const [msg, setMsg] = useState("");
  const enviar = () => {
    if (!row) return;
    pedir.mutate(
      { unidade: row.unidade as "Botafogo" | "Ipanema", data: row.data, mensagem: msg },
      {
        onSuccess: () => {
          toast.success("Gestor avisado. Aguarde a autorização para chamar o freelancer.");
          setMsg("");
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };
  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pedir reforço ao gestor</DialogTitle>
          <DialogDescription>
            {row ? `${row.unidade} · ${dataCurta(row.data)} · carga ${Math.round(Number(row.ocupacao_carga_pct))}%` : ""}. O gestor recebe
            uma notificação e autoriza ou não. Só chame o freelancer depois de autorizado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Observação (opcional)</Label>
          <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ex.: 6 gerais com check-in antes das 14h" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={pedir.isPending}>
            <BellRing className="mr-2 h-4 w-4" /> Avisar gestor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
