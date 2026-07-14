import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Ban, Package, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  property: string;
  requested_by: string;
  item_id: string;
  quantity: number;
  purpose: string | null;
  status: string;
  audited_by: string | null;
  created_at: string;
  item?: { id: string; name: string; unit_type: string; current_stock: number };
};

export function AuditoriaAlmoxarifadoPanel({ unidade }: { unidade: "Botafogo" | "Ipanema" }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const nomeRecepcao = me?.funcionario?.nome || "Recepção";
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: pendentes = [], isLoading } = useQuery({
    queryKey: ["inv_requests_pending", unidade],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_requests" as never)
        .select("*, item:inventory_items(id,name,unit_type,current_stock)")
        .eq("property", unidade)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
    refetchInterval: 15000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inv_requests_pending"] });
    qc.invalidateQueries({ queryKey: ["inv_requests_history"] });
    qc.invalidateQueries({ queryKey: ["inv_items"] });
  };

  const aprovar = async (r: Row) => {
    setBusyId(r.id);
    try {
      const estoque = r.item?.current_stock ?? 0;
      if (r.quantity > estoque) {
        toast.error(`Estoque insuficiente (${estoque} disponíveis)`);
        return;
      }
      const { error: e1 } = await supabase
        .from("inventory_requests" as never)
        .update({ status: "approved", audited_by: nomeRecepcao } as never)
        .eq("id", r.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("inventory_items" as never)
        .update({ current_stock: estoque - r.quantity } as never)
        .eq("id", r.item_id);
      if (e2) throw e2;

      toast.success("Retirada aprovada e estoque atualizado");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao aprovar");
    } finally {
      setBusyId(null);
    }
  };

  const recusar = async (r: Row) => {
    setBusyId(r.id);
    try {
      const { error } = await supabase
        .from("inventory_requests" as never)
        .update({ status: "rejected", audited_by: nomeRecepcao } as never)
        .eq("id", r.id);
      if (error) throw error;
      toast.success("Solicitação recusada");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao recusar");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-purple-100 text-purple-700 grid place-items-center">
            <Package size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800">📥 Auditoria de Almoxarifado</h3>
            <p className="text-[11px] text-slate-500">Fila de retiradas aguardando aprovação</p>
          </div>
        </div>
        <span className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
          {pendentes.length} pendentes
        </span>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate-500">
          <Loader2 className="animate-spin inline mr-2" size={16} />
          Carregando…
        </div>
      ) : pendentes.length === 0 ? (
        <div className="p-8 text-center text-slate-400">
          <Inbox className="mx-auto mb-2" size={28} />
          <p className="text-sm">Nenhuma solicitação pendente.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {pendentes.map((r) => {
            const busy = busyId === r.id;
            return (
              <li key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800">
                    <span className="font-black">{r.requested_by}</span> solicitou{" "}
                    <span className="font-black text-purple-700">
                      {r.quantity} {r.item?.unit_type ?? ""}
                    </span>{" "}
                    de{" "}
                    <span className="font-black">{r.item?.name ?? "Item removido"}</span>
                    {r.purpose ? (
                      <>
                        {" "}para <span className="font-bold text-blue-700">{r.purpose}</span>
                      </>
                    ) : null}
                    .
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {new Date(r.created_at).toLocaleString("pt-BR")} · Estoque atual:{" "}
                    {r.item?.current_stock ?? "?"}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => aprovar(r)}
                    disabled={busy}
                    className={cn(
                      "inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-black text-white",
                      "bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50",
                    )}
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Aprovar
                  </button>
                  <button
                    onClick={() => recusar(r)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-black text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
                  >
                    <Ban size={12} />
                    Recusar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
