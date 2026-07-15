import { useEffect, useMemo, useState } from "react";
import { Loader2, X, Send, Package, PackageCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const ITENS_FALLBACK = [
  "Protetor Travesseiro",
  "Capa de Almofada",
  "Protetor Colchão Casal / Solteiro",
  "Edredon",
  "Manta",
  "Lençol Casal",
  "Lençol King",
  "Lençol Solteiro",
  "Lençol Casal s/ Elástico",
  "Lençol Solteiro s/ Elástico",
  "Fronha",
  "Protetor Colchão Casal",
  "Protetor Colchão Solteiro",
  "Piso",
  "Toalha Banho F. Prata",
  "Toalha Rosto",
  "Toalha de Lavabo",
  "Roupão",
  "Travesseiro / Almofada",
  "Capa Sofá",
  "Capa Poltrona",
  "Toalha Mesa Retangular",
  "Toalha Mesa Redonda",
  "Lenços Seda",
  "Guardanapos Linho",
  "Guardanapos",
  "Cortinas M²",
  "Tapete M²",
  "Forro de Capa",
  "Pano de Chão",
];

type ItemSent = { item: string; enviado: number };
type ItemReceived = { item: string; enviado: number; retornado: number; em_falta: number };

type Batch = {
  batch_id: string;
  property: string;
  sent_by: string;
  sent_at: string;
  status: string;
  items_sent: ItemSent[];
  notes?: string | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  unidade: "Botafogo" | "Ipanema";
  camareiraName: string;
}

const PREFIX: Record<string, string> = { Botafogo: "BOT", Ipanema: "IPA" };

function ddmm(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}`;
}

async function generateBatchId(unidade: string): Promise<string> {
  const stamp = ddmm();
  const prefix = PREFIX[unidade] ?? "UNI";
  const like = `LOTE-${stamp}-${prefix}-%`;
  const { data } = await supabase
    .from("laundry_batches" as any)
    .select("batch_id")
    .like("batch_id", like);
  const seq = ((data as { batch_id: string }[] | null)?.length ?? 0) + 1;
  return `LOTE-${stamp}-${prefix}-${String(seq).padStart(2, "0")}`;
}

export function LaundryModal({ open, onClose, unidade, camareiraName }: Props) {
  const [tab, setTab] = useState<"enviar" | "receber">("enviar");
  const [itens, setItens] = useState<string[]>(ITENS_FALLBACK);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase
        .from("laundry_items_directory" as never)
        .select("name")
        .order("name");
      if (!error && Array.isArray(data) && data.length > 0) {
        setItens((data as { name: string }[]).map((d) => d.name));
      }
    })();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <p className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
              🧺 Lavanderia · Gestão por Lotes
            </p>
            <h3 className="text-base font-black text-white">Malote de Enxoval</h3>
            <p className="text-xs text-slate-400">INJOY {unidade} · {camareiraName || "—"}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-800 shrink-0">
          <button
            onClick={() => setTab("enviar")}
            className={cn(
              "py-3 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-colors",
              tab === "enviar"
                ? "bg-sky-500 text-white"
                : "bg-slate-900 text-slate-400 hover:bg-slate-800",
            )}
          >
            <Package size={16} /> 📤 Enviar Sujo
          </button>
          <button
            onClick={() => setTab("receber")}
            className={cn(
              "py-3 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-colors",
              tab === "receber"
                ? "bg-emerald-500 text-white"
                : "bg-slate-900 text-slate-400 hover:bg-slate-800",
            )}
          >
            <PackageCheck size={16} /> 📥 Receber Limpo
          </button>
        </div>

        {tab === "enviar" ? (
          <EnviarSujo
            itens={itens}
            unidade={unidade}
            camareiraName={camareiraName}
            onDone={onClose}
          />
        ) : (
          <ReceberLimpo unidade={unidade} camareiraName={camareiraName} onDone={onClose} />
        )}
      </div>
    </div>
  );
}

/* -------------------- ABA 1: ENVIAR SUJO -------------------- */

function EnviarSujo({
  itens,
  unidade,
  camareiraName,
  onDone,
}: {
  itens: string[];
  unidade: "Botafogo" | "Ipanema";
  camareiraName: string;
  onDone: () => void;
}) {
  const [dados, setDados] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [criado, setCriado] = useState<string | null>(null);

  const linhas = useMemo(
    () =>
      itens.map((item) => {
        const raw = dados[item] ?? "";
        const num = parseInt(raw || "0", 10) || 0;
        return { item, valor: raw, num };
      }),
    [dados, itens],
  );

  const total = linhas.filter((l) => l.num > 0).length;
  const canSubmit = total > 0 && !salvando;

  const enviar = async () => {
    if (!canSubmit) return;
    setSalvando(true);
    try {
      const items_sent: ItemSent[] = linhas
        .filter((l) => l.num > 0)
        .map((l) => ({ item: l.item, enviado: l.num }));
      const batch_id = await generateBatchId(unidade);
      const { error } = await supabase.from("laundry_batches" as any).insert({
        batch_id,
        property: unidade,
        sent_by: camareiraName || "—",
        status: "transit",
        items_sent,
        notes: notas.trim() ? notas.trim() : null,
      });
      if (error) throw error;
      setCriado(batch_id);
    } catch (err) {
      console.error("[laundry] enviar erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao criar lote");
    } finally {
      setSalvando(false);
    }
  };

  if (criado) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <CheckCircle2 size={48} className="text-emerald-400" />
        </div>
        <h4 className="text-2xl font-black text-white">Lote criado com sucesso!</h4>
        <p className="text-sm text-slate-300 max-w-md">
          Anote na guia de remessa o número abaixo. Ao receber a roupa limpa, use a aba{" "}
          <span className="text-emerald-400 font-bold">📥 Receber Limpo</span> para dar baixa.
        </p>
        <div className="bg-slate-800 border-2 border-sky-500 rounded-2xl px-6 py-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
            Número do Lote
          </p>
          <p className="text-3xl font-black text-sky-300 tracking-wider">{criado}</p>
        </div>
        <button
          onClick={onDone}
          className="mt-2 bg-sky-500 hover:bg-sky-600 text-white font-black px-6 py-3 rounded-xl uppercase text-sm tracking-wider"
        >
          Fechar
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
            <tr className="text-[10px] uppercase tracking-wider text-slate-400">
              <th className="text-left p-3 font-bold">Item</th>
              <th className="p-2 font-bold w-32">Quantidade</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr
                key={l.item}
                className={cn(
                  "border-b border-slate-800/60",
                  i % 2 === 0 ? "bg-slate-900" : "bg-slate-800/30",
                )}
              >
                <td className="p-3 text-slate-200 font-semibold text-xs">{l.item}</td>
                <td className="p-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={l.valor}
                    onChange={(e) =>
                      setDados((s) => ({
                        ...s,
                        [l.item]: e.target.value.replace(/[^0-9]/g, ""),
                      }))
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-center text-white text-sm outline-none focus:border-sky-500"
                    placeholder="0"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-slate-800 space-y-3">
        <div>
          <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300 mb-1.5">
            <AlertTriangle size={12} /> Observações do Lote (Avarias ou Manchas)
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ex.: 2 lençóis enviados com mancha de vinho para lavagem química"
            className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500 rounded-md px-3 py-2 text-sm text-white outline-none resize-none placeholder:text-slate-500"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Este alerta aparece para Recepção e Gestor no painel do lote.
          </p>
        </div>
        <button
          onClick={enviar}
          disabled={!canSubmit}
          className={cn(
            "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2",
            canSubmit
              ? "bg-sky-500 hover:bg-sky-600 text-white"
              : "bg-slate-800 text-slate-500 cursor-not-allowed",
          )}
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Gerar Lote ({total} itens)
        </button>
      </div>
    </>
  );
}

/* -------------------- ABA 2: RECEBER LIMPO -------------------- */

function ReceberLimpo({
  unidade,
  camareiraName,
  onDone,
}: {
  unidade: "Botafogo" | "Ipanema";
  camareiraName: string;
  onDone: () => void;
}) {
  const [lotes, setLotes] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionado, setSelecionado] = useState<Batch | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("laundry_batches" as any)
      .select("batch_id, property, sent_by, sent_at, status, items_sent, notes")
      .eq("property", unidade)
      .in("status", ["transit", "partial"])
      .order("sent_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setLotes((data as unknown as Batch[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade]);

  if (selecionado) {
    return (
      <ContagemRetorno
        batch={selecionado}
        camareiraName={camareiraName}
        onBack={() => setSelecionado(null)}
        onDone={() => {
          setSelecionado(null);
          carregar();
          onDone();
        }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      {loading ? (
        <div className="text-center text-slate-400 py-12">
          <Loader2 className="animate-spin inline mr-2" size={16} /> Carregando lotes…
        </div>
      ) : lotes.length === 0 ? (
        <div className="text-center text-slate-400 py-12">
          Nenhum lote em trânsito para {unidade}. Envie um novo lote pela aba{" "}
          <span className="text-sky-400 font-bold">📤 Enviar Sujo</span>.
        </div>
      ) : (
        <div className="grid gap-3">
          {lotes.map((b) => {
            const totalPecas = (b.items_sent ?? []).reduce((s, it) => s + (it.enviado || 0), 0);
            const dias = Math.floor(
              (Date.now() - new Date(b.sent_at).getTime()) / (1000 * 60 * 60 * 24),
            );
            return (
              <button
                key={b.batch_id}
                onClick={() => setSelecionado(b)}
                className="text-left bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-sky-500 rounded-2xl p-4 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-lg font-black text-sky-300 tracking-wider">{b.batch_id}</p>
                  <span
                    className={cn(
                      "text-[10px] font-black uppercase px-2 py-1 rounded-md",
                      b.status === "partial"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-sky-500/20 text-sky-300",
                    )}
                  >
                    {b.status === "partial" ? "Parcial" : "Em Trânsito"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-500 font-bold uppercase text-[10px]">Peças</p>
                    <p className="text-white font-black">{totalPecas}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold uppercase text-[10px]">Enviado por</p>
                    <p className="text-slate-200 font-bold truncate">{b.sent_by}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold uppercase text-[10px]">Há</p>
                    <p className="text-slate-200 font-bold">
                      {dias === 0 ? "hoje" : `${dias}d`}
                    </p>
                  </div>
                </div>
                {b.notes ? (
                  <div className="mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
                    <AlertTriangle size={14} className="text-amber-300 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-amber-200 leading-snug">
                      <span className="font-black uppercase tracking-wider">Obs:</span>{" "}
                      {b.notes}
                    </p>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContagemRetorno({
  batch,
  camareiraName,
  onBack,
  onDone,
}: {
  batch: Batch;
  camareiraName: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [recebidos, setRecebidos] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const linhas = useMemo(() => {
    return (batch.items_sent ?? []).map((it) => {
      const raw = recebidos[it.item] ?? "";
      const ret = parseInt(raw || "0", 10) || 0;
      const emFalta = Math.max(0, it.enviado - ret);
      return { ...it, retornado: raw, retNum: ret, emFalta };
    });
  }, [batch, recebidos]);

  const totalFalta = linhas.reduce((s, l) => s + l.emFalta, 0);

  const salvar = async () => {
    setSalvando(true);
    try {
      const items_received: ItemReceived[] = linhas.map((l) => ({
        item: l.item,
        enviado: l.enviado,
        retornado: l.retNum,
        em_falta: l.emFalta,
      }));
      const missing = items_received.filter((r) => r.em_falta > 0);
      const status = missing.length === 0 ? "completed" : "partial";

      const { error: e1 } = await supabase
        .from("laundry_batches" as any)
        .update({
          received_by: camareiraName || "—",
          received_at: new Date().toISOString(),
          items_received,
          missing_items: missing,
          status,
        })
        .eq("batch_id", batch.batch_id);
      if (e1) throw e1;

      if (missing.length > 0) {
        const rows = missing.map((m) => ({
          property: batch.property,
          batch_id: batch.batch_id,
          item_name: m.item,
          quantity_missing: m.em_falta,
          status: "pending" as const,
        }));
        const { error: e2 } = await supabase.from("laundry_debt" as any).insert(rows);
        if (e2) throw e2;
        toast.warning(`Lote ${batch.batch_id} fechado com ${missing.length} item(ns) em falta`);
      } else {
        toast.success(`Lote ${batch.batch_id} fechado — tudo conferido ✅`);
      }
      onDone();
    } catch (err) {
      console.error("[laundry] receber erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao dar baixa");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <div className="p-3 border-b border-slate-800 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-xs font-bold text-slate-400 hover:text-white px-2 py-1"
        >
          ← Voltar
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Lote</p>
          <p className="text-sm font-black text-sky-300">{batch.batch_id}</p>
        </div>
      </div>
      {batch.notes ? (
        <div className="mx-3 mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/40 rounded-lg p-3">
          <AlertTriangle size={16} className="text-amber-300 mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-300">
              Observações do envio
            </p>
            <p className="text-xs text-amber-100 mt-0.5 leading-snug">{batch.notes}</p>
          </div>
        </div>
      ) : null}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
            <tr className="text-[10px] uppercase tracking-wider text-slate-400">
              <th className="text-left p-3 font-bold">Item</th>
              <th className="p-2 font-bold w-20">Enviado</th>
              <th className="p-2 font-bold w-24">Recebido</th>
              <th className="p-2 font-bold w-20">Em Falta</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr
                key={l.item}
                className={cn(
                  "border-b border-slate-800/60",
                  i % 2 === 0 ? "bg-slate-900" : "bg-slate-800/30",
                )}
              >
                <td className="p-3 text-slate-200 font-semibold text-xs">{l.item}</td>
                <td className="p-2 text-center text-slate-300 font-bold">{l.enviado}</td>
                <td className="p-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={l.retornado}
                    onChange={(e) =>
                      setRecebidos((s) => ({
                        ...s,
                        [l.item]: e.target.value.replace(/[^0-9]/g, ""),
                      }))
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-center text-white text-sm outline-none focus:border-emerald-500"
                    placeholder="0"
                  />
                </td>
                <td className="p-1 text-center">
                  {l.emFalta > 0 ? (
                    <span className="inline-block min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-black bg-red-500 text-white shadow-lg shadow-red-500/30">
                      -{l.emFalta}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-slate-800 space-y-2">
        {totalFalta > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
            <AlertTriangle size={14} />
            <span>
              {totalFalta} peça(s) em falta — serão registradas na Conta Corrente da Lavanderia.
            </span>
          </div>
        )}
        <button
          onClick={salvar}
          disabled={salvando}
          className={cn(
            "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2",
            salvando
              ? "bg-slate-800 text-slate-500"
              : "bg-emerald-500 hover:bg-emerald-600 text-white",
          )}
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
          Fechar Lote
        </button>
      </div>
    </>
  );
}
