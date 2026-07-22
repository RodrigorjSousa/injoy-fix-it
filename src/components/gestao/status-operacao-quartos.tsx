import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Flame, AlertTriangle, Wrench, User, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type StatusKey = "prontos" | "emFaxina" | "sujos" | "bloqueados";

type Room = {
  id: string;
  room_number: string;
  room_type: string | null;
  status: string | null;
  service_status: string | null;
  condition: string | null;
  assigned_camareira: string | null;
  guest_name: string | null;
  updated_at: string;
};

function classify(r: Pick<Room, "status" | "service_status" | "condition">): StatusKey | null {
  // Bloqueio (manutenção) tem prioridade sobre qualquer outro status
  if (r.condition === "maintenance") return "bloqueados";
  // A produção da camareira é a fonte da verdade: service_status
  if (r.service_status === "done") return "prontos";
  if (r.service_status === "in_progress") return "emFaxina";
  // Fallback pelo status bruto quando service_status estiver ausente
  if (r.status === "clean") return "prontos";
  if (r.status === "cleaning") return "emFaxina";
  if (r.status === "dirty") return "sujos";
  return "sujos";
}

const CARDS: {
  key: StatusKey;
  label: string;
  modalTitle: string;
  icon: typeof CheckCircle2;
  accent: string;
  bg: string;
  border: string;
  ring: string;
  dot: string;
}[] = [
  {
    key: "prontos",
    label: "Prontos / Liberados",
    modalTitle: "Quartos Prontos e Liberados",
    icon: CheckCircle2,
    accent: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    ring: "hover:ring-emerald-300",
    dot: "bg-emerald-500",
  },
  {
    key: "emFaxina",
    label: "Em Faxina",
    modalTitle: "Quartos em Faxina",
    icon: Flame,
    accent: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-100",
    ring: "hover:ring-orange-300",
    dot: "bg-orange-500",
  },
  {
    key: "sujos",
    label: "Sujos (Check-out)",
    modalTitle: "Quartos Sujos (Check-out)",
    icon: AlertTriangle,
    accent: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-100",
    ring: "hover:ring-red-300",
    dot: "bg-red-500",
  },
  {
    key: "bloqueados",
    label: "Bloqueados OS",
    modalTitle: "Quartos Bloqueados (Ordem de Serviço)",
    icon: Wrench,
    accent: "text-sky-600",
    bg: "bg-sky-50",
    border: "border-sky-100",
    ring: "hover:ring-sky-300",
    dot: "bg-sky-500",
  },
];

export function StatusOperacaoQuartos({ unidade }: { unidade: Unidade }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<StatusKey | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchRooms = async () => {
      const { data, error } = await supabase
        .from("room_housekeeping")
        .select(
          "id, room_number, room_type, status, condition, assigned_camareira, guest_name, updated_at",
        )
        .eq("property", unidade)
        .order("room_number", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("[status-operacao-quartos] fetch error", error);
        return;
      }
      setRooms((data ?? []) as Room[]);
    };

    fetchRooms();

    const channel = supabase
      .channel(`mudancas-limpeza-${unidade}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_housekeeping",
          filter: `property=eq.${unidade}`,
        },
        () => fetchRooms(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [unidade]);

  const counters = useMemo(() => {
    const c: Record<StatusKey, number> = { prontos: 0, emFaxina: 0, sujos: 0, bloqueados: 0 };
    for (const r of rooms) {
      const k = classify(r);
      if (k) c[k]++;
    }
    return c;
  }, [rooms]);

  const listaSelecionada = useMemo(() => {
    if (!selected) return [];
    return rooms.filter((r) => classify(r) === selected);
  }, [rooms, selected]);

  const cardSelecionado = CARDS.find((c) => c.key === selected);

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Status da Operação de Quartos
          </p>
          <h3 className="text-base font-black text-slate-900 mt-0.5 truncate">
            INJOY {unidade}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Acompanhamento de andamento em tempo real
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full uppercase tracking-wider">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Tempo real ativo
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setSelected(c.key)}
              className={cn(
                "text-left rounded-xl border p-3 flex items-center gap-3 transition-all",
                "hover:-translate-y-0.5 hover:shadow-md ring-1 ring-transparent",
                "focus:outline-none focus-visible:ring-2",
                c.bg,
                c.border,
                c.ring,
              )}
              aria-label={`Ver ${c.label}`}
            >
              <div className={cn("p-2 rounded-lg bg-white/70", c.accent)}>
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", c.dot)} />
                  <p className="text-[11px] font-semibold text-slate-600 truncate">
                    {c.label}
                  </p>
                </div>
                <p className={cn("text-2xl font-black leading-tight", c.accent)}>
                  {counters[c.key]}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {cardSelecionado && (
                <cardSelecionado.icon className={cn("h-5 w-5", cardSelecionado.accent)} />
              )}
              {cardSelecionado?.modalTitle ?? "Quartos"}
            </DialogTitle>
            <DialogDescription>
              INJOY {unidade} · {listaSelecionada.length}{" "}
              {listaSelecionada.length === 1 ? "quarto" : "quartos"}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {listaSelecionada.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-500">
                Nenhum quarto neste status no momento.
              </div>
            ) : (
              <ul className="space-y-2">
                {listaSelecionada.map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3",
                      cardSelecionado?.bg,
                      cardSelecionado?.border,
                    )}
                  >
                    <div
                      className={cn(
                        "h-11 w-11 shrink-0 rounded-lg bg-white grid place-items-center font-black text-sm",
                        cardSelecionado?.accent,
                      )}
                    >
                      {r.room_number}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          Quarto {r.room_number}
                        </p>
                        {r.room_type && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-white px-1.5 py-0.5 rounded">
                            {r.room_type}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
                        {r.assigned_camareira && (
                          <span className="inline-flex items-center gap-1">
                            <User size={12} /> {r.assigned_camareira}
                          </span>
                        )}
                        {r.guest_name && (
                          <span className="truncate">Hóspede: {r.guest_name}</span>
                        )}
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Clock size={12} />
                          {new Date(r.updated_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
