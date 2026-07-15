import { useEffect, useState } from "react";
import { MessageSquare, Check, User, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Unidade = "Botafogo" | "Ipanema";

type Recado = {
  id: string;
  property: Unidade;
  room_number: string | null;
  message: string;
  created_by_name: string;
  read_at: string | null;
  read_by: string | null;
  created_at: string;
};

type Props = {
  unidade: Unidade;
  camareiraName: string;
};

function tempoAtras(iso: string) {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin} min atrás`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h} h atrás`;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function RecadosCamareirasSection({ unidade, camareiraName }: Props) {
  const [recados, setRecados] = useState<Recado[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("recados_camareiras")
      .select("*")
      .eq("property", unidade)
      .is("read_at", null)
      .order("created_at", { ascending: false });
    setCarregando(false);
    if (error) {
      console.error("[recados-camareiras]", error);
      return;
    }
    setRecados((data ?? []) as Recado[]);
  };

  useEffect(() => {
    carregar();
    const channel = supabase
      .channel(`recados-camareiras-${unidade}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recados_camareiras",
          filter: `property=eq.${unidade}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const novo = payload.new as Recado;
            toast.info(
              novo.room_number
                ? `📩 Novo recado — Quarto ${novo.room_number}`
                : "📩 Novo recado geral da recepção",
            );
          }
          carregar();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade]);

  const marcarLido = async (id: string) => {
    const { error } = await supabase
      .from("recados_camareiras")
      .update({
        read_at: new Date().toISOString(),
        read_by: camareiraName || "Camareira",
      })
      .eq("id", id);
    if (error) {
      toast.error("Falha ao marcar como lido");
      return;
    }
    setRecados((prev) => prev.filter((r) => r.id !== id));
  };

  if (!carregando && recados.length === 0) return null;

  return (
    <div className="px-4 pt-2 pb-1">
      <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/60 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-blue-900 flex items-center gap-2 uppercase tracking-wide">
            <MessageSquare size={16} /> Recados da Recepção
            <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full">
              {recados.length}
            </span>
          </h3>
        </div>
        <div className="space-y-2">
          {recados.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-xl border border-blue-200 p-3 shadow-sm space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.room_number ? (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white px-2 py-0.5 rounded-md">
                      Quarto {r.room_number}
                    </span>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-slate-700 text-white px-2 py-0.5 rounded-md">
                      Recado geral
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock size={11} /> {tempoAtras(r.created_at)}
                  </span>
                </div>
                <button
                  onClick={() => marcarLido(r.id)}
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg"
                >
                  <Check size={12} /> Li
                </button>
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-snug">
                {r.message}
              </p>
              <p className="text-[10px] text-slate-500 flex items-center gap-1">
                <User size={11} /> {r.created_by_name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
