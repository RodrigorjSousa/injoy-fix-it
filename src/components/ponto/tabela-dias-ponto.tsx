import { dataBR, horaSP, minutosParaHoras } from "@/lib/ponto";
import { CLASSE_LABEL, diaDaSemana, type DiaCalculado } from "@/lib/ponto-banco";
import { cn } from "@/lib/utils";

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const horas = (m: number) => (m ? minutosParaHoras(m) : "—");

const COR_CLASSE: Record<string, string> = {
  folga_trabalhada: "bg-blue-100 text-blue-800",
  domingo_feriado: "bg-purple-100 text-purple-800",
  abonado: "bg-emerald-100 text-emerald-800",
  falta: "bg-rose-100 text-rose-800",
  incompleto: "bg-amber-100 text-amber-800",
};

function Chip({ texto, cor }: { texto: string; cor: string }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", cor)}>{texto}</span>;
}

/** Dias do mês com previsto, ponto, extras, noturno, débito e alertas (gestor e espelho). */
export function TabelaDiasPonto({ dias }: { dias: DiaCalculado[] }) {
  const visiveis = dias.filter(
    (d) => d.resultado.classe !== "sem_registro" || d.resultado.previsto > 0,
  );
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="p-2">Dia</th>
            <th className="p-2">Escala</th>
            <th className="p-2">Ponto</th>
            <th className="p-2 text-right">Trab.</th>
            <th className="p-2 text-right">50%</th>
            <th className="p-2 text-right">100%</th>
            <th className="p-2 text-right">Noturno</th>
            <th className="p-2 text-right">Débito</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {visiveis.map((d) => {
            const r = d.resultado;
            return (
              <tr key={d.data} className="border-t align-top">
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
                  {(d.almoco_saida || d.almoco_volta) && (
                    <span className="block text-xs text-slate-500">
                      almoço {horaSP(d.almoco_saida)}–{horaSP(d.almoco_volta)}
                    </span>
                  )}
                </td>
                <td className="p-2 text-right">{horas(r.trabalhado)}</td>
                <td className="p-2 text-right text-blue-700">{horas(r.extra50)}</td>
                <td className="p-2 text-right text-purple-700">{horas(r.extra100)}</td>
                <td className="p-2 text-right text-indigo-700">
                  {r.noturno ? (
                    <span title={`${minutosParaHoras(r.noturnoReduzido)} em hora reduzida`}>
                      {minutosParaHoras(r.noturno)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-2 text-right text-rose-700">{horas(r.debito)}</td>
                <td className="space-x-1 space-y-1 p-2">
                  {COR_CLASSE[r.classe] && (
                    <Chip texto={r.aviso ?? CLASSE_LABEL[r.classe]} cor={COR_CLASSE[r.classe]} />
                  )}
                  {r.abonoAplicado && r.classe !== "abonado" && (
                    <Chip texto="Justificado (abonado)" cor="bg-emerald-100 text-emerald-800" />
                  )}
                  {r.jornadaLonga && (
                    <Chip texto="Jornada > 10 h" cor="bg-rose-100 text-rose-800" />
                  )}
                  {r.interjornadaMin != null && (
                    <Chip
                      texto={`Descanso de ${minutosParaHoras(r.interjornadaMin)} (< 11 h)`}
                      cor="bg-rose-100 text-rose-800"
                    />
                  )}
                  {r.toleranciaAplicada && (
                    <span className="text-xs text-slate-400">tolerância</span>
                  )}
                </td>
              </tr>
            );
          })}
          {!visiveis.length && (
            <tr>
              <td colSpan={9} className="p-4 text-center text-muted-foreground">
                Nada neste mês.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
