// Janelas dos botões que mexem com dinheiro na tela Reservas. Nada é decidido aqui: o servidor relê o saldo
// no Cloudbeds, acha o cliente/cartão no Stripe e faz todas as conferências antes de cobrar.
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, Loader2, Mail, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { linkCloudbeds } from "@/lib/reservas/cobranca";
import {
  useCobrarAgora,
  useEnviarLink,
  usePagamentoNoCheckin,
  usePrepararCobranca,
  type LinhaCobranca,
} from "@/lib/reservas/use-reservas";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const erroTexto = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir. Tente de novo.");

function Carregando({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
      <Loader2 className="h-5 w-5 animate-spin text-[#0f8b8d]" /> {texto}
    </div>
  );
}

function Bloqueio({ texto, linha }: { texto: string; linha: LinhaCobranca }) {
  return (
    <div role="alert" className="space-y-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
      <p className="flex gap-2 font-semibold">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /> Por segurança, o app não vai cobrar.
      </p>
      <p>{texto}</p>
      <a
        href={linkCloudbeds(linha.property_id, linha.reservation_id)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-semibold text-[#0e2a30] underline-offset-2 hover:underline"
      >
        <ExternalLink className="h-4 w-4" /> Abrir a reserva no Cloudbeds
      </a>
    </div>
  );
}

function SeloTeste() {
  return (
    <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-violet-800">
      Modo de teste: nada vai ao Cloudbeds
    </span>
  );
}

function Resumo({ linha, saldo }: { linha: LinhaCobranca; saldo: number }) {
  const mudou = Math.round(saldo * 100) !== Math.round(linha.saldo * 100);
  return (
    <div className="rounded-xl bg-[#0e2a30] p-4 text-white">
      <p className="text-xs font-semibold text-[#7fd1cf]">Saldo no Cloudbeds agora</p>
      <p className="font-display text-3xl font-extrabold tabular-nums">{brl(saldo)}</p>
      <p className="mt-1 text-sm text-slate-300">
        {linha.hospede} · reserva <span className="tabular-nums">{linha.reservation_id}</span>
      </p>
      {mudou && (
        <p className="mt-2 rounded-lg bg-amber-400/15 px-2 py-1 text-xs text-amber-200">
          A lista mostrava {brl(linha.saldo)}. Vale o valor de agora do Cloudbeds.
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Cobrar agora

export function CobrarAgoraDialog({ linha, aberto, onFechar }: { linha: LinhaCobranca; aberto: boolean; onFechar: () => void }) {
  const preparar = usePrepararCobranca();
  const cobrar = useCobrarAgora(linha.unidade);
  const link = useEnviarLink(linha.unidade);
  const [cartaoId, setCartaoId] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ tipo: "autenticacao" | "recusado" | "processando"; texto: string } | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setResultado(null);
    setCartaoId(null);
    preparar.mutate(linha.id, {
      onSuccess: (p) => {
        const liberados = p.cartoes.filter((c) => c.podeCobrar);
        if (liberados.length === 1) setCartaoId(liberados[0].id); // um só: já vem marcado, mas ainda pede confirmação
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, linha.id]);

  const p = preparar.data;
  const cartao = p?.cartoes.find((c) => c.id === cartaoId);
  const liberados = p?.cartoes.filter((c) => c.podeCobrar) ?? [];

  const confirmar = () => {
    if (!p?.saldo || !cartaoId) return;
    cobrar.mutate(
      { linhaId: linha.id, valorConfirmado: p.saldo, cartaoId },
      {
        onSuccess: (r) => {
          if (r.resultado === "aprovado") {
            if (r.cloudbedsOk) toast.success(r.mensagem);
            else toast.error(r.mensagem, { duration: 15000 });
            onFechar();
          } else setResultado({ tipo: r.resultado, texto: r.mensagem });
        },
        onError: (e) => toast.error(erroTexto(e)),
      },
    );
  };

  const mandarLink = () => {
    if (!p?.saldo) return;
    link.mutate(
      { linhaId: linha.id, valorConfirmado: p.saldo },
      {
        onSuccess: (r) => {
          toast.success(r.mensagem);
          onFechar();
        },
        onError: (e) => toast.error(erroTexto(e)),
      },
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !cobrar.isPending && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[#0f8b8d]" /> Cobrar agora
          </DialogTitle>
          <DialogDescription>Cobrança no cartão guardado na reserva, pelo Stripe. Confira antes de confirmar.</DialogDescription>
        </DialogHeader>

        {preparar.isPending ? (
          <Carregando texto="Conferindo o saldo no Cloudbeds e o cartão no Stripe…" />
        ) : preparar.error ? (
          <Bloqueio texto={erroTexto(preparar.error)} linha={linha} />
        ) : p?.bloqueio ? (
          <Bloqueio texto={p.bloqueio} linha={linha} />
        ) : p && p.saldo ? (
          <div className="space-y-4">
            {p.modo === "teste" && <SeloTeste />}
            <Resumo linha={linha} saldo={p.saldo} />

            {p.linkAberto && !resultado && (
              <p className="flex gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Há um link de pagamento aberto para esta reserva. Ao cobrar, o app <span className="font-semibold">cancela o link
                  antes</span>, para o hóspede não pagar duas vezes.
                </span>
              </p>
            )}

            {resultado ? (
              <div
                role="alert"
                className={cn(
                  "space-y-3 rounded-xl p-4 text-sm ring-1",
                  resultado.tipo === "autenticacao" ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-amber-50 text-amber-900 ring-amber-200",
                )}
              >
                <p className="flex gap-2 font-semibold">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  {resultado.tipo === "autenticacao" ? "O banco pediu confirmação do hóspede" : resultado.tipo === "recusado" ? "Cartão recusado" : "Em processamento"}
                </p>
                <p>{resultado.texto}</p>
                {resultado.tipo !== "processando" && p.emailDestino && (
                  <button
                    type="button"
                    onClick={mandarLink}
                    disabled={link.isPending}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0e2a30] px-3 font-semibold text-white disabled:opacity-60"
                  >
                    {link.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Enviar link para {p.emailDestino}
                  </button>
                )}
              </div>
            ) : (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold text-slate-700">
                  {liberados.length > 1 ? "Este hóspede tem mais de um cartão. Escolha qual cobrar:" : "Cartão"}
                </legend>
                {p.cartoes.length === 0 && <p className="text-sm text-slate-500">Nenhum cartão guardado no Stripe para esta reserva.</p>}
                {p.cartoes.map((c) => (
                  <label
                    key={c.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 text-sm",
                      c.podeCobrar ? "cursor-pointer border-slate-200 hover:border-[#0f8b8d]" : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400",
                      cartaoId === c.id && "border-[#0f8b8d] bg-[#eef8f7] ring-1 ring-[#0f8b8d]",
                    )}
                  >
                    <input
                      type="radio"
                      name={`cartao-${linha.id}`}
                      value={c.id}
                      disabled={!c.podeCobrar}
                      checked={cartaoId === c.id}
                      onChange={() => setCartaoId(c.id)}
                      className="h-4 w-4 accent-[#0f8b8d]"
                    />
                    <span className="flex-1 font-semibold">{c.texto}</span>
                    {c.porque && <span className="text-xs">{c.porque}</span>}
                  </label>
                ))}
                {p.cartoes.length > 0 && liberados.length === 0 && (
                  <Bloqueio texto="Nenhum cartão do Stripe confere com os cartões desta reserva no Cloudbeds." linha={linha} />
                )}
              </fieldset>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onFechar}
            disabled={cobrar.isPending}
            className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {resultado ? "Fechar" : "Cancelar"}
          </button>
          {!resultado && p && !p.bloqueio && p.saldo ? (
            <button
              type="button"
              onClick={confirmar}
              disabled={!cartao?.podeCobrar || cobrar.isPending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0f8b8d] px-4 text-sm font-bold text-white hover:bg-[#0c7a7c] disabled:opacity-50"
            >
              {cobrar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {cobrar.isPending ? "Cobrando…" : cartao ? `Cobrar ${brl(p.saldo)} no ${cartao.texto.split(",")[0]}` : "Escolha o cartão"}
            </button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Enviar link

export function EnviarLinkDialog({ linha, aberto, onFechar }: { linha: LinhaCobranca; aberto: boolean; onFechar: () => void }) {
  const preparar = usePrepararCobranca();
  const link = useEnviarLink(linha.unidade);
  useEffect(() => {
    if (aberto) preparar.mutate(linha.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, linha.id]);
  const p = preparar.data;
  const pode = !!p && !p.bloqueio && !!p.saldo && !!p.emailDestino && !p.linkAberto;

  const enviar = () => {
    if (!p?.saldo) return;
    link.mutate(
      { linhaId: linha.id, valorConfirmado: p.saldo },
      {
        onSuccess: (r) => {
          toast.success(r.mensagem);
          onFechar();
        },
        onError: (e) => toast.error(erroTexto(e)),
      },
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !link.isPending && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#0f8b8d]" /> Enviar link de pagamento
          </DialogTitle>
          <DialogDescription>
            O Stripe manda um e-mail ao hóspede com o link. Quando ele pagar, o app lança no Cloudbeds e escreve "Pagamento OK" na reserva.
          </DialogDescription>
        </DialogHeader>
        {preparar.isPending ? (
          <Carregando texto="Conferindo o saldo no Cloudbeds e o cliente no Stripe…" />
        ) : preparar.error ? (
          <Bloqueio texto={erroTexto(preparar.error)} linha={linha} />
        ) : p?.bloqueio ? (
          <Bloqueio texto={p.bloqueio} linha={linha} />
        ) : p && p.saldo ? (
          <div className="space-y-4">
            {p.modo === "teste" && <SeloTeste />}
            <Resumo linha={linha} saldo={p.saldo} />
            {p.linkAberto ? (
              <div className="space-y-2 rounded-xl bg-sky-50 p-4 text-sm text-sky-900 ring-1 ring-sky-200">
                <p className="font-semibold">Já existe um link aberto para esta reserva.</p>
                {p.linkAberto.url && (
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(p.linkAberto?.url ?? "").then(() => toast.success("Link copiado"))}
                    className="font-semibold underline underline-offset-2"
                  >
                    Copiar o link para mandar de novo
                  </button>
                )}
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <Mail className="h-4 w-4 text-slate-400" /> Vai para <span className="font-semibold">{p.emailDestino ?? "—"}</span> · vence em 2 dias
              </p>
            )}
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" onClick={onFechar} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          {pode && (
            <button
              type="button"
              onClick={enviar}
              disabled={link.isPending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0e2a30] px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {link.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Enviar link de {brl(p!.saldo!)}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Pagamento no check-in

export function CheckinDialog({ linha, aberto, onFechar }: { linha: LinhaCobranca; aberto: boolean; onFechar: () => void }) {
  const checkin = usePagamentoNoCheckin(linha.unidade);
  const confirmar = () =>
    checkin.mutate(
      { linhaId: linha.id },
      {
        onSuccess: (r) => {
          toast.success(r.mensagem);
          onFechar();
        },
        onError: (e) => toast.error(erroTexto(e)),
      },
    );
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !checkin.isPending && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-[#7048e8]" /> Pagamento no check-in
          </DialogTitle>
          <DialogDescription>
            {linha.hospede} vai pagar {brl(linha.saldo)} no local. O app escreve na reserva {linha.reservation_id} do Cloudbeds a nota{" "}
            <span className="font-semibold text-slate-800">"Pagamento no check in // seu nome"</span>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" onClick={onFechar} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={checkin.isPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#7048e8] px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {checkin.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar e escrever a nota
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
