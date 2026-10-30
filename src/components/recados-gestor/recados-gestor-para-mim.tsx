import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { recadoEhPara, setoresDaPessoa, textoDestino, type AlvoRecado } from "@/lib/recados-gestor";

type Recado = {
  id: string;
  created_at: string;
  gestor_nome: string;
  unidade: string;
  alvo: AlvoRecado | null;
  setor: string | null;
  setores: string[] | null;
  destinatarios: string[] | null;
  destinatarios_nomes: string[] | null;
  mensagem: string;
  midia_url: string | null;
  midia_tipo: "foto" | "video" | null;
};

/** Recados antigos (sem lista de destinatários) aparecem só por este tempo. */
const DIAS_RECADO_ANTIGO = 30;

async function urlAssinada(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from("recados-midia").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/**
 * Recados do gestor para quem está logado, no topo de qualquer tela. Ficam piscando até a pessoa
 * tocar em "Ciente" (o gestor vê quem já leu em Recado do Gestor › Enviados). Gestor/admin não veem.
 */
export function RecadosGestorParaMim() {
  const { data: me } = useMe();
  const [recados, setRecados] = useState<Recado[]>([]);
  const [lidos, setLidos] = useState<Set<string>>(new Set());
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [ampliada, setAmpliada] = useState<Recado | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);

  const gestor = !!(me?.isAdmin || me?.isGestor);
  const userId = me?.userId ?? null;
  const meusSetores = useMemo(
    () =>
      setoresDaPessoa({
        roles: [
          me?.isRecepcao && "recepcao",
          me?.isCamareira && "camareira",
          me?.isFuncionario && "funcionario",
        ].filter(Boolean) as string[],
        categorias: me?.funcionario?.categorias ?? [],
        telas: me?.funcionario?.telasPermitidas ?? null,
      }),
    [me],
  );

  const carregar = useCallback(async () => {
    if (!userId || gestor) return;
    const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const [{ data, error }, { data: l }] = await Promise.all([
      supabase
        .from("recados_gestor")
        .select("*")
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("recados_gestor_leituras" as never)
        .select("recado_id")
        .eq("user_id", userId),
    ]);
    if (error) {
      console.error("[RecadosGestorParaMim]", error.message);
      return;
    }
    const limiteAntigo = Date.now() - DIAS_RECADO_ANTIGO * 86_400_000;
    const meus = ((data ?? []) as unknown as Recado[]).filter(
      (r) =>
        recadoEhPara(r, userId, meusSetores) &&
        (r.destinatarios?.length || Date.parse(r.created_at) >= limiteAntigo),
    );
    setRecados(meus);
    setLidos(new Set(((l ?? []) as unknown as { recado_id: string }[]).map((x) => x.recado_id)));
    const mapa: Record<string, string> = {};
    await Promise.all(
      meus
        .filter((r) => r.midia_url)
        .map(async (r) => {
          const u = await urlAssinada(r.midia_url);
          if (u) mapa[r.id] = u;
        }),
    );
    setUrls(mapa);
  }, [userId, gestor, meusSetores]);

  useEffect(() => {
    if (!userId || gestor) return;
    void carregar();
    const canal = supabase
      .channel(`recados-gestor-para-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "recados_gestor" }, () => {
        void carregar();
      })
      .subscribe();
    const iv = setInterval(() => void carregar(), 5 * 60_000);
    return () => {
      supabase.removeChannel(canal);
      clearInterval(iv);
    };
  }, [userId, gestor, carregar]);

  const ciente = async (r: Recado) => {
    setMarcando(r.id);
    try {
      const { error } = await supabase
        .from("recados_gestor_leituras" as never)
        .insert({ recado_id: r.id, nome: me?.funcionario?.nome ?? me?.email ?? null } as never);
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
      setLidos((prev) => new Set(prev).add(r.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível marcar como ciente.");
    } finally {
      setMarcando(null);
    }
  };

  const pendentes = recados.filter((r) => !lidos.has(r.id));
  if (gestor || !pendentes.length) return null;

  return (
    <div className="space-y-3 p-3 md:p-4">
      <style>{`
        @keyframes recado-blink {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.7); border-color: rgb(220,38,38); background-color: rgb(254,226,226); }
          50% { box-shadow: 0 0 0 12px rgba(220,38,38,0); border-color: rgb(153,27,27); background-color: rgb(254,202,202); }
        }
      `}</style>
      {pendentes.map((r) => (
        <div
          key={r.id}
          className="rounded-2xl border-4 border-red-600 bg-red-50 p-4 shadow-2xl"
          style={{ animation: "recado-blink 1s ease-in-out infinite" }}
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 animate-bounce rounded-full bg-red-600 p-2 text-white">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-black uppercase leading-tight tracking-wide text-red-700 md:text-lg">
                🚨 Mensagem do gestor: {r.gestor_nome}
              </h3>
              <p className="text-[11px] font-bold text-red-700/80">
                {r.alvo === "pessoas" ? "Para você" : `Para: ${textoDestino(r)}`} ·{" "}
                {r.unidade === "Ambas" ? "Botafogo e Ipanema" : r.unidade}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-red-900 md:text-base">
                {r.mensagem}
              </p>
              <p className="mt-1 text-[11px] font-bold text-red-700">
                {new Date(r.created_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              {r.midia_url && urls[r.id] && (
                <div className="mt-3">
                  {r.midia_tipo === "foto" ? (
                    <button
                      type="button"
                      onClick={() => setAmpliada(r)}
                      className="block overflow-hidden rounded-lg border-2 border-red-400 transition hover:border-red-600"
                    >
                      <img
                        src={urls[r.id]}
                        alt="Anexo do gestor"
                        className="max-h-48 object-cover"
                      />
                    </button>
                  ) : (
                    <video
                      src={urls[r.id]}
                      controls
                      className="max-h-56 w-full rounded-lg border-2 border-red-400 bg-black"
                    />
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => ciente(r)}
                disabled={marcando === r.id}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-black text-white shadow hover:bg-red-800 disabled:opacity-60"
              >
                {marcando === r.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Ciente
              </button>
            </div>
          </div>
        </div>
      ))}
      <Dialog open={!!ampliada} onOpenChange={(o) => !o && setAmpliada(null)}>
        <DialogContent className="max-w-3xl p-2">
          {ampliada && urls[ampliada.id] && (
            <img src={urls[ampliada.id]} alt="Anexo" className="h-auto w-full rounded" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
