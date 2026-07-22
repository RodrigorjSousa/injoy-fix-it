import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type LogRow = {
  id: string;
  room_number: string;
  guest_name: string;
  password: string;
  entrada: string;
  saida: string;
  device_ids: string[];
  senha_ids: Record<string, string | number> | null;
  unidade: string | null;
  generated_by_name: string | null;
  created_at: string;
  revoked_at: string | null;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function SenhasAtivasPanel({ unidade }: { unidade: string }) {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tuya_password_logs")
      .select("id,room_number,guest_name,password,entrada,saida,device_ids,senha_ids,unidade,generated_by_name,created_at,revoked_at")
      .eq("unidade", unidade)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(30);
    setLoading(false);
    if (error) return toast.error("Erro ao carregar senhas ativas: " + error.message);
    setRows((data ?? []) as LogRow[]);
  }, [unidade]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const revogar = async (row: LogRow) => {
    if (!confirm(`Revogar AGORA a senha do quarto ${row.room_number} (${row.guest_name})?\n\nA fechadura Zigbee deixará de aceitar essa senha imediatamente. Portão/porta de vidro (senha fixa) NÃO são afetados.`)) return;
    setRevoking(row.id);
    try {
      const items = Object.entries(row.senha_ids ?? {})
        .filter(([, pid]) => pid && String(pid) !== "senha_fixa")
        .map(([deviceId, passwordId]) => ({ deviceId, passwordId }));

      if (items.length > 0) {
        const { data, error } = await supabase.functions.invoke("tuya-password", {
          body: { action: "revoke", items, roomNumber: row.room_number, unidade: row.unidade },
        });
        if (error) throw error;
        const partial = Array.isArray(data?.revokes) && data.revokes.some((r: { success: boolean }) => !r.success);
        if (partial) toast.warning("Algumas fechaduras não confirmaram a revogação. Verifique nos logs.");
      }

      const { data: userData } = await supabase.auth.getUser();
      let nome: string | null = null;
      if (userData?.user?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("nome")
          .eq("id", userData.user.id)
          .maybeSingle();
        nome = prof?.nome ?? userData.user.email ?? null;
      }

      const { error: upErr } = await supabase
        .from("tuya_password_logs")
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by_name: nome ?? "manual",
          revoke_reason: "manual:recepcao",
        })
        .eq("id", row.id);
      if (upErr) throw upErr;

      toast.success(`Senha do quarto ${row.room_number} revogada.`);
      refresh();
    } catch (e) {
      toast.error("Falha ao revogar: " + (e as Error).message);
    } finally {
      setRevoking(null);
    }
  };

  return (
    <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <header className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 grid place-items-center text-white shadow-sm">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900">Painel de Emergência · Senhas Ativas</h2>
            <p className="text-xs text-slate-500">Revogue imediatamente qualquer senha de quarto (Zigbee) em uso.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
          title="Atualizar"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </header>

      {loading && rows === null ? (
        <div className="py-6 flex justify-center text-slate-400"><Loader2 className="animate-spin" size={20} /></div>
      ) : (rows ?? []).length === 0 ? (
        <p className="text-sm text-slate-500 py-2">Nenhuma senha ativa no momento.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {(rows ?? []).map((row) => {
            const expirada = new Date(row.saida).getTime() < Date.now();
            return (
              <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 truncate">
                    Quarto {row.room_number} · {row.guest_name}
                    {expirada && (
                      <span className="ml-2 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">EXPIRADA</span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {fmt(row.entrada)} → {fmt(row.saida)} · gerada por {row.generated_by_name ?? "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revogar(row)}
                  disabled={revoking === row.id}
                  className="text-[11px] font-bold px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center gap-1 disabled:opacity-60"
                >
                  {revoking === row.id ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}
                  Revogar agora
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
