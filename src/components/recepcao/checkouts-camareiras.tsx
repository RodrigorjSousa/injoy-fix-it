// Check-outs feitos pelas camareiras (Ipanema não tem recepção) para a Recepção conferir.
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, LogOut, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

type LogCheckout = {
  id: string;
  property: string;
  room_number: string;
  guest_name: string | null;
  reservation_id: string | null;
  camareira_name: string;
  created_at: string;
  status?: "confirmado" | "nao_confirmado" | "falhou" | null;
  cloudbeds_status?: string | null;
  erro?: string | null;
  conferido_nome?: string | null;
  conferido_em?: string | null;
};

const ESTADO = {
  confirmado: { txt: "Confirmado no Cloudbeds", cls: "border-emerald-300 bg-emerald-50", Icon: CheckCircle2, cor: "text-emerald-700" },
  nao_confirmado: { txt: "Feito, mas o Cloudbeds não confirmou: confira", cls: "border-amber-300 bg-amber-50", Icon: AlertTriangle, cor: "text-amber-700" },
  falhou: { txt: "NÃO foi feito no Cloudbeds: faça você", cls: "border-red-300 bg-red-50", Icon: XCircle, cor: "text-red-700" },
} as const;

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function CheckoutsCamareirasSection() {
  const qc = useQueryClient();
  const hoje = todaySP();
  useEffect(() => {
    const ch = supabase
      .channel(`checkouts-camareiras-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cloudbeds_checkout_logs" }, (p) => {
        if (p.eventType === "INSERT") {
          const r = p.new as LogCheckout;
          const st = r.status ?? "confirmado";
          const msg = `Check-out ${r.property} · quarto ${r.room_number}: ${ESTADO[st].txt}`;
          if (st === "confirmado") toast.success(msg);
          else toast.error(msg, { duration: 15000 });
        }
        void qc.invalidateQueries({ queryKey: ["checkouts-camareiras"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const q = useQuery({
    queryKey: ["checkouts-camareiras", hoje],
    refetchInterval: 60_000,
    queryFn: async (): Promise<LogCheckout[]> => {
      const desde = new Date(`${hoje}T00:00:00-03:00`).toISOString();
      const { data, error } = await supabase
        .from("cloudbeds_checkout_logs")
        .select("*")
        .gte("created_at", desde)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LogCheckout[];
    },
  });

  const conferir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(
        "checkout_log_conferir",
        { _id: id },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkouts-camareiras"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível marcar"),
  });

  const lista = q.data ?? [];
  if (q.error) return <p className="px-4 pt-3 text-xs text-red-600">Check-outs das camareiras: {(q.error as Error).message}</p>;
  if (!lista.length) return null;
  const pendentes = lista.filter((l) => !l.conferido_em).length;

  return (
    <div className="px-4 pt-3">
      <div className="space-y-2 rounded-2xl border-2 border-rose-200 bg-rose-50/50 p-3">
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-rose-900">
          <LogOut size={16} /> Check-outs feitos pelas camareiras (hoje)
          {pendentes > 0 && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] text-white">{pendentes} a conferir</span>}
        </h3>
        <div className="space-y-2">
          {lista.map((l) => {
            const e = ESTADO[l.status ?? "confirmado"];
            return (
              <div key={l.id} className={cn("space-y-1.5 rounded-xl border bg-white p-3 shadow-sm", e.cls)}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-900">
                    {l.property} · Quarto {l.room_number}
                    <span className="ml-2 text-xs font-semibold text-slate-500">{hora(l.created_at)}</span>
                  </p>
                  <span className={cn("inline-flex items-center gap-1 text-xs font-black", e.cor)}>
                    <e.Icon size={14} /> {e.txt}
                  </span>
                </div>
                <p className="text-xs text-slate-700">
                  Hóspede: <b>{l.guest_name ?? "—"}</b> · por {l.camareira_name}
                  {l.reservation_id ? ` · reserva ${l.reservation_id}` : ""}
                </p>
                {l.erro && <p className="text-xs font-semibold text-red-700">Motivo: {l.erro}</p>}
                {l.conferido_em ? (
                  <p className="text-[11px] font-semibold text-emerald-700">
                    Conferido por {l.conferido_nome ?? "Recepção"} às {hora(l.conferido_em)}
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={conferir.isPending}
                    onClick={() => conferir.mutate(l.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <CheckCircle2 size={12} /> Conferi no Cloudbeds
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
