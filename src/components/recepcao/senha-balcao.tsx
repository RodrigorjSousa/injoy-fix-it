import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { gerarSenhaBalcao, type SenhaBalcao } from "@/lib/senha-balcao.functions";

type Opcao = { reservationId: string; hospede: string; rotulo: string };

/**
 * Senha da estadia gerada no balcão (hóspede que não conseguiu usar o totem).
 * Mesma senha do totem: quarto + portões até o check-out, gravada na reserva do Cloudbeds.
 * Se a reserva já tem senha, mostra a mesma (para reenviar ao hóspede).
 */
export function SenhaBalcaoButton({ unidade, quarto, opcoes }: { unidade: string; quarto: string; opcoes: Opcao[] }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<SenhaBalcao | null>(null);
  const gerar = useServerFn(gerarSenhaBalcao);
  const validas = opcoes.filter((o) => o.reservationId && !o.reservationId.startsWith("room-"));
  if (!validas.length || (unidade !== "Botafogo" && unidade !== "Ipanema")) return null;

  const pedir = async (o: Opcao) => {
    setCarregando(o.reservationId);
    try {
      const r = await gerar({ data: { unidade: unidade as "Botafogo" | "Ipanema", reservationId: o.reservationId } });
      setResultado(r);
      if (r.avisoCloudbeds) toast.warning(`Senha gerada, mas não foi gravada no Cloudbeds: ${r.avisoCloudbeds}`, { duration: 10000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar a senha", { duration: 10000 });
    } finally {
      setCarregando(null);
    }
  };

  const copiar = (texto: string) => {
    void navigator.clipboard?.writeText(texto).then(
      () => toast.success("Senha copiada"),
      () => undefined,
    );
  };

  const fechar = (v: boolean) => {
    setAberto(v);
    if (!v) setResultado(null);
  };

  const outras = resultado?.portas.filter((p) => p.senha && p.senha !== resultado.senha) ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full py-2.5 rounded-xl font-bold text-sm border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 flex items-center justify-center gap-2"
      >
        <KeyRound size={16} /> Senha da estadia (balcão)
      </button>
      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Senha da estadia · quarto {quarto}</DialogTitle>
            <DialogDescription>
              Para o hóspede que não conseguiu fazer o check-in no totem. É a mesma senha do totem: quarto e portões até o
              check-out, e fica gravada na reserva do Cloudbeds. O check-in no Cloudbeds continua no botão de check-in.
            </DialogDescription>
          </DialogHeader>

          {!resultado ? (
            <div className="space-y-2">
              {validas.map((o) => (
                <button
                  key={o.reservationId}
                  type="button"
                  disabled={!!carregando}
                  onClick={() => void pedir(o)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50 disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{o.rotulo}</div>
                      <div className="font-semibold text-slate-900">{o.hospede || "Hóspede"}</div>
                    </div>
                    {carregando === o.reservationId ? (
                      <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
                    ) : (
                      <span className="text-sm font-bold text-teal-700">Gerar / ver senha</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl bg-teal-50 p-4 text-center">
                <div className="text-sm text-teal-900">
                  {resultado.hospede} · {resultado.quartos.join(", ")}
                </div>
                <button
                  type="button"
                  onClick={() => copiar(resultado.senha)}
                  className="mt-1 inline-flex items-center gap-2 text-5xl font-bold tracking-widest text-teal-900"
                >
                  {resultado.senha}
                  <span className="text-teal-500">#</span>
                  <Copy className="h-5 w-5 text-teal-700" />
                </button>
                <div className="mt-1 text-xs text-teal-800">
                  {outras.length ? "Senha do quarto" : "Quarto e portões"} · válida até{" "}
                  {new Date(resultado.validaAte).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  {resultado.reaproveitada && " · senha que o hóspede já tinha"}
                </div>
              </div>
              {outras.map((p) => (
                <div key={p.label} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2">
                  <span className="text-sm text-slate-700">{p.label}</span>
                  <button type="button" onClick={() => copiar(p.senha as string)} className="font-mono text-lg font-bold">
                    {p.senha}#
                  </button>
                </div>
              ))}
              {resultado.portas
                .filter((p) => !p.senha && !p.mesma)
                .map((p) => (
                  <p key={p.label} className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
                    {p.label} não aceitou a senha. Verifique a fechadura/gateway.
                  </p>
                ))}
              {resultado.avisoCloudbeds && (
                <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
                  Não gravou na reserva do Cloudbeds: {resultado.avisoCloudbeds}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
