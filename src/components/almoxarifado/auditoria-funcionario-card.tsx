import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Clock, PlayCircle, Send, Loader2, X, Printer, CheckCircle2 } from "lucide-react";
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

type InventarioItem = {
  id: string;
  name: string;
  sector: string;
  unit_type: string;
  current_stock: number;
};

type LinhaContagem = {
  itemId: string;
  name: string;
  sector: string;
  unit_type: string;
  contagem: string;
  observacao: string;
};

type ConferenciaConcluida = {
  auditoria: Auditoria;
  linhas: LinhaContagem[];
  observacaoGeral: string;
  statusCaixa: string;
  concluidoEm: string;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function imprimirConferencia(dados: ConferenciaConcluida) {
  const { auditoria, linhas, observacaoGeral, statusCaixa, concluidoEm } = dados;
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    toast.error("Habilite pop-ups para imprimir");
    return;
  }

  const linhasTabela = linhas.length > 0
    ? linhas
        .map(
          (l) => `
      <tr>
        <td class="c-item">${escapeHtml(l.name)}</td>
        <td class="c-cat">${escapeHtml(l.sector)}<div class="unit">${escapeHtml(l.unit_type || "")}</div></td>
        <td class="c-count"><div class="count-val">${escapeHtml(l.contagem || "—")}</div></td>
        <td class="c-obs">${escapeHtml(l.observacao || "")}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" style="text-align:center;padding:24px;color:#555;font-style:italic;">
        Nenhum item conferido.
      </td></tr>`;

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Conferência de Auditoria — ${escapeHtml(auditoria.funcionario_nome)}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:"Times New Roman",Georgia,serif;color:#000;padding:24px 28px;line-height:1.4;background:#fff;}
  h1{margin:0;font-size:22px;letter-spacing:1px;font-weight:900;}
  .sub{font-size:12px;letter-spacing:.5px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px double #000;padding-bottom:10px;margin-bottom:14px;}
  .meta{border:1.5px solid #000;padding:10px 12px;margin-bottom:14px;}
  .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;}
  .label{font-size:10px;text-transform:uppercase;letter-spacing:.15em;font-weight:700;}
  .val{font-size:13px;font-weight:700;margin-top:2px;}
  table{width:100%;border-collapse:collapse;margin-top:6px;}
  thead th{border:1.5px solid #000;background:#f0f0f0;padding:8px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;text-align:left;}
  tbody td{border:1px solid #000;padding:8px 6px;font-size:12px;vertical-align:middle;}
  .c-item{width:34%;font-weight:600;}
  .c-cat{width:22%;}
  .c-cat .unit{font-size:9px;color:#444;text-transform:uppercase;letter-spacing:.05em;margin-top:2px;}
  .c-count{width:16%;text-align:center;}
  .count-val{border:1.5px solid #000;padding:4px 6px;font-weight:900;font-size:14px;background:#fafafa;min-height:24px;text-align:center;}
  .c-obs{width:28%;font-style:italic;}
  .obs-geral{margin-top:16px;border:1.5px solid #000;padding:10px 12px;}
  .obs-geral .label{margin-bottom:4px;}
  .obs-geral .text{font-size:12px;white-space:pre-wrap;min-height:40px;}
  .sign{margin-top:36px;page-break-inside:avoid;}
  .sign-line{border-bottom:1.5px solid #000;height:32px;margin-top:22px;}
  .sign-label{font-size:11px;margin-top:4px;}
  tbody tr{page-break-inside:avoid;}
  thead{display:table-header-group;}
  @page{size:A4;margin:14mm 12mm;}
  @media print{body{padding:0;}}
</style></head><body>
  <div class="header">
    <div>
      <h1>INJOY HOTÉIS</h1>
      <div class="sub">Conferência de Auditoria de Almoxarifado — CONCLUÍDA</div>
    </div>
    <div style="text-align:right;font-size:11px;">
      Encerrada em<br><strong>${new Date(concluidoEm).toLocaleString("pt-BR")}</strong>
    </div>
  </div>

  <div class="meta">
    <div class="meta-grid">
      <div><div class="label">Unidade</div><div class="val">INJOY ${escapeHtml(auditoria.unidade)}</div></div>
      <div><div class="label">Auditor</div><div class="val">${escapeHtml(auditoria.funcionario_nome)}</div></div>
      <div><div class="label">Designado por</div><div class="val">${escapeHtml(auditoria.gestor_nome ?? "-")}</div></div>
      <div><div class="label">Data/Hora do Encerramento</div><div class="val">${new Date(concluidoEm).toLocaleString("pt-BR")}</div></div>
      <div><div class="label">Prazo Original</div><div class="val">${escapeHtml(auditoria.tempo_limite)}</div></div>
      <div><div class="label">Status Final do Caixa / Estoque</div><div class="val">${escapeHtml(statusCaixa || "Fechado sem divergências")}</div></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="c-item">Item / Insumo</th>
        <th class="c-cat">Categoria / Setor</th>
        <th class="c-count">Contagem Física</th>
        <th class="c-obs">Divergência / Observações</th>
      </tr>
    </thead>
    <tbody>${linhasTabela}</tbody>
  </table>

  ${observacaoGeral.trim() ? `
  <div class="obs-geral">
    <div class="label">Observações Gerais do Auditor</div>
    <div class="text">${escapeHtml(observacaoGeral)}</div>
  </div>` : ""}

  <div class="sign">
    <div class="sign-line"></div>
    <div class="sign-label">Assinatura do Funcionário: ${escapeHtml(auditoria.funcionario_nome)}</div>
  </div>

  <script>window.onload=()=>{setTimeout(()=>window.print(),200);};</script>
</body></html>`);
  w.document.close();
}

export function AuditoriaFuncionarioCard({ unidade }: { unidade: Unidade }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const funcionarioId = me?.funcionario?.id;
  const [openRelatorio, setOpenRelatorio] = useState(false);
  const [linhas, setLinhas] = useState<LinhaContagem[]>([]);
  const [loadingItens, setLoadingItens] = useState(false);
  const [observacaoGeral, setObservacaoGeral] = useState("");
  const [statusCaixa, setStatusCaixa] = useState("");
  const [busy, setBusy] = useState(false);
  const [concluida, setConcluida] = useState<ConferenciaConcluida | null>(null);

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

  const carregarItens = async () => {
    setLoadingItens(true);
    try {
      const { data, error } = await supabase
        .from("inventory_items" as never)
        .select("id, name, sector, unit_type, current_stock")
        .eq("property", unidade)
        .order("sector")
        .order("name");
      if (error) throw error;
      const itens = (data as unknown as InventarioItem[]) ?? [];
      setLinhas(
        itens.map((it) => ({
          itemId: it.id,
          name: it.name,
          sector: it.sector,
          unit_type: it.unit_type,
          contagem: "",
          observacao: "",
        })),
      );
    } catch (err) {
      toast.error("Falha ao carregar itens do almoxarifado");
      console.error(err);
    } finally {
      setLoadingItens(false);
    }
  };

  useEffect(() => {
    if (openRelatorio && linhas.length === 0 && !loadingItens) {
      carregarItens();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRelatorio]);

  if (!auditoria && !concluida) return null;

  const iniciar = async () => {
    if (!auditoria) return;
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

  const atualizarLinha = (idx: number, campo: "contagem" | "observacao", valor: string) => {
    setLinhas((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)));
  };

  const enviarRelatorio = async () => {
    if (!auditoria) return;
    const preenchidas = linhas.filter((l) => l.contagem.trim() !== "");
    if (preenchidas.length === 0 && !observacaoGeral.trim()) {
      toast.error("Preencha ao menos uma contagem ou observação");
      return;
    }
    setBusy(true);
    try {
      const resumo = [
        statusCaixa.trim() ? `STATUS FINAL: ${statusCaixa.trim()}` : "",
        observacaoGeral.trim() ? `OBSERVAÇÕES GERAIS:\n${observacaoGeral.trim()}` : "",
        "CONTAGEM POR ITEM:",
        ...linhas
          .filter((l) => l.contagem.trim() || l.observacao.trim())
          .map((l) => `• ${l.name} (${l.sector}): ${l.contagem || "—"}${l.observacao ? ` [${l.observacao}]` : ""}`),
      ]
        .filter(Boolean)
        .join("\n");

      const concluidoEm = new Date().toISOString();
      const { error } = await supabase
        .from("auditorias_almoxarifado" as never)
        .update({
          status: "concluido",
          concluido_em: concluidoEm,
          relatorio_final: resumo,
        } as never)
        .eq("id", auditoria.id);
      if (error) throw error;

      toast.success("Auditoria enviada com sucesso!");
      setConcluida({
        auditoria,
        linhas,
        observacaoGeral,
        statusCaixa,
        concluidoEm,
      });
      setOpenRelatorio(false);
      qc.invalidateQueries({ queryKey: ["auditoria_almox_me"] });
      qc.invalidateQueries({ queryKey: ["auditorias_almox"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setBusy(false);
    }
  };

  const prazoTxt = auditoria?.prazo_ate
    ? new Date(auditoria.prazo_ate).toLocaleString("pt-BR")
    : auditoria?.tempo_limite;
  const emAndamento = auditoria?.status === "em_andamento";

  // Tela de sucesso pós-envio
  if (concluida) {
    return (
      <div className="rounded-2xl p-5 border-2 border-emerald-300 shadow-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-xl bg-white/20 grid place-items-center shrink-0">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black uppercase tracking-wider">✅ Auditoria enviada com sucesso!</h3>
            <p className="text-xs text-white/90 mt-1">
              Sua conferência de INJOY {concluida.auditoria.unidade} foi registrada em{" "}
              {new Date(concluida.concluidoEm).toLocaleString("pt-BR")}.
            </p>
            <div className="mt-4 flex gap-2 flex-wrap">
              <button
                onClick={() => imprimirConferencia(concluida)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-emerald-700 font-black text-sm shadow hover:shadow-lg"
              >
                <Printer size={14} />
                Imprimir Conferência Realizada
              </button>
              <button
                onClick={() => setConcluida(null)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!auditoria) return null;

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
                  Preencher Conferência
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {openRelatorio && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={() => !busy && setOpenRelatorio(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-800">Conferência de Auditoria</h3>
                <p className="text-[11px] text-slate-500">
                  Preencha a contagem física de cada item em INJOY {auditoria.unidade}
                </p>
              </div>
              <button onClick={() => setOpenRelatorio(false)} className="h-8 w-8 rounded-lg hover:bg-slate-100 grid place-items-center text-slate-500">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingItens ? (
                <div className="text-center py-8 text-slate-500">
                  <Loader2 size={16} className="animate-spin inline mr-2" /> Carregando itens…
                </div>
              ) : linhas.length === 0 ? (
                <p className="text-center py-8 text-slate-400 text-sm">Nenhum item no almoxarifado desta unidade.</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <th className="text-left p-2 font-bold">Item</th>
                        <th className="text-left p-2 font-bold">Setor</th>
                        <th className="text-left p-2 font-bold w-28">Contagem</th>
                        <th className="text-left p-2 font-bold">Observação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l, idx) => (
                        <tr key={l.itemId} className="border-b border-slate-100 last:border-0">
                          <td className="p-2 text-slate-800 font-semibold">{l.name}</td>
                          <td className="p-2 text-slate-500 text-[11px] uppercase">{l.sector}</td>
                          <td className="p-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={l.contagem}
                              onChange={(e) => atualizarLinha(idx, "contagem", e.target.value)}
                              placeholder="0"
                              className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm text-center font-black focus:outline-none focus:border-blue-500"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={l.observacao}
                              onChange={(e) => atualizarLinha(idx, "observacao", e.target.value)}
                              placeholder="Divergência, avaria…"
                              className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Status final do caixa / estoque
                  </label>
                  <input
                    type="text"
                    value={statusCaixa}
                    onChange={(e) => setStatusCaixa(e.target.value)}
                    placeholder="Ex.: Fechado sem divergências"
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Observações gerais
                  </label>
                  <textarea
                    value={observacaoGeral}
                    onChange={(e) => setObservacaoGeral(e.target.value)}
                    rows={2}
                    placeholder="Comentários gerais para o gestor…"
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex gap-2 justify-end">
              <button
                onClick={() => setOpenRelatorio(false)}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={enviarRelatorio}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-black bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Concluir Auditoria
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
