// Cartão de uma reserva a cobrar. A cobrança é feita no Cloudbeds; aqui a recepção anota o resultado.
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, CreditCard, ExternalLink, Loader2, Mail, MessageSquareText, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { todaySP } from "@/lib/tz";
import {
  COBRADO_TEXTO,
  SAIDA_TEXTO,
  cobrancaResolvida,
  diasEntre,
  linkCloudbeds,
  PRAZO_NR_DIAS,
  type Cobrado,
  type MotivoCobranca,
} from "@/lib/reservas/cobranca";
import { useRelancarNoCloudbeds, type LinhaCobranca, type TentativaCobranca } from "@/lib/reservas/use-reservas";
import { CheckinDialog, CobrarAgoraDialog, EnviarLinkDialog } from "./acoes-cobranca";

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

/** Cores dos botões de "Cobrado?" (Aguardando autenticação = vermelho, Pgto. no check-in = roxo). */
const TOM_ATIVO: Record<Cobrado, string> = {
  sim: "bg-[#0f8b8d] text-white border-[#0f8b8d]",
  recusado: "bg-[#fdecec] text-[#a61b1b] border-[#f0a8a8]",
  link_enviado: "bg-[#e6f3fb] text-[#155e86] border-[#9cc9e4]",
  aguardando_autenticacao: "bg-[#e03131] text-white border-[#e03131]",
  pagamento_checkin: "bg-[#7048e8] text-white border-[#7048e8]",
};
const TOM_INATIVO: Partial<Record<Cobrado, string>> = {
  aguardando_autenticacao: "border-[#f5b5b5] text-[#c92a2a] hover:border-[#e03131]",
  pagamento_checkin: "border-[#cfc2fb] text-[#6741d9] hover:border-[#7048e8]",
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

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Uma linha sobre a última ação com dinheiro desta reserva (e o alerta se faltou lançar no Cloudbeds). */
function UltimaAcao({ t, unidade }: { t: TentativaCobranca; unidade: LinhaCobranca["unidade"] }) {
  const relancar = useRelancarNoCloudbeds(unidade);
  const valor = t.valor ? brl(t.valor) : "";
  const quem = t.usuario_nome ? ` por ${t.usuario_nome}` : "";
  const teste = t.modo === "teste" ? " [teste]" : "";
  const faltouCloudbeds =
    (t.status === "aprovado" || t.status === "link_pago") && (t.cloudbeds_pagamento === "falhou" || t.cloudbeds_nota === "falhou");

  if (faltouCloudbeds) {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200 sm:flex-row sm:items-center">
        <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
        <p className="flex-1">
          <span className="font-bold">Pago no Stripe ({valor}), mas falta lançar no Cloudbeds.</span> Não cobre de novo.
          {t.mensagem ? <span className="block text-xs text-red-700">{t.mensagem}</span> : null}
        </p>
        <button
          type="button"
          disabled={relancar.isPending}
          onClick={() =>
            relancar.mutate(
              { tentativaId: t.id },
              { onSuccess: (r) => toast.success(r.mensagem), onError: (e) => toast.error(e instanceof Error ? e.message : "Falhou de novo.") },
            )
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {relancar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Lançar no Cloudbeds
        </button>
      </div>
    );
  }

  let texto = "";
  if (t.tipo === "cobranca") {
    texto =
      t.status === "aprovado"
        ? `Cobrado ${valor} no ${t.cartao ?? "cartão"}${quem} em ${quando(t.criado_em)}${t.modo === "teste" ? "" : ". Pagamento e nota no Cloudbeds."}`
        : t.status === "autenticacao"
          ? `Banco pediu confirmação do hóspede (${quando(t.criado_em)}). Nada foi cobrado.`
          : t.status === "recusado"
            ? `Recusado em ${quando(t.criado_em)}: ${t.mensagem ?? ""}`
            : t.status === "processando"
              ? `Cobrança em andamento${quem}…`
              : `Erro ao cobrar em ${quando(t.criado_em)}: ${t.mensagem ?? ""}`;
  } else if (t.tipo === "link") {
    texto =
      t.status === "link_pago"
        ? `Link pago (${valor}). Pagamento e nota no Cloudbeds.`
        : t.status === "link_enviado"
          ? `Link de ${valor} enviado para ${t.email_destino ?? "o hóspede"}${quem} em ${quando(t.criado_em)}. Aguardando o pagamento.`
          : t.status === "processando"
            ? "Enviando o link…"
            : `Erro ao enviar o link: ${t.mensagem ?? ""}`;
  } else {
    texto = t.status === "registrado" ? `Nota "Pagamento no check in"${quem} em ${quando(t.criado_em)}.` : `Erro ao escrever a nota: ${t.mensagem ?? ""}`;
  }
  return (
    <p className={cn("flex items-start gap-1.5 text-xs", t.status === "erro" || t.status === "recusado" ? "text-red-700" : "text-slate-600")}>
      <span className="min-w-0 flex-1">
        {texto}
        {teste}
      </span>
      {t.tipo === "link" && t.status === "link_enviado" && t.link_url && (
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(t.link_url ?? "").then(() => toast.success("Link copiado"))}
          className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#0f8b8d] hover:underline"
        >
          <Copy className="h-3.5 w-3.5" /> Copiar link
        </button>
      )}
    </p>
  );
}

type Janela = "cobrar" | "link" | "checkin" | null;

export function CobrancaCard({
  linha,
  onMarcar,
  salvando,
  tentativas = [],
}: {
  linha: LinhaCobranca;
  onMarcar: (cobrado: Cobrado | null, observacao: string | null) => Promise<void>;
  salvando: boolean;
  tentativas?: TentativaCobranca[];
}) {
  const tom = linha.motivo ? TOM_MOTIVO[linha.motivo] : null;
  const [obs, setObs] = useState(linha.observacao ?? "");
  const [obsAberta, setObsAberta] = useState(!!linha.observacao);
  const [janela, setJanela] = useState<Janela>(null);
  useEffect(() => setObs(linha.observacao ?? ""), [linha.observacao]);
  const obsMudou = (obs.trim() || null) !== (linha.observacao ?? null);
  const noites = linha.checkin && linha.checkout ? diasEntre(linha.checkin, linha.checkout) : null;
  const saiu = !linha.ativa;
  const pago = linha.cobrado === "sim";
  const resolvida = cobrancaResolvida(linha.cobrado);
  const ultima = tentativas[0];
  const emAndamento = ultima?.status === "processando";
  // Pago no Stripe e não lançado no Cloudbeds: o cartão nunca fica apagado (o alerta precisa aparecer).
  const pendenteCloudbeds = tentativas.some(
    (t) => (t.status === "aprovado" || t.status === "link_pago") && (t.cloudbeds_pagamento === "falhou" || t.cloudbeds_nota === "falhou"),
  );

  const salvar = async (cobrado: Cobrado | null, observacao: string | null, aviso?: string) => {
    try {
      await onMarcar(cobrado, observacao);
      if (aviso) toast.success(aviso);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    }
  };

  /** Recusado e Aguardando autenticação: anotação manual (liga/desliga). */
  const alternar = (opcao: Cobrado) => {
    const novo = linha.cobrado === opcao ? null : opcao;
    void salvar(novo, linha.observacao, novo ? `${linha.hospede}: ${COBRADO_TEXTO[novo]}` : `${linha.hospede}: marcação removida`);
  };

  const salvarObs = () => {
    if (!obsMudou) return;
    void salvar(linha.cobrado, obs.trim() || null, "Observação salva");
  };

  const botao = (opcao: Cobrado, rotulo: React.ReactNode, onClick: () => void, extra?: string) => {
    const ativo = linha.cobrado === opcao;
    return (
      <button
        key={opcao}
        type="button"
        aria-pressed={ativo}
        disabled={salvando || pago || emAndamento}
        onClick={onClick}
        className={cn(
          "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition-colors sm:h-8 disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f8b8d] focus-visible:ring-offset-1",
          ativo ? TOM_ATIVO[opcao] : cn("border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900", TOM_INATIVO[opcao]),
          extra,
        )}
      >
        {ativo && <Check className="h-3.5 w-3.5" />}
        {rotulo}
      </button>
    );
  };

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 transition-opacity",
        (resolvida || saiu) && !pendenteCloudbeds && "opacity-75",
        pendenteCloudbeds && "ring-2 ring-red-300",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", tom?.faixa ?? "bg-slate-300")} />

      <div className="grid gap-3 p-4 pl-6 sm:grid-cols-[1fr_auto] sm:items-start sm:p-5 sm:pl-7">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", tom?.prazo ?? "bg-slate-100 text-slate-600")}>
              {textoPrazo(linha)}
            </span>
            {linha.cobrado && (
              <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold", TOM_ATIVO[linha.cobrado])}>
                {COBRADO_TEXTO[linha.cobrado]}
              </span>
            )}
          </div>
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
          <p className="font-display text-2xl font-extrabold tabular-nums tracking-tight text-[#0e2a30]">{brl(linha.saldo)}</p>
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
              {botao(
                "sim",
                pago ? "Pago" : (
                  <>
                    <CreditCard className="h-3.5 w-3.5" /> Cobrar agora
                  </>
                ),
                () => setJanela("cobrar"),
                pago ? "col-span-2 sm:col-span-1" : "col-span-2 border-[#0f8b8d] bg-[#0f8b8d] text-white hover:bg-[#0c7a7c] hover:text-white sm:col-span-1",
              )}
              {botao("recusado", "Recusado", () => alternar("recusado"))}
              {botao(
                "link_enviado",
                linha.cobrado === "link_enviado" ? "Link enviado" : (
                  <>
                    <Mail className="h-3.5 w-3.5" /> Enviar link
                  </>
                ),
                () => setJanela("link"),
              )}
              {botao(
                "aguardando_autenticacao",
                <>
                  <span className="sm:hidden">Aguard. aut.</span>
                  <span className="hidden sm:inline">Aguard. autenticação</span>
                </>,
                () => alternar("aguardando_autenticacao"),
              )}
              {botao("pagamento_checkin", "Pgto. no check-in", () =>
                linha.cobrado === "pagamento_checkin" ? alternar("pagamento_checkin") : setJanela("checkin"),
              )}
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

          {(() => {
            // O alerta de "falta lançar no Cloudbeds" tem prioridade sobre a última ação.
            const alvo = tentativas.find(
              (t) => (t.status === "aprovado" || t.status === "link_pago") && (t.cloudbeds_pagamento === "falhou" || t.cloudbeds_nota === "falhou"),
            ) ?? ultima;
            return alvo ? <UltimaAcao t={alvo} unidade={linha.unidade} /> : null;
          })()}

          {linha.marcado_nome && linha.marcado_em && (!ultima || new Date(linha.marcado_em) > new Date(ultima.criado_em)) && (
            <p className="text-xs text-slate-500">
              Anotado por {linha.marcado_nome} em {quando(linha.marcado_em)}.{resolvida ? " Fica na lista até o Cloudbeds zerar o saldo." : ""}
            </p>
          )}
        </div>
      )}

      <CobrarAgoraDialog linha={linha} aberto={janela === "cobrar"} onFechar={() => setJanela(null)} />
      <EnviarLinkDialog linha={linha} aberto={janela === "link"} onFechar={() => setJanela(null)} />
      <CheckinDialog linha={linha} aberto={janela === "checkin"} onFechar={() => setJanela(null)} />
    </article>
  );
}
