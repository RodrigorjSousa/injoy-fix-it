import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMe } from "@/lib/store";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type Setor = "manutencao" | "recepcao" | "camareiras";
type Unidade = "Botafogo" | "Ipanema";

type Recado = {
  id: string;
  created_at: string;
  gestor_nome: string;
  unidade: Unidade;
  setor: Setor;
  mensagem: string;
  midia_url: string | null;
  midia_tipo: "foto" | "video" | null;
};

async function resolveSignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from("recados-midia").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export function RecadosGestorAlert({
  setor,
  unidade,
}: {
  setor: Setor;
  unidade: Unidade;
}) {
  const { data: me } = useMe();
  const [recados, setRecados] = useState<Recado[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Recado | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const podeRemover = Boolean(me?.isAdmin || me?.isGestor);

  useEffect(() => {
    let cancelled = false;
    const fetchRecados = async () => {
      const { data, error } = await supabase
        .from("recados_gestor")
        .select("*")
        .eq("setor", setor)
        .eq("unidade", unidade)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[RecadosGestorAlert]", error);
        return;
      }
      if (cancelled) return;
      const rows = (data ?? []) as Recado[];
      setRecados(rows);
      const map: Record<string, string> = {};
      await Promise.all(
        rows
          .filter((r) => r.midia_url)
          .map(async (r) => {
            const url = await resolveSignedUrl(r.midia_url);
            if (url) map[r.id] = url;
          }),
      );
      if (!cancelled) setSignedUrls(map);
    };

    fetchRecados();

    const channel = supabase
      .channel(`recados-gestor-${setor}-${unidade}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recados_gestor",
          filter: `setor=eq.${setor}`,
        },
        () => fetchRecados(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [setor, unidade]);

  const remover = async (id: string) => {
    if (!podeRemover) return;
    if (!confirm("Remover este recado?")) return;
    setRemovingId(id);
    try {
      const { error } = await supabase.from("recados_gestor").delete().eq("id", id);
      if (error) throw error;
      toast.success("Recado removido.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    } finally {
      setRemovingId(null);
    }
  };

  if (recados.length === 0) return null;

  return (
    <div className="space-y-3">
      {recados.map((r) => (
        <div
          key={r.id}
          className="relative rounded-2xl border-4 border-red-600 bg-red-50 p-4 shadow-2xl animate-pulse-attention"
          style={{
            animation: "recado-blink 1s ease-in-out infinite",
          }}
        >
          <style>{`
            @keyframes recado-blink {
              0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.7); border-color: rgb(220,38,38); background-color: rgb(254,226,226); }
              50% { box-shadow: 0 0 0 12px rgba(220,38,38,0); border-color: rgb(153,27,27); background-color: rgb(254,202,202); }
            }
          `}</style>

          {podeRemover && (
            <button
              type="button"
              onClick={() => remover(r.id)}
              disabled={removingId === r.id}
              className="absolute top-2 right-2 rounded-full bg-red-700 text-white p-1.5 hover:bg-red-800 disabled:opacity-50"
              aria-label="Remover recado"
            >
              {removingId === r.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </button>
          )}

          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-full bg-red-600 p-2 text-white animate-bounce">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1 pr-8">
              <h3 className="text-base md:text-lg font-black text-red-700 uppercase tracking-wide leading-tight">
                🚨 MENSAGEM DO GESTOR: {r.gestor_nome}
              </h3>
              <p className="mt-2 text-sm md:text-base text-red-900 font-semibold whitespace-pre-wrap">
                {r.mensagem}
              </p>
              <p className="mt-1 text-[11px] text-red-700 font-bold">
                {new Date(r.created_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>

              {r.midia_url && signedUrls[r.id] && (
                <div className="mt-3">
                  {r.midia_tipo === "foto" ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(r)}
                      className="block rounded-lg overflow-hidden border-2 border-red-400 hover:border-red-600 transition"
                    >
                      <img
                        src={signedUrls[r.id]}
                        alt="Anexo do gestor"
                        className="max-h-48 object-cover"
                      />
                    </button>
                  ) : (
                    <video
                      src={signedUrls[r.id]}
                      controls
                      className="max-h-56 w-full rounded-lg border-2 border-red-400 bg-black"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <Dialog open={!!expanded} onOpenChange={(o) => !o && setExpanded(null)}>
        <DialogContent className="max-w-3xl p-2">
          {expanded && signedUrls[expanded.id] && (
            <img src={signedUrls[expanded.id]} alt="Anexo" className="w-full h-auto rounded" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
