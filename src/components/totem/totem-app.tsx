import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, DoorOpen, KeyRound, Loader2, LogOut, Phone, Star } from "lucide-react";
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

const CHAVE_TOKEN = "injoy.totem.token";

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
    /* modo privado: segue sem guardar */
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

type Tela =
  | { t: "carregando" }
  | { t: "parear" }
  | { t: "inicio" }
  | { t: "checkin" }
  | { t: "checkin_resumo"; nome: string; quartos: string[]; checkOut: string; ident: Ident }
  | { t: "senha"; r: SenhaTela }
  | { t: "impedido"; nome: string; quartos: string[]; motivos: Motivo[] }
  | { t: "nao_encontrado"; fluxo: "checkin" | "checkout" }
  | { t: "bloqueado" }
  | { t: "checkout" }
  | { t: "checkout_resumo"; nome: string; quarto: string; sobrenome: string }
  | { t: "checkout_feito"; nome: string; quarto: string; reservationID: string }
  | { t: "avaliado" }
  | { t: "erro"; mensagem: string };

const OCIOSO_MS: Partial<Record<Tela["t"], number>> = {
  checkin: 90_000,
  checkin_resumo: 90_000,
  impedido: 60_000,
  nao_encontrado: 45_000,
  bloqueado: 60_000,
  checkout: 90_000,
  checkout_resumo: 90_000,
  checkout_feito: 90_000,
  avaliado: 8_000,
  erro: 60_000,
  senha: 180_000,
};

function mensagemDe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Erro desconhecido";
}

export function TotemApp({ api = API_SERVIDOR }: { api?: TotemApi } = {}) {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<TotemInfo | null>(null);
  const [idioma, setIdioma] = useState<Idioma>("pt");
  const [tela, setTela] = useState<Tela>({ t: "carregando" });
  const t = TEXTOS[idioma];
  const fmt = useMemo(() => formatadores(idioma), [idioma]);

  const tratarErro = useCallback((e: unknown) => {
    const msg = mensagemDe(e);
    if (msg.includes("TOTEM_NAO_AUTORIZADO")) {
      gravar(CHAVE_TOKEN, null);
      setToken(null);
      setInfo(null);
      setTela({ t: "parear" });
      return;
    }
    setTela({ t: "erro", mensagem: msg });
  }, []);

  // Início: recupera token e idioma do aparelho
  useEffect(() => {
    const salvo = ler(CHAVE_TOKEN);
    if (!salvo) {
      setTela({ t: "parear" });
      return;
    }
    setToken(salvo);
    api.info(salvo)
      .then((i) => {
        setInfo(i);
        setTela({ t: "inicio" });
      })
      .catch(tratarErro);
  }, [api, tratarErro]);

  const irInicio = useCallback(() => {
    setTela((atual) => (atual.t === "parear" || atual.t === "carregando" ? atual : { t: "inicio" }));
    // Cada hóspede começa em português; o idioma escolhido não fica para o próximo.
    setIdioma("pt");
  }, []);

  // Volta sozinho ao início depois de um tempo sem toque
  const ultimoToque = useRef(Date.now());
  useEffect(() => {
    const marcar = () => {
      ultimoToque.current = Date.now();
    };
    window.addEventListener("pointerdown", marcar);
    window.addEventListener("keydown", marcar);
    return () => {
      window.removeEventListener("pointerdown", marcar);
      window.removeEventListener("keydown", marcar);
    };
  }, []);
  useEffect(() => {
    const limite = OCIOSO_MS[tela.t];
    if (!limite) return;
    ultimoToque.current = Date.now();
    const iv = window.setInterval(() => {
      if (Date.now() - ultimoToque.current > limite) irInicio();
    }, 1000);
    return () => window.clearInterval(iv);
  }, [tela, irInicio]);

  const escolherIdioma = (i: Idioma) => setIdioma(i);

  return (
    <div className="totem min-h-screen bg-[#EAF2F1] text-[#0B2E33] antialiased" lang={idioma === "pt" ? "pt-BR" : idioma}>
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 pt-6 sm:px-8">
        <button type="button" onClick={irInicio} className="text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0C5A64]">
          <span className="block text-2xl font-extrabold tracking-tight text-[#0C5A64]">IN.JOY</span>
          {info && <span className="block text-sm font-medium text-[#0B2E33]/60">{info.unidade}</span>}
        </button>
        <nav aria-label="Idioma / Language" className="flex rounded-full bg-white p-1 shadow-[inset_0_0_0_1px_rgba(12,90,100,0.15)]">
          {IDIOMAS.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => escolherIdioma(i.id)}
              aria-pressed={idioma === i.id}
              className={cn(
                "min-h-11 rounded-full px-3 text-sm font-semibold sm:px-4 transition-colors focus-visible:outline-2 focus-visible:outline-[#0C5A64]",
                idioma === i.id ? "bg-[#0C5A64] text-white" : "text-[#0B2E33]/70",
              )}
            >
              <span className="hidden sm:inline">{i.rotulo}</span>
              <span className="sm:hidden" aria-label={i.rotulo}>{i.curto}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16 pt-10 sm:px-8">
        {tela.t === "carregando" && <Carregando />}

        {tela.t === "parear" && (
          <Parear
            t={t}
            parear={api.parear}
            onPareado={(tok, i) => {
              gravar(CHAVE_TOKEN, tok);
              setToken(tok);
              setInfo(i);
              setTela({ t: "inicio" });
            }}
          />
        )}

        {tela.t === "inicio" && (
          <section>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{t.boasVindas}</h1>
            <p className="mt-3 text-xl text-[#0B2E33]/70">{t.oQueFazer}</p>
            <div className="mt-10 grid gap-4">
              <button
                type="button"
                onClick={() => setTela({ t: "checkin" })}
                className="group flex min-h-36 items-center gap-6 rounded-3xl bg-[#0C5A64] px-8 py-6 text-left text-white shadow-[0_12px_30px_-12px_rgba(12,90,100,0.6)] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#F2C14E] active:scale-[0.99]"
              >
                <KeyRound className="h-12 w-12 shrink-0 text-[#F2C14E]" strokeWidth={1.75} />
                <span>
                  <span className="block text-3xl font-extrabold">{t.checkin}</span>
                  <span className="mt-1 block text-lg text-white/80">{t.checkinSub}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTela({ t: "checkout" })}
                className="flex min-h-28 items-center gap-6 rounded-2xl bg-white px-8 py-5 text-left shadow-[inset_0_0_0_2px_rgba(12,90,100,0.25)] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#0C5A64] active:scale-[0.99]"
              >
                <LogOut className="h-10 w-10 shrink-0 text-[#0C5A64]" strokeWidth={1.75} />
                <span>
                  <span className="block text-2xl font-bold">{t.checkout}</span>
                  <span className="mt-1 block text-base text-[#0B2E33]/65">{t.checkoutSub}</span>
                </span>
              </button>
            </div>
          </section>
        )}

        {tela.t === "checkin" && token && (
          <FormCheckin
            t={t}
            onVoltar={irInicio}
            onEnviar={async (ident) => {
              try {
                const r = await api.checkinConsultar(token, ident);
                if (r.estado === "pronto") setTela({ t: "checkin_resumo", nome: r.nome, quartos: r.quartos, checkOut: r.checkOut, ident });
                else if (r.estado === "impedido") setTela({ t: "impedido", nome: r.nome, quartos: r.quartos, motivos: r.motivos });
                else if (r.estado === "nao_encontrado") setTela({ t: "nao_encontrado", fluxo: "checkin" });
                else if (r.estado === "bloqueado") setTela({ t: "bloqueado" });
                else if (r.estado === "senha") setTela({ t: "senha", r });
              } catch (e) {
                tratarErro(e);
              }
            }}
          />
        )}

        {tela.t === "checkin_resumo" && token && (
          <Resumo
            t={t}
            titulo={t.ola(tela.nome)}
            linhas={[t.seuQuarto(tela.quartos), tela.checkOut ? t.saidaEm(fmt.data(tela.checkOut)) : ""]}
            acao={t.confirmarCheckin}
            carregando={t.gerandoSenha}
            onVoltar={irInicio}
            onConfirmar={async () => {
              try {
                const r = await api.checkinConfirmar(token, tela.ident);
                if (r.estado === "senha") setTela({ t: "senha", r });
                else if (r.estado === "impedido") setTela({ t: "impedido", nome: r.nome, quartos: r.quartos, motivos: r.motivos });
                else if (r.estado === "bloqueado") setTela({ t: "bloqueado" });
                else setTela({ t: "nao_encontrado", fluxo: "checkin" });
              } catch (e) {
                tratarErro(e);
              }
            }}
          />
        )}

        {tela.t === "senha" && <TelaSenha t={t} r={tela.r} validaAte={fmt.dataHora(tela.r.validaAte)} onFim={irInicio} />}

        {tela.t === "impedido" && (
          <Aviso
            titulo={t.naoDeuCerto}
            telefone={info?.telefoneSuporte ?? null}
            t={t}
            onFim={irInicio}
          >
            <ul className="mt-6 space-y-3">
              {tela.motivos.map((m) => (
                <li key={JSON.stringify(m)} className="rounded-2xl bg-white px-6 py-4 text-xl font-medium">
                  {t.motivo(m, fmt.data, fmt.valor)}
                </li>
              ))}
            </ul>
          </Aviso>
        )}

        {tela.t === "nao_encontrado" && (
          <Aviso
            titulo={tela.fluxo === "checkin" ? t.naoEncontrada : t.naoEncontradaCheckout}
            telefone={info?.telefoneSuporte ?? null}
            t={t}
            onFim={irInicio}
            tentar={() => setTela({ t: tela.fluxo })}
          >
            <p className="mt-4 text-lg text-[#0B2E33]/70">{t.naoEncontradaDica}</p>
          </Aviso>
        )}

        {tela.t === "bloqueado" && (
          <Aviso titulo={t.bloqueado} telefone={info?.telefoneSuporte ?? null} t={t} onFim={irInicio}>
            <p className="mt-4 text-lg text-[#0B2E33]/70">{t.bloqueadoDica}</p>
          </Aviso>
        )}

        {tela.t === "erro" && (
          <Aviso titulo={t.erro} telefone={info?.telefoneSuporte ?? null} t={t} onFim={irInicio}>
            <p className="mt-4 rounded-2xl bg-white px-6 py-4 text-lg">{tela.mensagem}</p>
          </Aviso>
        )}

        {tela.t === "checkout" && token && (
          <FormCheckout
            t={t}
            onVoltar={irInicio}
            onEnviar={async (quarto, sobrenome) => {
              try {
                const r = await api.checkoutConsultar(token, quarto, sobrenome);
                if (r.estado === "pronto") setTela({ t: "checkout_resumo", nome: r.nome, quarto: r.quarto, sobrenome });
                else if (r.estado === "impedido") setTela({ t: "impedido", nome: r.nome, quartos: [r.quarto], motivos: r.motivos });
                else if (r.estado === "bloqueado") setTela({ t: "bloqueado" });
                else setTela({ t: "nao_encontrado", fluxo: "checkout" });
              } catch (e) {
                tratarErro(e);
              }
            }}
          />
        )}

        {tela.t === "checkout_resumo" && token && (
          <Resumo
            t={t}
            titulo={t.ola(tela.nome)}
            linhas={[t.seuQuarto([tela.quarto])]}
            acao={t.confirmarCheckout}
            carregando={t.saindo}
            onVoltar={irInicio}
            onConfirmar={async () => {
              try {
                const r = await api.checkoutConfirmar(token, tela.quarto, tela.sobrenome);
                if (r.estado === "concluido") setTela({ t: "checkout_feito", nome: r.nome, quarto: r.quarto, reservationID: r.reservationID });
                else if (r.estado === "impedido") setTela({ t: "impedido", nome: r.nome, quartos: [r.quarto], motivos: r.motivos });
                else if (r.estado === "bloqueado") setTela({ t: "bloqueado" });
                else setTela({ t: "nao_encontrado", fluxo: "checkout" });
              } catch (e) {
                tratarErro(e);
              }
            }}
          />
        )}

        {tela.t === "checkout_feito" && token && (
          <Avaliacao
            t={t}
            onPular={irInicio}
            onEnviar={async (nota, comentario) => {
              try {
                await api.avaliar(token, { reservationID: tela.reservationID, quarto: tela.quarto, nota, comentario });
                setTela({ t: "avaliado" });
              } catch (e) {
                tratarErro(e);
              }
            }}
          />
        )}

        {tela.t === "avaliado" && (
          <section className="pt-10">
            <h1 className="text-4xl font-extrabold tracking-tight">{t.avaliacaoEnviada}</h1>
            <BotaoPrincipal onClick={irInicio} className="mt-10">{t.inicio}</BotaoPrincipal>
          </section>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- peças

type T = (typeof TEXTOS)["pt"];

function Carregando() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Loader2 className="h-10 w-10 animate-spin text-[#0C5A64]" aria-label="…" />
    </div>
  );
}

function BotaoPrincipal({
  children,
  onClick,
  type = "button",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#0C5A64] px-6 text-xl font-bold text-white focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#F2C14E] disabled:opacity-60",
        className,
      )}
    >
      {children}
    </button>
  );
}

function BotaoVoltar({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 items-center gap-2 rounded-xl pr-4 text-lg font-semibold text-[#0C5A64] focus-visible:outline-2 focus-visible:outline-[#0C5A64]"
    >
      <ArrowLeft className="h-5 w-5" /> {children}
    </button>
  );
}

function Campo({
  label,
  ajuda,
  value,
  onChange,
  autoFocus,
  inputMode,
  autoCapitalize = "words",
}: {
  label: string;
  ajuda?: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  inputMode?: "text" | "numeric";
  autoCapitalize?: "words" | "characters" | "none";
}) {
  return (
    <label className="block">
      <span className="block text-lg font-semibold">{label}</span>
      {ajuda && <span className="mt-0.5 block text-base text-[#0B2E33]/60">{ajuda}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="mt-2 block min-h-16 w-full rounded-2xl border-2 border-[#0C5A64]/20 bg-white px-5 text-2xl font-semibold outline-none focus:border-[#0C5A64]"
      />
    </label>
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

function Parear({ t, parear, onPareado }: { t: T; parear: TotemApi["parear"]; onPareado: (token: string, info: TotemInfo) => void }) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const { enviando, enviar } = useEnvio();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    void enviar(async () => {
      try {
        const r = await parear(codigo);
        onPareado(r.token, r.totem);
      } catch (err) {
        setErro(mensagemDe(err));
      }
    });
  };
  return (
    <form onSubmit={submit} className="space-y-6">
      <h1 className="text-4xl font-extrabold tracking-tight">{t.pareamentoTitulo}</h1>
      <p className="text-lg text-[#0B2E33]/70">{t.pareamentoAjuda}</p>
      <Campo label={t.pareamentoCodigo} value={codigo} onChange={(v) => setCodigo(v.toUpperCase())} autoFocus autoCapitalize="characters" />
      {erro && <p role="alert" className="rounded-2xl bg-[#B4232C]/10 px-5 py-4 text-lg font-medium text-[#8E1B22]">{erro}</p>}
      <BotaoPrincipal type="submit" disabled={enviando || codigo.replace(/[^A-Za-z0-9]/g, "").length !== 8}>
        {enviando && <Loader2 className="h-6 w-6 animate-spin" />} {t.parear}
      </BotaoPrincipal>
    </form>
  );
}

function FormCheckin({ t, onVoltar, onEnviar }: { t: T; onVoltar: () => void; onEnviar: (i: Ident) => Promise<void> }) {
  const [modo, setModo] = useState<"codigo" | "documento">("codigo");
  const [codigo, setCodigo] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const { enviando, enviar } = useEnvio();
  const valido =
    modo === "codigo"
      ? codigo.trim().length >= 4 && sobrenome.trim().length >= 2
      : nome.trim().split(/\s+/).length >= 2 && documento.trim().length >= 5;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    void enviar(() =>
      onEnviar(modo === "codigo" ? { modo, codigo: codigo.trim(), sobrenome: sobrenome.trim() } : { modo, nome: nome.trim(), documento: documento.trim() }),
    );
  };
  return (
    <form onSubmit={submit} className="space-y-7">
      <BotaoVoltar onClick={onVoltar}>{t.voltar}</BotaoVoltar>
      <h1 className="text-4xl font-extrabold tracking-tight">{t.checkin}</h1>
      <div role="tablist" className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-1.5 shadow-[inset_0_0_0_1px_rgba(12,90,100,0.15)]">
        {(["codigo", "documento"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={modo === m}
            onClick={() => setModo(m)}
            className={cn(
              "min-h-14 rounded-xl px-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-[#0C5A64]",
              modo === m ? "bg-[#0C5A64] text-white" : "text-[#0B2E33]/70",
            )}
          >
            {m === "codigo" ? t.porCodigo : t.porDocumento}
          </button>
        ))}
      </div>
      {modo === "codigo" ? (
        <>
          <Campo label={t.codigo} ajuda={t.codigoAjuda} value={codigo} onChange={setCodigo} autoFocus autoCapitalize="characters" />
          <Campo label={t.sobrenome} ajuda={t.sobrenomeAjuda} value={sobrenome} onChange={setSobrenome} />
        </>
      ) : (
        <>
          <Campo label={t.nome} value={nome} onChange={setNome} autoFocus />
          <Campo label={t.documento} ajuda={t.documentoAjuda} value={documento} onChange={setDocumento} autoCapitalize="characters" />
        </>
      )}
      <BotaoPrincipal type="submit" disabled={!valido || enviando}>
        {enviando ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin" /> {t.conferindo}
          </>
        ) : (
          t.continuar
        )}
      </BotaoPrincipal>
    </form>
  );
}

function FormCheckout({ t, onVoltar, onEnviar }: { t: T; onVoltar: () => void; onEnviar: (quarto: string, sobrenome: string) => Promise<void> }) {
  const [quarto, setQuarto] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const { enviando, enviar } = useEnvio();
  const valido = quarto.trim().length >= 1 && sobrenome.trim().length >= 2;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valido) void enviar(() => onEnviar(quarto.trim(), sobrenome.trim()));
      }}
      className="space-y-7"
    >
      <BotaoVoltar onClick={onVoltar}>{t.voltar}</BotaoVoltar>
      <h1 className="text-4xl font-extrabold tracking-tight">{t.checkout}</h1>
      <Campo label={t.quarto} value={quarto} onChange={setQuarto} autoFocus inputMode="numeric" autoCapitalize="none" />
      <Campo label={t.sobrenome} value={sobrenome} onChange={setSobrenome} />
      <BotaoPrincipal type="submit" disabled={!valido || enviando}>
        {enviando ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin" /> {t.conferindo}
          </>
        ) : (
          t.continuar
        )}
      </BotaoPrincipal>
    </form>
  );
}

function Resumo({
  t,
  titulo,
  linhas,
  acao,
  carregando,
  onVoltar,
  onConfirmar,
}: {
  t: T;
  titulo: string;
  linhas: string[];
  acao: string;
  carregando: string;
  onVoltar: () => void;
  onConfirmar: () => Promise<void>;
}) {
  const { enviando, enviar } = useEnvio();
  return (
    <section className="space-y-8">
      <BotaoVoltar onClick={onVoltar}>{t.voltar}</BotaoVoltar>
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">{titulo}</h1>
        {linhas.filter(Boolean).map((l) => (
          <p key={l} className="mt-2 text-2xl text-[#0B2E33]/75 first-letter:uppercase">
            {l}
          </p>
        ))}
      </div>
      <BotaoPrincipal onClick={() => void enviar(onConfirmar)} disabled={enviando}>
        {enviando ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin" /> {carregando}
          </>
        ) : (
          acao
        )}
      </BotaoPrincipal>
    </section>
  );
}

/** A senha aparece como as teclas que o hóspede vai apertar na porta, terminando em #. */
function Teclas({ senha, grande = true }: { senha: string; grande?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2.5" aria-label={`${senha.split("").join(" ")} #`}>
      {[...senha.split(""), "#"].map((d, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            "grid place-items-center rounded-2xl font-extrabold tabular-nums",
            grande ? "h-24 w-[4.25rem] text-5xl sm:h-28 sm:w-20 sm:text-6xl" : "h-12 w-10 text-2xl",
            d === "#"
              ? "bg-[#F2C14E] text-[#0B2E33] shadow-[inset_0_-4px_0_rgba(11,46,51,0.18)]"
              : "bg-white text-[#0C5A64] shadow-[inset_0_-4px_0_rgba(12,90,100,0.18),0_0_0_1px_rgba(12,90,100,0.12)]",
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
    <section className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">{t.ola(r.nome)}</h1>
        <p className="mt-2 text-2xl text-[#0B2E33]/75">{t.seuQuarto(r.quartos)}</p>
      </div>
      <div className="rounded-[2rem] bg-[#0C5A64] p-6 text-white sm:p-8">
        <p className="text-lg font-semibold text-white/80">{t.suaSenha}</p>
        <div className="mt-4">
          <Teclas senha={r.senha} />
        </div>
        <p className="mt-6 text-xl font-semibold">{t.comoAbrir}</p>
        <p className="mt-2 text-base text-white/75">
          {t.ativacao} {t.validaAte(validaAte)}
        </p>
      </div>
      {entrada.length > 0 && (
        <div>
          <h2 className="text-xl font-bold">{t.outrasPortas}</h2>
          <ul className="mt-3 divide-y divide-[#0C5A64]/10 rounded-2xl bg-white">
            {entrada.map((p: PortaTotem) => (
              <li key={p.label} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <span className="flex items-center gap-3 text-lg font-semibold">
                  <DoorOpen className="h-6 w-6 text-[#0C5A64]" /> {p.label}
                </span>
                {p.senha ? (
                  <Teclas senha={p.senha} grande={false} />
                ) : (
                  <span className="text-base text-[#0B2E33]/60">{p.mesma ? t.mesmaSenha : t.portaSemSenha}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-lg text-[#0B2E33]/70">{t.anoteSenha}</p>
      <BotaoPrincipal onClick={onFim}>{t.pronto}</BotaoPrincipal>
    </section>
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
    <section>
      <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{titulo}</h1>
      {children}
      {telefone && (
        <p className="mt-8 flex items-center gap-3 text-xl font-semibold text-[#0C5A64]">
          <Phone className="h-6 w-6" /> {t.ligar(telefone)}
        </p>
      )}
      <div className="mt-10 grid gap-3">
        {tentar && <BotaoPrincipal onClick={tentar}>{t.tentarDeNovo}</BotaoPrincipal>}
        <button
          type="button"
          onClick={onFim}
          className="min-h-16 rounded-2xl bg-white text-xl font-bold text-[#0C5A64] shadow-[inset_0_0_0_2px_rgba(12,90,100,0.25)] focus-visible:outline-4 focus-visible:outline-[#0C5A64]"
        >
          {t.inicio}
        </button>
      </div>
    </section>
  );
}

function Avaliacao({ t, onEnviar, onPular }: { t: T; onEnviar: (nota: number, comentario: string) => Promise<void>; onPular: () => void }) {
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const { enviando, enviar } = useEnvio();
  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">{t.checkoutFeito}</h1>
        <p className="mt-3 text-xl text-[#0B2E33]/75">{t.obrigado}</p>
      </div>
      <fieldset>
        <legend className="text-2xl font-bold">{t.comoFoi}</legend>
        <div className="mt-4 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNota(n)}
              aria-label={`${n}/5`}
              aria-pressed={nota === n}
              className="grid h-20 w-20 place-items-center rounded-2xl bg-white focus-visible:outline-4 focus-visible:outline-[#0C5A64]"
            >
              <Star className={cn("h-11 w-11", n <= nota ? "fill-[#F2C14E] text-[#D9A520]" : "text-[#0B2E33]/25")} />
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="block text-lg font-semibold">{t.comentario}</span>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value.slice(0, 500))}
          rows={3}
          className="mt-2 block w-full rounded-2xl border-2 border-[#0C5A64]/20 bg-white px-5 py-4 text-xl outline-none focus:border-[#0C5A64]"
        />
      </label>
      <div className="grid gap-3">
        <BotaoPrincipal disabled={!nota || enviando} onClick={() => void enviar(() => onEnviar(nota, comentario.trim()))}>
          {enviando && <Loader2 className="h-6 w-6 animate-spin" />} {t.enviar}
        </BotaoPrincipal>
        <button type="button" onClick={onPular} className="min-h-14 text-lg font-semibold text-[#0C5A64]">
          {t.pular}
        </button>
      </div>
    </section>
  );
}
