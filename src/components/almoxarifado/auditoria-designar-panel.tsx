import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Loader2, Plus, Printer, User, Clock, CheckCircle2, PlayCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useFuncionarios } from "@/lib/store";
import type { Unidade } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  iniciado_em: string | null;
  concluido_em: string | null;
  created_at: string;
};

const STATUS_STYLE: Record<Auditoria["status"], { label: string; badge: string; icon: React.ReactNode }> = {
  pendente: { label: "Pendente", badge: "bg-amber-100 text-amber-700 border-amber-200", icon: <Clock size={12} /> },
  em_andamento: { label: "Em andamento", badge: "bg-blue-100 text-blue-700 border-blue-200", icon: <PlayCircle size={12} /> },
  concluido: { label: "Concluído", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 size={12} /> },
};

function parsePrazo(input: string): string | null {
  const t = input.trim().toLowerCase();
  if (!t) return null;
  const m = t.match(/^(\d+)\s*(h|hora|horas|d|dia|dias|min|minuto|minutos)?$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2] ?? "h";
  const ms =
    unit.startsWith("d") ? n * 24 * 60 * 60 * 1000 :
    unit.startsWith("min") ? n * 60 * 1000 :
    n * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

export function AuditoriaDesignarPanel({ unidade }: { unidade: Unidade }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: funcionarios = [] } = useFuncionarios();
  const [funcId, setFuncId] = useState("");
  const [tempo, setTempo] = useState("2 horas");
  const [saving, setSaving] = useState(false);

  const { data: auditorias = [], isLoading } = useQuery({
    queryKey: ["auditorias_almox", unidade],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auditorias_almoxarifado" as never)
        .select("*")
        .eq("unidade", unidade)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as unknown as Auditoria[]) ?? [];
    },
    refetchInterval: 30000,
  });

  const funcSelecionado = useMemo(
    () => funcionarios.find((f) => f.id === funcId),
    [funcionarios, funcId],
  );

  const designar = async () => {
    if (!funcSelecionado) {
      toast.error("Selecione um funcionário");
      return;
    }
    if (!tempo.trim()) {
      toast.error("Informe o tempo de responsabilidade");
      return;
    }
    setSaving(true);
    try {
      const prazo_ate = parsePrazo(tempo);
      const { error } = await supabase
        .from("auditorias_almoxarifado" as never)
        .insert({
          unidade,
          funcionario_id: funcSelecionado.id,
          funcionario_nome: funcSelecionado.nome,
          gestor_id: me?.userId ?? null,
          gestor_nome: me?.funcionario?.nome ?? "Gestor",
          tempo_limite: tempo.trim(),
          prazo_ate,
          status: "pendente",
        } as never);
      if (error) throw error;
      toast.success(`Auditoria designada para ${funcSelecionado.nome}`);
      setFuncId("");
      setTempo("2 horas");
      qc.invalidateQueries({ queryKey: ["auditorias_almox"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao designar auditoria");
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir esta auditoria?")) return;
    try {
      const { error } = await supabase
        .from("auditorias_almoxarifado" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Auditoria removida");
      qc.invalidateQueries({ queryKey: ["auditorias_almox"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir");
    }
  };

  const imprimirOrdem = (a: Auditoria) => {
    const prazoTxt = a.prazo_ate
      ? new Date(a.prazo_ate).toLocaleString("pt-BR")
      : a.tempo_limite;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      toast.error("Habilite pop-ups para imprimir");
      return;
    }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ordem de Auditoria — ${a.funcionario_nome}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;padding:40px;line-height:1.5;}
  h1{margin:0;font-size:22px;letter-spacing:.5px;}
  .sub{color:#475569;font-size:13px;}
  .box{border:2px solid #0f172a;border-radius:12px;padding:20px;margin-top:24px;}
  .row{display:flex;justify-content:space-between;gap:16px;margin:8px 0;}
  .label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;font-weight:700;}
  .val{font-size:16px;font-weight:700;}
  .notes{margin-top:32px;border-top:1px dashed #94a3b8;padding-top:12px;}
  .lines{margin-top:12px;}
  .line{border-bottom:1px solid #cbd5e1;height:28px;}
  .sign{margin-top:60px;display:flex;justify-content:space-between;gap:40px;}
  .sign div{flex:1;text-align:center;border-top:1px solid #0f172a;padding-top:6px;font-size:12px;color:#334155;}
  @media print{ body{padding:20px;} }
</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <h1>INJOY HOTÉIS</h1>
      <div class="sub">Ordem de Auditoria de Almoxarifado</div>
    </div>
    <div style="text-align:right;font-size:12px;color:#475569;">
      Emitido em<br><strong>${new Date().toLocaleString("pt-BR")}</strong>
    </div>
  </div>
  <div class="box">
    <div class="row"><div><div class="label">Unidade</div><div class="val">INJOY ${a.unidade}</div></div>
      <div><div class="label">Status</div><div class="val">${STATUS_STYLE[a.status].label}</div></div></div>
    <div class="row"><div><div class="label">Funcionário Escalado</div><div class="val">${a.funcionario_nome}</div></div>
      <div><div class="label">Designado por</div><div class="val">${a.gestor_nome ?? "-"}</div></div></div>
    <div class="row"><div><div class="label">Tempo de Responsabilidade</div><div class="val">${a.tempo_limite}</div></div>
      <div><div class="label">Prazo Limite</div><div class="val">${prazoTxt}</div></div></div>
  </div>
  <div class="notes">
    <div class="label">Anotações e Contagem Manual</div>
    <div class="lines">
      ${Array.from({ length: 14 }).map(() => '<div class="line"></div>').join("")}
    </div>
  </div>
  <div class="sign">
    <div>Assinatura do Funcionário</div>
    <div>Assinatura do Gestor</div>
  </div>
  <script>window.onload=()=>{window.print();};</script>
</body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-9 w-9 rounded-xl bg-indigo-100 text-indigo-700 grid place-items-center">
            <ClipboardList size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800">Designar Auditoria de Almoxarifado</h3>
            <p className="text-[11px] text-slate-500">
              Escale um funcionário responsável em INJOY {unidade}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <User size={12} /> Funcionário
            </label>
            <Select value={funcId} onValueChange={setFuncId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {funcionarios.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Clock size={12} /> Tempo de responsabilidade
            </label>
            <input
              type="text"
              value={tempo}
              onChange={(e) => setTempo(e.target.value)}
              placeholder="Ex.: 2 horas, 30 min, 1 dia"
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-slate-400 mt-1">Formatos: "2 horas", "30 min", "1 dia"</p>
          </div>
          <div className="flex items-end">
            <button
              onClick={designar}
              disabled={saving || !funcId}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Designar Auditoria
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-800">Histórico de Auditorias</h3>
            <p className="text-[11px] text-slate-500">Últimas 100 designações em {unidade}</p>
          </div>
          <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
            {auditorias.length}
          </span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">
            <Loader2 className="animate-spin inline mr-2" size={16} />Carregando…
          </div>
        ) : auditorias.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Nenhuma auditoria designada ainda.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {auditorias.map((a) => {
              const st = STATUS_STYLE[a.status];
              const prazo = a.prazo_ate ? new Date(a.prazo_ate) : null;
              const vencido = prazo && a.status !== "concluido" && prazo < new Date();
              return (
                <li key={a.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-800">{a.funcionario_nome}</span>
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border", st.badge)}>
                        {st.icon}{st.label}
                      </span>
                      {vencido && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                          Prazo vencido
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Prazo: <strong>{a.tempo_limite}</strong>
                      {prazo && <> · até {prazo.toLocaleString("pt-BR")}</>}
                      {" · designado em "}
                      {new Date(a.created_at).toLocaleString("pt-BR")}
                    </p>
                    {a.relatorio_final && (
                      <p className="text-xs mt-2 text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2 whitespace-pre-wrap">
                        <strong>Relatório: </strong>{a.relatorio_final}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => imprimirOrdem(a)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-black bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                    >
                      <Printer size={12} /> Imprimir
                    </button>
                    <button
                      onClick={() => excluir(a.id)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-black bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
