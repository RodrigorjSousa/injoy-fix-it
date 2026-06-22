import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Send, MessageSquare, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
});

interface Contato {
  id: string;
  nome: string;
  email: string;
  role: "gestor" | "funcionario" | "outro";
  naoLidas: number;
  ultimaEm: string | null;
}

interface Mensagem {
  id: string;
  remetente_id: string;
  destinatario_id: string;
  conteudo: string;
  created_at: string;
  lida_em: string | null;
}

function ChatPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const contatosQuery = useQuery({
    queryKey: ["chat-contatos", me?.userId],
    enabled: !!me?.userId,
    queryFn: async (): Promise<Contato[]> => {
      const [{ data: profiles, error: pErr }, { data: roles }, { data: msgs }] = await Promise.all([
        supabase.from("profiles").select("id, nome").neq("id", me!.userId),
        supabase.from("user_roles").select("user_id, role"),
        supabase
          .from("mensagens")
          .select("remetente_id, destinatario_id, lida_em, created_at")
          .or(`remetente_id.eq.${me!.userId},destinatario_id.eq.${me!.userId}`),
      ]);
      if (pErr) throw pErr;
      const roleMap = new Map<string, "gestor" | "funcionario" | "outro">();
      (roles ?? []).forEach((r) => {
        const cur = roleMap.get(r.user_id);
        // prioriza gestor
        if (cur !== "gestor") roleMap.set(r.user_id, (r.role as "gestor" | "funcionario") ?? "outro");
      });
      const lastMap = new Map<string, string>();
      const unreadMap = new Map<string, number>();
      (msgs ?? []).forEach((m) => {
        const other = m.remetente_id === me!.userId ? m.destinatario_id : m.remetente_id;
        const prev = lastMap.get(other);
        if (!prev || prev < m.created_at) lastMap.set(other, m.created_at);
        if (m.destinatario_id === me!.userId && !m.lida_em) {
          unreadMap.set(other, (unreadMap.get(other) ?? 0) + 1);
        }
      });
      const list: Contato[] = (profiles ?? []).map((p) => ({
        id: p.id,
        nome: p.nome ?? p.email,
        email: p.email,
        role: roleMap.get(p.id) ?? "outro",
        naoLidas: unreadMap.get(p.id) ?? 0,
        ultimaEm: lastMap.get(p.id) ?? null,
      }));
      list.sort((a, b) => {
        if (a.ultimaEm && b.ultimaEm) return b.ultimaEm.localeCompare(a.ultimaEm);
        if (a.ultimaEm) return -1;
        if (b.ultimaEm) return 1;
        return a.nome.localeCompare(b.nome);
      });
      return list;
    },
  });

  const mensagensQuery = useQuery({
    queryKey: ["chat-mensagens", me?.userId, selecionado],
    enabled: !!me?.userId && !!selecionado,
    queryFn: async (): Promise<Mensagem[]> => {
      const { data, error } = await supabase
        .from("mensagens")
        .select("id, remetente_id, destinatario_id, conteudo, created_at, lida_em")
        .or(
          `and(remetente_id.eq.${me!.userId},destinatario_id.eq.${selecionado}),and(remetente_id.eq.${selecionado},destinatario_id.eq.${me!.userId})`,
        )
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Mensagem[];
    },
  });

  const enviar = useMutation({
    mutationFn: async (conteudo: string) => {
      if (!me?.userId || !selecionado) return;
      const { error } = await supabase.from("mensagens").insert({
        remetente_id: me.userId,
        destinatario_id: selecionado,
        conteudo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-mensagens", me?.userId, selecionado] });
      qc.invalidateQueries({ queryKey: ["chat-contatos", me?.userId] });
    },
  });

  // Realtime: nova mensagem envolvendo o usuário
  useEffect(() => {
    if (!me?.userId) return;
    const channel = supabase
      .channel(`mensagens-${me.userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mensagens" },
        (payload) => {
          const row = (payload.new ?? payload.old) as Mensagem | undefined;
          if (!row) return;
          if (row.remetente_id !== me.userId && row.destinatario_id !== me.userId) return;
          qc.invalidateQueries({ queryKey: ["chat-contatos", me.userId] });
          qc.invalidateQueries({ queryKey: ["chat-mensagens", me.userId, selecionado] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me?.userId, selecionado, qc]);

  // Marcar como lidas ao abrir
  useEffect(() => {
    if (!me?.userId || !selecionado) return;
    void supabase
      .from("mensagens")
      .update({ lida_em: new Date().toISOString() })
      .eq("destinatario_id", me.userId)
      .eq("remetente_id", selecionado)
      .is("lida_em", null)
      .then(() => qc.invalidateQueries({ queryKey: ["chat-contatos", me.userId] }));
  }, [me?.userId, selecionado, qc, mensagensQuery.data?.length]);

  const contatos = contatosQuery.data ?? [];
  const contatoAtual = useMemo(
    () => contatos.find((c) => c.id === selecionado) ?? null,
    [contatos, selecionado],
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Chat</h1>
        <p className="text-sm text-muted-foreground">Converse com o gestor e os funcionários</p>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[480px]">
        {/* Lista de contatos */}
        <aside
          className={cn(
            "rounded-xl border bg-card overflow-hidden flex flex-col",
            selecionado && "hidden lg:flex",
          )}
        >
          <div className="px-4 py-3 border-b text-sm font-medium">Conversas</div>
          <div className="flex-1 overflow-y-auto">
            {contatos.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Nenhum contato disponível.
              </div>
            )}
            {contatos.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelecionado(c.id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors flex items-center gap-3",
                  selecionado === c.id && "bg-muted",
                )}
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 text-primary grid place-items-center font-semibold shrink-0">
                  {c.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm truncate">{c.nome}</div>
                    {c.naoLidas > 0 && (
                      <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                        {c.naoLidas}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.role === "gestor" ? "Gestor" : c.role === "funcionario" ? "Funcionário" : c.email}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Conversa */}
        <section
          className={cn(
            "rounded-xl border bg-card flex flex-col overflow-hidden",
            !selecionado && "hidden lg:flex",
          )}
        >
          {!contatoAtual ? (
            <div className="flex-1 grid place-items-center text-center px-6">
              <div>
                <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <div className="font-medium">Selecione uma conversa</div>
                <div className="text-sm text-muted-foreground">
                  Escolha um contato na lista para começar.
                </div>
              </div>
            </div>
          ) : (
            <ConversaView
              meId={me!.userId}
              contato={contatoAtual}
              mensagens={mensagensQuery.data ?? []}
              onVoltar={() => setSelecionado(null)}
              onEnviar={(t) => enviar.mutate(t)}
              enviando={enviar.isPending}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ConversaView({
  meId,
  contato,
  mensagens,
  onVoltar,
  onEnviar,
  enviando,
}: {
  meId: string;
  contato: Contato;
  mensagens: Mensagem[];
  onVoltar: () => void;
  onEnviar: (texto: string) => void;
  enviando: boolean;
}) {
  const [texto, setTexto] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [mensagens.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    onEnviar(t);
    setTexto("");
  };

  return (
    <>
      <header className="px-4 py-3 border-b flex items-center gap-3">
        <button
          onClick={onVoltar}
          className="lg:hidden p-1 -ml-1 rounded hover:bg-muted"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary grid place-items-center font-semibold">
          {contato.nome.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{contato.nome}</div>
          <div className="text-xs text-muted-foreground truncate">
            {contato.role === "gestor" ? "Gestor" : contato.role === "funcionario" ? "Funcionário" : contato.email}
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-muted/20">
        {mensagens.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Nenhuma mensagem ainda. Envie a primeira!
          </div>
        )}
        {mensagens.map((m) => {
          const mine = m.remetente_id === meId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                  mine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-card border rounded-bl-sm",
                )}
              >
                <div className="whitespace-pre-wrap break-words">{m.conteudo}</div>
                <div
                  className={cn(
                    "text-[10px] mt-1 opacity-70",
                    mine ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} className="border-t p-3 flex items-center gap-2 bg-card">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Mensagem..."
          autoFocus
        />
        <Button type="submit" size="icon" disabled={!texto.trim() || enviando}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </>
  );
}
