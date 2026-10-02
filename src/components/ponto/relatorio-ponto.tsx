import { useMemo, useState } from "react";
import { Download, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { addCivilDays } from "@/lib/escala-engine";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";
import {
  dataBR,
  horaSP,
  minutosParaHoras,
  useColaboradoresPonto,
  useLancarManual,
  usePontoConfig,
  usePontoDia,
  type PontoDiaRow,
  type PontoUnidade,
  type TipoBatida,
} from "@/lib/ponto";

type Alerta = { label: string; tone: string };

function alertasDaLinha(r: PontoDiaRow, tolerancia: number): Alerta[] {
  const a: Alerta[] = [];
  if (r.falta_sem_registro)
    a.push({ label: "Falta sem registro", tone: "bg-rose-100 text-rose-800" });
  if (r.sem_saida) a.push({ label: "Sem saída", tone: "bg-rose-100 text-rose-800" });
  if (r.almoco_sem_volta)
    a.push({ label: "Saiu p/ almoço e não registrou a volta", tone: "bg-rose-100 text-rose-800" });
  if (r.sem_intervalo)
    a.push({ label: "Sem registro de almoço", tone: "bg-amber-100 text-amber-800" });
  if (r.intervalo_curto)
    a.push({
      label: `Almoço curto (${minutosParaHoras(r.intervalo_min)})`,
      tone: "bg-amber-100 text-amber-800",
    });
  if (r.atraso_min > tolerancia)
    a.push({
      label: `Atraso ${minutosParaHoras(r.atraso_min)}`,
      tone: "bg-amber-100 text-amber-800",
    });
  if (r.saida_antecipada_min > tolerancia)
    a.push({
      label: `Saiu ${minutosParaHoras(r.saida_antecipada_min)} antes`,
      tone: "bg-amber-100 text-amber-800",
    });
  if (r.apos_horario_min > tolerancia)
    a.push({
      label: `+${minutosParaHoras(r.apos_horario_min)} após o horário`,
      tone: "bg-blue-100 text-blue-800",
    });
  if (r.trabalhou_fora_da_escala)
    a.push({ label: "Trabalhou fora da escala", tone: "bg-purple-100 text-purple-800" });
  if (r.feriado && r.entrada_real)
    a.push({ label: "Feriado", tone: "bg-purple-100 text-purple-800" });
  if (r.batidas_pendentes > 0)
    a.push({ label: "Pendente de conferência", tone: "bg-amber-100 text-amber-800" });
  if (r.tem_lancamento_manual)
    a.push({ label: "Lançamento manual", tone: "bg-slate-100 text-slate-700" });
  return a;
}

function exportarCsv(rows: PontoDiaRow[]) {
  const head = [
    "data",
    "nome",
    "vinculo",
    "unidade",
    "escala",
    "entrada_prevista",
    "saida_prevista",
    "entrada",
    "saida_almoco",
    "volta_almoco",
    "saida",
    "intervalo",
    "trabalhado",
    "previsto",
    "atraso_min",
    "saida_antecipada_min",
    "apos_horario_min",
    "falta",
    "sem_saida",
    "feriado",
    "pendentes",
  ];
  const lines = rows.map((r) =>
    [
      r.data,
      r.nome,
      r.vinculo,
      r.unidade ?? "",
      r.status_escala ?? "",
      horaSP(r.entrada_prevista),
      horaSP(r.saida_prevista),
      horaSP(r.entrada_real),
      horaSP(r.almoco_saida),
      horaSP(r.almoco_volta),
      horaSP(r.saida_real),
      minutosParaHoras(r.intervalo_min),
      minutosParaHoras(r.minutos_trabalhados),
      minutosParaHoras(r.minutos_previstos),
      r.atraso_min,
      r.saida_antecipada_min,
      r.apos_horario_min,
      r.falta_sem_registro ? "sim" : "",
      r.sem_saida ? "sim" : "",
      r.feriado ? "sim" : "",
      r.batidas_pendentes,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";"),
  );
  const blob = new Blob(["﻿" + [head.join(";"), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ponto-injoy-${todaySP()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function RelatorioPonto() {
  const hoje = todaySP();
  const [inicio, setInicio] = useState(addCivilDays(hoje, -6));
  const [fim, setFim] = useState(hoje);
  const [unidade, setUnidade] = useState<"todas" | PontoUnidade>("todas");
  const [pessoa, setPessoa] = useState("todas");
  const [manualAberto, setManualAberto] = useState(false);
  const q = usePontoDia(inicio, fim);
  const cfg = usePontoConfig();
  const tolerancia = (u: string | null) =>
    cfg.data?.find((c) => c.unidade === u)?.tolerancia_min ?? 10;

  const rows = useMemo(
    () =>
      (q.data ?? []).filter(
        (r) =>
          (unidade === "todas" || r.unidade === unidade) &&
          (pessoa === "todas" || r.colaborador_id === pessoa),
      ),
    [q.data, unidade, pessoa],
  );
  const pessoas = useMemo(() => {
    const m = new Map<string, string>();
    (q.data ?? []).forEach((r) => m.set(r.colaborador_id, r.nome));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [q.data]);

  const resumo = useMemo(() => {
    const porPessoa = new Map<
      string,
      {
        nome: string;
        vinculo: string;
        trabalhado: number;
        previsto: number;
        atrasos: number;
        faltas: number;
        extra: number;
        dias: number;
      }
    >();
    for (const r of rows) {
      const p = porPessoa.get(r.colaborador_id) ?? {
        nome: r.nome,
        vinculo: r.vinculo,
        trabalhado: 0,
        previsto: 0,
        atrasos: 0,
        faltas: 0,
        extra: 0,
        dias: 0,
      };
      p.trabalhado += r.minutos_trabalhados ?? 0;
      p.previsto +=
        r.status_escala === "trabalho" || r.status_escala === "extra"
          ? (r.minutos_previstos ?? 0)
          : 0;
      if (r.atraso_min > tolerancia(r.unidade)) p.atrasos++;
      if (r.falta_sem_registro) p.faltas++;
      if (r.apos_horario_min > tolerancia(r.unidade)) p.extra += r.apos_horario_min;
      if (r.entrada_real) p.dias++;
      porPessoa.set(r.colaborador_id, p);
    }
    return [...porPessoa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cfg.data]);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <Label className="text-xs">De</Label>
          <Input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label className="text-xs">Unidade</Label>
          <Select value={unidade} onValueChange={(v) => setUnidade(v as typeof unidade)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="Botafogo">Botafogo</SelectItem>
              <SelectItem value="Ipanema">Ipanema</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Pessoa</Label>
          <Select value={pessoa} onValueChange={setPessoa}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {pessoas.map(([id, nome]) => (
                <SelectItem key={id} value={id}>
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setManualAberto(true)}>
            <Plus className="h-4 w-4" />
            Lançamento manual
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={!rows.length}
            onClick={() => exportarCsv(rows)}
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </Card>

      {q.isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      ) : q.error ? (
        <p className="text-sm text-rose-600">{(q.error as Error).message}</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {resumo.map((p) => (
              <Card key={p.nome} className="p-3 text-sm">
                <div className="flex items-center justify-between">
                  <strong>{p.nome}</strong>
                  <Badge variant="outline">{p.vinculo}</Badge>
                </div>
                <p className="mt-1 text-slate-600">
                  Trabalhado {minutosParaHoras(p.trabalhado)} de {minutosParaHoras(p.previsto)}{" "}
                  previstos · {p.dias} dia(s)
                </p>
                <p className="text-xs text-slate-500">
                  {p.atrasos} atraso(s) · {p.faltas} falta(s) sem registro ·{" "}
                  {minutosParaHoras(p.extra)} após o horário
                </p>
              </Card>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-2">Data</th>
                  <th className="p-2">Pessoa</th>
                  <th className="p-2">Previsto</th>
                  <th className="p-2">Realizado</th>
                  <th className="p-2">Horas</th>
                  <th className="p-2">Alertas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const alertas = alertasDaLinha(r, tolerancia(r.unidade));
                  return (
                    <tr key={`${r.colaborador_id}-${r.data}`} className="border-t align-top">
                      <td className="p-2 whitespace-nowrap">{dataBR(r.data)}</td>
                      <td className="p-2">
                        <span className="font-semibold">{r.nome}</span>
                        <span className="block text-xs text-slate-500">{r.unidade ?? "—"}</span>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {r.status_escala === "trabalho" || r.status_escala === "extra"
                          ? `${horaSP(r.entrada_prevista)}–${horaSP(r.saida_prevista)}`
                          : (r.status_escala ?? "sem escala")}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {horaSP(r.entrada_real)}–{horaSP(r.saida_real)}
                        {(r.almoco_saida || r.almoco_volta) && (
                          <span className="block text-xs text-slate-500">
                            almoço {horaSP(r.almoco_saida)}–{horaSP(r.almoco_volta)}
                            {r.intervalo_min != null
                              ? ` (${minutosParaHoras(r.intervalo_min)})`
                              : ""}
                          </span>
                        )}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {minutosParaHoras(r.minutos_trabalhados)}
                        {r.minutos_previstos ? (
                          <span className="text-xs text-slate-500">
                            {" "}
                            / {minutosParaHoras(r.minutos_previstos)}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {alertas.length ? (
                            alertas.map((a) => (
                              <span
                                key={a.label}
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                                  a.tone,
                                )}
                              >
                                {a.label}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-emerald-700">ok</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Nada no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Tolerância diária usada nos alertas:{" "}
            {cfg.data?.map((c) => `${c.unidade} ${c.tolerancia_min} min`).join(" · ") ?? "10 min"}{" "}
            (CLT art. 58 §1º). Controle interno — não substitui o ponto oficial.
          </p>
        </>
      )}
      <LancamentoManualDialog open={manualAberto} onOpenChange={setManualAberto} />
    </div>
  );
}

function LancamentoManualDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const colabs = useColaboradoresPonto();
  const lancar = useLancarManual();
  const [colaboradorId, setColaboradorId] = useState("");
  const [tipo, setTipo] = useState<TipoBatida>("entrada");
  const [data, setData] = useState(todaySP());
  const [hora, setHora] = useState("07:00");
  const [unidade, setUnidade] = useState<PontoUnidade>("Botafogo");
  const [motivo, setMotivo] = useState("");
  const salvar = () => {
    if (!colaboradorId || !motivo.trim()) return toast.error("Escolha a pessoa e informe o motivo");
    lancar.mutate(
      { colaboradorId, tipo, registradoEm: `${data}T${hora}:00-03:00`, unidade, motivo },
      {
        onSuccess: () => {
          toast.success("Lançamento registrado");
          onOpenChange(false);
          setMotivo("");
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lançamento manual de ponto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Pessoa</Label>
            <Select value={colaboradorId} onValueChange={setColaboradorId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {(colabs.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida_almoco">Saída para almoço</SelectItem>
                  <SelectItem value="volta_almoco">Volta do almoço</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={unidade} onValueChange={(v) => setUnidade(v as PontoUnidade)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Botafogo">Botafogo</SelectItem>
                  <SelectItem value="Ipanema">Ipanema</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div>
              <Label>Hora</Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Motivo</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: esqueceu de bater, celular sem bateria"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={salvar} disabled={lancar.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
