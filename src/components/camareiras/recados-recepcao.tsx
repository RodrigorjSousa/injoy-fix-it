import { useEffect, useState } from "react";
import { MessageSquare, Check, User, Clock, BellRing } from "lucide-react";
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
 * Seção geral (topo do painel) — mostra apenas recados SEM quarto vinculado.
 * Recados de quartos específicos aparecem no próprio card do quarto.
 */
export function RecadosCamareirasSection({
  unidade,
  camareiraName,
}: {
  unidade: Unidade;
  camareiraName: string;
}) {
  const [recados, setRecados] = useState<Recado[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("recados_camareiras")
      .select("*")
      .eq("property", unidade)
      .eq("direction", "to_camareira")
      .is("room_number", null)
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
      .channel(`recados-camareiras-geral-${unidade}`)
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
            if (!novo.room_number) {
              toast.info("📩 Novo recado geral da recepção");
            }
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
            <MessageSquare size={16} /> Recados Gerais da Recepção
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
                  <span className="text-[10px] font-black uppercase tracking-wider bg-slate-700 text-white px-2 py-0.5 rounded-md">
                    Recado geral
                  </span>
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

/**
 * Recados do quarto — piscando dentro do card para chamar atenção.
 */
export function RecadosDoQuartoSection({
  unidade,
  roomNumber,
  camareiraName,
}: {
  unidade: Unidade;
  roomNumber: string;
  camareiraName: string;
}) {
  const [recados, setRecados] = useState<Recado[]>([]);

  const carregar = async () => {
    const { data, error } = await supabase
      .from("recados_camareiras")
      .select("*")
      .eq("property", unidade)
      .eq("room_number", roomNumber)
      .is("read_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[recados-quarto]", error);
      return;
    }
    setRecados((data ?? []) as Recado[]);
  };

  useEffect(() => {
    carregar();
    const channel = supabase
      .channel(`recados-quarto-${unidade}-${roomNumber}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recados_camareiras",
          filter: `property=eq.${unidade}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Recado | undefined;
          if (!row || row.room_number !== roomNumber) return;
          if (payload.eventType === "INSERT") {
            toast.info(`📩 Novo recado — Quarto ${roomNumber}`);
          }
          carregar();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade, roomNumber]);

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

  if (recados.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 space-y-2 animate-pulse-attention shadow-md shadow-amber-200">
      <div className="flex items-center gap-2">
        <BellRing size={15} className="text-amber-700 animate-bounce" />
        <span className="text-[11px] font-black uppercase tracking-wider text-amber-800">
          Recado da recepção
        </span>
        <span className="ml-auto text-[10px] font-black bg-amber-600 text-white px-2 py-0.5 rounded-full">
          {recados.length}
        </span>
      </div>
      <div className="space-y-2">
        {recados.map((r) => (
          <div
            key={r.id}
            className="bg-white rounded-lg border border-amber-300 p-2.5 space-y-1.5"
          >
            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-snug font-medium">
              {r.message}
            </p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <User size={10} /> {r.created_by_name}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={10} /> {tempoAtras(r.created_at)}
                </span>
              </div>
              <button
                onClick={() => marcarLido(r.id)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg"
              >
                <Check size={12} /> Li
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
