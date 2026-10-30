import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  ImagePlus,
  Loader2,
  Megaphone,
  Search,
  Trash2,
  User,
  Users,
  Video,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compression";
import { cn } from "@/lib/utils";
import { useFuncionarios, useUsuariosComRoles } from "@/lib/store";
import {
  resolverDestinatarios,
  setoresDaPessoa,
  SETOR_RECADO_LABEL,
  SETORES_RECADO,
  textoDestino,
  type AlvoRecado,
  type PessoaEquipe,
  type SetorRecado,
} from "@/lib/recados-gestor";

type Unidade = "Botafogo" | "Ipanema" | "Ambas";

type RecadoEnviado = {
  id: string;
  created_at: string;
  unidade: string;
  alvo: AlvoRecado | null;
  setor: string | null;
  setores: string[] | null;
  destinatarios: string[] | null;
  destinatarios_nomes: string[] | null;
  mensagem: string;
};
type Leitura = { recado_id: string; user_id: string; nome: string | null; lido_em: string };

/** Equipe com login: cadastro de funcionários + papéis (quem só tem papel também entra). */
function useEquipe(): PessoaEquipe[] {
  const { data: funcionarios = [] } = useFuncionarios();
  const { data: usuarios = [] } = useUsuariosComRoles();
  return useMemo(() => {
    const roles = new Map<string, string[]>();
    for (const u of usuarios) {
      roles.set(
        u.userId,
        [
          u.isAdmin && "admin",
          u.isGestor && "gestor",
          u.isRecepcao && "recepcao",
          u.isCamareira && "camareira",
          u.isFuncionario && "funcionario",
        ].filter(Boolean) as string[],
      );
    }
    const out = new Map<string, PessoaEquipe>();
    for (const f of funcionarios) {
      if (!f.userId || out.has(f.userId)) continue;
      out.set(f.userId, {
        userId: f.userId,
        nome: f.nome,
        roles: roles.get(f.userId) ?? [],
        categorias: f.categorias,
        telas: f.telasPermitidas,
      });
    }
    for (const u of usuarios) {
      if (out.has(u.userId) || !(roles.get(u.userId) ?? []).length) continue;
      out.set(u.userId, {
        userId: u.userId,
        nome: u.nome,
        roles: roles.get(u.userId) ?? [],
        categorias: [],
        telas: null,
      });
    }
    return [...out.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [funcionarios, usuarios]);
}

export function RecadorGestorModal({
  open,
  onOpenChange,
  gestorNome,
  gestorId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  gestorNome: string;
  gestorId: string;
}) {
  const qc = useQueryClient();
  const equipe = useEquipe();
  const [aba, setAba] = useState("enviar");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [alvo, setAlvo] = useState<AlvoRecado | null>(null);
  const [setores, setSetores] = useState<SetorRecado[]>([]);
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [verLista, setVerLista] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [midia, setMidia] = useState<{
    file: File;
    tipo: "foto" | "video";
    preview: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setAba("enviar");
      setStep(1);
      setUnidade(null);
      setAlvo(null);
      setSetores([]);
      setPessoas([]);
      setBusca("");
      setVerLista(false);
      setMensagem("");
      if (midia) URL.revokeObjectURL(midia.preview);
      setMidia(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const destinatarios = useMemo(
    () => (alvo ? resolverDestinatarios(alvo, { setores, pessoas }, equipe) : []),
    [alvo, setores, pessoas, equipe],
  );
  const escolhiveis = useMemo(() => {
    const t = busca.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    return equipe
      .filter((p) => !p.roles.includes("gestor") && !p.roles.includes("admin"))
      .filter((p) => !t || p.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(t));
  }, [equipe, busca]);

  const destinoTexto =
    alvo === "todos"
      ? "Todos os funcionários"
      : alvo === "setor"
        ? textoDestino({ alvo: "setor", setores })
        : textoDestino({ alvo: "pessoas", destinatarios_nomes: destinatarios.map((d) => d.nome) });

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const compressed = await compressImage(f);
      if (midia) URL.revokeObjectURL(midia.preview);
      setMidia({ file: compressed, tipo: "foto", preview: URL.createObjectURL(compressed) });
    } catch {
      toast.error("Não foi possível processar a foto.");
    }
  };

  const handleVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 60 * 1024 * 1024) {
      toast.error("Vídeo muito grande (máx. 60MB).");
      return;
    }
    const url = URL.createObjectURL(f);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      if (v.duration > 15.5) {
        URL.revokeObjectURL(url);
        toast.error(`O vídeo tem ${Math.round(v.duration)}s. O limite é 15 segundos.`);
        return;
      }
      if (midia) URL.revokeObjectURL(midia.preview);
      setMidia({ file: f, tipo: "video", preview: url });
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("Não foi possível ler o vídeo.");
    };
    v.src = url;
  };

  const removerMidia = () => {
    if (midia) URL.revokeObjectURL(midia.preview);
    setMidia(null);
  };

  const enviar = async () => {
    if (!unidade || !alvo || !mensagem.trim()) {
      toast.error("Preencha unidade, destinatários e mensagem.");
      return;
    }
    if (!destinatarios.length) {
      toast.error("Ninguém vai receber: escolha outro setor ou pessoa.");
      return;
    }
    setSaving(true);
    try {
      let midia_url: string | null = null;
      let midia_tipo: "foto" | "video" | null = null;
      if (midia) {
        const ext = midia.file.name.split(".").pop() || (midia.tipo === "foto" ? "jpg" : "mp4");
        const path = `${gestorId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("recados-midia")
          .upload(path, midia.file, { contentType: midia.file.type, upsert: false });
        if (upErr) throw upErr;
        midia_url = path;
        midia_tipo = midia.tipo;
      }
      const { error } = await supabase.from("recados_gestor").insert({
        gestor_id: gestorId,
        gestor_nome: gestorNome,
        unidade,
        alvo,
        setor: alvo === "setor" && setores.length === 1 ? setores[0] : null,
        setores: alvo === "setor" ? setores : null,
        destinatarios: destinatarios.map((d) => d.userId),
        destinatarios_nomes: destinatarios.map((d) => d.nome),
        mensagem: mensagem.trim(),
        midia_url,
        midia_tipo,
      } as never);
      if (error) throw error;
      toast.success(`Recado enviado para ${destinoTexto} (${destinatarios.length} pessoa(s)).`);
      qc.invalidateQueries({ queryKey: ["recados_gestor_enviados"] });
      onOpenChange(false);
    } catch (err) {
      console.error("[RecadorGestor] erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao enviar recado.");
    } finally {
      setSaving(false);
    }
  };

  const escolherAlvo = (a: AlvoRecado) => {
    setAlvo(a);
    setVerLista(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-red-500" />
            Recado do Gestor
          </DialogTitle>
          <DialogDescription>
            Enviando como <strong>{gestorNome}</strong>
          </DialogDescription>
        </DialogHeader>

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="enviar">Enviar</TabsTrigger>
            <TabsTrigger value="enviados">Enviados</TabsTrigger>
          </TabsList>

          <TabsContent value="enviar" className="space-y-4 pt-2">
            <p className="text-xs text-slate-500">Passo {step} de 3</p>

            {step === 1 && (
              <div className="space-y-3">
                <Label className="text-sm font-bold">1. Unidade do recado</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Botafogo", "Ipanema", "Ambas"] as Unidade[]).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => {
                        setUnidade(u);
                        setStep(2);
                      }}
                      className={cn(
                        "rounded-xl border-2 p-4 font-black transition",
                        unidade === u
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-slate-200 hover:border-red-400 hover:bg-red-50/50",
                      )}
                    >
                      🏢 {u === "Ambas" ? "As duas" : u}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <Label className="text-sm font-bold">2. Para quem?</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["todos", "Todos", Users],
                      ["setor", "Setores", Megaphone],
                      ["pessoas", "Escolher pessoas", User],
                    ] as const
                  ).map(([v, label, Icon]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => escolherAlvo(v)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-sm font-bold transition",
                        alvo === v
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-slate-200 hover:border-red-400 hover:bg-red-50/50",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {label}
                    </button>
                  ))}
                </div>

                {alvo === "setor" && (
                  <div className="grid grid-cols-2 gap-2">
                    {SETORES_RECADO.map((s) => {
                      const on = setores.includes(s);
                      const qtd = resolverDestinatarios("setor", { setores: [s] }, equipe).length;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() =>
                            setSetores((prev) => (on ? prev.filter((x) => x !== s) : [...prev, s]))
                          }
                          className={cn(
                            "rounded-xl border-2 p-3 text-left text-sm font-bold transition",
                            on
                              ? "border-red-500 bg-red-50 text-red-700"
                              : "border-slate-200 hover:border-red-300",
                          )}
                        >
                          {on ? "☑" : "☐"} {SETOR_RECADO_LABEL[s]}
                          <span className="block text-[11px] font-normal text-slate-500">
                            {qtd} pessoa(s)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {alvo === "pessoas" && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        className="pl-9"
                        placeholder="Buscar funcionário (ex.: Flavio)"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                      />
                    </div>
                    <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                      {escolhiveis.map((p) => {
                        const on = pessoas.includes(p.userId as string);
                        const meus = [...setoresDaPessoa(p)].map((s) => SETOR_RECADO_LABEL[s]);
                        return (
                          <li key={p.userId}>
                            <label className="flex cursor-pointer items-center gap-3 p-2.5 hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() =>
                                  setPessoas((prev) =>
                                    on
                                      ? prev.filter((x) => x !== p.userId)
                                      : [...prev, p.userId as string],
                                  )
                                }
                                className="h-4 w-4"
                              />
                              <span className="flex-1">
                                <span className="font-semibold">{p.nome}</span>
                                {meus.length > 0 && (
                                  <span className="block text-[11px] text-slate-500">
                                    {meus.join(" · ")}
                                  </span>
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                      {!escolhiveis.length && (
                        <li className="p-4 text-center text-sm text-slate-500">
                          Ninguém encontrado.
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {alvo && (
                  <div className="rounded-lg bg-slate-100 p-3 text-xs">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between font-semibold"
                      onClick={() => setVerLista((v) => !v)}
                    >
                      <span>
                        Vai para <strong>{destinatarios.length}</strong> pessoa(s)
                      </span>
                      {destinatarios.length > 0 && (
                        <ChevronDown
                          className={cn("h-4 w-4 transition-transform", verLista && "rotate-180")}
                        />
                      )}
                    </button>
                    {verLista && destinatarios.length > 0 && (
                      <p className="mt-2 text-slate-600">
                        {destinatarios.map((d) => d.nome).join(", ")}
                      </p>
                    )}
                    {alvo === "todos" && (
                      <p className="mt-1 text-slate-500">
                        Todos os funcionários com acesso ao app (menos gestores).
                      </p>
                    )}
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                    ← Voltar
                  </Button>
                  <Button
                    size="sm"
                    disabled={!destinatarios.length}
                    onClick={() => setStep(3)}
                    className="bg-red-600 font-bold text-white hover:bg-red-700"
                  >
                    Continuar
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-slate-100 p-3 text-xs">
                  📤 Para: <strong>{destinoTexto}</strong> · {destinatarios.length} pessoa(s) ·{" "}
                  <strong>{unidade === "Ambas" ? "Botafogo e Ipanema" : unidade}</strong>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="msg" className="text-sm font-bold">
                    3. Mensagem
                  </Label>
                  <Textarea
                    id="msg"
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value.slice(0, 800))}
                    placeholder="Escreva aqui o recado…"
                    rows={4}
                    maxLength={800}
                  />
                  <p className="text-right text-[10px] text-slate-500">{mensagem.length}/800</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-bold">Anexar mídia (opcional)</Label>
                  {!midia ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fotoRef.current?.click()}
                        className="flex-1"
                      >
                        <ImagePlus className="mr-1 h-4 w-4" /> Foto
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => videoRef.current?.click()}
                        className="flex-1"
                      >
                        <Video className="mr-1 h-4 w-4" /> Vídeo (15s)
                      </Button>
                      <input
                        ref={fotoRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFoto}
                      />
                      <input
                        ref={videoRef}
                        type="file"
                        accept="video/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleVideo}
                      />
                    </div>
                  ) : (
                    <div className="relative overflow-hidden rounded-lg border bg-slate-50">
                      {midia.tipo === "foto" ? (
                        <img
                          src={midia.preview}
                          alt="preview"
                          className="max-h-56 w-full object-contain"
                        />
                      ) : (
                        <video src={midia.preview} controls className="max-h-56 w-full" />
                      )}
                      <button
                        type="button"
                        onClick={removerMidia}
                        className="absolute right-2 top-2 rounded-full bg-red-600 p-1 text-white shadow"
                        aria-label="Remover mídia"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setStep(2)} disabled={saving}>
                    ← Voltar
                  </Button>
                  <Button
                    onClick={enviar}
                    disabled={saving || !mensagem.trim()}
                    className="bg-red-600 font-bold text-white hover:bg-red-700"
                  >
                    {saving ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Megaphone className="mr-1 h-4 w-4" />
                    )}
                    Enviar recado
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="enviados" className="pt-2">
            <RecadosEnviados ativo={open && aba === "enviados"} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Últimos recados com quem já tocou em "Ciente". */
function RecadosEnviados({ ativo }: { ativo: boolean }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["recados_gestor_enviados"],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recados_gestor")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      const recados = (data ?? []) as unknown as RecadoEnviado[];
      const ids = recados.map((r) => r.id);
      let leituras: Leitura[] = [];
      if (ids.length) {
        const { data: l } = await supabase
          .from("recados_gestor_leituras" as never)
          .select("recado_id, user_id, nome, lido_em")
          .in("recado_id", ids);
        leituras = (l ?? []) as unknown as Leitura[];
      }
      return { recados, leituras };
    },
  });

  const remover = async (id: string) => {
    if (!confirm("Apagar este recado? Ele some da tela de quem recebeu.")) return;
    const { data, error } = await supabase
      .from("recados_gestor")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("Não foi possível apagar (sem permissão).");
    toast.success("Recado apagado.");
    qc.invalidateQueries({ queryKey: ["recados_gestor_enviados"] });
  };

  if (q.isLoading)
    return (
      <div className="grid place-items-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  if (q.error) return <p className="text-sm text-red-600">{(q.error as Error).message}</p>;
  const recados = q.data?.recados ?? [];
  if (!recados.length)
    return <p className="py-8 text-center text-sm text-slate-500">Nenhum recado enviado.</p>;

  return (
    <ul className="space-y-2">
      {recados.map((r) => {
        const lidos = (q.data?.leituras ?? []).filter((l) => l.recado_id === r.id);
        const total = r.destinatarios?.length ?? 0;
        const lidosIds = new Set(lidos.map((l) => l.user_id));
        const faltam = (r.destinatarios ?? [])
          .map((id, i) => (lidosIds.has(id) ? null : (r.destinatarios_nomes?.[i] ?? "—")))
          .filter(Boolean) as string[];
        return (
          <li key={r.id} className="rounded-lg border p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-red-700">
                  Para: {textoDestino(r)} ·{" "}
                  {r.unidade === "Ambas" ? "Botafogo e Ipanema" : r.unidade}
                </p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm">{r.mensagem}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {new Date(r.created_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remover(r.id)}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Apagar recado"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {total > 0 && (
              <button
                type="button"
                onClick={() => setAberto(aberto === r.id ? null : r.id)}
                className="mt-2 flex w-full items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-xs font-semibold"
              >
                <span className={lidos.length === total ? "text-emerald-700" : "text-slate-700"}>
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                  Ciente: {lidos.length} de {total}
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", aberto === r.id && "rotate-180")}
                />
              </button>
            )}
            {aberto === r.id && (
              <div className="mt-2 space-y-1 text-xs">
                {lidos.map((l) => (
                  <p key={l.user_id} className="text-emerald-700">
                    ✓ {l.nome ?? "—"} ·{" "}
                    {new Date(l.lido_em).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                ))}
                {faltam.length > 0 && (
                  <p className="text-amber-700">
                    <Clock className="mr-1 inline h-3 w-3" />
                    Ainda não viram: {faltam.join(", ")}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
