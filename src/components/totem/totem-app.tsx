import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, Check, CornerDownLeft, Delete, DoorOpen, KeyRound, Loader2, LogOut, Phone, ScanLine, Star, UserRound } from "lucide-react";
import {
  totemAvaliar,
  totemCheckinConfirmar,
  totemCheckinConsultar,
  totemCheckoutConfirmar,
  totemCheckoutConsultar,
  totemInfo,
  totemParear,
  type PortaTotem,
  type RespostaCheckin,
  type RespostaCheckout,
  type TotemInfo,
} from "@/lib/totem.functions";
import { formatadores, IDIOMAS, TEXTOS, type Idioma } from "@/lib/totem/i18n";
import type { Motivo } from "@/lib/totem/regras";
import { cn } from "@/lib/utils";
import { CHAVE_TOKEN_TOTEM } from "@/lib/totem/chave";

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
};

const API_SERVIDOR: TotemApi = {
  info: (token) => totemInfo({ data: { token } }),
  parear: (codigo) => totemParear({ data: { codigo } }),
  checkinConsultar: (token, ident) => totemCheckinConsultar({ data: { token, ident } }),
  checkinConfirmar: (token, ident) => totemCheckinConfirmar({ data: { token, ident } }),
  checkoutConsultar: (token, quarto, sobrenome) => totemCheckoutConsultar({ data: { token, quarto, sobrenome } }),
  checkoutConfirmar: (token, quarto, sobrenome) => totemCheckoutConfirmar({ data: { token, quarto, sobrenome } }),
  avaliar: (token, a) => totemAvaliar({ data: { token, ...a } }),
};

type SenhaTela = Extract<RespostaCheckin, { estado: "senha" }>;
type Fluxo = "checkin" | "checkout";

type Tela =
  | { t: "carregando" }
  | { t: "parear" }
  | { t: "inicio" }
  | { t: "checkin"; modo: Ident["modo"] }
  | { t: "checkin_resumo"; nome: string; quartos: string[]; checkOut: string; ident: Ident }
  | { t: "senha"; r: SenhaTela }
  | { t: "impedido"; fluxo: Fluxo; nome: string; motivos: Motivo[] }
  | { t: "nao_encontrado"; fluxo: Fluxo; voltar: Tela }
  | { t: "bloqueado"; fluxo: Fluxo }
  | { t: "checkout" }
  | { t: "checkout_resumo"; nome: string; quarto: string; sobrenome: string }
  | { t: "checkout_feito"; nome: string; quarto: string; reservationID: string }
  | { t: "avaliado" }
  | { t: "erro"; fluxo: Fluxo; mensagem: string };

/** Quanto tempo sem toque até perguntar "Ainda está aí?" (a tela inicial não tem limite). */
const OCIOSO_MS: Partial<Record<Tela["t"], number>> = {
  checkin: 75_000,
  checkin_resumo: 60_000,
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
    case "checkin_resumo":
    case "checkout_resumo":
      return 1;
    case "senha":
    case "checkout_feito":
    case "avaliado":
      return 2;
    default:
      return 0;
  }
}

// ======================================================================= app

export function TotemApp({ api = API_SERVIDOR }: { api?: TotemApi } = {}) {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<TotemInfo | null>(null);
  const [idioma, setIdioma] = useState<Idioma>("pt");
  const [tela, setTela] = useState<Tela>({ t: "carregando" });
  const t = TEXTOS[idioma];
  const fmt = useMemo(() => formatadores(idioma), [idioma]);

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
  }, []);

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

  // --------------------------------------------------------------- ações
  const consultarCheckin = async (ident: Ident) => {
    if (!token) return;
    try {
      const r = await api.checkinConsultar(token, ident);
      if (r.estado === "pronto") setTela({ t: "checkin_resumo", nome: r.nome, quartos: r.quartos, checkOut: r.checkOut, ident });
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

  const consultarCheckout = async (quarto: string, sobrenome: string) => {
    if (!token) return;
    try {
      const r = await api.checkoutConsultar(token, quarto, sobrenome);
      if (r.estado === "pronto") setTela({ t: "checkout_resumo", nome: r.nome, quarto: r.quarto, sobrenome });
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
      if (r.estado === "concluido") setTela({ t: "checkout_feito", nome: r.nome, quarto: r.quarto, reservationID: r.reservationID });
      else if (r.estado === "impedido") setTela({ t: "impedido", fluxo: "checkout", nome: r.nome, motivos: r.motivos });
      else if (r.estado === "bloqueado") setTela({ t: "bloqueado", fluxo: "checkout" });
      else setTela({ t: "nao_encontrado", fluxo: "checkout", voltar: { t: "checkout" } });
    } catch (e) {
      tratarErro(e, "checkout");
    }
  };

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
    case "checkin_resumo":
      painel = (
        <Resumo
          t={t}
          titulo={t.ola(tela.nome)}
          linhas={[t.seuQuarto(tela.quartos), tela.checkOut ? t.saidaEm(fmt.data(tela.checkOut)) : ""]}
          acao={t.confirmarCheckin}
          carregando={t.gerandoSenha}
          icone={<KeyRound className="h-7 w-7" />}
          onConfirmar={() => confirmarCheckin(tela.ident)}
        />
      );
      break;
    case "senha":
      painel = <TelaSenha t={t} r={tela.r} validaAte={fmt.dataHora(tela.r.validaAte)} onFim={irInicio} />;
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
          titulo={t.ola(tela.nome)}
          linhas={[t.seuQuarto([tela.quarto])]}
          acao={t.confirmarCheckout}
          carregando={t.saindo}
          icone={<LogOut className="h-7 w-7" />}
          onConfirmar={() => confirmarCheckout(tela.quarto, tela.sobrenome)}
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

  const passos = fluxo === "checkout" ? t.passosCheckout : t.passosCheckin;

  return (
    <div
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

function TelaSenha({ t, r, validaAte, onFim }: { t: T; r: SenhaTela; validaAte: string; onFim: () => void }) {
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
      <div className="mt-auto flex flex-wrap items-center gap-6">
        <p className="min-w-[14rem] flex-1 text-lg text-[var(--tinta-suave)]">{t.anoteSenha}</p>
        <BotaoPrincipal onClick={onFim} className="w-auto min-w-[16rem]">
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
