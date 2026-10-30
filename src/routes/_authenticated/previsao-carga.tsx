import { createFileRoute } from "@tanstack/react-router";
import { situacaoReforco } from "@/lib/previsao-reforco-status";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Gauge, RefreshCw, XCircle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Bloco,
  SERVICOS,
  contarServicosPrevistos,
  useQuartosServico,
} from "@/components/gestao/servicos-quartos";
import { requireGestor } from "@/lib/require-gestor";
import { usePrevisaoCarga, useRecalcularPrevisao, type ForecastRow } from "@/lib/previsao-carga";
import {
  STATUS_PEDIDO,
  lancadosDoDia,
  pedidoDoDia,
  useCancelarReforco,
  useLancarReforco,
  useOpcoesReforco,
  usePedidosReforco,
  type PedidoReforco,
} from "@/lib/previsao-reforco";
import { useMe } from "@/lib/store";
import { todaySP } from "@/lib/tz";
import { addCivilDays } from "@/lib/escala-engine";
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
  new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${v}T12:00:00Z`));

function Page() {
  const previsao = usePrevisaoCarga();
  const recalcular = useRecalcularPrevisao();
  const pedidos = usePedidosReforco();
  const [pedindo, setPedindo] = useState<PedidoAlvo | null>(null);
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
            Serviços de limpeza previstos pelo Cloudbeds e a equipe escalada. Viu sobrecarga? Lance
            o reforço (freelancer e valor): ele entra na escala e o gestor é avisado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={atualizar} disabled={recalcular.isPending}>
            <RefreshCw className={cn("mr-2 h-4 w-4", recalcular.isPending && "animate-spin")} />{" "}
            Atualizar agora
          </Button>
          <Button
            onClick={() =>
              setPedindo({ unidade: "Botafogo", data: addCivilDays(hoje, 1), livre: true })
            }
          >
            <BellRing className="mr-2 h-4 w-4" /> Pedir reforço
          </Button>
        </div>
      </header>

      {previsao.error && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar a previsão: {(previsao.error as Error).message}
        </Card>
      )}

      {grupos.map((g) => (
        <UnidadeSecao
          key={g.unidade}
          unidade={g.unidade}
          dias={g.dias}
          pedidos={pedidos.data}
          onPedir={(r) =>
            setPedindo({
              unidade: r.unidade as "Botafogo" | "Ipanema",
              data: r.data,
              carga: Number(r.ocupacao_carga_pct),
            })
          }
          carregando={previsao.isLoading}
        />
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
        <Card className="p-6 text-sm text-slate-500">
          {carregando ? "Carregando…" : "Previsão ainda não calculada. Clique em Atualizar agora."}
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {dias.map((row) => (
            <DiaCard
              key={row.id}
              row={row}
              totalQuartos={totalQuartos}
              pedido={pedidoDoDia(pedidos, unidade, row.data)}
              lancados={lancadosDoDia(pedidos, unidade, row.data)}
              onPedir={() => onPedir(row)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DiaCard({
  row,
  totalQuartos,
  pedido,
  lancados,
  onPedir,
}: {
  row: ForecastRow;
  totalQuartos: number;
  pedido: PedidoReforco | null;
  lancados: PedidoReforco[];
  onPedir: () => void;
}) {
  const { data: me } = useMe();
  const cancelar = useCancelarReforco();
  const c = contarServicosPrevistos(row, totalQuartos);
  const nivel = NIVEL[row.nivel];
  const sit = situacaoReforco(row, undefined, pedido?.status === "autorizado" || lancados.length > 0);
  const reforcoOk = sit.chamado;
  const sozinha = sit.sozinha;
  const podeCancelar =
    pedido?.status === "pendente" &&
    (pedido.solicitado_por === me?.userId || me?.isGestor || me?.isAdmin);
  return (
    <Card
      className={cn(
        "space-y-3 p-4",
        sozinha ? "border-red-500 bg-red-50" : reforcoOk && row.nivel !== "verde" ? "border-teal-400 bg-teal-50" : nivel.cls,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="capitalize">{dataCurta(row.data)}</strong>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-black uppercase">
          {sozinha ? "Camareira sozinha" : reforcoOk && row.nivel !== "verde" ? "Reforço chamado" : nivel.txt} · carga{" "}
          {Math.round(Number(row.ocupacao_carga_pct))}%
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SERVICOS.map((s) => (
          <Bloco key={s.key} s={s} valor={c[s.key]} pequeno />
        ))}
      </div>
      <p className="text-xs font-semibold text-slate-700">
        {row.qtd_checkins} chegadas · {row.qtd_checkouts} saídas · {row.camareiras_escaladas}{" "}
        camareira(s) na escala
        {row.freelancers_escalados > 0 ? ` + ${row.freelancers_escalados} reforço(s)` : ""}
        {row.chegada_mais_cedo ? ` · 1ª chegada ${row.chegada_mais_cedo.slice(0, 5)}` : ""}
      </p>

      {lancados.length > 0 && (
        <div className={cn("space-y-1 rounded-lg border p-2 text-xs", STATUS_PEDIDO.lancado.cls)}>
          <p className="flex items-center gap-1 font-black">
            <CheckCircle2 className="h-4 w-4" /> Reforço lançado
          </p>
          {lancados.map((l) => (
            <p key={l.id}>
              <b>{l.freelancer_nome ?? "Freelancer"}</b>
              {l.valor != null
                ? ` · ${Number(l.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                : ""}{" "}
              · por {l.solicitado_nome ?? "—"}
              {!l.escala_dia_id ? " · removido da escala pelo gestor" : ""}
            </p>
          ))}
        </div>
      )}
      {pedido ? (
        <div
          className={cn(
            "space-y-1 rounded-lg border p-2 text-xs",
            STATUS_PEDIDO[pedido.status].cls,
          )}
        >
          <p className="flex items-center gap-1 font-black">
            {pedido.status === "autorizado" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : pedido.status === "negado" ? (
              <XCircle className="h-4 w-4" />
            ) : (
              <BellRing className="h-4 w-4" />
            )}
            {STATUS_PEDIDO[pedido.status].txt}
          </p>
          <p>
            Pedido por {pedido.solicitado_nome ?? "—"} em{" "}
            {new Date(pedido.solicitado_em).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {pedido.mensagem ? ` · "${pedido.mensagem}"` : ""}
          </p>
          {pedido.decidido_nome && (
            <p>
              {pedido.status === "autorizado" ? "Autorizado" : "Respondido"} por{" "}
              {pedido.decidido_nome}
              {pedido.resposta ? `: "${pedido.resposta}"` : ""}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            {podeCancelar && (
              <Button
                size="sm"
                variant="outline"
                disabled={cancelar.isPending}
                onClick={() =>
                  cancelar.mutate(pedido.id, { onError: (e) => toast.error(e.message) })
                }
              >
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
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {sozinha ? (
            <p className="flex items-center gap-1 text-xs font-black text-red-700">
              <AlertTriangle className="h-4 w-4" /> Sobrecarga com 1 pessoa só — escale mais uma camareira.
            </p>
          ) : row.freelancers_escalados > 0 ? (
            <p className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" /> Reforço já escalado
            </p>
          ) : row.nivel !== "verde" ? (
            <p className="flex items-center gap-1 text-xs font-bold text-red-700">
              <AlertTriangle className="h-4 w-4" /> Possível sobrecarga
            </p>
          ) : (
            <span />
          )}
          <Button
            size="sm"
            variant={row.nivel === "verde" ? "outline" : "default"}
            onClick={onPedir}
          >
            <BellRing className="mr-1.5 h-4 w-4" />{" "}
            {row.freelancers_escalados > 0 || lancados.length > 0
              ? "Pedir mais reforço"
              : "Pedir reforço"}
          </Button>
        </div>
      )}
    </Card>
  );
}

type PedidoAlvo = {
  unidade: "Botafogo" | "Ipanema";
  data: string;
  carga?: number;
  livre?: boolean;
};

function PedirDialog({ row, onClose }: { row: PedidoAlvo | null; onClose: () => void }) {
  const lancar = useLancarReforco();
  const [unidade, setUnidade] = useState<"Botafogo" | "Ipanema">("Botafogo");
  const [data, setData] = useState("");
  const [escolhido, setEscolhido] = useState(""); // id do freelancer ou "novo"
  const [novoNome, setNovoNome] = useState("");
  const [valor, setValor] = useState("");
  const [entrada, setEntrada] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const opcoes = useOpcoesReforco(row ? unidade : null);
  const hoje = todaySP();
  useEffect(() => {
    if (row) {
      setUnidade(row.unidade);
      setData(row.data);
      setEscolhido("");
      setNovoNome("");
      setEntrada("");
      setMsg("");
      setErro(null);
    }
  }, [row]);
  useEffect(() => {
    if (opcoes.data) setValor((v) => v || String(opcoes.data.valor_padrao));
  }, [opcoes.data]);
  useEffect(() => {
    const f = opcoes.data?.freelancers.find((x) => x.id === escolhido);
    if (f?.hora_entrada) setEntrada(f.hora_entrada);
  }, [escolhido, opcoes.data]);
  const fechar = () => {
    setErro(null);
    setValor("");
    onClose();
  };
  const enviar = () => {
    if (!row) return;
    const v = Number(valor.replace(",", "."));
    if (!data || data < hoje) return setErro("Escolha hoje ou um dia futuro.");
    if (!escolhido) return setErro('Escolha o freelancer ou "Outro (digitar nome)".');
    if (escolhido === "novo" && novoNome.trim().length < 3)
      return setErro("Digite o nome completo do freelancer.");
    if (!(v >= 0) || valor.trim() === "") return setErro("Informe o valor.");
    setErro(null);
    lancar.mutate(
      {
        unidade,
        data,
        colaboradorId: escolhido === "novo" ? null : escolhido,
        novoNome: escolhido === "novo" ? novoNome.trim() : null,
        valor: v,
        horaEntrada: entrada || null,
        mensagem: msg,
      },
      {
        onSuccess: () => {
          toast.success("Reforço lançado na escala. O gestor foi avisado.");
          fechar();
        },
        onError: (e) => {
          setErro(e.message);
          toast.error(e.message);
        },
      },
    );
  };
  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pedir reforço</DialogTitle>
          <DialogDescription>
            O freelancer entra direto na escala do dia e o gestor recebe uma notificação. Para
            corrigir depois, fale com o gestor.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Unidade</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={unidade}
              disabled={!row?.livre}
              onChange={(e) => {
                setUnidade(e.target.value as "Botafogo" | "Ipanema");
                setEscolhido("");
              }}
            >
              <option value="Botafogo">Botafogo</option>
              <option value="Ipanema">Ipanema</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Dia</Label>
            <Input
              type="date"
              min={hoje}
              value={data}
              disabled={!row?.livre}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Freelancer</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={escolhido}
              onChange={(e) => setEscolhido(e.target.value)}
            >
              <option value="">{opcoes.isLoading ? "Carregando…" : "Escolha…"}</option>
              {(opcoes.data?.freelancers ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
              <option value="novo">Outro (digitar nome)</option>
            </select>
            {opcoes.error && (
              <p className="text-xs text-red-700">{(opcoes.error as Error).message}</p>
            )}
          </div>
          {escolhido === "novo" && (
            <div className="space-y-1 sm:col-span-2">
              <Label>Nome completo do freelancer</Label>
              <Input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex.: Joana Silva"
              />
              <p className="text-[11px] text-slate-500">
                O cadastro dele(a) é criado na escala automaticamente.
              </p>
            </div>
          )}
          <div className="space-y-1">
            <Label>Valor (R$)</Label>
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
            {opcoes.data?.modalidade && (
              <p className="text-[11px] text-slate-500">
                Padrão: {opcoes.data.modalidade} · {opcoes.data.horas_padrao} h
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Entrada</Label>
            <Input
              type="time"
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              placeholder="08:00"
            />
            <p className="text-[11px] text-slate-500">Vazio = horário do cadastro (ou 08:00).</p>
          </div>
        </div>
        {row?.carga != null && (
          <p className="text-xs text-slate-500">Carga prevista: {Math.round(row.carga)}%</p>
        )}
        <div className="space-y-2">
          <Label>Observação (opcional)</Label>
          <Textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Ex.: 6 gerais com check-in antes das 14h"
          />
        </div>
        {erro && (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm font-semibold text-red-700">
            {erro}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={lancar.isPending}>
            <BellRing className="mr-2 h-4 w-4" />{" "}
            {lancar.isPending ? "Lançando…" : "Lançar reforço"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
