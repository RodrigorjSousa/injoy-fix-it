import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Clock, PlayCircle, Send, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/store";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";

type Auditoria = {
  id: string;
  unidade: string;
  funcionario_id: string;
  funcionario_nome: string;
  gestor_nome: string | null;
  tempo_limite: string;
  prazo_ate: string | null;
  status: "pendente" | "em_andamento" | "concluido";
  relatorio_final: string | null;
};

export function AuditoriaFuncionarioCard({ unidade }: { unidade: Unidade }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const funcionarioId = me?.funcionario?.id;
  const [openRelatorio, setOpenRelatorio] = useState(false);
  const [relatorio, setRelatorio] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: auditoria } = useQuery({
    queryKey: ["auditoria_almox_me", unidade, funcionarioId],
    enabled: !!funcionarioId,
    queryFn: async (): Promise<Auditoria | null> => {
      const { data, error } = await supabase
        .from("auditorias_almoxarifado" as never)
        .select("*")
        .eq("unidade", unidade)
        .eq("funcionario_id", funcionarioId!)
        .in("status", ["pendente", "em_andamento"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const arr = (data as unknown as Auditoria[]) ?? [];
      return arr[0] ?? null;
    },
    refetchInterval: 20000,
  });

  if (!auditoria) return null;

  const iniciar = async () => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("auditorias_almoxarifado" as never)
        .update({ status: "em_andamento", iniciado_em: new Date().toISOString() } as never)
        .eq("id", auditoria.id);
      if (error) throw error;
      toast.success("Auditoria iniciada. Boa sorte!");
      qc.invalidateQueries({ queryKey: ["auditoria_almox_me"] });
      qc.invalidateQueries({ queryKey: ["auditorias_almox"] });
      setOpenRelatorio(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao iniciar");
    } finally {
      setBusy(false);
    }
  };

  const enviarRelatorio = async () => {
    if (!relatorio.trim()) {
      toast.error("Preencha o relatório antes de enviar");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("auditorias_almoxarifado" as never)
        .update({
          status: "concluido",
          concluido_em: new Date().toISOString(),
          relatorio_final: relatorio.trim(),
        } as never)
        .eq("id", auditoria.id);
      if (error) throw error;
      toast.success("Relatório enviado para o gestor");
      setOpenRelatorio(false);
      setRelatorio("");
      qc.invalidateQueries({ queryKey: ["auditoria_almox_me"] });
      qc.invalidateQueries({ queryKey: ["auditorias_almox"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setBusy(false);
    }
  };

  const prazoTxt = auditoria.prazo_ate
    ? new Date(auditoria.prazo_ate).toLocaleString("pt-BR")
    : auditoria.tempo_limite;
  const emAndamento = auditoria.status === "em_andamento";

  return (
    <>
      <div className={cn(
        "rounded-2xl p-5 border-2 shadow-xl",
        emAndamento
          ? "bg-gradient-to-br from-blue-600 to-indigo-700 border-blue-300 text-white"
          : "bg-gradient-to-br from-amber-500 to-orange-600 border-amber-300 text-white animate-pulse",
      )}>
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-xl bg-white/20 grid place-items-center shrink-0">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black uppercase tracking-wider">📋 Auditoria de Almoxarifado Designada!</h3>
            <p className="text-xs text-white/90 mt-1">
              Você foi escalado(a) pelo gestor <strong>{auditoria.gestor_nome ?? "-"}</strong> em INJOY {auditoria.unidade}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 bg-white/20 px-2 py-1 rounded-full font-bold">
                <Clock size={12} /> Prazo: {auditoria.tempo_limite}
              </span>
              {auditoria.prazo_ate && (
                <span className="inline-flex items-center gap-1 bg-white/20 px-2 py-1 rounded-full">
                  até {prazoTxt}
                </span>
              )}
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
              {!emAndamento ? (
                <button
                  onClick={iniciar}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-orange-700 font-black text-sm shadow hover:shadow-lg disabled:opacity-60"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                  Iniciar Auditoria
                </button>
              ) : (
                <button
                  onClick={() => setOpenRelatorio(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-blue-700 font-black text-sm shadow hover:shadow-lg"
                >
                  <Send size={14} />
                  Enviar Relatório Final
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {openRelatorio && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={() => !busy && setOpenRelatorio(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-black text-slate-800">Relatório de Auditoria</h3>
                <p className="text-[11px] text-slate-500">
                  Descreva o fechamento do estoque em INJOY {auditoria.unidade}
                </p>
              </div>
              <button onClick={() => setOpenRelatorio(false)} className="h-8 w-8 rounded-lg hover:bg-slate-100 grid place-items-center text-slate-500">
                <X size={16} />
              </button>
            </div>
            <textarea
              value={relatorio}
              onChange={(e) => setRelatorio(e.target.value)}
              rows={8}
              placeholder="O que encontrou? Itens em falta, divergências, observações…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button
                onClick={() => setOpenRelatorio(false)}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={enviarRelatorio}
                disabled={busy || !relatorio.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Enviar para o Gestor
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
