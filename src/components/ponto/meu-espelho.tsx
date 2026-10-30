import { useState } from "react";
import { CalendarCheck2, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { TabelaDiasPonto } from "@/components/ponto/tabela-dias-ponto";
import { dataBR, minutosParaHoras } from "@/lib/ponto";
import { mesAnterior, mesBR, useDarCiencia, useMeuEspelho } from "@/lib/ponto-mensal";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

const horas = (m: number) => (m ? minutosParaHoras(m) : "0h00");
const comSinal = (m: number) => (m > 0 ? `+${minutosParaHoras(m)}` : minutosParaHoras(m));

function Total({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="text-[11px] font-semibold uppercase text-slate-500">{rotulo}</p>
      <p className={cn("text-base font-black", cor)}>{valor}</p>
    </div>
  );
}

/** Funcionário: espelho do mês (dias, extras, noturno, banco) e ciência do mês encerrado. */
export function MeuEspelho() {
  const [aberto, setAberto] = useState(false);
  const mesAtual = todaySP().slice(0, 7);
  const [mes, setMes] = useState(mesAnterior(mesAtual));
  return (
    <>
      <Card className="flex items-center justify-between gap-2 p-4">
        <p className="flex items-center gap-2 text-sm font-bold">
          <FileText className="h-4 w-4 text-indigo-600" />
          Meu espelho de ponto
        </p>
        <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
          Ver meu espelho
        </Button>
      </Card>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Espelho de ponto</DialogTitle>
            <DialogDescription>
              Seus dias, horas extras e banco de horas. Controle interno — não substitui o ponto
              oficial.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Mês</Label>
            <Input
              type="month"
              value={mes}
              max={mesAtual}
              onChange={(e) => e.target.value && setMes(e.target.value)}
              className="w-44"
            />
          </div>
          {aberto && <ConteudoEspelho mes={mes} encerrado={mes < mesAtual} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConteudoEspelho({ mes, encerrado }: { mes: string; encerrado: boolean }) {
  const q = useMeuEspelho(mes);
  const ciencia = useDarCiencia();
  const [comentario, setComentario] = useState("");

  if (q.isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (q.error) return <p className="text-sm text-rose-600">{(q.error as Error).message}</p>;
  if (!q.data?.vinculado)
    return (
      <p className="text-sm text-muted-foreground">Seu usuário ainda não está ligado à escala.</p>
    );
  const r = q.data.resumo;
  if (!r) return <p className="text-sm text-muted-foreground">Nada registrado neste mês.</p>;

  const darCiencia = () =>
    ciencia.mutate(
      {
        mes,
        comentario,
        totais: {
          previsto: r.previsto,
          trabalhado: r.trabalhado,
          extra50: r.extra50,
          extra100: r.extra100,
          noturno: r.noturno,
          noturno_reduzido: r.noturnoReduzido,
          debito: r.debito,
          faltas: r.faltas,
          saldo_final: q.data.bancoSeAplica ? r.saldoFinal : null,
        },
      },
      {
        onSuccess: () => toast.success("Ciência registrada. Obrigado!"),
        onError: (e) => toast.error((e as Error).message),
      },
    );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Total rotulo="Trabalhado" valor={horas(r.trabalhado)} />
        <Total rotulo="Previsto" valor={horas(r.previsto)} />
        <Total rotulo="Extra 50%" valor={horas(r.extra50)} cor="text-blue-700" />
        <Total rotulo="Extra 100%" valor={horas(r.extra100)} cor="text-purple-700" />
        <Total rotulo="Noturno" valor={horas(r.noturno)} cor="text-indigo-700" />
        <Total rotulo="Débito" valor={horas(r.debito)} cor="text-rose-700" />
        <Total rotulo="Faltas" valor={String(r.faltas)} />
        {q.data.bancoSeAplica ? (
          <Total
            rotulo="Saldo do banco"
            valor={comSinal(r.saldoFinal)}
            cor={r.saldoFinal >= 0 ? "text-emerald-700" : "text-rose-700"}
          />
        ) : (
          <Total rotulo="Banco de horas" valor="não se aplica" />
        )}
      </div>
      {q.data.bancoSeAplica && r.modo === "pagamento" && r.extra50 + r.extra100 > 0 && (
        <p className="text-xs text-slate-600">
          Suas horas extras deste mês são pagas (não entram no banco).
        </p>
      )}
      {r.noturno > 0 && (
        <p className="text-xs text-slate-600">
          Noturno (22h–5h) em hora reduzida: {minutosParaHoras(r.noturnoReduzido)}.
        </p>
      )}

      <TabelaDiasPonto dias={r.dias} />

      {q.data.ciencia ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Você deu ciência em {dataBR(q.data.ciencia.ciente_em)}
          {q.data.ciencia.comentario ? ` — “${q.data.ciencia.comentario}”` : ""}.
        </p>
      ) : encerrado ? (
        <Card className="space-y-2 p-3">
          <p className="text-sm">
            Confira os dias acima. Se estiver tudo certo, confirme. Se algo estiver errado, escreva
            o que é (ex.: “no dia 12 saí às 18h”) e confirme assim mesmo — o gestor vê o seu
            comentário.
          </p>
          <Textarea
            rows={2}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Comentário (opcional)"
          />
          <Button className="w-full gap-2" onClick={darCiencia} disabled={ciencia.isPending}>
            <CalendarCheck2 className="h-4 w-4" />
            Estou ciente do espelho de {mesBR(mes)}
          </Button>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">
          A ciência fica disponível quando o mês terminar.
        </p>
      )}
    </div>
  );
}
