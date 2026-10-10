import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, Camera, Check, CornerDownLeft, CreditCard, Delete, DoorOpen, IdCard, KeyRound, Loader2, LogOut, Phone, Printer, QrCode, RotateCcw, ScanFace, ScanLine, ShieldCheck, Star, UserRound, Volume2, VolumeX, Wallet } from "lucide-react";
import {
  totemAvaliar,
  totemDocumentoEnviar,
  totemPagamentoCancelar,
  totemPagamentoIniciar,
  totemPagamentoStatus,
  totemCheckinConfirmar,
  totemCheckinConsultar,
  totemCheckoutConfirmar,
  totemCheckoutConsultar,
  totemInfo,
  totemParear,
  type Comprovante,
  type DocumentosPendentes,
  type MetodoPagamento,
  type PagamentoPendente,
  type PortaTotem,
  type RespostaCheckin,
  type SituacaoPagamento,
  type RespostaCheckout,
  type TotemInfo,
} from "@/lib/totem.functions";
import { formatadores, IDIOMAS, TEXTOS, type Idioma } from "@/lib/totem/i18n";
import { documentosFaltando, type Motivo } from "@/lib/totem/regras";
import { imprimirRawBT, montarEscPos } from "@/lib/totem/escpos";
import { cn } from "@/lib/utils";
import { CHAVE_TOKEN_TOTEM } from "@/lib/totem/chave";
import { BlinkDetector, eyeAspectRatio, loadFaceApi } from "@/lib/ponto-face";
import { Locutor, calar, falar, motorDeVoz } from "@/lib/totem/voz";
import { ESPERA_MANUAL_DOC_MS, ESPERA_MANUAL_MS, Estabilidade, situacaoComDocumento, situacaoSelfie, type LeituraRosto } from "@/lib/totem/rosto";

// Tela do hóspede no tablet do balcão "Express" (pensada para 12" em paisagem,
// funciona também em retrato). Não usa o teclado do Android: o teclado é
// desenhado aqui, grande, para não cobrir metade da tela.


function ler(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravar(chave: string, valor: string | null) {
  try {
    if (valor === null) window.localStorage.removeItem(chave);
    else window.localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: segue sem guardar */
  }
}

type Ident =
  | { modo: "codigo"; codigo: string; sobrenome: string }
  | { modo: "documento"; nome: string; documento: string };

/** Chamadas ao servidor. Injetáveis para testar as telas sem Cloudbeds/Tuya. */
export type TotemApi = {
  info: (token: string) => Promise<TotemInfo>;
  parear: (codigo: string) => Promise<{ token: string; totem: TotemInfo }>;
  checkinConsultar: (token: string, ident: Ident) => Promise<RespostaCheckin>;
  checkinConfirmar: (token: string, ident: Ident) => Promise<RespostaCheckin>;
  checkoutConsultar: (token: string, quarto: string, sobrenome: string) => Promise<RespostaCheckout>;
  checkoutConfirmar: (token: string, quarto: string, sobrenome: string) => Promise<RespostaCheckout>;
  avaliar: (token: string, a: { reservationID: string; quarto: string; nota: number; comentario: string }) => Promise<unknown>;
  pagamentoIniciar: (token: string, ticket: string, metodo: MetodoPagamento) => Promise<SituacaoPagamento | { status: "nada_a_pagar" }>;
  pagamentoStatus: (token: string, cobrancaId: string) => Promise<SituacaoPagamento>;
  pagamentoCancelar: (token: string, cobrancaId: string) => Promise<SituacaoPagamento>;
  documentoEnviar: (token: string, d: DocumentoEnvio) => Promise<unknown>;
};

export type DocumentoEnvio = {
  ticket: string;
  ordem: number;
  nome: string;
  tipo: "rg" | "cnh" | "passaporte" | "outro";
  numero: string;
  etapa: "rosto" | "rosto_documento";
  vivacidade: boolean | null;
  distPessoa: number | null;
  distDocumento: number | null;
  consentimento: true;
  foto: string;
};

const API_SERVIDOR: TotemApi = {
  info: (token) => totemInfo({ data: { token } }),
  parear: (codigo) => totemParear({ data: { codigo } }),
  checkinConsultar: (token, ident) => totemCheckinConsultar({ data: { token, ident } }),
  checkinConfirmar: (token, ident) => totemCheckinConfirmar({ data: { token, ident } }),
  checkoutConsultar: (token, quarto, sobrenome) => totemCheckoutConsultar({ data: { token, quarto, sobrenome } }),
  checkoutConfirmar: (token, quarto, sobrenome) => totemCheckoutConfirmar({ data: { token, quarto, sobrenome } }),
  avaliar: (token, a) => totemAvaliar({ data: { token, ...a } }),
  pagamentoIniciar: (token, ticket, metodo) => totemPagamentoIniciar({ data: { token, ticket, metodo } }),
  pagamentoStatus: (token, cobrancaId) => totemPagamentoStatus({ data: { token, cobrancaId } }),
  pagamentoCancelar: (token, cobrancaId) => totemPagamentoCancelar({ data: { token, cobrancaId } }),
  documentoEnviar: (token, d) => totemDocumentoEnviar({ data: { token, ...d } }),
};

type SenhaTela = Extract<RespostaCheckin, { estado: "senha" }>;
type Fluxo = "checkin" | "checkout";

type CtxCheckin = {
  ident: Ident;
  ticket: string;
  nome: string;
  quartos: string[];
  checkOut: string;
  pagamento: PagamentoPendente | null;
  documentos: DocumentosPendentes | null;
};
type CtxCheckout = { quarto: string; sobrenome: string; ticket: string; nome: string; reservationID: string; pagamento: PagamentoPendente | null };

type Tela =
  | { t: "carregando" }
  | { t: "parear" }
  | { t: "inicio" }
  | { t: "checkin"; modo: Ident["modo"] }
  | { t: "checkin_resumo"; ctx: CtxCheckin }
  | { t: "pagamento"; fluxo: "checkin"; ctx: CtxCheckin }
  | { t: "pagamento"; fluxo: "checkout"; ctx: CtxCheckout }
  | { t: "documentos"; ctx: CtxCheckin }
  | { t: "senha"; r: SenhaTela }
  | { t: "impedido"; fluxo: Fluxo; nome: string; motivos: Motivo[] }
  | { t: "nao_encontrado"; fluxo: Fluxo; voltar: Tela }
  | { t: "bloqueado"; fluxo: Fluxo }
  | { t: "checkout" }
  | { t: "checkout_resumo"; ctx: CtxCheckout }
  | { t: "checkout_feito"; nome: string; quarto: string; reservationID: string; comprovante: Comprovante }
  | { t: "avaliado" }
  | { t: "erro"; fluxo: Fluxo; mensagem: string };

/** Quanto tempo sem toque até perguntar "Ainda está aí?" (a tela inicial não tem limite). */
const OCIOSO_MS: Partial<Record<Tela["t"], number>> = {
  checkin: 75_000,
  checkin_resumo: 60_000,
  pagamento: 180_000,
  documentos: 120_000,
  impedido: 45_000,
  nao_encontrado: 45_000,
  bloqueado: 45_000,
  checkout: 75_000,
  checkout_resumo: 60_000,
  checkout_feito: 60_000,
  avaliado: 6_000,
  erro: 45_000,
  senha: 150_000,
};
const AVISO_S = 15;

function mensagemDe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Erro desconhecido";
}

function fluxoDe(tela: Tela, modo: TotemInfo["modo"] | undefined): Fluxo {
  if ("fluxo" in tela) return tela.fluxo;
  if (tela.t.startsWith("checkout") || tela.t === "avaliado") return "checkout";
  if (tela.t === "inicio" && modo === "checkout") return "checkout";
  return "checkin";
}

function passoDe(tela: Tela): number {
  switch (tela.t) {
    case "pagamento":
      return 1;
    case "documentos":
    case "checkout_resumo":
      return 2;
    case "senha":
    case "checkout_feito":
    case "avaliado":
      return 3;
    default:
      return 0;
  }
}

const faltaDocumento = (ctx: CtxCheckin) =>
  !!ctx.documentos && documentosFaltando(ctx.documentos.adultos.length, ctx.documentos.enviados) > 0;

// ======================================================================= app

/** Fala no idioma da tela; `prioridade` = frase de tela (sai na hora), sem ela = dica (filtrada). */
const VozContexto = createContext<(texto: string, prioridade?: boolean) => void>(() => undefined);
const useVoz = () => useContext(VozContexto);
const primeiroNomeTela = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

export function TotemApp({ api = API_SERVIDOR }: { api?: TotemApi } = {}) {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<TotemInfo | null>(null);
  const [idioma, setIdioma] = useState<Idioma>("pt");
  const [tela, setTela] = useState<Tela>({ t: "carregando" });
  const t = TEXTOS[idioma];
  const fmt = useMemo(() => formatadores(idioma), [idioma]);

  // ---- voz: passo a passo falado no idioma escolhido
  const [mudo, setMudo] = useState(false);
  const [temVoz, setTemVoz] = useState(false);
  useEffect(() => setTemVoz(motorDeVoz() !== null), []);
  const vozLigada = temVoz && (info?.voz ?? true) && !mudo;
  const idiomaRef = useRef(idioma);
  idiomaRef.current = idioma;
  const vozRef = useRef(vozLigada);
  vozRef.current = vozLigada;
  const locutor = useMemo(() => new Locutor((texto) => falar(texto, idiomaRef.current)), []);
  const dizer = useCallback(
    (texto: string, prioridade = false) => {
      if (vozRef.current) locutor.dizer(texto, prioridade);
    },
    [locutor],
  );
  // Só fala depois que alguém toca na tela (não conversa com o saguão vazio).
  const interagiu = useRef(false);

  const tratarErro = useCallback((e: unknown, fluxo: Fluxo = "checkin") => {
    const msg = mensagemDe(e);
    if (msg.includes("TOTEM_NAO_AUTORIZADO")) {
      gravar(CHAVE_TOKEN_TOTEM, null);
      setToken(null);
      setInfo(null);
      setTela({ t: "parear" });
      return;
    }
    setTela({ t: "erro", fluxo, mensagem: msg });
  }, []);

  useEffect(() => {
    const salvo = ler(CHAVE_TOKEN_TOTEM);
    if (!salvo) {
      setTela({ t: "parear" });
      return;
    }
    setToken(salvo);
    api
      .info(salvo)
      .then((i) => {
        setInfo(i);
        setTela({ t: "inicio" });
      })
      .catch((e) => tratarErro(e));
    // Revalida o aparelho a cada 10 min (desconectar no painel do gestor tem efeito rápido).
    const iv = window.setInterval(() => {
      api
        .info(salvo)
        .then(setInfo)
        .catch((e) => {
          if (mensagemDe(e).includes("TOTEM_NAO_AUTORIZADO")) tratarErro(e);
        });
    }, 10 * 60_000);
    return () => window.clearInterval(iv);
  }, [api, tratarErro]);

  const irInicio = useCallback(() => {
    setTela((atual) => (atual.t === "parear" || atual.t === "carregando" ? atual : { t: "inicio" }));
    // Cada hóspede começa em português; o idioma escolhido não fica para o próximo.
    setIdioma("pt");
    setMudo(false);
    interagiu.current = false;
    calar();
    locutor.esquecer();
  }, [locutor]);

  useModoQuiosque(!!token);
  const restante = useOcioso(OCIOSO_MS[tela.t], tela, irInicio);

  const modo = info?.modo ?? "ambos";
  const fluxo = fluxoDe(tela, modo);
  const titulo =
    tela.t === "inicio" && modo === "ambos"
      ? t.expressAmbos
      : fluxo === "checkout"
        ? t.expressCheckout
        : t.expressCheckin;
  const subtitulo =
    tela.t === "inicio" && modo === "ambos" ? t.subtituloAmbos : fluxo === "checkout" ? t.subtituloCheckout : t.subtituloCheckin;
  const mostraPassos = tela.t !== "parear" && tela.t !== "carregando" && !(tela.t === "inicio" && modo === "ambos");

  // ------------------------------------------------------------ impressão
  const imprimir = useCallback(
    (c: Comprovante) => {
      try {
        imprimirRawBT(montarEscPos(c, t.rc, { dataHora: fmt.dataHora, valor: fmt.valor, metodo: (m) => t.metodos[m] }));
      } catch (e) {
        console.error("[totem] falha ao imprimir", e);
      }
    },
    [t, fmt],
  );
  // Imprime sozinho uma vez ao chegar na senha (check-in) ou ao concluir o check-out.
  const impresso = useRef<object | null>(null);
  useEffect(() => {
    if (info?.impressora !== "rawbt") return;
    const c = tela.t === "senha" ? tela.r.comprovante : tela.t === "checkout_feito" ? tela.comprovante : null;
    if (!c || impresso.current === c) return;
    impresso.current = c;
    imprimir(c);
  }, [tela, info?.impressora, imprimir]);

  // --------------------------------------------------------------- ações
  const consultarCheckin = async (ident: Ident) => {
    if (!token) return;
    try {
      const r = await api.checkinConsultar(token, ident);
      if (r.estado === "pronto")
        setTela({
          t: "checkin_resumo",
          ctx: { ident, ticket: r.ticket, nome: r.nome, quartos: r.quartos, checkOut: r.checkOut, pagamento: r.pagamento, documentos: r.documentos },
        });
      else if (r.estado === "impedido") setTela({ t: "impedido", fluxo: "checkin", nome: r.nome, motivos: r.motivos });
      else if (r.estado === "nao_encontrado") setTela({ t: "nao_encontrado", fluxo: "checkin", voltar: { t: "checkin", modo: ident.modo } });
      else if (r.estado === "bloqueado") setTela({ t: "bloqueado", fluxo: "checkin" });
      else if (r.estado === "senha") setTela({ t: "senha", r });
    } catch (e) {
      tratarErro(e, "checkin");
    }
  };

  const confirmarCheckin = async (ident: Ident) => {
    if (!token) return;
    try {
      const r = await api.checkinConfirmar(token, ident);
      if (r.estado === "senha") setTela({ t: "senha", r });
      else if (r.estado === "impedido") setTela({ t: "impedido", fluxo: "checkin", nome: r.nome, motivos: r.motivos });
      else if (r.estado === "bloqueado") setTela({ t: "bloqueado", fluxo: "checkin" });
      else setTela({ t: "nao_encontrado", fluxo: "checkin", voltar: { t: "checkin", modo: ident.modo } });
    } catch (e) {
      tratarErro(e, "checkin");
    }
  };

  /** Depois de cada etapa do check-in, vai para a próxima que faltar (pagamento → documentos → senha). */
  const avancarCheckin = async (ctx: CtxCheckin, depoisDe: "resumo" | "pagamento" | "documentos") => {
    if (depoisDe === "resumo" && ctx.pagamento) return setTela({ t: "pagamento", fluxo: "checkin", ctx });
    if (depoisDe !== "documentos" && faltaDocumento(ctx)) return setTela({ t: "documentos", ctx });
    await confirmarCheckin(ctx.ident);
  };

  const consultarCheckout = async (quarto: string, sobrenome: string) => {
    if (!token) return;
    try {
      const r = await api.checkoutConsultar(token, quarto, sobrenome);
      if (r.estado === "pronto") {
        const ctx: CtxCheckout = { quarto: r.quarto, sobrenome, ticket: r.ticket, nome: r.nome, reservationID: r.reservationID, pagamento: r.pagamento };
        setTela(r.pagamento ? { t: "pagamento", fluxo: "checkout", ctx } : { t: "checkout_resumo", ctx });
      }
      else if (r.estado === "impedido") setTela({ t: "impedido", fluxo: "checkout", nome: r.nome, motivos: r.motivos });
      else if (r.estado === "bloqueado") setTela({ t: "bloqueado", fluxo: "checkout" });
      else setTela({ t: "nao_encontrado", fluxo: "checkout", voltar: { t: "checkout" } });
    } catch (e) {
      tratarErro(e, "checkout");
    }
  };

  const confirmarCheckout = async (quarto: string, sobrenome: string) => {
    if (!token) return;
    try {
      const r = await api.checkoutConfirmar(token, quarto, sobrenome);
      if (r.estado === "concluido")
        setTela({ t: "checkout_feito", nome: r.nome, quarto: r.quarto, reservationID: r.reservationID, comprovante: r.comprovante });
      else if (r.estado === "impedido") setTela({ t: "impedido", fluxo: "checkout", nome: r.nome, motivos: r.motivos });
      else if (r.estado === "bloqueado") setTela({ t: "bloqueado", fluxo: "checkout" });
      else setTela({ t: "nao_encontrado", fluxo: "checkout", voltar: { t: "checkout" } });
    } catch (e) {
      tratarErro(e, "checkout");
    }
  };

  // Narração de cada tela (a identificação fala por conta própria, etapa a etapa).
  useEffect(() => {
    const v = t.voz;
    let texto: string | null = null;
    switch (tela.t) {
      case "inicio":
        if (!interagiu.current) return;
        texto = modo === "checkout" ? v.checkout : modo === "checkin" ? v.inicioCheckin : v.inicioAmbos;
        break;
      case "checkin":
        texto = tela.modo === "codigo" ? v.checkinCodigo : v.checkinDocumento;
        break;
      case "checkin_resumo":
        texto = v.resumo(primeiroNomeTela(tela.ctx.nome));
        break;
      case "pagamento":
        texto = v.pagamento(fmt.valor(tela.ctx.pagamento?.valor ?? 0));
        break;
      case "senha":
        texto = v.senha;
        break;
      case "checkout":
        texto = v.checkout;
        break;
      case "checkout_resumo":
        texto = v.checkoutResumo(primeiroNomeTela(tela.ctx.nome));
        break;
      case "checkout_feito":
        texto = v.checkoutFeito;
        break;
      case "avaliado":
        texto = v.avaliado;
        break;
      case "impedido":
        texto = v.problema(`${t.naoDeuCerto}.`);
        break;
      case "nao_encontrado":
        texto = v.problema(tela.fluxo === "checkin" ? t.naoEncontrada : t.naoEncontradaCheckout);
        break;
      case "bloqueado":
        texto = v.problema(t.bloqueado);
        break;
      case "erro":
        texto = v.problema(`${t.naoDeuCerto}.`);
        break;
      default:
        return;
    }
    if (texto) dizer(texto, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tela, idioma]);

  const voltarInicioVisivel = !(tela.t === "inicio" || tela.t === "parear" || tela.t === "carregando" || (tela.t === "checkout" && modo === "checkout"));

  // ------------------------------------------------------------- conteúdo
  let painel: ReactNode = null;
  switch (tela.t) {
    case "carregando":
      painel = (
        <div className="grid h-full place-items-center">
          <Loader2 className="h-10 w-10 animate-spin text-[var(--teal)]" aria-label="…" />
        </div>
      );
      break;
    case "parear":
      painel = (
        <Parear
          t={t}
          parear={api.parear}
          onPareado={(tok, i) => {
            gravar(CHAVE_TOKEN_TOTEM, tok);
            setToken(tok);
            setInfo(i);
            setTela({ t: "inicio" });
          }}
        />
      );
      break;
    case "inicio":
      if (modo === "checkout") painel = <FormCheckout t={t} onEnviar={consultarCheckout} />;
      else if (modo === "checkin") painel = <EscolherMetodo t={t} onEscolher={(m) => setTela({ t: "checkin", modo: m })} />;
      else painel = <EscolherFluxo t={t} onEscolher={(f) => setTela(f === "checkin" ? { t: "checkin", modo: "codigo" } : { t: "checkout" })} />;
      break;
    case "checkin":
      painel = <FormCheckin key={tela.modo} t={t} modo={tela.modo} onTrocarModo={(m) => setTela({ t: "checkin", modo: m })} onEnviar={consultarCheckin} />;
      break;
    case "checkin_resumo": {
      const ctx = tela.ctx;
      const temEtapas = !!ctx.pagamento || faltaDocumento(ctx);
      painel = (
        <Resumo
          t={t}
          titulo={t.ola(ctx.nome)}
          linhas={[
            t.seuQuarto(ctx.quartos),
            ctx.checkOut ? t.saidaEm(fmt.data(ctx.checkOut)) : "",
            ctx.pagamento ? `${t.valorAPagar}: ${fmt.valor(ctx.pagamento.valor)}` : "",
          ]}
          acao={temEtapas ? t.continuar2 : t.confirmarCheckin}
          carregando={temEtapas ? t.conferindo : t.gerandoSenha}
          icone={temEtapas ? <CornerDownLeft className="h-7 w-7" /> : <KeyRound className="h-7 w-7" />}
          onConfirmar={() => avancarCheckin(ctx, "resumo")}
        />
      );
      break;
    }
    case "pagamento": {
      const ctx = tela.ctx;
      const valor = ctx.pagamento?.valor ?? 0;
      const aposPagar = () => {
        if (tela.fluxo === "checkin") void avancarCheckin({ ...tela.ctx, pagamento: null }, "pagamento");
        else setTela({ t: "checkout_resumo", ctx: { ...tela.ctx, pagamento: null } });
      };
      painel = (
        <EtapaPagamento
          key={ctx.ticket}
          t={t}
          valorTexto={fmt.valor(valor)}
          iniciar={(m) => api.pagamentoIniciar(token ?? "", ctx.ticket, m)}
          status={(id) => api.pagamentoStatus(token ?? "", id)}
          cancelar={(id) => api.pagamentoCancelar(token ?? "", id)}
          onPago={aposPagar}
          onErro={(e) => tratarErro(e, tela.fluxo)}
        />
      );
      break;
    }
    case "documentos": {
      const ctx = tela.ctx;
      painel = (
        <EtapaDocumentos
          key={ctx.ticket}
          t={t}
          adultos={ctx.documentos?.adultos ?? []}
          enviados={ctx.documentos?.enviados ?? []}
          enviar={(d) => api.documentoEnviar(token ?? "", { ...d, ticket: ctx.ticket })}
          onConcluir={() => void avancarCheckin({ ...ctx, documentos: null }, "documentos")}
        />
      );
      break;
    }

    case "senha":
      painel = (
        <TelaSenha
          t={t}
          r={tela.r}
          validaAte={fmt.dataHora(tela.r.validaAte)}
          onFim={irInicio}
          imprimir={info?.impressora === "rawbt" ? () => imprimir(tela.r.comprovante) : null}
        />
      );
      break;
    case "impedido":
      painel = (
        <Aviso t={t} titulo={tela.nome ? `${t.ola(tela.nome)} ${t.naoDeuCerto}.` : t.naoDeuCerto} telefone={info?.telefoneSuporte ?? null} onFim={irInicio}>
          <ul className="mt-8 space-y-3">
            {tela.motivos.map((m) => (
              <li key={JSON.stringify(m)} className="flex gap-4 rounded-2xl bg-[var(--pedra)] px-6 py-5 text-xl font-medium">
                <span aria-hidden className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--madeira)]" />
                {t.motivo(m, fmt.data, fmt.valor)}
              </li>
            ))}
          </ul>
        </Aviso>
      );
      break;
    case "nao_encontrado":
      painel = (
        <Aviso
          t={t}
          titulo={tela.fluxo === "checkin" ? t.naoEncontrada : t.naoEncontradaCheckout}
          telefone={info?.telefoneSuporte ?? null}
          onFim={irInicio}
          tentar={() => setTela(tela.voltar)}
        >
          <p className="mt-5 max-w-xl text-xl leading-relaxed text-[var(--tinta-suave)]">{t.naoEncontradaDica}</p>
        </Aviso>
      );
      break;
    case "bloqueado":
      painel = (
        <Aviso t={t} titulo={t.bloqueado} telefone={info?.telefoneSuporte ?? null} onFim={irInicio}>
          <p className="mt-5 text-xl text-[var(--tinta-suave)]">{t.bloqueadoDica}</p>
        </Aviso>
      );
      break;
    case "erro":
      painel = (
        <Aviso t={t} titulo={t.erro} telefone={info?.telefoneSuporte ?? null} onFim={irInicio}>
          <p className="mt-6 rounded-2xl bg-[var(--pedra)] px-6 py-5 text-lg">{tela.mensagem}</p>
        </Aviso>
      );
      break;
    case "checkout":
      painel = <FormCheckout t={t} onEnviar={consultarCheckout} />;
      break;
    case "checkout_resumo":
      painel = (
        <Resumo
          t={t}
          titulo={t.ola(tela.ctx.nome)}
          linhas={[t.seuQuarto([tela.ctx.quarto])]}
          acao={t.confirmarCheckout}
          carregando={t.saindo}
          icone={<LogOut className="h-7 w-7" />}
          onConfirmar={() => confirmarCheckout(tela.ctx.quarto, tela.ctx.sobrenome)}
        />
      );
      break;
    case "checkout_feito":
      painel = (
        <Avaliacao
          t={t}
          onPular={irInicio}
          onEnviar={async (nota, comentario) => {
            if (!token) return;
            try {
              await api.avaliar(token, { reservationID: tela.reservationID, quarto: tela.quarto, nota, comentario });
              setTela({ t: "avaliado" });
            } catch (e) {
              tratarErro(e, "checkout");
            }
          }}
        />
      );
      break;
    case "avaliado":
      painel = (
        <div className="flex h-full flex-col justify-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-[var(--teal)] text-white">
            <Check className="h-10 w-10" />
          </span>
          <h2 className="mt-8 text-5xl font-extrabold tracking-tight">{t.avaliacaoEnviada}</h2>
          <p className="mt-4 text-2xl text-[var(--tinta-suave)]">{t.obrigado}</p>
        </div>
      );
      break;
  }

  const passos = fluxo === "checkout" ? t.passosCheckout4 : t.passosCheckin4;

  return (
    <VozContexto.Provider value={dizer}>
    <div
      onPointerDownCapture={() => {
        interagiu.current = true;
      }}
      className="totem-quiosque relative min-h-[100dvh] select-none bg-[var(--pedra)] text-[var(--tinta)] antialiased lg:h-[100dvh] lg:overflow-hidden"
      lang={idioma === "pt" ? "pt-BR" : idioma}
      style={
        {
          "--pedra": "#ECE6DD",
          "--linho": "#FBF8F4",
          "--tinta": "#2B2622",
          "--tinta-suave": "#2B2622B3",
          "--madeira": "#B08356",
          "--luz": "#F2C98A",
          "--teal": "#0C5A64",
          "--teal-escuro": "#08434B",
        } as CSSProperties
      }
    >
      <div className="grid min-h-[100dvh] lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,37fr)_minmax(0,63fr)] lg:grid-rows-[100%]">
        {/* Coluna da marca: quem somos, onde estamos e em que etapa o hóspede está */}
        <aside className="relative flex min-h-0 flex-col gap-6 px-8 py-7 lg:px-11 lg:py-9">
          <div className="flex items-start justify-between gap-4">
            <Marca unidade={info?.unidade} />
            <Relogio idioma={idioma} />
          </div>

          <div className="lg:mt-2">
            <h1 className="text-[2.6rem] font-extrabold leading-[1.04] tracking-tight xl:text-[2.9rem]">{titulo}</h1>
            <p className="mt-3 max-w-md text-lg leading-snug text-[var(--tinta-suave)]">{subtitulo}</p>
          </div>

          {mostraPassos && (
            <ol className="hidden space-y-1 lg:block" aria-label="Etapas">
              {passos.map((p, i) => {
                const atual = passoDe(tela);
                const feito = i < atual;
                const ativo = i === atual;
                return (
                  <li key={p} className="flex items-center gap-4 py-1.5">
                    <span
                      className={cn(
                        "grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-bold transition-colors",
                        feito && "bg-[var(--teal)] text-white",
                        ativo && "bg-[var(--tinta)] text-white",
                        !feito && !ativo && "border-2 border-[var(--tinta)]/20 text-[var(--tinta)]/40",
                      )}
                    >
                      {feito ? <Check className="h-5 w-5" /> : i + 1}
                    </span>
                    <span className={cn("text-xl", ativo ? "font-bold" : feito ? "font-medium text-[var(--tinta-suave)]" : "text-[var(--tinta)]/45")}>{p}</span>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-auto space-y-5">
            {voltarInicioVisivel && (
              <button
                type="button"
                onClick={irInicio}
                className="inline-flex min-h-14 items-center gap-3 rounded-full bg-white/70 px-6 text-lg font-semibold text-[var(--teal)] focus-visible:outline-2 focus-visible:outline-[var(--teal)]"
              >
                <ArrowLeft className="h-6 w-6" /> {t.inicio}
              </button>
            )}
            {info?.telefoneSuporte && tela.t !== "parear" && (
              <p className="flex items-center gap-3 text-lg">
                <Phone className="h-5 w-5 text-[var(--madeira)]" />
                <span>
                  <span className="text-[var(--tinta-suave)]">{t.ajuda} </span>
                  <span className="font-semibold">{info.telefoneSuporte}</span>
                </span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
            {temVoz && (info?.voz ?? true) && (
              <button
                type="button"
                onClick={() => {
                  if (!mudo) calar();
                  setMudo(!mudo);
                }}
                aria-pressed={!mudo}
                aria-label={mudo ? t.somDesligado : t.somLigado}
                className="grid h-14 w-14 place-items-center rounded-full bg-white/70 text-[var(--teal)] focus-visible:outline-2 focus-visible:outline-[var(--teal)]"
              >
                {mudo ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
              </button>
            )}
            <nav aria-label="Idioma / Language / Idioma" className="flex w-fit gap-1 rounded-full bg-white/70 p-1">
                {IDIOMAS.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setIdioma(i.id)}
                    aria-pressed={idioma === i.id}
                    className={cn(
                      "min-h-12 rounded-full px-5 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--teal)]",
                      idioma === i.id ? "bg-[var(--tinta)] text-white" : "text-[var(--tinta-suave)]",
                    )}
                  >
                    {i.rotulo}
                  </button>
                ))}
            </nav>
            </div>
          </div>
          {/* Linha de luz, como o LED do balcão */}
          <span aria-hidden className="pointer-events-none absolute inset-x-12 bottom-0 hidden h-px bg-gradient-to-r from-transparent via-[var(--luz)] to-transparent lg:block" />
        </aside>

        {/* Painel de interação */}
        <main className="relative min-h-0 bg-[var(--linho)] px-8 py-8 shadow-[-24px_0_60px_-40px_rgba(43,38,34,0.35)] lg:rounded-l-[2.5rem] lg:px-12 lg:py-9">
          <div className="h-full">{painel}</div>
        </main>
      </div>

      {restante !== null && (
        <AvisoInativo t={t} segundos={restante} onContinuar={() => window.dispatchEvent(new Event("pointerdown"))} />
      )}
    </div>
    </VozContexto.Provider>
  );
}

// =================================================================== quiosque

/**
 * Comportamento de quiosque no tablet pareado: tela sempre acesa, tela cheia ao
 * primeiro toque, sem menu de toque longo, sem zoom de pinça e sem "voltar".
 */
function useModoQuiosque(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    const bloquear = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", bloquear);
    document.addEventListener("gesturestart", bloquear);

    // Impede o "voltar" do navegador/Android de sair do totem.
    window.history.pushState(null, "", window.location.href);
    const naoVoltar = () => window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", naoVoltar);

    // Mantém a tela acesa enquanto o totem está aberto.
    type WakeLock = { release: () => Promise<void> };
    let trava: WakeLock | null = null;
    const pedirTela = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } }).wakeLock;
        if (wl && document.visibilityState === "visible") trava = await wl.request("screen");
      } catch {
        /* navegador sem suporte: a configuração do Android cuida disso */
      }
    };
    void pedirTela();
    const aoVoltarVisivel = () => document.visibilityState === "visible" && void pedirTela();
    document.addEventListener("visibilitychange", aoVoltarVisivel);

    // Tela cheia no primeiro toque (o navegador exige um gesto do usuário).
    const telaCheia = () => {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
      }
    };
    window.addEventListener("pointerdown", telaCheia);

    const viewport = document.querySelector('meta[name="viewport"]');
    const viewportAntes = viewport?.getAttribute("content") ?? null;
    viewport?.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");

    return () => {
      document.removeEventListener("contextmenu", bloquear);
      document.removeEventListener("gesturestart", bloquear);
      window.removeEventListener("popstate", naoVoltar);
      document.removeEventListener("visibilitychange", aoVoltarVisivel);
      window.removeEventListener("pointerdown", telaCheia);
      if (viewport && viewportAntes) viewport.setAttribute("content", viewportAntes);
      void trava?.release().catch(() => undefined);
    };
  }, [ativo]);
}

/** Depois de `limite` ms sem toque, mostra a contagem; ao zerar, volta ao início. */
function useOcioso(limite: number | undefined, tela: Tela, aoExpirar: () => void): number | null {
  const ultimo = useRef(Date.now());
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    const marcar = () => {
      ultimo.current = Date.now();
      setRestante(null);
    };
    window.addEventListener("pointerdown", marcar);
    window.addEventListener("keydown", marcar);
    return () => {
      window.removeEventListener("pointerdown", marcar);
      window.removeEventListener("keydown", marcar);
    };
  }, []);

  useEffect(() => {
    ultimo.current = Date.now();
    setRestante(null);
    if (!limite) return;
    const iv = window.setInterval(() => {
      const parado = Date.now() - ultimo.current;
      if (parado < limite) return;
      const falta = AVISO_S - Math.floor((parado - limite) / 1000);
      if (falta <= 0 || tela.t === "avaliado") {
        setRestante(null);
        aoExpirar();
      } else setRestante(falta);
    }, 500);
    return () => window.clearInterval(iv);
  }, [limite, tela, aoExpirar]);

  return restante;
}

// ===================================================================== peças

type T = (typeof TEXTOS)["pt"];

function Marca({ unidade }: { unidade?: string }) {
  // Mesmo desenho da placa do hall: IN / JOY dentro do quadrado, com o ponto.
  return (
    <div className="flex items-center gap-4">
      <div className="relative border-[2.5px] border-[var(--tinta)] px-3 pb-2 pt-1.5 text-[1.35rem] font-extrabold leading-[1.05] tracking-[0.06em]">
        <span className="block">IN</span>
        <span className="block">
          JOY<span aria-hidden className="ml-0.5 inline-block h-2 w-2 rounded-full bg-[var(--teal)] align-baseline" />
        </span>
      </div>
      {unidade && <span className="text-lg font-medium text-[var(--tinta-suave)]">{unidade}</span>}
    </div>
  );
}

function Relogio({ idioma }: { idioma: Idioma }) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const iv = window.setInterval(() => setAgora(new Date()), 20_000);
    return () => window.clearInterval(iv);
  }, []);
  const locale = idioma === "pt" ? "pt-BR" : idioma === "en" ? "en-GB" : "es-ES";
  return (
    <p className="text-right leading-tight">
      <span className="block text-2xl font-bold tabular-nums">
        {agora.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
      </span>
      <span className="block text-sm text-[var(--tinta-suave)] first-letter:uppercase">
        {agora.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" })}
      </span>
    </p>
  );
}

function BotaoPrincipal({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[4.5rem] w-full items-center justify-center gap-3 rounded-2xl bg-[var(--teal)] px-8 text-2xl font-bold text-white transition-transform focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[var(--luz)] active:scale-[0.99] disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

function BotaoSecundario({ children, onClick, className }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[4.5rem] w-full rounded-2xl border-2 border-[var(--tinta)]/15 bg-white text-2xl font-bold text-[var(--tinta)] focus-visible:outline-4 focus-visible:outline-[var(--teal)] active:scale-[0.99]",
        className,
      )}
    >
      {children}
    </button>
  );
}

function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const enviar = async (fn: () => Promise<void>) => {
    if (enviando) return;
    setEnviando(true);
    try {
      await fn();
    } finally {
      setEnviando(false);
    }
  };
  return { enviando, enviar };
}

// ------------------------------------------------------- teclado da tela

type Campo = {
  id: string;
  rotulo: string;
  ajuda?: string;
  valor: string;
  teclado: "texto" | "numerico";
  max: number;
  valido: (v: string) => boolean;
};

const LINHAS_TEXTO = ["1234567890", "QWERTYUIOP", "ASDFGHJKL-", "ZXCVBNM'"];

/**
 * Formulário com campos grandes + teclado próprio. Também aceita teclado físico
 * (útil para a equipe testar no computador). Nenhum <input>: o teclado do
 * Android nunca abre.
 */
function FormTeclado({
  t,
  campos,
  onChange,
  acao,
  carregando,
  onEnviar,
  cabecalho,
}: {
  t: T;
  campos: Campo[];
  onChange: (id: string, valor: string) => void;
  acao: string;
  carregando: string;
  onEnviar: () => Promise<void>;
  cabecalho?: ReactNode;
}) {
  const [ativo, setAtivo] = useState(campos[0]?.id);
  const { enviando, enviar } = useEnvio();
  const campo = campos.find((c) => c.id === ativo) ?? campos[0];
  const tudoValido = campos.every((c) => c.valido(c.valor));

  const digitar = useCallback(
    (ch: string) => {
      if (!campo || campo.valor.length >= campo.max) return;
      if (campo.teclado === "numerico" && !/[0-9A-Za-z]/.test(ch)) return;
      onChange(campo.id, campo.valor + ch);
    },
    [campo, onChange],
  );
  const apagar = useCallback(() => campo && onChange(campo.id, campo.valor.slice(0, -1)), [campo, onChange]);
  const confirmar = useCallback(() => {
    // "Continuar" leva ao próximo campo vazio; com tudo preenchido, envia.
    const pendente = campos.find((c) => !c.valido(c.valor));
    if (pendente) {
      setAtivo(pendente.id);
      return;
    }
    void enviar(onEnviar);
  }, [campos, enviar, onEnviar]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Backspace") apagar();
      else if (e.key === "Enter") confirmar();
      else if (e.key === "Tab") {
        e.preventDefault();
        const i = campos.findIndex((c) => c.id === ativo);
        setAtivo(campos[(i + 1) % campos.length].id);
      } else if (e.key.length === 1 && /[\p{L}\p{N} '\-.]/u.test(e.key)) digitar(e.key.toUpperCase());
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [apagar, confirmar, digitar, campos, ativo]);

  return (
    <div className="flex h-full flex-col">
      {cabecalho}
      <div className={cn("grid gap-4", campos.length > 1 && "sm:grid-cols-2")}>
        {campos.map((c) => {
          const sel = c.id === campo?.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setAtivo(c.id)}
              aria-pressed={sel}
              className="block self-start text-left focus-visible:outline-none"
            >
              <span className="block text-lg font-semibold">{c.rotulo}</span>
              <span
                className={cn(
                  "mt-2 flex min-h-[4.5rem] items-center rounded-2xl border-2 bg-white px-5 text-[1.75rem] font-bold tracking-wide transition-colors",
                  sel ? "border-[var(--teal)] shadow-[0_0_0_4px_rgba(12,90,100,0.12)]" : "border-[var(--tinta)]/10",
                )}
              >
                <span className="truncate">{c.valor}</span>
                {sel && <span aria-hidden className="ml-0.5 inline-block h-8 w-[3px] animate-pulse rounded bg-[var(--teal)]" />}
              </span>
              {c.ajuda && <span className="mt-1.5 block text-[0.95rem] leading-snug text-[var(--tinta-suave)]">{c.ajuda}</span>}
            </button>
          );
        })}
      </div>

      <div className="pt-6 lg:mt-auto lg:pt-5">
        {campo?.teclado === "numerico" ? (
          <TecladoNumerico t={t} onDigito={digitar} onApagar={apagar} onConfirmar={confirmar} acao={enviando ? carregando : acao} enviando={enviando} pronto={tudoValido} />
        ) : (
          <TecladoTexto t={t} onDigito={digitar} onApagar={apagar} onConfirmar={confirmar} acao={enviando ? carregando : acao} enviando={enviando} pronto={tudoValido} />
        )}
      </div>
    </div>
  );
}

type PropsTeclado = {
  t: T;
  onDigito: (ch: string) => void;
  onApagar: () => void;
  onConfirmar: () => void;
  acao: string;
  enviando: boolean;
  pronto: boolean;
};

const classeTecla =
  "grid min-h-[3.6rem] place-items-center rounded-xl bg-white text-[1.45rem] font-bold text-[var(--tinta)] shadow-[inset_0_-3px_0_rgba(43,38,34,0.12),0_0_0_1px_rgba(43,38,34,0.06)] active:translate-y-px active:bg-[var(--pedra)] focus-visible:outline-2 focus-visible:outline-[var(--teal)]";

function TeclaAcao({ acao, enviando, pronto, onConfirmar, className }: { acao: string; enviando: boolean; pronto: boolean; onConfirmar: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onConfirmar}
      disabled={enviando}
      className={cn(
        "flex min-h-[3.6rem] items-center justify-center gap-2 rounded-xl px-4 text-xl font-bold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--luz)]",
        pronto ? "bg-[var(--teal)] text-white" : "bg-[var(--tinta)]/80 text-white",
        className,
      )}
    >
      {enviando ? <Loader2 className="h-6 w-6 animate-spin" /> : <CornerDownLeft className="h-6 w-6" />}
      <span className="truncate">{acao}</span>
    </button>
  );
}

function TecladoTexto({ t, onDigito, onApagar, onConfirmar, acao, enviando, pronto }: PropsTeclado) {
  return (
    <div className="space-y-2" aria-label="Teclado">
      {LINHAS_TEXTO.map((linha, i) => (
        <div key={linha} className="grid grid-cols-10 gap-2">
          {linha.split("").map((ch) => (
            <button key={ch} type="button" onClick={() => onDigito(ch)} className={classeTecla}>
              {ch}
            </button>
          ))}
          {i === 3 && (
            <button type="button" onClick={onApagar} className={cn(classeTecla, "col-span-2 text-base")} aria-label={t.apagar}>
              <Delete className="h-7 w-7" />
            </button>
          )}
        </div>
      ))}
      <div className="grid grid-cols-10 gap-2">
        <button type="button" onClick={() => onDigito(" ")} className={cn(classeTecla, "col-span-5 text-lg font-semibold text-[var(--tinta-suave)]")}>
          {t.espaco}
        </button>
        <TeclaAcao acao={acao} enviando={enviando} pronto={pronto} onConfirmar={onConfirmar} className="col-span-5" />
      </div>
    </div>
  );
}

function TecladoNumerico({ t, onDigito, onApagar, onConfirmar, acao, enviando, pronto }: PropsTeclado) {
  return (
    <div className="mx-auto grid max-w-xl grid-cols-3 gap-2.5" aria-label="Teclado">
      {"123456789".split("").map((d) => (
        <button key={d} type="button" onClick={() => onDigito(d)} className={cn(classeTecla, "min-h-[4.25rem] text-[2rem]")}>
          {d}
        </button>
      ))}
      <button type="button" onClick={onApagar} className={cn(classeTecla, "min-h-[4.25rem]")} aria-label={t.apagar}>
        <Delete className="h-8 w-8" />
      </button>
      <button type="button" onClick={() => onDigito("0")} className={cn(classeTecla, "min-h-[4.25rem] text-[2rem]")}>
        0
      </button>
      <TeclaAcao acao={acao} enviando={enviando} pronto={pronto} onConfirmar={onConfirmar} className="min-h-[4.25rem]" />
    </div>
  );
}

// ---------------------------------------------------------------- telas

function Parear({ t, parear, onPareado }: { t: T; parear: TotemApi["parear"]; onPareado: (token: string, info: TotemInfo) => void }) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const limpo = codigo.replace(/[^A-Za-z0-9]/g, "");
  return (
    <FormTeclado
      t={t}
      cabecalho={
        <div className="mb-8">
          <h2 className="text-4xl font-extrabold tracking-tight">{t.pareamentoTitulo}</h2>
          <p className="mt-3 text-xl text-[var(--tinta-suave)]">{t.pareamentoAjuda}</p>
          {erro && (
            <p role="alert" className="mt-5 rounded-2xl bg-[#A3342B]/10 px-5 py-4 text-lg font-medium text-[#7E2720]">
              {erro}
            </p>
          )}
        </div>
      }
      campos={[{ id: "codigo", rotulo: t.pareamentoCodigo, valor: codigo, teclado: "texto", max: 9, valido: () => limpo.length === 8 }]}
      onChange={(_, v) => setCodigo(v.toUpperCase())}
      acao={t.parear}
      carregando={t.conferindo}
      onEnviar={async () => {
        setErro(null);
        try {
          const r = await parear(codigo);
          onPareado(r.token, r.totem);
        } catch (e) {
          setErro(mensagemDe(e));
        }
      }}
    />
  );
}

function CartaoEscolha({ icone, titulo, texto, onClick, destaque }: { icone: ReactNode; titulo: string; texto: string; onClick: () => void; destaque?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-[12rem] flex-col justify-between rounded-[1.75rem] p-8 text-left transition-transform focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[var(--teal)] active:scale-[0.99]",
        destaque ? "bg-[var(--teal)] text-white shadow-[0_24px_50px_-28px_rgba(12,90,100,0.9)]" : "bg-white shadow-[0_0_0_1px_rgba(43,38,34,0.08)]",
      )}
    >
      <span className={cn("grid h-16 w-16 place-items-center rounded-2xl", destaque ? "bg-white/15 text-[var(--luz)]" : "bg-[var(--pedra)] text-[var(--teal)]")}>{icone}</span>
      <span>
        <span className="block text-3xl font-extrabold tracking-tight">{titulo}</span>
        <span className={cn("mt-2 block text-lg leading-snug", destaque ? "text-white/80" : "text-[var(--tinta-suave)]")}>{texto}</span>
      </span>
    </button>
  );
}

function EscolherFluxo({ t, onEscolher }: { t: T; onEscolher: (f: Fluxo) => void }) {
  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <h2 className="text-4xl font-extrabold tracking-tight">{t.oQueFazer}</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <CartaoEscolha destaque icone={<KeyRound className="h-8 w-8" />} titulo={t.checkin} texto={t.checkinSub} onClick={() => onEscolher("checkin")} />
        <CartaoEscolha icone={<LogOut className="h-8 w-8" />} titulo={t.checkout} texto={t.checkoutSub} onClick={() => onEscolher("checkout")} />
      </div>
    </div>
  );
}

function EscolherMetodo({ t, onEscolher }: { t: T; onEscolher: (m: Ident["modo"]) => void }) {
  return (
    <div className="flex h-full flex-col justify-center gap-6">
      <div>
        <p className="text-2xl font-semibold text-[var(--madeira)]">{t.boasVindas}</p>
        <h2 className="mt-2 text-4xl font-extrabold tracking-tight">{t.comoEncontrar}</h2>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <CartaoEscolha destaque icone={<ScanLine className="h-8 w-8" />} titulo={t.porCodigo} texto={t.porCodigoSub} onClick={() => onEscolher("codigo")} />
        <CartaoEscolha icone={<UserRound className="h-8 w-8" />} titulo={t.porDocumento} texto={t.porDocumentoSub} onClick={() => onEscolher("documento")} />
      </div>
    </div>
  );
}

function FormCheckin({ t, modo, onTrocarModo, onEnviar }: { t: T; modo: Ident["modo"]; onTrocarModo: (m: Ident["modo"]) => void; onEnviar: (i: Ident) => Promise<void> }) {
  const [v, setV] = useState<Record<string, string>>({});
  const set = (id: string, valor: string) => setV((a) => ({ ...a, [id]: valor }));
  const campos: Campo[] =
    modo === "codigo"
      ? [
          { id: "codigo", rotulo: t.codigo, ajuda: t.codigoAjuda, valor: v.codigo ?? "", teclado: "texto", max: 30, valido: (x) => x.replace(/[^A-Za-z0-9]/g, "").length >= 4 },
          { id: "sobrenome", rotulo: t.sobrenome, ajuda: t.sobrenomeAjuda, valor: v.sobrenome ?? "", teclado: "texto", max: 60, valido: (x) => x.trim().length >= 2 },
        ]
      : [
          { id: "nome", rotulo: t.nome, valor: v.nome ?? "", teclado: "texto", max: 80, valido: (x) => x.trim().split(/\s+/).length >= 2 },
          { id: "documento", rotulo: t.documento, ajuda: t.documentoAjuda, valor: v.documento ?? "", teclado: "texto", max: 30, valido: (x) => x.replace(/[^A-Za-z0-9]/g, "").length >= 5 },
        ];
  return (
    <FormTeclado
      t={t}
      cabecalho={
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-[2.1rem] font-extrabold tracking-tight">{modo === "codigo" ? t.porCodigo : t.porDocumento}</h2>
          <button
            type="button"
            onClick={() => onTrocarModo(modo === "codigo" ? "documento" : "codigo")}
            className="min-h-12 rounded-full bg-[var(--pedra)] px-5 text-base font-semibold text-[var(--teal)] focus-visible:outline-2 focus-visible:outline-[var(--teal)]"
          >
            {modo === "codigo" ? t.porDocumento : t.porCodigo}
          </button>
        </div>
      }
      campos={campos}
      onChange={set}
      acao={t.continuar}
      carregando={t.conferindo}
      onEnviar={() =>
        onEnviar(
          modo === "codigo"
            ? { modo, codigo: (v.codigo ?? "").trim(), sobrenome: (v.sobrenome ?? "").trim() }
            : { modo, nome: (v.nome ?? "").trim(), documento: (v.documento ?? "").trim() },
        )
      }
    />
  );
}

function FormCheckout({ t, onEnviar }: { t: T; onEnviar: (quarto: string, sobrenome: string) => Promise<void> }) {
  const [quarto, setQuarto] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  return (
    <FormTeclado
      t={t}
      cabecalho={<h2 className="mb-7 text-[2.1rem] font-extrabold tracking-tight">{t.checkout}</h2>}
      campos={[
        { id: "quarto", rotulo: t.quarto, valor: quarto, teclado: "numerico", max: 6, valido: (x) => x.trim().length >= 1 },
        { id: "sobrenome", rotulo: t.sobrenome, valor: sobrenome, teclado: "texto", max: 60, valido: (x) => x.trim().length >= 2 },
      ]}
      onChange={(id, valor) => (id === "quarto" ? setQuarto(valor) : setSobrenome(valor))}
      acao={t.continuar}
      carregando={t.conferindo}
      onEnviar={() => onEnviar(quarto.trim(), sobrenome.trim())}
    />
  );
}

function Resumo({
  t,
  titulo,
  linhas,
  acao,
  carregando,
  icone,
  onConfirmar,
}: {
  t: T;
  titulo: string;
  linhas: string[];
  acao: string;
  carregando: string;
  icone: ReactNode;
  onConfirmar: () => Promise<void>;
}) {
  const { enviando, enviar } = useEnvio();
  return (
    <div className="flex h-full flex-col justify-center">
      <h2 className="text-6xl font-extrabold tracking-tight">{titulo}</h2>
      <div className="mt-8 space-y-3">
        {linhas.filter(Boolean).map((l, i) => (
          <p key={l} className={cn("first-letter:uppercase", i === 0 ? "text-4xl font-bold text-[var(--teal)]" : "text-2xl text-[var(--tinta-suave)]")}>
            {l}
          </p>
        ))}
      </div>
      <BotaoPrincipal className="mt-14" onClick={() => void enviar(onConfirmar)} disabled={enviando}>
        {enviando ? <Loader2 className="h-7 w-7 animate-spin" /> : icone}
        {enviando ? carregando : acao}
      </BotaoPrincipal>
    </div>
  );
}

/** A senha aparece como as teclas que o hóspede vai apertar na porta, terminando em #. */
function Teclas({ senha, grande = true }: { senha: string; grande?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3" aria-label={`${senha.split("").join(" ")} #`}>
      {[...senha.split(""), "#"].map((d, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            "grid place-items-center font-extrabold tabular-nums",
            grande ? "h-24 w-[4.5rem] rounded-[1.1rem] text-[3.4rem]" : "h-12 w-10 rounded-xl text-2xl",
            d === "#"
              ? "bg-[var(--luz)] text-[var(--tinta)] shadow-[inset_0_-5px_0_rgba(43,38,34,0.18)]"
              : "bg-white text-[var(--teal)] shadow-[inset_0_-5px_0_rgba(12,90,100,0.16),0_0_0_1px_rgba(12,90,100,0.1)]",
          )}
        >
          {d}
        </span>
      ))}
    </div>
  );
}

function TelaSenha({ t, r, validaAte, onFim, imprimir }: { t: T; r: SenhaTela; validaAte: string; onFim: () => void; imprimir: (() => void) | null }) {
  const entrada = r.portas.filter((p) => p.tipo !== "quarto");
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6">
        <h2 className="text-4xl font-extrabold tracking-tight">{t.ola(r.nome)}</h2>
        <p className="text-3xl font-bold text-[var(--teal)]">{t.seuQuarto(r.quartos)}</p>
      </div>
      <div className="rounded-[2rem] bg-[var(--teal)] px-8 py-7 text-white">
        <p className="text-lg font-semibold text-white/75">{t.suaSenha}</p>
        <div className="mt-3">
          <Teclas senha={r.senha} />
        </div>
        <p className="mt-5 text-[1.4rem] font-semibold leading-snug">{t.comoAbrir}</p>
        <p className="mt-1.5 text-base text-white/75">
          {t.ativacao} {t.validaAte(validaAte)}
        </p>
      </div>
      {entrada.length > 0 && (
        <div>
          <h3 className="text-xl font-bold">{t.outrasPortas}</h3>
          <ul className="mt-3 divide-y divide-[var(--tinta)]/10 rounded-2xl bg-white">
            {entrada.map((p: PortaTotem) => (
              <li key={p.label} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <span className="flex items-center gap-3 text-xl font-semibold">
                  <DoorOpen className="h-6 w-6 text-[var(--madeira)]" /> {p.label}
                </span>
                {p.senha ? (
                  <Teclas senha={p.senha} grande={false} />
                ) : (
                  <span className="text-lg text-[var(--tinta-suave)]">{p.mesma ? t.mesmaSenha : t.portaSemSenha}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-4">
        <p className="min-w-[12rem] flex-1 text-lg text-[var(--tinta-suave)]">{imprimir ? t.pegueComprovante : t.anoteSenha}</p>
        {imprimir && (
          <button
            type="button"
            onClick={imprimir}
            className="inline-flex min-h-[4.5rem] items-center gap-3 rounded-2xl border-2 border-[var(--tinta)]/15 bg-white px-6 text-lg font-bold focus-visible:outline-4 focus-visible:outline-[var(--teal)]"
          >
            <Printer className="h-6 w-6" /> {t.imprimirDeNovo}
          </button>
        )}
        <BotaoPrincipal onClick={onFim} className="w-auto min-w-[10rem]">
          {t.pronto}
        </BotaoPrincipal>
      </div>
    </div>
  );
}

function Aviso({
  t,
  titulo,
  telefone,
  children,
  onFim,
  tentar,
}: {
  t: T;
  titulo: string;
  telefone: string | null;
  children?: ReactNode;
  onFim: () => void;
  tentar?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight">{titulo}</h2>
      {children}
      {telefone && (
        <p className="mt-8 flex items-center gap-3 text-2xl font-semibold text-[var(--teal)]">
          <Phone className="h-7 w-7" /> {t.ligar(telefone)}
        </p>
      )}
      <div className="mt-auto grid gap-4 pt-8 sm:grid-cols-2">
        {tentar && <BotaoPrincipal onClick={tentar}>{t.tentarDeNovo}</BotaoPrincipal>}
        {/* Em paisagem o botão "Início" já fica na coluna da esquerda. */}
        <BotaoSecundario onClick={onFim} className="lg:hidden">
          {t.inicio}
        </BotaoSecundario>
      </div>
    </div>
  );
}

function Avaliacao({ t, onEnviar, onPular }: { t: T; onEnviar: (nota: number, comentario: string) => Promise<void>; onPular: () => void }) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [escrevendo, setEscrevendo] = useState(false);
  const { enviando, enviar } = useEnvio();
  const enviarAvaliacao = () => void enviar(() => onEnviar(nota, comentario.trim()));

  if (escrevendo) {
    return (
      <FormTeclado
        t={t}
        cabecalho={<h2 className="mb-6 text-3xl font-extrabold tracking-tight">{t.comoFoi}</h2>}
        campos={[{ id: "comentario", rotulo: t.comentario, valor: comentario, teclado: "texto", max: 300, valido: () => true }]}
        onChange={(_, v) => setComentario(v)}
        acao={t.enviar}
        carregando={t.conferindo}
        onEnviar={() => onEnviar(nota, comentario.trim())}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--teal)] text-white">
          <Check className="h-8 w-8" />
        </span>
        <h2 className="text-4xl font-extrabold tracking-tight">{t.checkoutFeito}</h2>
      </div>
      <p className="mt-4 text-xl text-[var(--tinta-suave)]">{t.obrigado}</p>
      <fieldset className="mt-12">
        <legend className="text-3xl font-bold">{t.comoFoi}</legend>
        <div className="mt-6 flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNota(n)}
              aria-label={`${n}/5`}
              aria-pressed={nota === n}
              className="grid h-24 w-24 place-items-center rounded-2xl bg-white shadow-[0_0_0_1px_rgba(43,38,34,0.08)] focus-visible:outline-4 focus-visible:outline-[var(--teal)] active:scale-95"
            >
              <Star className={cn("h-12 w-12 transition-colors", n <= nota ? "fill-[var(--luz)] text-[#C9963F]" : "text-[var(--tinta)]/20")} />
            </button>
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        onClick={() => setEscrevendo(true)}
        disabled={!nota}
        className="mt-8 min-h-16 w-full max-w-xl rounded-2xl border-2 border-dashed border-[var(--tinta)]/20 px-6 text-left text-xl text-[var(--tinta-suave)] disabled:opacity-40"
      >
        {comentario || t.comentario}
      </button>
      <div className="mt-auto grid gap-4 pt-8 sm:grid-cols-[2fr_1fr]">
        <BotaoPrincipal disabled={!nota || enviando} onClick={enviarAvaliacao}>
          {enviando && <Loader2 className="h-6 w-6 animate-spin" />} {t.enviar}
        </BotaoPrincipal>
        <BotaoSecundario onClick={onPular}>{t.pular}</BotaoSecundario>
      </div>
    </div>
  );
}

function AvisoInativo({ t, segundos, onContinuar }: { t: T; segundos: number; onContinuar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--tinta)]/45 p-6 backdrop-blur-sm" role="alertdialog" aria-live="assertive">
      <div className="w-full max-w-lg rounded-[2rem] bg-[var(--linho)] p-10 text-center shadow-2xl">
        <p className="text-7xl font-extrabold tabular-nums text-[var(--teal)]">{segundos}</p>
        <h2 className="mt-4 text-3xl font-extrabold">{t.inativoTitulo}</h2>
        <p className="mt-3 text-xl text-[var(--tinta-suave)]">{t.inativoTexto(segundos)}</p>
        <BotaoPrincipal className="mt-8" onClick={onContinuar}>
          {t.inativoContinuar}
        </BotaoPrincipal>
      </div>
    </div>
  );
}

// ============================================================= pagamento

function EtapaPagamento({
  t,
  valorTexto,
  iniciar,
  status,
  cancelar,
  onPago,
  onErro,
}: {
  t: T;
  valorTexto: string;
  iniciar: (m: MetodoPagamento) => Promise<SituacaoPagamento | { status: "nada_a_pagar" }>;
  status: (id: string) => Promise<SituacaoPagamento>;
  cancelar: (id: string) => Promise<SituacaoPagamento>;
  onPago: () => void;
  onErro: (e: unknown) => void;
}) {
  type Fase = { f: "escolher"; aviso?: string } | { f: "iniciando"; metodo: MetodoPagamento } | { f: "aguardando"; c: SituacaoPagamento } | { f: "aprovado" };
  const [fase, setFase] = useState<Fase>({ f: "escolher" });
  const pendente = useRef<string | null>(null);
  // Funções do pai mudam a cada renderização: guardadas em ref para não reiniciar efeitos.
  const fns = useRef({ status, cancelar, onPago });
  fns.current = { status, cancelar, onPago };

  // Saiu da tela no meio (inatividade, "Início"): tira a cobrança da maquininha.
  useEffect(
    () => () => {
      if (pendente.current) void fns.current.cancelar(pendente.current).catch(() => undefined);
    },
    [],
  );

  const cobrancaAguardando = fase.f === "aguardando" ? fase.c.cobrancaId : null;
  const textoFalhou = t.pagamentoNaoConcluido;
  useEffect(() => {
    if (!cobrancaAguardando) return;
    let ativo = true;
    const iv = window.setInterval(async () => {
      try {
        const s = await fns.current.status(cobrancaAguardando);
        if (!ativo) return;
        if (s.status === "pago") {
          pendente.current = null;
          setFase({ f: "aprovado" });
          window.setTimeout(() => fns.current.onPago(), 1800);
        } else if (s.status !== "pendente") {
          pendente.current = null;
          setFase({ f: "escolher", aviso: textoFalhou });
        }
      } catch {
        /* rede instável: tenta de novo no próximo ciclo */
      }
    }, 2500);
    return () => {
      ativo = false;
      window.clearInterval(iv);
    };
  }, [cobrancaAguardando, textoFalhou]);

  const escolher = async (m: MetodoPagamento) => {
    setFase({ f: "iniciando", metodo: m });
    try {
      const r = await iniciar(m);
      if (r.status === "nada_a_pagar") return onPago();
      pendente.current = r.cobrancaId;
      setFase({ f: "aguardando", c: r });
    } catch (e) {
      onErro(e);
    }
  };

  if (fase.f === "aprovado") {
    return (
      <div className="flex h-full flex-col justify-center">
        <span className="grid h-24 w-24 place-items-center rounded-full bg-[var(--teal)] text-white">
          <Check className="h-12 w-12" />
        </span>
        <h2 className="mt-8 text-5xl font-extrabold tracking-tight">{t.pagamentoAprovado}</h2>
        <p className="mt-3 text-3xl font-bold text-[var(--teal)]">{valorTexto}</p>
      </div>
    );
  }

  if (fase.f === "aguardando") {
    const m = fase.c.metodo;
    return (
      <div className="flex h-full flex-col">
        <p className="text-xl font-semibold text-[var(--madeira)]">
          {t.metodos[m]} · {valorTexto}
        </p>
        <h2 className="mt-2 text-5xl font-extrabold tracking-tight">{t.naMaquininha}</h2>
        <div className="mt-10 flex items-center gap-8">
          {/* A maquininha fica à direita do tablet no balcão */}
          <div className="relative grid h-44 w-32 shrink-0 place-items-center rounded-[1.75rem] border-[3px] border-[var(--tinta)] bg-white">
            {m === "pix" ? <QrCode className="h-14 w-14 text-[var(--teal)]" /> : <CreditCard className="h-14 w-14 text-[var(--teal)]" />}
            <span aria-hidden className="absolute -right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-ping rounded-full bg-[var(--luz)]" />
          </div>
          <p className="max-w-md text-2xl leading-snug">{t.maquininhaTexto(m)}</p>
        </div>
        <p className="mt-10 flex items-center gap-3 text-xl text-[var(--tinta-suave)]">
          <Loader2 className="h-6 w-6 animate-spin" /> {t.aguardandoPagamento}
        </p>
        <div className="mt-auto">
          <BotaoSecundario
            className="w-auto px-8 text-xl"
            onClick={async () => {
              const id = fase.c.cobrancaId;
              pendente.current = null;
              setFase({ f: "escolher" });
              try {
                const r = await cancelar(id);
                if (r.status === "pago") {
                  setFase({ f: "aprovado" });
                  window.setTimeout(onPago, 1800);
                }
              } catch (e) {
                onErro(e);
              }
            }}
          >
            {t.trocarMetodo}
          </BotaoSecundario>
        </div>
      </div>
    );
  }

  const opcoes: Array<{ m: MetodoPagamento; icone: ReactNode }> = [
    { m: "credito", icone: <CreditCard className="h-8 w-8" /> },
    { m: "debito", icone: <Wallet className="h-8 w-8" /> },
    { m: "pix", icone: <QrCode className="h-8 w-8" /> },
  ];
  return (
    <div className="flex h-full flex-col">
      <h2 className="text-4xl font-extrabold tracking-tight">{t.pagarTitulo}</h2>
      <p className="mt-2 text-xl text-[var(--tinta-suave)]">{t.pagarTexto(valorTexto)}</p>
      <div className="mt-6 rounded-[1.75rem] bg-[var(--pedra)] px-8 py-6">
        <p className="text-lg font-semibold text-[var(--tinta-suave)]">{t.valorAPagar}</p>
        <p className="text-6xl font-extrabold tabular-nums tracking-tight">{valorTexto}</p>
      </div>
      {fase.f === "escolher" && fase.aviso && (
        <p role="alert" className="mt-4 rounded-2xl bg-[#A3342B]/10 px-5 py-3 text-lg font-medium text-[#7E2720]">
          {fase.aviso}
        </p>
      )}
      <h3 className="mt-8 text-2xl font-bold">{t.escolhaMetodo}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {opcoes.map(({ m, icone }) => (
          <button
            key={m}
            type="button"
            disabled={fase.f === "iniciando"}
            onClick={() => void escolher(m)}
            className="flex min-h-[8.5rem] flex-col justify-between rounded-[1.5rem] bg-white p-6 text-left shadow-[0_0_0_1px_rgba(43,38,34,0.08)] focus-visible:outline-4 focus-visible:outline-[var(--teal)] active:scale-[0.99] disabled:opacity-50"
          >
            <span className="flex items-center justify-between text-[var(--teal)]">
              {icone}
              {fase.f === "iniciando" && fase.metodo === m && <Loader2 className="h-6 w-6 animate-spin" />}
            </span>
            <span>
              <span className="block text-2xl font-extrabold">{t.metodos[m]}</span>
              <span className="mt-1 block text-base leading-snug text-[var(--tinta-suave)]">{t.metodosSub[m]}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================ identificação
// Igual ao gov.br: para cada adulto, (1) foto do rosto com prova de vida
// (piscar) e (2) foto segurando o documento ao lado do rosto. A leitura do
// rosto roda no próprio tablet (face-api, o mesmo do ponto); só a foto e as
// distâncias de comparação vão para o servidor, nunca o "vetor do rosto".

type TipoDoc = DocumentoEnvio["tipo"];
type EtapaFoto = DocumentoEnvio["etapa"];
type Captura = {
  foto: string;
  vivacidade: boolean | null;
  descritor: number[] | null;
  distPessoa: number | null;
  distDocumento: number | null;
};

function EtapaDocumentos({
  t,
  adultos,
  enviados,
  enviar,
  onConcluir,
}: {
  t: T;
  adultos: Array<{ ordem: number; nome: string | null }>;
  enviados: Array<{ hospede_ordem: number; etapa: string }>;
  enviar: (d: Omit<DocumentoEnvio, "ticket">) => Promise<unknown>;
  onConcluir: () => void;
}) {
  const fila = useMemo(() => {
    const tem = (o: number, e: string) =>
      enviados.some((d) => d.hospede_ordem === o && d.etapa === e);
    return adultos.filter((a) => !(tem(a.ordem, "rosto") && tem(a.ordem, "rosto_documento")));
  }, [adultos, enviados]);
  const [pos, setPos] = useState(0);
  const atual = fila[pos];
  const [fase, setFase] = useState<"consentimento" | "dados" | EtapaFoto>("consentimento");
  const [nome, setNome] = useState(atual?.nome ?? "");
  const [tipo, setTipo] = useState<TipoDoc>("rg");
  const [numero, setNumero] = useState("");
  const [selfie, setSelfie] = useState<number[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const dizer = useVoz();

  // Voz da etapa (a câmera tem as próprias falas).
  useEffect(() => {
    if (fase === "consentimento") dizer(t.voz.consentimento, true);
    else if (fase === "dados") dizer(pos > 0 ? `${t.voz.proximoHospede(pos + 1)} ${t.voz.dados}` : t.voz.dados, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, pos, t]);

  const concluiu = useRef(false);
  const concluir = useRef(onConcluir);
  concluir.current = onConcluir;
  useEffect(() => {
    if (!atual && !concluiu.current) {
      concluiu.current = true;
      concluir.current();
    }
  }, [atual]);
  if (!atual) {
    return (
      <div className="flex h-full flex-col justify-center gap-6">
        <Loader2 className="h-12 w-12 animate-spin text-[var(--teal)]" />
        <p className="text-3xl font-bold">{t.gerandoSenha}</p>
      </div>
    );
  }

  const proximo = () => {
    setFase("dados");
    setErro(null);
    setNumero("");
    setTipo("rg");
    setSelfie(null);
    setNome(fila[pos + 1]?.nome ?? "");
    setPos(pos + 1);
  };

  if (fase === "consentimento") {
    const icones = [ScanFace, IdCard, ShieldCheck];
    return (
      <div className="flex h-full flex-col">
        <h2 className="text-[2.1rem] font-extrabold tracking-tight">{t.consentTitulo}</h2>
        <p className="mt-1 text-lg leading-snug text-[var(--tinta-suave)]">
          {t.docsTexto(fila.length)}
        </p>
        <ul className="mt-6 space-y-3">
          {t.consentItens.map((item, i) => {
            const Icone = icones[i] ?? ShieldCheck;
            return (
              <li
                key={item}
                className="flex items-start gap-4 rounded-2xl bg-white px-5 py-4 text-lg leading-snug shadow-[0_0_0_1px_rgba(43,38,34,0.06)]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--pedra)] text-[var(--teal)]">
                  <Icone className="h-6 w-6" />
                </span>
                <span className="pt-1.5">{item}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto pt-6">
          <p className="mb-3 text-base text-[var(--tinta-suave)]">{t.consentObrigatorio}</p>
          <BotaoPrincipal onClick={() => setFase("dados")}>
            <Check className="h-6 w-6" /> {t.consentAceito}
          </BotaoPrincipal>
        </div>
      </div>
    );
  }

  const cabecalho = (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-[2rem] font-extrabold tracking-tight">
        {fase === "dados" ? t.docsTitulo : fase === "rosto" ? t.etapaRosto : t.etapaDocumento}
      </h2>
      <span className="text-xl font-bold text-[var(--madeira)]">
        {t.adulto(atual.ordem, adultos.length)}
      </span>
    </div>
  );

  if (fase === "dados") {
    return (
      <FormTeclado
        key={`dados-${atual.ordem}`}
        t={t}
        cabecalho={
          <>
            {cabecalho}
            <p className="text-lg font-semibold">{t.tipoDocumento}</p>
            <div className="mb-5 mt-2 grid grid-cols-4 gap-2">
              {(Object.keys(t.tipos) as TipoDoc[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTipo(k)}
                  aria-pressed={tipo === k}
                  className={cn(
                    "min-h-14 rounded-xl px-3 text-base font-semibold leading-tight focus-visible:outline-2 focus-visible:outline-[var(--teal)]",
                    tipo === k
                      ? "bg-[var(--tinta)] text-white"
                      : "bg-white text-[var(--tinta)] shadow-[0_0_0_1px_rgba(43,38,34,0.1)]",
                  )}
                >
                  {t.tipos[k]}
                </button>
              ))}
            </div>
          </>
        }
        campos={[
          {
            id: "nome",
            rotulo: t.nome,
            valor: nome,
            teclado: "texto",
            max: 80,
            valido: (x) => x.trim().split(/\s+/).length >= 2,
          },
          {
            id: "numero",
            rotulo: t.numeroDocumento,
            valor: numero,
            teclado: "texto",
            max: 30,
            valido: (x) => x.replace(/[^A-Za-z0-9]/g, "").length >= 4,
          },
        ]}
        onChange={(id, v) => (id === "nome" ? setNome(v) : setNumero(v))}
        acao={t.continuar2}
        carregando={t.continuar2}
        onEnviar={async () => setFase("rosto")}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {cabecalho}
      <CapturaIdentidade
        key={`${atual.ordem}-${fase}`}
        t={t}
        etapa={fase}
        selfie={selfie}
        erro={erro}
        onFoto={async (c) => {
          setErro(null);
          try {
            await enviar({
              ordem: atual.ordem,
              nome: nome.trim(),
              tipo,
              numero: numero.trim(),
              etapa: fase,
              vivacidade: c.vivacidade,
              distPessoa: c.distPessoa,
              distDocumento: c.distDocumento,
              consentimento: true,
              foto: c.foto,
            });
          } catch (e) {
            setErro(mensagemDe(e));
            return false;
          }
          if (fase === "rosto") {
            setSelfie(c.descritor);
            setFase("rosto_documento");
          } else proximo();
          return true;
        }}
      />
    </div>
  );
}

type Fonte = HTMLVideoElement | HTMLCanvasElement;

async function detectar(fonte: Fonte, W: number, H: number, tamanho: number, dx = 0): Promise<LeituraRosto[]> {
  const faceapi = await loadFaceApi();
  const achados = await faceapi
    .detectAllFaces(fonte, new faceapi.TinyFaceDetectorOptions({ inputSize: tamanho, scoreThreshold: 0.45 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  return achados.map((r) => {
    const b = r.detection.box;
    return {
      caixa: { x: (b.x + dx) / W, y: b.y / H, w: b.width / W, h: b.height / H },
      ear: (eyeAspectRatio(r.landmarks.getLeftEye()) + eyeAspectRatio(r.landmarks.getRightEye())) / 2,
      descritor: Array.from(r.descriptor),
      score: r.detection.score,
    };
  });
}

let recorte: HTMLCanvasElement | null = null;

/**
 * Lê os rostos do quadro atual (coordenadas do vídeo, sem espelhar, de 0 a 1).
 * Na foto com documento, a foto 3x4 é pequena demais para a leitura do quadro
 * inteiro; então procuramos de novo, em resolução maior, no lado oposto ao rosto.
 */
async function lerRostos(video: HTMLVideoElement, comDocumento: boolean): Promise<LeituraRosto[]> {
  const W = video.videoWidth;
  const H = video.videoHeight;
  if (!W || !H) return [];
  const rostos = await detectar(video, W, H, 416);
  if (!comDocumento || rostos.length !== 1) return rostos;
  const [rosto] = rostos;
  const centro = rosto.caixa.x + rosto.caixa.w / 2;
  const x0 = Math.round(centro < 0.5 ? Math.min(W * 0.5, (rosto.caixa.x + rosto.caixa.w) * W) : 0);
  const largura = Math.round(centro < 0.5 ? W - x0 : Math.max(W * 0.5, rosto.caixa.x * W));
  recorte ??= document.createElement("canvas");
  recorte.width = largura;
  recorte.height = H;
  recorte.getContext("2d")?.drawImage(video, x0, 0, largura, H, 0, 0, largura, H);
  const extras = await detectar(recorte, W, H, 608, x0);
  return [...rostos, ...extras.filter((e) => e.caixa.w < rosto.caixa.w * 0.6)];
}

/** JPEG do quadro atual, sem espelhar (o texto do documento fica legível). */
function fotografar(v: HTMLVideoElement): string | null {
  if (!v.videoWidth) return null;
  const escala = Math.min(1, 1600 / v.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(v.videoWidth * escala);
  canvas.height = Math.round(v.videoHeight * escala);
  canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

type Leitor = "carregando" | "ligado" | "desligado";
type AvisoCaptura = keyof T["msgRosto"] | keyof T["msgDoc"];

function CapturaIdentidade({
  t,
  etapa,
  selfie,
  erro,
  onFoto,
}: {
  t: T;
  etapa: EtapaFoto;
  selfie: number[] | null;
  erro: string | null;
  onFoto: (c: Captura) => Promise<boolean>;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [camera, setCamera] = useState<"abrindo" | "aberta" | string>("abrindo");
  const [leitor, setLeitor] = useState<Leitor>("carregando");
  const [aviso, setAviso] = useState<AvisoCaptura>("carregando");
  const [progresso, setProgresso] = useState(0);
  // Lado da tela (já espelhada) onde fica o rosto; a guia do documento vai do outro lado.
  const [rostoNaEsquerda, setRostoNaEsquerda] = useState(true);
  const [podeManual, setPodeManual] = useState(false);
  const [previa, setPrevia] = useState<Captura | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const { enviando, enviar } = useEnvio();
  const ultima = useRef<{
    descritor: number[] | null;
    distPessoa: number | null;
    distDocumento: number | null;
  }>({
    descritor: null,
    distPessoa: null,
    distDocumento: null,
  });
  const fotoFn = useRef(onFoto);
  fotoFn.current = onFoto;
  const enviarRef = useRef(enviar);
  enviarRef.current = enviar;
  const dizer = useVoz();
  const doc = etapa === "rosto_documento";

  // Câmera frontal + leitura do rosto (carregam juntas).
  useEffect(() => {
    let stream: MediaStream | null = null;
    let ativo = true;
    setCamera("abrindo");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!ativo) return stream.getTracks().forEach((tr) => tr.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => undefined);
        }
        setCamera("aberta");
      } catch (e) {
        setCamera(mensagemDe(e));
      }
    })();
    const limite = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("tempo")), 25_000),
    );
    Promise.race([loadFaceApi(), limite]).then(
      () => ativo && setLeitor("ligado"),
      () => ativo && setLeitor("desligado"),
    );
    return () => {
      ativo = false;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [tentativa]);

  // Sem leitura automática: libera o botão na hora.
  useEffect(() => {
    if (leitor === "desligado") setPodeManual(true);
  }, [leitor]);

  // Laço de leitura: decide sozinho a hora de tirar a foto.
  useEffect(() => {
    if (camera !== "aberta" || leitor !== "ligado" || previa) return;
    const v = video.current;
    if (!v) return;
    let ativo = true;
    let timer: number | undefined;
    const piscada = new BlinkDetector();
    const estavel = new Estabilidade();
    const amostras: number[][] = [];
    let piscou = false;
    const inicio = Date.now();

    const passo = async () => {
      if (!ativo) return;
      try {
        const leituras = await lerRostos(v, doc);
        if (!ativo) return;
        if (!doc) {
          const { situacao, principal } = situacaoSelfie(leituras);
          ultima.current.descritor = principal?.descritor ?? ultima.current.descritor;
          if (situacao !== "ok" || !principal) {
            estavel.registrar(false);
            setAviso(situacao === "ok" ? "sem_rosto" : situacao);
          } else {
            if (!piscou) piscou = piscada.push(principal.ear);
            if (piscou) amostras.push(principal.descritor);
            const pronto = estavel.registrar(piscou);
            setAviso(piscou ? "segure" : "pisque");
            if (pronto) {
              const foto = fotografar(v);
              if (foto) {
                const media = amostras.slice(-4);
                const descritor = media[0].map(
                  (_, i) => media.reduce((s, m) => s + m[i], 0) / media.length,
                );
                void enviarRef.current(async () => {
                  const ok = await fotoFn.current({
                    foto,
                    vivacidade: true,
                    descritor,
                    distPessoa: null,
                    distDocumento: null,
                  });
                  if (!ok) setTentativa((n) => n + 1);
                });
                return;
              }
            }
          }
        } else {
          const maior = [...leituras].sort((a, b) => b.caixa.w * b.caixa.h - a.caixa.w * a.caixa.h)[0];
          if (maior) setRostoNaEsquerda(1 - (maior.caixa.x + maior.caixa.w / 2) < 0.5);
          const r = situacaoComDocumento(leituras, selfie);
          ultima.current = {
            ...ultima.current,
            distPessoa: r.distPessoa,
            distDocumento: r.distDocumento,
          };
          const pronto = estavel.registrar(r.situacao === "ok");
          setAviso(r.situacao === "ok" ? "segure" : r.situacao);
          if (pronto) {
            const foto = fotografar(v);
            if (foto) {
              setPrevia({
                foto,
                vivacidade: null,
                descritor: null,
                distPessoa: r.distPessoa,
                distDocumento: r.distDocumento,
              });
              return;
            }
          }
        }
        setProgresso(estavel.progresso);
      } catch (e) {
        console.warn("[totem] leitura do rosto", e);
      }
      if (Date.now() - inicio > (doc ? ESPERA_MANUAL_DOC_MS : ESPERA_MANUAL_MS)) setPodeManual(true);
      timer = window.setTimeout(passo, 140);
    };
    void passo();
    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [camera, leitor, previa, doc, selfie]);

  const manual = () => {
    const v = video.current;
    const foto = v ? fotografar(v) : null;
    if (!foto) return;
    const u = ultima.current;
    const c: Captura = doc
      ? {
          foto,
          vivacidade: null,
          descritor: null,
          distPessoa: u.distPessoa,
          distDocumento: u.distDocumento,
        }
      : { foto, vivacidade: false, descritor: u.descritor, distPessoa: null, distDocumento: null };
    if (doc) setPrevia(c);
    else
      void enviar(async () => {
        const ok = await fotoFn.current(c);
        if (!ok) setTentativa((n) => n + 1);
      });
  };

  const textoAviso =
    leitor === "desligado"
      ? t.semDetector
      : camera === "abrindo" || leitor === "carregando" || aviso === "carregando"
        ? t.msgRosto.carregando
        : doc
          ? (t.msgDoc[aviso as keyof T["msgDoc"]] ?? t.msgDoc.sem_rosto)
          : (t.msgRosto[aviso as keyof T["msgRosto"]] ?? t.msgRosto.sem_rosto);
  // Voz: apresenta a etapa, depois lê as dicas da câmera (filtradas para não atropelar).
  useEffect(() => {
    dizer(doc ? t.voz.documento : t.voz.rosto, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, t]);
  useEffect(() => {
    if (previa) dizer(t.voz.previa, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previa, t]);
  useEffect(() => {
    if (!previa && !enviando && aviso !== "carregando" && leitor === "ligado") dizer(textoAviso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoAviso, previa, enviando, leitor]);
  if (camera !== "abrindo" && camera !== "aberta") {
    return (
      <div className="flex flex-1 flex-col justify-center gap-4">
        <p className="text-2xl font-bold">{t.cameraErro}</p>
        <p className="text-base text-[var(--tinta-suave)]">{camera}</p>
        <BotaoPrincipal
          onClick={() => setTentativa((n) => n + 1)}
          className="w-auto self-start px-10"
        >
          <RotateCcw className="h-6 w-6" /> {t.tentarDeNovo}
        </BotaoPrincipal>
      </div>
    );
  }

  const bom = aviso === "segure";
  const atencao = aviso === "pisque";
  const corGuia = bom ? "border-[#3FB68B]" : atencao ? "border-[var(--luz)]" : "border-white/85";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="text-base leading-snug text-[var(--tinta-suave)]">
        {previa ? t.confiraFoto : doc ? t.docDica : t.rostoDica}
      </p>
      {/* Caixa no formato do vídeo (16:9): as guias batem com o que o leitor do rosto enxerga. */}
      <div className="mt-3 flex min-h-0 flex-1 items-start justify-center">
        <div className="relative aspect-video max-h-full w-full overflow-hidden rounded-[1.5rem] bg-[var(--tinta)]">
          {previa ? (
            <img src={previa.foto} alt="" className="h-full w-full object-contain" />
          ) : (
            <>
              <video
                ref={video}
                playsInline
                muted
                className="h-full w-full -scale-x-100 object-cover"
              />
              <div aria-hidden className="pointer-events-none absolute inset-0">
                {doc ? (
                  <>
                    <div
                      className={cn(
                        "absolute top-1/2 h-[74%] w-[25%] -translate-y-1/2 rounded-[50%] border-[5px] transition-[left,colors] duration-300",
                        rostoNaEsquerda ? "left-[14%]" : "left-[61%]",
                        corGuia,
                      )}
                    />
                    <div
                      className={cn(
                        "absolute top-1/2 aspect-[1.586] w-[28%] -translate-y-1/2 rounded-2xl border-[5px] border-dashed transition-[left,colors] duration-300",
                        rostoNaEsquerda ? "left-[60%]" : "left-[12%]",
                        corGuia,
                      )}
                    >
                      <IdCard className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-white/70" />
                    </div>
                  </>
                ) : (
                  <div
                    className={cn(
                      "absolute left-1/2 top-1/2 h-[80%] w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[5px] transition-colors",
                      corGuia,
                    )}
                  />
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-6 pb-5 pt-12">
                <p
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-3 text-2xl font-bold text-white"
                >
                  {(enviando || leitor === "carregando") && (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  )}
                  {enviando ? t.enviando : textoAviso}
                </p>
                {leitor === "ligado" && (
                  <div className="h-2 w-56 overflow-hidden rounded-full bg-white/25">
                    <div
                      className="h-full rounded-full bg-[#3FB68B] transition-[width]"
                      style={{ width: `${Math.round(progresso * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {erro && (
        <p
          role="alert"
          className="mt-3 rounded-2xl bg-[#A3342B]/10 px-5 py-3 text-lg font-medium text-[#7E2720]"
        >
          {erro}
        </p>
      )}
      {(previa || podeManual) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {previa ? (
            <>
              <BotaoSecundario onClick={() => setPrevia(null)}>{t.tirarOutra}</BotaoSecundario>
              <BotaoPrincipal
                disabled={enviando}
                onClick={() =>
                  void enviar(async () => {
                    const ok = await onFoto(previa);
                    if (!ok) setPrevia(null);
                  })
                }
              >
                {enviando ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Check className="h-6 w-6" />
                )}
                {enviando ? t.enviando : t.usarFoto}
              </BotaoPrincipal>
            </>
          ) : (
            <BotaoPrincipal
              onClick={manual}
              disabled={enviando || camera !== "aberta"}
              className="sm:col-span-2"
            >
              <Camera className="h-7 w-7" /> {leitor === "desligado" ? t.tirarFoto : t.tirarManual}
            </BotaoPrincipal>
          )}
        </div>
      )}
    </div>
  );
}
