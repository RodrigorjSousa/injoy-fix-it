// Cartão de uma reserva a cobrar. A cobrança é feita no Cloudbeds; aqui a recepção anota o resultado.
import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { todaySP } from "@/lib/tz";
import {
  COBRADO_TEXTO,
  OPCOES_COBRADO,
  SAIDA_TEXTO,
  diasEntre,
  linkCloudbeds,
  PRAZO_NR_DIAS,
  type Cobrado,
  type MotivoCobranca,
} from "@/lib/reservas/cobranca";
import type { LinhaCobranca } from "@/lib/reservas/use-reservas";

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12))
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .replace(".", "");
}

/** Cor de cada motivo: faixa lateral, ponto do filtro e etiqueta de prazo. */
export const TOM_MOTIVO: Record<MotivoCobranca, { faixa: string; ponto: string; prazo: string; nome: string }> = {
  nr_checkin_proximo: {
    faixa: "bg-[#d9480f]",
    ponto: "bg-[#d9480f]",
    prazo: "bg-[#fff1ea] text-[#b23a0b]",
    nome: "NR, check-in próximo",
  },
  nr_8o_dia: {
    faixa: "bg-[#b7791f]",
    ponto: "bg-[#b7791f]",
    prazo: "bg-[#fdf5e3] text-[#8a5a12]",
    nome: "NR, 8º dia",
  },
  standard: {
    faixa: "bg-[#3b5bdb]",
    ponto: "bg-[#3b5bdb]",
    prazo: "bg-[#eef1fd] text-[#2f49b0]",
    nome: "Standard",
  },
};

const TOM_COBRADO: Record<Cobrado, string> = {
  sim: "bg-[#0f8b8d] text-white border-[#0f8b8d]",
  link_enviado: "bg-[#e6f3fb] text-[#155e86] border-[#9cc9e4]",
  recusado: "bg-[#fdecec] text-[#a61b1b] border-[#f0a8a8]",
  cancelada: "bg-slate-200 text-slate-700 border-slate-300",
};

/** O prazo em linguagem de gente: é o dado que decide a ordem do trabalho. */
export function textoPrazo(l: Pick<LinhaCobranca, "motivo" | "checkin" | "data_reserva">, hoje = todaySP()): string {
  if (l.motivo === "nr_8o_dia" && l.data_reserva) {
    const atraso = diasEntre(l.data_reserva, hoje) - PRAZO_NR_DIAS;
    if (atraso <= 0) return "Liberada hoje";
    if (atraso === 1) return "Liberada ontem";
    return `Liberada há ${atraso} dias`;
  }
  if (!l.checkin) return "Sem data de check-in";
  const d = diasEntre(hoje, l.checkin);
  if (d < -1) return `Check-in foi há ${-d} dias`;
  if (d === -1) return "Check-in foi ontem";
  if (d === 0) return "Check-in hoje";
  if (d === 1) return "Check-in amanhã";
  return `Check-in em ${d} dias`;
}

const tratada = (l: LinhaCobranca) => l.cobrado === "sim" || l.cobrado === "cancelada";

export function CobrancaCard({
  linha,
  onMarcar,
  salvando,
}: {
  linha: LinhaCobranca;
  onMarcar: (cobrado: Cobrado | null, observacao: string | null) => Promise<void>;
  salvando: boolean;
}) {
  const tom = linha.motivo ? TOM_MOTIVO[linha.motivo] : null;
  const [obs, setObs] = useState(linha.observacao ?? "");
  const [obsAberta, setObsAberta] = useState(!!linha.observacao);
  useEffect(() => setObs(linha.observacao ?? ""), [linha.observacao]);
  const obsMudou = (obs.trim() || null) !== (linha.observacao ?? null);
  const noites = linha.checkin && linha.checkout ? diasEntre(linha.checkin, linha.checkout) : null;
  const saiu = !linha.ativa;

  const salvar = async (cobrado: Cobrado | null, observacao: string | null, aviso?: string) => {
    try {
      await onMarcar(cobrado, observacao);
      if (aviso) toast.success(aviso);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    }
  };

  const escolher = (opcao: Cobrado) => {
    const novo = linha.cobrado === opcao ? null : opcao;
    void salvar(
      novo,
      linha.observacao,
      novo ? `${linha.hospede}: ${COBRADO_TEXTO[novo]}` : `${linha.hospede}: marcação removida`,
    );
  };

  const salvarObs = () => {
    if (!obsMudou) return;
    void salvar(linha.cobrado, obs.trim() || null, "Observação salva");
  };

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 transition-opacity",
        (tratada(linha) || saiu) && "opacity-70",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", tom?.faixa ?? "bg-slate-300")} />

      <div className="grid gap-3 p-4 pl-6 sm:grid-cols-[1fr_auto] sm:items-start sm:p-5 sm:pl-7">
        <div className="min-w-0 space-y-1.5">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
              tom?.prazo ?? "bg-slate-100 text-slate-600",
            )}
          >
            {textoPrazo(linha)}
          </span>
          <h3 className="truncate font-display text-lg font-extrabold leading-tight text-[#0e2a30]">{linha.hospede}</h3>
          <p className="text-sm text-slate-600">
            Reserva <span className="font-semibold tabular-nums text-slate-800">{linha.reservation_id}</span>
            <span className="mx-1.5 text-slate-300">/</span>
            {dataCurta(linha.checkin)} a {dataCurta(linha.checkout)}
            {noites ? ` (${noites} ${noites === 1 ? "noite" : "noites"})` : ""}
          </p>
          <p className="text-xs text-slate-500">
            {linha.plano ?? "Plano não informado"}
            {linha.origem ? `, via ${linha.origem}` : ""}
            {linha.data_reserva ? `. Reservada em ${dataCurta(linha.data_reserva)}` : ""}
          </p>
        </div>
        <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
          <p className="font-display text-2xl font-extrabold tabular-nums tracking-tight text-[#0e2a30]">
            {brl(linha.saldo)}
          </p>
          <p className="text-xs text-slate-500">{saiu ? "saldo na saída" : "em aberto"}</p>
        </div>
      </div>

      {saiu ? (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 pl-6 text-xs text-slate-600 sm:pl-7">
          Saiu da lista: {linha.motivo_saida ? SAIDA_TEXTO[linha.motivo_saida] : "—"}
          {linha.cobrado ? `. Anotado como ${COBRADO_TEXTO[linha.cobrado].toLowerCase()}` : ""}
        </div>
      ) : (
        <div className="space-y-2.5 border-t border-slate-100 bg-[#f7faf9] px-4 py-3 pl-6 sm:pl-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <span id={`cobrado-${linha.id}`} className="text-sm font-semibold text-slate-700 sm:mr-1">
              Cobrado?
            </span>
            <div role="group" aria-labelledby={`cobrado-${linha.id}`} className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
              {OPCOES_COBRADO.map((opcao) => {
                const ativo = linha.cobrado === opcao;
                return (
                  <button
                    key={opcao}
                    type="button"
                    aria-pressed={ativo}
                    disabled={salvando}
                    onClick={() => escolher(opcao)}
                    className={cn(
                      "inline-flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition-colors sm:h-8",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b8d] focus-visible:ring-offset-1",
                      ativo ? TOM_COBRADO[opcao] : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                    )}
                  >
                    {ativo && <Check className="h-3.5 w-3.5" />}
                    {COBRADO_TEXTO[opcao]}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:ml-auto sm:flex sm:items-center">
              {!obsAberta && (
                <button
                  type="button"
                  onClick={() => setObsAberta(true)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-semibold text-slate-600 sm:h-8 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b8d]"
                >
                  <MessageSquareText className="h-4 w-4" /> Observação
                </button>
              )}
              <a
                href={linkCloudbeds(linha.property_id, linha.reservation_id)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir a reserva de ${linha.hospede} no Cloudbeds`}
                className="col-start-2 inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#0e2a30]/15 sm:h-8 bg-white px-3 text-sm font-semibold text-[#0e2a30] hover:border-[#0f8b8d] hover:text-[#0f8b8d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b8d]"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="sm:hidden">Cloudbeds</span>
                <span className="hidden sm:inline">Abrir no Cloudbeds</span>
              </a>
            </div>
          </div>

          {obsAberta && (
            <div className="flex items-center gap-2">
              <input
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                onBlur={salvarObs}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                maxLength={500}
                placeholder="Ex.: cartão recusado, liguei às 15h e pedi outro cartão"
                aria-label={`Observação de ${linha.hospede}`}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0f8b8d] focus:outline-none focus:ring-2 focus:ring-[#0f8b8d]/25"
              />
              <span className="w-5 shrink-0" aria-live="polite">
                {salvando ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : !obsMudou && linha.observacao ? (
                  <Check className="h-4 w-4 text-[#0f8b8d]" aria-label="Salva" />
                ) : null}
              </span>
            </div>
          )}

          {(linha.marcado_nome || tratada(linha)) && (
            <p className="text-xs text-slate-500">
              {linha.marcado_nome && linha.marcado_em
                ? `Anotado por ${linha.marcado_nome} em ${new Date(linha.marcado_em).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}. `
                : ""}
              {tratada(linha) && "Fica na lista até o Cloudbeds zerar o saldo."}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
