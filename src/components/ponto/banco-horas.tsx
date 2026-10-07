import { useMemo, useState } from "react";
import { AlertTriangle, Download, Info, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { dataBR, horaSP, minutosParaHoras } from "@/lib/ponto";
import {
  AJUSTE_LABEL,
  BANCO_INICIO_PADRAO,
  CLASSE_LABEL,
  MODO_LABEL,
  diaDaSemana,
  lerHoras,
  type AjusteBanco,
  type ModoBanco,
  type ResumoPessoa,
} from "@/lib/ponto-banco";
import {
  useBancoHoras,
  useExcluirAjusteBanco,
  useLancarAjusteBanco,
  useSalvarBancoConfig,
} from "@/lib/ponto-gestao";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

const SETOR_LABEL: Record<string, string> = {
  manutencao: "Manutenção",
  recepcao: "Recepção",
  camareiras: "Camareiras",
};
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const fimDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes}-${String(ultimo).padStart(2, "0")}`;
};

const horas = (m: number) => (m ? minutosParaHoras(m) : "—");
const saldoCls = (m: number) =>
  m > 0 ? "text-emerald-700" : m < 0 ? "text-rose-700" : "text-slate-500";
const comSinal = (m: number) => (m > 0 ? `+${minutosParaHoras(m)}` : minutosParaHoras(m));

function exportarCsv(rows: ResumoPessoa[], mes: string) {
  const h = (m: number) => (m / 60).toFixed(2).replace(".", ",");
  const linhas = [
    [
      "Pessoa",
      "Setor",
      "Modo",
      "Previsto (h)",
      "Trabalhado (h)",
      "Extra 50% (h)",
      "Extra 100% (h)",
      "Débito (h)",
      "Ajustes (h)",
      "Saldo anterior (h)",
      "Saldo do banco (h)",
      "Dias incompletos",
    ],
    ...rows.map((p) => [
      p.nome,
      SETOR_LABEL[p.setor] ?? p.setor,
      MODO_LABEL[p.modo],
      h(p.previsto),
      h(p.trabalhado),
      h(p.extra50),
      h(p.extra100),
      h(p.debito),
      h(p.ajustesPeriodo),
      h(p.saldoAnterior),
      h(p.saldoFinal),
      String(p.diasIncompletos),
    ]),
  ];
  const csv = linhas
    .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `banco-de-horas-${mes}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function BancoHoras() {
  const [mes, setMes] = useState(todaySP().slice(0, 7));
  const [setor, setSetor] = useState("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const inicio = `${mes}-01`;
  const fim = fimDoMes(mes);
  const q = useBancoHoras(inicio, fim);

  const rows = useMemo(
    () => (q.data ?? []).filter((p) => setor === "todos" || p.setor === setor),
    [q.data, setor],
  );
  const pessoa = (q.data ?? []).find((p) => p.colaborador_id === aberto) ?? null;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <Label className="text-xs">Mês</Label>
          <Input
            type="month"
            value={mes}
            onChange={(e) => e.target.value && setMes(e.target.value)}
            className="w-44"
          />
        </div>
        <div>
          <Label className="text-xs">Setor</Label>
          <Select value={setor} onValueChange={setSetor}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="manutencao">Manutenção</SelectItem>
              <SelectItem value="recepcao">Recepção</SelectItem>
              <SelectItem value="camareiras">Camareiras</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          className="ml-auto gap-2"
          disabled={!rows.length}
          onClick={() => exportarCsv(rows, mes)}
        >
          <Download className="h-4 w-4" />
          CSV
        </Button>
      </Card>

      <Card className="flex gap-2 bg-slate-50 p-3 text-xs text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <b>Extra 50%:</b> o que passa do horário da escala, e trabalho em folga de dia útil ou
          sábado. <b>Extra 100%:</b> trabalho em domingo ou feriado que é folga na escala.{" "}
          <b>Débito:</b> atrasos, saídas antes e faltas. Tolerância da CLT: até 5 min por batida e
          10 min no dia são ignorados. Atestado aprovado e férias abonam o dia. No modo{" "}
          <b>Banco de horas</b> as extras entram no saldo (1 h por 1 h); no modo <b>Paga extra</b>{" "}
          elas são pagas e só os débitos vão para o banco. Só funcionários fixos aparecem aqui.
        </p>
      </Card>

      {q.isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      ) : q.error ? (
        <p className="text-sm text-rose-600">{(q.error as Error).message}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-2">Pessoa</th>
                <th className="p-2">Modo</th>
                <th className="p-2 text-right">Previsto</th>
                <th className="p-2 text-right">Trabalhado</th>
                <th className="p-2 text-right">Extra 50%</th>
                <th className="p-2 text-right">Extra 100%</th>
                <th className="p-2 text-right">Débito</th>
                <th className="p-2 text-right">Ajustes</th>
                <th className="p-2 text-right">Saldo anterior</th>
                <th className="p-2 text-right">Saldo do banco</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.colaborador_id}
                  className="cursor-pointer border-t hover:bg-slate-50"
                  onClick={() => setAberto(p.colaborador_id)}
                >
                  <td className="p-2">
                    <span className="font-semibold underline-offset-2 hover:underline">
                      {p.nome}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {SETOR_LABEL[p.setor] ?? p.setor}
                      {p.diasIncompletos > 0 && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          {p.diasIncompletos} dia(s) incompleto(s)
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="p-2">
                    <Badge
                      variant="outline"
                      className={cn(!p.configurado && "border-dashed text-slate-500")}
                    >
                      {MODO_LABEL[p.modo]}
                    </Badge>
                  </td>
                  <td className="p-2 text-right">{horas(p.previsto)}</td>
                  <td className="p-2 text-right">{horas(p.trabalhado)}</td>
                  <td className="p-2 text-right font-semibold text-blue-700">{horas(p.extra50)}</td>
                  <td className="p-2 text-right font-semibold text-purple-700">
                    {horas(p.extra100)}
                  </td>
                  <td className="p-2 text-right text-rose-700">{horas(p.debito)}</td>
                  <td className={cn("p-2 text-right", saldoCls(p.ajustesPeriodo))}>
                    {p.ajustesPeriodo ? comSinal(p.ajustesPeriodo) : "—"}
                  </td>
                  <td className={cn("p-2 text-right", saldoCls(p.saldoAnterior))}>
                    {p.saldoAnterior ? comSinal(p.saldoAnterior) : "—"}
                  </td>
                  <td className={cn("p-2 text-right font-black", saldoCls(p.saldoFinal))}>
                    {comSinal(p.saldoFinal)}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-muted-foreground">
                    Nenhum funcionário fixo com escala ou ponto neste mês.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Clique no nome para ver os dias, mudar o modo e lançar folga compensada, pagamento do saldo
        ou correção. Controle interno — não substitui o ponto oficial.
      </p>

      <DetalhePessoa pessoa={pessoa} mes={mes} onClose={() => setAberto(null)} />
    </div>
  );
}

function DetalhePessoa({
  pessoa,
  mes,
  onClose,
}: {
  pessoa: ResumoPessoa | null;
  mes: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!pessoa} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {pessoa && (
          <>
            <DialogHeader>
              <DialogTitle>
                {pessoa.nome} · {mes.split("-").reverse().join("/")}
              </DialogTitle>
              <DialogDescription>
                Saldo do banco no fim do mês:{" "}
                <b className={saldoCls(pessoa.saldoFinal)}>{comSinal(pessoa.saldoFinal)}</b>
                {pessoa.modo === "pagamento" && pessoa.extra50 + pessoa.extra100 > 0
                  ? ` · a pagar: ${horas(pessoa.extra50)} a 50% e ${horas(pessoa.extra100)} a 100%`
                  : null}
              </DialogDescription>
            </DialogHeader>
            <ConfigPessoa key={`${pessoa.colaborador_id}-cfg`} pessoa={pessoa} />
            <AjustesPessoa key={`${pessoa.colaborador_id}-aj`} pessoa={pessoa} mes={mes} />
            <DiasPessoa pessoa={pessoa} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConfigPessoa({ pessoa }: { pessoa: ResumoPessoa }) {
  const salvar = useSalvarBancoConfig();
  const [modo, setModo] = useState<ModoBanco>(pessoa.modo);
  const [inicio, setInicio] = useState(pessoa.inicio);
  const mudou = !pessoa.configurado || modo !== pessoa.modo || inicio !== pessoa.inicio;
  return (
    <Card className="flex flex-wrap items-end gap-3 p-3">
      <div>
        <Label className="text-xs">Horas a mais</Label>
        <Select value={modo} onValueChange={(v) => setModo(v as ModoBanco)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="banco">Vão para o banco</SelectItem>
            <SelectItem value="pagamento">São pagas como extra</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Banco conta a partir de</Label>
        <Input
          type="date"
          value={inicio}
          onChange={(e) => setInicio(e.target.value || BANCO_INICIO_PADRAO)}
          className="w-40"
        />
      </div>
      <Button
        size="sm"
        disabled={!mudou || salvar.isPending}
        onClick={() =>
          salvar.mutate(
            { colaboradorId: pessoa.colaborador_id, modo, inicio },
            {
              onSuccess: () => toast.success("Configuração salva"),
              onError: (e) => toast.error((e as Error).message),
            },
          )
        }
      >
        Salvar
      </Button>
      {!pessoa.configurado && (
        <p className="w-full text-xs text-amber-700">
          Ainda não configurado: por enquanto as extras são tratadas como pagas.
        </p>
      )}
    </Card>
  );
}

function AjustesPessoa({ pessoa, mes }: { pessoa: ResumoPessoa; mes: string }) {
  const lancar = useLancarAjusteBanco();
  const excluir = useExcluirAjusteBanco();
  const hoje = todaySP();
  const [tipo, setTipo] = useState<AjusteBanco["tipo"]>("folga_compensada");
  const [data, setData] = useState(hoje.startsWith(mes) ? hoje : `${mes}-01`);
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const salvar = () => {
    const min = lerHoras(qtd);
    if (min == null || min === 0) return toast.error("Horas inválidas. Ex.: 8, 1h30, 0:45");
    if (!motivo.trim()) return toast.error("Informe o motivo.");
    lancar.mutate(
      { colaboradorId: pessoa.colaborador_id, data, minutos: min, tipo, motivo },
      {
        onSuccess: () => {
          toast.success("Ajuste lançado");
          setQtd("");
          setMotivo("");
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };
  const sinalLivre = tipo === "saldo_inicial" || tipo === "correcao";
  return (
    <Card className="space-y-3 p-3">
      <p className="text-xs font-bold uppercase text-slate-500">Ajustes no banco</p>
      <div className="grid gap-2 sm:grid-cols-[11rem_9rem_7rem_1fr_auto] sm:items-end">
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as AjusteBanco["tipo"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(AJUSTE_LABEL) as AjusteBanco["tipo"][]).map((t) => (
                <SelectItem key={t} value={t}>
                  {AJUSTE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Data</Label>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Horas</Label>
          <Input
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            placeholder={sinalLivre ? "-1h30" : "8h"}
          />
        </div>
        <div>
          <Label className="text-xs">Motivo</Label>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: folga do dia 15"
          />
        </div>
        <Button onClick={salvar} disabled={lancar.isPending}>
          Lançar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Folga compensada e pagamento sempre diminuem o saldo. Saldo inicial e correção usam o sinal
        que você digitar (use “-” para tirar horas).
      </p>
      {pessoa.ajustes.length ? (
        <ul className="divide-y text-sm">
          {pessoa.ajustes.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1.5">
              <span className="w-20 text-slate-500">{dataBR(a.data)}</span>
              <span className="w-36">{AJUSTE_LABEL[a.tipo]}</span>
              <span className={cn("w-16 font-semibold", saldoCls(a.minutos))}>
                {comSinal(a.minutos)}
              </span>
              <span className="flex-1 truncate text-slate-600">{a.motivo}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-slate-400 hover:text-rose-600"
                disabled={excluir.isPending}
                onClick={() => {
                  if (!window.confirm("Excluir este ajuste?")) return;
                  excluir.mutate(a.id, {
                    onSuccess: () => toast.success("Ajuste excluído"),
                    onError: (e) => toast.error((e as Error).message),
                  });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Nenhum ajuste neste mês.</p>
      )}
    </Card>
  );
}

const COR_CLASSE: Record<string, string> = {
  folga_trabalhada: "bg-blue-100 text-blue-800",
  domingo_feriado: "bg-purple-100 text-purple-800",
  abonado: "bg-emerald-100 text-emerald-800",
  falta: "bg-rose-100 text-rose-800",
  incompleto: "bg-amber-100 text-amber-800",
};

function DiasPessoa({ pessoa }: { pessoa: ResumoPessoa }) {
  const dias = pessoa.dias.filter(
    (d) => d.resultado.classe !== "sem_registro" || d.resultado.previsto > 0,
  );
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="p-2">Dia</th>
            <th className="p-2">Escala</th>
            <th className="p-2">Ponto</th>
            <th className="p-2 text-right">Trab.</th>
            <th className="p-2 text-right">50%</th>
            <th className="p-2 text-right">100%</th>
            <th className="p-2 text-right">Débito</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => {
            const r = d.resultado;
            return (
              <tr key={d.data} className="border-t">
                <td className="whitespace-nowrap p-2">
                  {dataBR(d.data)}{" "}
                  <span className="text-xs text-slate-500">{SEMANA[diaDaSemana(d.data)]}</span>
                  {d.feriado && <span className="ml-1 text-xs text-purple-700">feriado</span>}
                </td>
                <td className="whitespace-nowrap p-2 text-slate-600">
                  {d.status_escala === "trabalho" || d.status_escala === "extra"
                    ? `${horaSP(d.entrada_prevista)}–${horaSP(d.saida_prevista)}`
                    : (d.status_escala ?? "sem escala")}
                </td>
                <td className="whitespace-nowrap p-2">
                  {d.entrada_real ? `${horaSP(d.entrada_real)}–${horaSP(d.saida_real)}` : "—"}
                </td>
                <td className="p-2 text-right">{horas(r.trabalhado)}</td>
                <td className="p-2 text-right text-blue-700">{horas(r.extra50)}</td>
                <td className="p-2 text-right text-purple-700">{horas(r.extra100)}</td>
                <td className="p-2 text-right text-rose-700">{horas(r.debito)}</td>
                <td className="p-2">
                  {COR_CLASSE[r.classe] && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        COR_CLASSE[r.classe],
                      )}
                    >
                      {r.aviso ?? CLASSE_LABEL[r.classe]}
                    </span>
                  )}
                  {r.toleranciaAplicada && (
                    <span className="text-xs text-slate-400">tolerância</span>
                  )}
                </td>
              </tr>
            );
          })}
          {!dias.length && (
            <tr>
              <td colSpan={8} className="p-4 text-center text-muted-foreground">
                Nada neste mês.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
