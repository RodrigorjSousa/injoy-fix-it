import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Hand,
  Loader2,
  MessageCircle,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  joyApagarConversa,
  joyCarregarConfig,
  joyEnviarSimulador,
  joyListarModelos,
  joyMensagemEquipe,
  joyMudarModo,
  joyNovaConversa,
  joyPadrao,
  joySalvarConfig,
} from "@/lib/whatsapp.functions";

// Área do Gestor › WhatsApp (Joy). Entrega E1: simulador + configuração + execuções.
// Nada nesta tela envia mensagem real a hóspede (ver docs/projeto-injoy/08-whatsapp-ia.md).

export const Route = createFileRoute("/_authenticated/gestor/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp (Joy) | Área do Gestor" }] }),
  component: WhatsappGestor,
});

// Tabelas novas ainda não estão no types.ts gerado.
const sb = supabase as unknown as SupabaseClient;

type Conversa = {
  id: string;
  canal: string;
  contato_nome: string | null;
  telefone: string | null;
  unidade: string | null;
  reserva_id: string | null;
  reserva_unidade: string | null;
  modo: "ia" | "humano" | "pausada";
  etapa: string;
  updated_at: string;
};

type Mensagem = {
  id: string;
  autor: "cliente" | "joy" | "equipe" | "sistema";
  texto: string;
  meta: {
    ferramentas?: Array<{
      nome: string;
      args: Record<string, unknown>;
      resultado: Record<string, unknown>;
    }>;
    bloqueios?: string[];
    tokens?: { entrada: number; saida: number };
    modelo?: string;
    duracao_ms?: number;
  } | null;
  created_at: string;
};

type Execucao = {
  id: string;
  canal: string;
  modelo: string;
  tokens_entrada: number;
  tokens_saida: number;
  chamadas_modelo: number;
  ferramentas: Array<{ nome: string; ok: boolean }>;
  bloqueios: string[];
  duracao_ms: number;
  erro: string | null;
  created_at: string;
};

const NOME_FERRAMENTA: Record<string, string> = {
  consultar_disponibilidade: "Disponibilidade (Cloudbeds)",
  identificar_reserva: "Identificar reserva",
  minha_reserva: "Reserva do contato",
  consultar_wifi: "Wi-Fi",
  buscar_arredores: "Arredores (Maps)",
  como_chegar: "Como chegar",
  link_checkin_online: "Link check-in online",
  transferir_para_humano: "Passou para a equipe",
};

const MODO: Record<Conversa["modo"], { label: string; cls: string }> = {
  ia: { label: "Joy", cls: "bg-emerald-100 text-emerald-800" },
  humano: { label: "Equipe", cls: "bg-amber-100 text-amber-800" },
  pausada: { label: "Pausada", cls: "bg-slate-200 text-slate-700" },
};

function erroTexto(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function hora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ======================================================================

function WhatsappGestor() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-green-600 text-white">
          <MessageCircle className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">WhatsApp — Joy</h2>
          <p className="text-sm text-slate-600">
            Assistente de IA da Injoy. Etapa 1: simulador (sem WhatsApp).
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Simulador: <b>nenhuma mensagem sai para hóspedes</b> e a equipe não recebe push. As
          consultas ao Cloudbeds são reais, só de leitura. Cada resposta da Joy gasta créditos de IA
          do Lovable.
        </p>
      </div>

      <Tabs defaultValue="simulador">
        <TabsList>
          <TabsTrigger value="simulador">Simulador</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="execucoes">Execuções</TabsTrigger>
        </TabsList>
        <TabsContent value="simulador">
          <Simulador />
        </TabsContent>
        <TabsContent value="config">
          <Configuracao />
        </TabsContent>
        <TabsContent value="execucoes">
          <Execucoes />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================ simulador

function useConfig() {
  return useQuery({
    queryKey: ["joy-config"],
    queryFn: () => joyCarregarConfig(),
    staleTime: 60_000,
  });
}

function Simulador() {
  const qc = useQueryClient();
  const config = useConfig();
  const [ativa, setAtiva] = useState<string | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);

  const conversas = useQuery({
    queryKey: ["joy-conversas"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("wa_conversas")
        .select("*")
        .eq("canal", "simulador")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as Conversa[];
    },
  });

  useEffect(() => {
    if (!ativa && conversas.data?.length) setAtiva(conversas.data[0].id);
  }, [ativa, conversas.data]);

  const conversa = conversas.data?.find((c) => c.id === ativa) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="flex max-h-[70vh] flex-col p-3">
        <Button
          className="mb-3 w-full"
          onClick={() => setNovaAberta((v) => !v)}
          variant={novaAberta ? "secondary" : "default"}
        >
          <Plus className="mr-1 h-4 w-4" /> Nova conversa de teste
        </Button>
        {novaAberta && (
          <NovaConversa
            onCriada={(id) => {
              setNovaAberta(false);
              setAtiva(id);
              void qc.invalidateQueries({ queryKey: ["joy-conversas"] });
            }}
          />
        )}
        {conversas.error && <p className="text-sm text-red-600">{erroTexto(conversas.error)}</p>}
        <div className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
          {conversas.isLoading && (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
          )}
          {conversas.data?.length === 0 && (
            <p className="text-center text-sm text-slate-500">Nenhuma conversa ainda.</p>
          )}
          {conversas.data?.map((c) => (
            <button
              key={c.id}
              onClick={() => setAtiva(c.id)}
              className={cn(
                "w-full rounded-lg border p-2 text-left text-sm transition-colors",
                c.id === ativa
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-transparent hover:bg-slate-100",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-slate-900">
                  {c.contato_nome || "Hóspede de teste"}
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    MODO[c.modo].cls,
                  )}
                >
                  {MODO[c.modo].label}
                </span>
              </div>
              <div className="mt-0.5 flex justify-between text-xs text-slate-500">
                <span className="truncate">
                  {c.reserva_id ? `Reserva ${c.reserva_id}` : c.telefone || c.unidade || "—"}
                </span>
                <span>{hora(c.updated_at)}</span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {conversa ? (
        <Chat
          key={conversa.id}
          conversa={conversa}
          esperaSegundos={config.data?.espera_segundos ?? 5}
          onMudou={() => void qc.invalidateQueries({ queryKey: ["joy-conversas"] })}
          onApagada={() => {
            setAtiva(null);
            void qc.invalidateQueries({ queryKey: ["joy-conversas"] });
          }}
        />
      ) : (
        <Card className="grid min-h-[50vh] place-items-center p-6 text-center text-slate-500">
          <div>
            <Bot className="mx-auto mb-2 h-10 w-10 text-slate-300" />
            Crie uma conversa de teste e escreva como se fosse um hóspede.
          </div>
        </Card>
      )}
    </div>
  );
}

function NovaConversa({ onCriada }: { onCriada: (id: string) => void }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [unidade, setUnidade] = useState<"" | "Botafogo" | "Ipanema">("");
  const [salvando, setSalvando] = useState(false);
  return (
    <div className="mb-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <div>
        <Label htmlFor="joy-nome">Nome do contato</Label>
        <Input
          id="joy-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Ana (teste)"
        />
      </div>
      <div>
        <Label htmlFor="joy-tel">Telefone (opcional)</Label>
        <Input
          id="joy-tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="Para testar a busca da reserva"
        />
        <p className="mt-1 text-xs text-slate-500">
          Com o telefone de uma reserva real, a Joy acha a reserva sozinha.
        </p>
      </div>
      <div>
        <Label>Unidade (opcional)</Label>
        <div className="mt-1 grid grid-cols-3 gap-1">
          {(["", "Botafogo", "Ipanema"] as const).map((u) => (
            <button
              key={u || "nenhuma"}
              onClick={() => setUnidade(u)}
              className={cn(
                "rounded border px-2 py-1 text-xs",
                unidade === u ? "border-emerald-500 bg-emerald-50" : "bg-white",
              )}
            >
              {u || "Não sei"}
            </button>
          ))}
        </div>
      </div>
      <Button
        className="w-full"
        disabled={salvando}
        onClick={async () => {
          setSalvando(true);
          try {
            const r = await joyNovaConversa({
              data: {
                contato_nome: nome || undefined,
                telefone: telefone || undefined,
                unidade: unidade || undefined,
              },
            });
            onCriada(r.id);
          } catch (e) {
            toast.error(erroTexto(e));
          } finally {
            setSalvando(false);
          }
        }}
      >
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
      </Button>
    </div>
  );
}

function Chat({
  conversa,
  esperaSegundos,
  onMudou,
  onApagada,
}: {
  conversa: Conversa;
  esperaSegundos: number;
  onMudou: () => void;
  onApagada: () => void;
}) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [pendentes, setPendentes] = useState<string[]>([]);
  const [contagem, setContagem] = useState<number | null>(null);
  const [respondendo, setRespondendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const pendentesRef = useRef<string[]>([]);
  pendentesRef.current = pendentes;

  const mensagens = useQuery({
    queryKey: ["joy-mensagens", conversa.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from("wa_mensagens")
        .select("*")
        .eq("conversa_id", conversa.id)
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []) as Mensagem[];
    },
  });

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.data?.length, pendentes.length, respondendo]);

  // Junta mensagens picotadas: a Joy só responde depois de X segundos sem mensagem nova (igual ao WhatsApp).
  useEffect(() => {
    if (contagem === null) return;
    if (contagem <= 0) {
      setContagem(null);
      void enviarPendentes();
      return;
    }
    const t = setTimeout(() => setContagem((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contagem]);

  async function enviarPendentes() {
    const lote = pendentesRef.current;
    if (lote.length === 0) return;
    setRespondendo(true);
    setErro(null);
    try {
      const r = await joyEnviarSimulador({ data: { conversaId: conversa.id, textos: lote } });
      setPendentes([]);
      if (r.bloqueios.length)
        toast.warning(
          "O filtro de segurança barrou parte da resposta (veja os detalhes na mensagem).",
        );
      if (r.transferida) toast.info("A Joy passou a conversa para a equipe.");
    } catch (e) {
      setPendentes([]);
      setErro(erroTexto(e));
    } finally {
      setRespondendo(false);
      await qc.invalidateQueries({ queryKey: ["joy-mensagens", conversa.id] });
      await qc.invalidateQueries({ queryKey: ["joy-execucoes"] });
      onMudou();
    }
  }

  async function enviar() {
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    if (conversa.modo !== "ia") {
      try {
        await joyMensagemEquipe({ data: { conversaId: conversa.id, texto: t } });
        await qc.invalidateQueries({ queryKey: ["joy-mensagens", conversa.id] });
      } catch (e) {
        toast.error(erroTexto(e));
      }
      return;
    }
    setPendentes((p) => [...p, t]);
    setContagem(Math.max(0, esperaSegundos));
  }

  async function mudarModo(modo: Conversa["modo"]) {
    try {
      await joyMudarModo({ data: { conversaId: conversa.id, modo } });
      onMudou();
      await qc.invalidateQueries({ queryKey: ["joy-mensagens", conversa.id] });
    } catch (e) {
      toast.error(erroTexto(e));
    }
  }

  const comEquipe = conversa.modo !== "ia";

  return (
    <Card className="flex max-h-[75vh] min-h-[60vh] flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-4 py-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">
            {conversa.contato_nome || "Hóspede de teste"}
          </p>
          <p className="truncate text-xs text-slate-500">
            {[
              conversa.telefone && `Tel. ${conversa.telefone}`,
              conversa.unidade,
              conversa.reserva_id && `Reserva ${conversa.reserva_id}`,
              `Etapa: ${conversa.etapa}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          {comEquipe ? (
            <Button size="sm" variant="outline" onClick={() => void mudarModo("ia")}>
              <Bot className="mr-1 h-4 w-4" /> Devolver para a Joy
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => void mudarModo("humano")}>
              <Hand className="mr-1 h-4 w-4" /> Equipe assume
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmarApagar(true)}
            aria-label="Apagar conversa"
          >
            <Trash2 className="h-4 w-4 text-slate-500" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-[#efeae2] p-4">
        {mensagens.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500" />}
        {mensagens.data?.map((m) => (
          <Bolha key={m.id} m={m} />
        ))}
        {pendentes.map((p, i) => (
          <div key={`p${i}`} className="flex justify-start">
            <div className="max-w-[80%] rounded-lg rounded-tl-none bg-white/70 px-3 py-2 text-sm text-slate-700 shadow-sm">
              {p}
              <span className="ml-2 text-[10px] text-slate-400">aguardando…</span>
            </div>
          </div>
        ))}
        {(respondendo || contagem !== null) && (
          <div className="flex justify-end">
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 shadow-sm">
              {respondendo ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Joy está digitando…
                </span>
              ) : (
                <span>Joy responde em {contagem}s (esperando mensagens picotadas)</span>
              )}
            </div>
          </div>
        )}
        {erro && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <b>Erro real:</b> {erro}
          </div>
        )}
        <div ref={fim} />
      </div>

      <div className="border-t bg-white p-3">
        {comEquipe && (
          <p className="mb-2 text-xs text-amber-700">
            A conversa está com a equipe: o que você escrever aqui entra como resposta da equipe e a
            Joy não responde.
          </p>
        )}
        <div className="flex gap-2">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            rows={2}
            placeholder={
              comEquipe
                ? "Responder como equipe…"
                : "Escreva como se fosse o hóspede (Enter envia)…"
            }
            className="min-h-[44px] resize-none"
          />
          <div className="flex flex-col gap-1">
            <Button
              onClick={() => void enviar()}
              disabled={!texto.trim() || respondendo}
              aria-label="Enviar"
            >
              <Send className="h-4 w-4" />
            </Button>
            {contagem !== null && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setContagem(null);
                  void enviarPendentes();
                }}
              >
                Já
              </Button>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmarApagar} onOpenChange={setConfirmarApagar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta conversa de teste?</AlertDialogTitle>
            <AlertDialogDescription>
              As mensagens somem. O histórico de execuções (tokens) continua.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await joyApagarConversa({ data: { conversaId: conversa.id } });
                  onApagada();
                } catch (e) {
                  toast.error(erroTexto(e));
                }
              }}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Bolha({ m }: { m: Mensagem }) {
  const [aberto, setAberto] = useState(false);
  if (m.autor === "sistema") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs text-slate-600 shadow-sm">
          {m.texto}
        </span>
      </div>
    );
  }
  const daCasa = m.autor === "joy" || m.autor === "equipe";
  const ferramentas = m.meta?.ferramentas ?? [];
  const bloqueios = m.meta?.bloqueios ?? [];
  return (
    <div className={cn("flex", daCasa ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm",
          daCasa ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white",
        )}
      >
        <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-slate-500">
          {m.autor === "joy" ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
          {m.autor === "joy" ? "Joy" : m.autor === "equipe" ? "Equipe" : "Hóspede"}
        </div>
        <p className="whitespace-pre-wrap break-words text-slate-900">{m.texto}</p>
        <div className="mt-1 flex flex-wrap items-center justify-end gap-1 text-[10px] text-slate-500">
          {bloqueios.length > 0 && (
            <span className="rounded bg-red-100 px-1 text-red-700">
              filtro: {bloqueios.join(", ")}
            </span>
          )}
          {m.meta?.tokens && (
            <span>
              {m.meta.tokens.entrada + m.meta.tokens.saida} tokens ·{" "}
              {((m.meta.duracao_ms ?? 0) / 1000).toFixed(1)}s
            </span>
          )}
          <span>{hora(m.created_at)}</span>
        </div>
        {ferramentas.length > 0 && (
          <div className="mt-1 border-t border-black/5 pt-1">
            <button
              className="flex items-center gap-1 text-[11px] text-slate-600"
              onClick={() => setAberto((v) => !v)}
            >
              {aberto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Wrench className="h-3 w-3" />
              {ferramentas.map((f) => NOME_FERRAMENTA[f.nome] ?? f.nome).join(" · ")}
            </button>
            {aberto && (
              <div className="mt-1 space-y-1">
                {ferramentas.map((f, i) => (
                  <pre
                    key={i}
                    className="max-h-60 overflow-auto rounded bg-white/70 p-2 text-[10px] leading-tight text-slate-700"
                  >
                    {f.nome}({JSON.stringify(f.args)}){"\n"}→ {JSON.stringify(f.resultado, null, 1)}
                  </pre>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================================= configuração

function Configuracao() {
  const qc = useQueryClient();
  const config = useConfig();
  const [modelo, setModelo] = useState("");
  const [espera, setEspera] = useState(5);
  const [prompt, setPrompt] = useState("");
  const [conhecimento, setConhecimento] = useState("");
  const [wifi, setWifi] = useState<Record<"Botafogo" | "Ipanema", { rede: string; senha: string }>>(
    {
      Botafogo: { rede: "", senha: "" },
      Ipanema: { rede: "", senha: "" },
    },
  );
  const [verSenha, setVerSenha] = useState(false);
  const [modelos, setModelos] = useState<string[] | null>(null);
  const [carregandoModelos, setCarregandoModelos] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroJson, setErroJson] = useState<string | null>(null);
  const [confirmarPadrao, setConfirmarPadrao] = useState(false);

  useEffect(() => {
    if (!config.data) return;
    setModelo(config.data.modelo);
    setEspera(config.data.espera_segundos);
    setPrompt(config.data.prompt);
    setConhecimento(JSON.stringify(config.data.conhecimento, null, 2));
    setWifi({
      Botafogo: {
        rede: config.data.wifi.Botafogo?.rede ?? "",
        senha: config.data.wifi.Botafogo?.senha ?? "",
      },
      Ipanema: {
        rede: config.data.wifi.Ipanema?.rede ?? "",
        senha: config.data.wifi.Ipanema?.senha ?? "",
      },
    });
  }, [config.data]);

  const filtrados = useMemo(() => {
    if (!modelos) return [];
    const q = modelo.toLowerCase();
    return modelos
      .filter((m) => !q || m.toLowerCase().includes(q) || /claude|gemini|gpt/i.test(m))
      .slice(0, 60);
  }, [modelos, modelo]);

  if (config.isLoading)
    return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-slate-400" />;
  if (config.error)
    return (
      <Card className="border-red-300 bg-red-50 p-4 text-sm text-red-800">
        <b>Erro real:</b> {erroTexto(config.error)}
        <p className="mt-2 text-red-700">
          Se for "relation wa_config does not exist", a migração 0074 ainda não foi aplicada no
          Lovable.
        </p>
      </Card>
    );

  async function salvar() {
    let conhecimentoObj: Record<string, unknown>;
    try {
      conhecimentoObj = JSON.parse(conhecimento) as Record<string, unknown>;
      if (!conhecimentoObj || typeof conhecimentoObj !== "object" || Array.isArray(conhecimentoObj))
        throw new Error("precisa ser um objeto { … }");
      setErroJson(null);
    } catch (e) {
      setErroJson(`JSON inválido: ${erroTexto(e)}`);
      return;
    }
    setSalvando(true);
    try {
      const w: Record<string, { rede: string; senha: string }> = {};
      for (const u of ["Botafogo", "Ipanema"] as const) {
        if (wifi[u].rede.trim() || wifi[u].senha.trim())
          w[u] = { rede: wifi[u].rede.trim(), senha: wifi[u].senha.trim() };
      }
      await joySalvarConfig({
        data: {
          modelo: modelo.trim(),
          espera_segundos: espera,
          prompt,
          conhecimento: conhecimentoObj,
          wifi: w,
        },
      });
      toast.success("Configuração da Joy salva.");
      await qc.invalidateQueries({ queryKey: ["joy-config"] });
    } catch (e) {
      toast.error(erroTexto(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <div>
            <Label htmlFor="joy-modelo">Modelo de IA (gateway do Lovable)</Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="joy-modelo"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder="ex.: google/gemini-2.5-flash"
              />
              <Button
                variant="outline"
                disabled={carregandoModelos}
                onClick={async () => {
                  setCarregandoModelos(true);
                  try {
                    setModelos(await joyListarModelos());
                  } catch (e) {
                    toast.error(erroTexto(e));
                  } finally {
                    setCarregandoModelos(false);
                  }
                }}
              >
                {carregandoModelos ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Listar modelos"
                )}
              </Button>
            </div>
            {modelos && (
              <div className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded border bg-slate-50 p-2">
                {filtrados.length === 0 && (
                  <span className="text-xs text-slate-500">Nenhum modelo com esse nome.</span>
                )}
                {filtrados.map((m) => (
                  <button
                    key={m}
                    onClick={() => setModelo(m)}
                    className={cn(
                      "rounded border px-2 py-0.5 text-xs",
                      m === modelo ? "border-emerald-500 bg-emerald-50" : "bg-white",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Teste no simulador mais de um modelo e compare qualidade e tokens na aba Execuções.
            </p>
          </div>
          <div>
            <Label htmlFor="joy-espera">Espera (segundos)</Label>
            <Input
              id="joy-espera"
              type="number"
              min={0}
              max={60}
              value={espera}
              onChange={(e) => setEspera(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
            />
            <p className="mt-1 text-xs text-slate-500">
              Tempo sem mensagem nova antes de a Joy responder.
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Wi-Fi por unidade</h3>
            <p className="text-xs text-slate-500">
              Fica só no banco (nunca no código). A Joy só entrega para hóspede identificado,
              hospedado ou com check-in hoje/amanhã.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setVerSenha((v) => !v)}
            aria-label="Mostrar senhas"
          >
            {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["Botafogo", "Ipanema"] as const).map((u) => (
            <div key={u} className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">{u}</p>
              <Input
                value={wifi[u].rede}
                onChange={(e) => setWifi((w) => ({ ...w, [u]: { ...w[u], rede: e.target.value } }))}
                placeholder="Rede"
              />
              <Input
                type={verSenha ? "text" : "password"}
                value={wifi[u].senha}
                onChange={(e) =>
                  setWifi((w) => ({ ...w, [u]: { ...w[u], senha: e.target.value } }))
                }
                placeholder="Senha"
                autoComplete="off"
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <Label htmlFor="joy-prompt" className="font-semibold">
          Prompt da Joy (personalidade, regras e transferência)
        </Label>
        <Textarea
          id="joy-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={18}
          className="font-mono text-xs"
        />
      </Card>

      <Card className="space-y-2 p-4">
        <Label htmlFor="joy-conhecimento" className="font-semibold">
          Base de conhecimento (JSON)
        </Label>
        <p className="text-xs text-slate-500">
          Unidades (ativa, endereço, links), avisos internos, políticas, guia de problemas e equipe.
          Para não oferecer uma unidade, ponha "ativa": false.
        </p>
        <Textarea
          id="joy-conhecimento"
          value={conhecimento}
          onChange={(e) => setConhecimento(e.target.value)}
          rows={22}
          className={cn("font-mono text-xs", erroJson && "border-red-500")}
          spellCheck={false}
        />
        {erroJson && <p className="text-sm text-red-600">{erroJson}</p>}
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setConfirmarPadrao(true)}>
          <RotateCcw className="mr-1 h-4 w-4" /> Restaurar prompt e base padrão
        </Button>
        <Button onClick={() => void salvar()} disabled={salvando}>
          {salvando ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}{" "}
          Salvar
        </Button>
      </div>

      <AlertDialog open={confirmarPadrao} onOpenChange={setConfirmarPadrao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar o padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              O prompt e a base de conhecimento voltam ao texto original (do documento do Rodrigo).
              Wi-Fi, modelo e espera não mudam. Só vale depois de clicar em Salvar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  const p = await joyPadrao();
                  setPrompt(p.prompt);
                  setConhecimento(JSON.stringify(p.conhecimento, null, 2));
                  toast.info("Padrão carregado. Clique em Salvar para aplicar.");
                } catch (e) {
                  toast.error(erroTexto(e));
                }
              }}
            >
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================ execuções

function Execucoes() {
  const execucoes = useQuery({
    queryKey: ["joy-execucoes"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("wa_ia_execucoes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as Execucao[];
    },
  });

  const resumo = useMemo(() => {
    const lista = execucoes.data ?? [];
    const porModelo = new Map<string, { n: number; entrada: number; saida: number; ms: number }>();
    for (const e of lista) {
      const r = porModelo.get(e.modelo) ?? { n: 0, entrada: 0, saida: 0, ms: 0 };
      r.n++;
      r.entrada += e.tokens_entrada;
      r.saida += e.tokens_saida;
      r.ms += e.duracao_ms;
      porModelo.set(e.modelo, r);
    }
    return [...porModelo.entries()];
  }, [execucoes.data]);

  if (execucoes.isLoading)
    return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-slate-400" />;
  if (execucoes.error) return <p className="text-sm text-red-600">{erroTexto(execucoes.error)}</p>;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="mb-2 font-semibold text-slate-900">Média por resposta (últimas 200)</h3>
        {resumo.length === 0 && <p className="text-sm text-slate-500">Nenhuma resposta ainda.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {resumo.map(([m, r]) => (
            <div key={m} className="rounded-lg border p-3 text-sm">
              <p className="font-medium text-slate-900">{m}</p>
              <p className="text-slate-600">
                {r.n} respostas · {Math.round(r.entrada / r.n).toLocaleString("pt-BR")} tokens de
                entrada · {Math.round(r.saida / r.n).toLocaleString("pt-BR")} de saída ·{" "}
                {(r.ms / r.n / 1000).toFixed(1)}s
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          O custo em reais aparece no painel do Lovable (Cloud › AI). Com os tokens médios dá para
          estimar o mês.
        </p>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="p-2">Quando</th>
              <th className="p-2">Modelo</th>
              <th className="p-2 text-right">Tokens (ent./saída)</th>
              <th className="p-2">Ferramentas</th>
              <th className="p-2 text-right">Tempo</th>
              <th className="p-2">Obs.</th>
            </tr>
          </thead>
          <tbody>
            {(execucoes.data ?? []).map((e) => (
              <tr key={e.id} className="border-t">
                <td className="whitespace-nowrap p-2">{hora(e.created_at)}</td>
                <td className="p-2">{e.modelo}</td>
                <td className="whitespace-nowrap p-2 text-right">
                  {e.tokens_entrada.toLocaleString("pt-BR")} /{" "}
                  {e.tokens_saida.toLocaleString("pt-BR")}
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {e.ferramentas.map((f, i) => (
                      <Badge
                        key={i}
                        variant={f.ok ? "secondary" : "destructive"}
                        className="text-[10px]"
                      >
                        {NOME_FERRAMENTA[f.nome] ?? f.nome}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="whitespace-nowrap p-2 text-right">
                  {(e.duracao_ms / 1000).toFixed(1)}s
                </td>
                <td className="p-2 text-xs">
                  {e.erro && <span className="text-red-600">{e.erro}</span>}
                  {e.bloqueios.length > 0 && (
                    <span className="text-amber-700">filtro: {e.bloqueios.join(", ")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
