import { useEffect, useState } from "react";
import { MessageSquare, Check, User, Clock, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";

type Recado = {
  id: string;
  property: string;
  room_number: string | null;
  message: string;
  created_by_name: string;
  read_at: string | null;
  created_at: string;
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

/**
 * Painel na recepção com os recados enviados PARA as camareiras que ainda
 * estão ativos. Apenas recepção/gestor podem remover (marcar como lido).
 */
export function RecadosEnviadosCamareiraSection({
  unidade,
  autorNome,
}: {
  unidade: Unidade;
  autorNome: string;
}) {
  const [recados, setRecados] = useState<Recado[]>([]);

  const carregar = async () => {
    const { data, error } = await supabase
      .from("recados_camareiras")
      .select("*")
      .eq("property", unidade)
      .eq("direction", "to_camareira")
      .is("read_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[recados-enviados-camareira]", error);
      return;
    }
    setRecados((data ?? []) as Recado[]);
  };

  useEffect(() => {
    carregar();
    const channel = supabase
      .channel(`recados-enviados-camareira-${unidade}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recados_camareiras",
          filter: `property=eq.${unidade}`,
        },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade]);

  const remover = async (id: string) => {
    const { error } = await supabase
      .from("recados_camareiras")
      .update({
        read_at: new Date().toISOString(),
        read_by: autorNome || "Recepção",
      })
      .eq("id", id);
    if (error) {
      toast.error("Falha ao remover recado");
      return;
    }
    toast.success("Recado removido");
    setRecados((prev) => prev.filter((r) => r.id !== id));
  };

  if (recados.length === 0) return null;

  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/60 p-3 space-y-2">
        <h3 className="text-sm font-black text-blue-900 flex items-center gap-2 uppercase tracking-wide">
          <MessageSquare size={16} /> Recados enviados às camareiras
          <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full">
            {recados.length}
          </span>
        </h3>
        <div className="space-y-2">
          {recados.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-xl border border-blue-200 p-3 shadow-sm space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.room_number ? (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-amber-600 text-white px-2 py-0.5 rounded-md flex items-center gap-1">
                      <DoorOpen size={10} /> Quarto {r.room_number}
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
                  onClick={() => remover(r.id)}
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg"
                >
                  <Check size={12} /> Remover
                </button>
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-snug">
                {r.message}
              </p>
              <p className="text-[10px] text-slate-500 flex items-center gap-1">
                <User size={11} /> Enviado por {r.created_by_name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
