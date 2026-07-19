import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingBag,
  Loader2,
  Inbox,
  Check,
  Ban,
  Package,
  Clock,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  property: string;
  requested_by: string;
  requester_role: string;
  item_name: string;
  quantity: number;
  unit: string | null;
  category: string | null;
  urgency: string;
  notes: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const STATUS_META: Record<
  string,
  { label: string; cls: string; icon: typeof Check }
> = {
  pending: { label: "Pendente", cls: "bg-amber-100 text-amber-700", icon: Clock },
  approved: { label: "Aprovado", cls: "bg-blue-100 text-blue-700", icon: Check },
  purchased: {
    label: "Comprado",
    cls: "bg-emerald-100 text-emerald-700",
    icon: Package,
  },
  rejected: { label: "Recusado", cls: "bg-red-100 text-red-700", icon: Ban },
};

const URGENCY_META: Record<string, string> = {
  baixa: "bg-slate-100 text-slate-600",
  normal: "bg-blue-100 text-blue-700",
  urgente: "bg-red-100 text-red-700",
};

export function SolicitacoesCompraPanel({
  unidade,
}: {
  unidade: "Botafogo" | "Ipanema";
}) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const canManage = !!(me?.isAdmin || me?.isGestor);
  const reviewer = me?.funcionario?.nome || me?.email || "Gestor";
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "pending" | "approved" | "purchased" | "rejected">(
    "pending",
  );

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["purchase_requests", unidade],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_requests" as never)
        .select("*")
        .eq("property", unidade)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
    refetchInterval: 20000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["purchase_requests"] });

  const filtradas = useMemo(
    () => rows.filter((r) => filtro === "todos" || r.status === filtro),
    [rows, filtro],
  );

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, purchased: 0, rejected: 0 };
    rows.forEach((r) => {
      if (r.status in c) c[r.status as keyof typeof c] += 1;
    });
    return c;
  }, [rows]);

  const updateStatus = async (r: Row, status: "approved" | "purchased" | "rejected") => {
    setBusyId(r.id);
    try {
      const { error } = await supabase
        .from("purchase_requests" as never)
        .update({
          status,
          reviewed_by: reviewer,
          reviewed_at: new Date().toISOString(),
        } as never)
        .eq("id", r.id);
      if (error) throw error;
      toast.success(`Solicitação ${STATUS_META[status].label.toLowerCase()}`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar");
    } finally {
      setBusyId(null);
    }
  };

  const excluir = async (r: Row) => {
    if (!confirm(`Excluir solicitação de "${r.item_name}"?`)) return;
    setBusyId(r.id);
    try {
      const { error } = await supabase
        .from("purchase_requests" as never)
        .delete()
        .eq("id", r.id);
      if (error) throw error;
      toast.success("Solicitação excluída");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir");
    } finally {
      setBusyId(null);
    }
  };

  const TABS: { key: typeof filtro; label: string; count?: number }[] = [
    { key: "pending", label: "Pendentes", count: counts.pending },
    { key: "approved", label: "Aprovadas", count: counts.approved },
    { key: "purchased", label: "Compradas", count: counts.purchased },
    { key: "rejected", label: "Recusadas", count: counts.rejected },
    { key: "todos", label: "Todas" },
  ];

  const hasPending = counts.pending > 0;
  const [isOpen, setIsOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (hasPending && !autoOpened) {
      setIsOpen(true);
      setAutoOpened(true);
    }
    if (!hasPending) setAutoOpened(false);
  }, [hasPending, autoOpened]);

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border shadow-sm transition-colors",
        hasPending ? "border-red-300 ring-1 ring-red-200" : "border-slate-200",
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-amber-100 text-amber-700 grid place-items-center">
            <ShoppingBag size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800">
              🛒 Solicitações de Compra
            </h3>
            <p className="text-[11px] text-slate-500">
              Pedidos da equipe para novos materiais
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-[11px] font-bold px-2 py-0.5 rounded-full",
              hasPending
                ? "bg-red-500 text-white animate-pulse"
                : "bg-slate-100 text-slate-500",
            )}
          >
            {counts.pending} pendente(s)
          </span>
          <ChevronDown
            size={18}
            className={cn("text-slate-500 transition-transform", isOpen && "rotate-180")}
          />
        </div>
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1.5">

        {TABS.map((t) => {
          const active = filtro === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setFiltro(t.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                active
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {t.label}
              {typeof t.count === "number" && (
                <span className="ml-1 opacity-70">({t.count})</span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate-500">
          <Loader2 className="animate-spin inline mr-2" size={16} />
          Carregando…
        </div>
      ) : filtradas.length === 0 ? (
        <div className="p-8 text-center text-slate-400">
          <Inbox className="mx-auto mb-2" size={28} />
          <p className="text-sm">Nenhuma solicitação nesta categoria.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {filtradas.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.pending;
            const busy = busyId === r.id;
            return (
              <li key={r.id} className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                          meta.cls,
                        )}
                      >
                        {meta.label}
                      </span>
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                          URGENCY_META[r.urgency] ?? URGENCY_META.normal,
                        )}
                      >
                        {r.urgency}
                      </span>
                      {r.category && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          {r.category}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-800 mt-2">
                      <span className="font-black text-amber-700">
                        {r.quantity} {r.unit || ""}
                      </span>{" "}
                      de <span className="font-black">{r.item_name}</span>
                    </p>
                    {r.notes && (
                      <p className="text-xs text-slate-600 mt-1 italic">"{r.notes}"</p>
                    )}
                    <p className="text-[11px] text-slate-500 mt-2">
                      Solicitado por <span className="font-bold">{r.requested_by}</span>{" "}
                      ({r.requester_role}) ·{" "}
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                      {r.reviewed_by && (
                        <>
                          {" "}
                          · Revisado por <span className="font-bold">{r.reviewed_by}</span>
                        </>
                      )}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {r.status === "pending" && (
                        <>
                          <button
                            onClick={() => updateStatus(r, "approved")}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-black text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
                          >
                            {busy ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Check size={12} />
                            )}
                            Aprovar
                          </button>
                          <button
                            onClick={() => updateStatus(r, "rejected")}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-black text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
                          >
                            <Ban size={12} />
                            Recusar
                          </button>
                        </>
                      )}
                      {r.status === "approved" && (
                        <button
                          onClick={() => updateStatus(r, "purchased")}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-black text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Package size={12} />
                          )}
                          Marcar Comprado
                        </button>
                      )}
                      <button
                        onClick={() => excluir(r)}
                        disabled={busy}
                        title="Excluir"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
