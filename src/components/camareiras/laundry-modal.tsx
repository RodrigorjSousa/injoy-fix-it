import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  X,
  Send,
  Package,
  PackageCheck,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";
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

// ------- Tipos -------
// items_sent no banco (jsonb) — campos preenchidos ao longo do ciclo de vida do malote.
type ItemSent = {
  item: string;
  enviado: number; // alias legado = saida_hotel
  saida_hotel: number; // 1ª contagem — camareira ao fechar o malote
  ent_lav?: number; // 2ª contagem — lavanderia confirma o que recebeu
  retorno_hotel?: number; // 3ª contagem — camareira ao receber de volta
};
type ItemReceived = {
  item: string;
  enviado: number;
  retornado: number;
  em_falta: number;
  diff_transporte?: number;
  diff_lavanderia?: number;
};

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
const ALERTA_DIAS = 3; // ≥ 3 dias em trânsito vira vermelho

function ddmm(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}`;
}

function diasEmTransito(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
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
  const [tab, setTab] = useState<"enviar" | "transito" | "receber">("enviar");
  const [itens, setItens] = useState<string[]>(ITENS_FALLBACK);
  const [transitCount, setTransitCount] = useState(0);

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

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const { data } = await supabase
        .from("laundry_batches" as any)
        .select("batch_id", { count: "exact", head: true })
        .eq("property", unidade)
        .in("status", ["transit", "at_laundry", "partial"]);
      setTransitCount((data as unknown as { length?: number })?.length ?? 0);
    };
    load();
  }, [open, unidade, tab]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <p className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
              🧺 Lavanderia · Gestão por Malote
            </p>
            <h3 className="text-base font-black text-white">Controle de Ida e Volta</h3>
            <p className="text-xs text-slate-400">
              INJOY {unidade} · {camareiraName || "—"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-3 border-b border-slate-800 shrink-0">
          <TabButton
            active={tab === "enviar"}
            onClick={() => setTab("enviar")}
            color="sky"
            icon={<Package size={16} />}
            label="📤 Enviar"
          />
          <TabButton
            active={tab === "transito"}
            onClick={() => setTab("transito")}
            color="amber"
            icon={<Truck size={16} />}
            label="🚚 Em Trânsito"
            badge={transitCount}
          />
          <TabButton
            active={tab === "receber"}
            onClick={() => setTab("receber")}
            color="emerald"
            icon={<PackageCheck size={16} />}
            label="📥 Receber"
          />
        </div>

        {tab === "enviar" && (
          <EnviarSujo
            itens={itens}
            unidade={unidade}
            camareiraName={camareiraName}
            onDone={() => setTab("transito")}
          />
        )}
        {tab === "transito" && (
          <EmTransito unidade={unidade} camareiraName={camareiraName} onGoReceber={() => setTab("receber")} />
        )}
        {tab === "receber" && (
          <ReceberLimpo unidade={unidade} camareiraName={camareiraName} onDone={onClose} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  color,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  color: "sky" | "amber" | "emerald";
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  const activeBg = {
    sky: "bg-sky-500 text-white",
    amber: "bg-amber-500 text-slate-950",
    emerald: "bg-emerald-500 text-white",
  }[color];
  return (
    <button
      onClick={onClick}
      className={cn(
        "py-3 px-2 text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors relative",
        active ? activeBg : "bg-slate-900 text-slate-400 hover:bg-slate-800",
      )}
    >
      {icon} {label}
      {badge && badge > 0 ? (
        <span
          className={cn(
            "ml-1 min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center",
            active ? "bg-slate-950/30 text-white" : "bg-amber-500 text-slate-950",
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/* ================== ABA 1: ENVIAR SUJO ================== */

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
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [talao, setTalao] = useState("");
  const [notas, setNotas] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [criado, setCriado] = useState<string | null>(null);

  const linhas = useMemo(
    () =>
      itens.map((item) => {
        const raw = quantidades[item] ?? "";
        const qtd = parseInt(raw || "0", 10) || 0;
        return { item, raw, qtd };
      }),
    [quantidades, itens],
  );

  const totalPecas = linhas.reduce((s, l) => s + l.qtd, 0);
  const totalItens = linhas.filter((l) => l.qtd > 0).length;
  const canSubmit = totalItens > 0 && talao.trim().length > 0 && !salvando;

  const setCampo = (item: string, valor: string) => {
    const clean = valor.replace(/[^0-9]/g, "");
    setQuantidades((s) => ({ ...s, [item]: clean }));
  };

  const enviar = async () => {
    if (!canSubmit) return;
    setSalvando(true);
    try {
      // Bloqueia envio duplicado do mesmo talão em malotes abertos
      const talaoNum = talao.trim();
      const { data: existente } = await supabase
        .from("laundry_batches" as any)
        .select("batch_id, notes")
        .eq("property", unidade)
        .in("status", ["transit", "at_laundry", "partial"]);
      const conflito = ((existente as { notes?: string | null }[] | null) ?? []).find((r) =>
        (r.notes ?? "").includes(`Talão nº ${talaoNum}`),
      );
      if (conflito) {
        toast.error(`Talão nº ${talaoNum} já está em um malote aberto. Verifique antes de reenviar.`);
        setSalvando(false);
        return;
      }

      const items_sent: ItemSent[] = linhas
        .filter((l) => l.qtd > 0)
        .map((l) => ({
          item: l.item,
          enviado: l.qtd,
          saida_hotel: l.qtd,
        }));
      const batch_id = await generateBatchId(unidade);
      const talaoPrefix = `Talão nº ${talaoNum}`;
      const notesFinal = notas.trim() ? `${talaoPrefix} — ${notas.trim()}` : talaoPrefix;
      const { error } = await supabase.from("laundry_batches" as any).insert({
        batch_id,
        property: unidade,
        sent_by: camareiraName || "—",
        status: "transit",
        items_sent,
        notes: notesFinal,
      });
      if (error) throw error;
      setCriado(batch_id);
    } catch (err) {
      console.error("[laundry] enviar erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao criar malote");
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
        <h4 className="text-2xl font-black text-white">Malote criado!</h4>
        <p className="text-sm text-slate-300 max-w-md">
          Talão nº <span className="text-sky-300 font-black">{talao}</span>. Escreva o número
          abaixo na guia de remessa. Quando a lavanderia devolver o recibo, entre em{" "}
          <span className="text-amber-400 font-bold">🚚 Em Trânsito</span> e confirme o que ela
          contou.
        </p>
        <div className="bg-slate-800 border-2 border-sky-500 rounded-2xl px-6 py-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
            Número do Malote
          </p>
          <p className="text-3xl font-black text-sky-300 tracking-wider">{criado}</p>
        </div>
        <button
          onClick={onDone}
          className="mt-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-6 py-3 rounded-xl uppercase text-sm tracking-wider"
        >
          Ver malotes em trânsito
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 border-b border-slate-800 bg-slate-900/60">
        <label className="block text-[10px] font-black uppercase tracking-wider text-sky-300 mb-1.5">
          Número do Talão da Lavanderia
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={talao}
          onChange={(e) => setTalao(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
          placeholder="Nº 19389"
          className="w-full sm:w-64 bg-slate-800 border-2 border-slate-700 focus:border-sky-500 rounded-lg px-4 py-3 text-2xl font-black text-sky-200 tracking-widest outline-none placeholder:text-slate-600 placeholder:font-black"
        />
        <p className="text-[10px] text-slate-500 mt-1.5">
          Este número acompanha o malote na ida e na volta. Sem talão não é possível enviar.
        </p>
      </div>
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-slate-900 border-b-2 border-slate-700 z-10">
            <tr className="text-[10px] uppercase tracking-wider text-slate-300">
              <th className="text-left p-3 font-black border-r border-slate-800">Material</th>
              <th className="p-2 font-black w-28">Saída do Hotel</th>
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
                <td className="p-3 text-slate-200 font-semibold text-xs border-r border-slate-800">
                  {l.item}
                </td>
                <td className="p-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={l.raw}
                    onChange={(e) => setCampo(l.item, e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-2 text-center text-white text-base font-bold outline-none focus:border-sky-500"
                    placeholder="0"
                  />
                </td>
              </tr>
            ))}
            <tr className="bg-sky-500/10 border-t-2 border-sky-500/40 sticky bottom-0">
              <td className="p-3 text-sky-200 font-black uppercase text-xs tracking-wider border-r border-sky-500/30">
                Total de Peças
              </td>
              <td className="p-2 text-center text-white font-black text-lg">{totalPecas}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-slate-800 space-y-3">
        <div>
          <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300 mb-1.5">
            <AlertTriangle size={12} /> Observações (avarias, manchas etc.)
          </label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ex.: 2 lençóis com mancha de vinho — lavagem química"
            className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500 rounded-md px-3 py-2 text-sm text-white outline-none resize-none placeholder:text-slate-500"
          />
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
          Gerar Malote · Talão {talao || "—"} · {totalPecas} peças
        </button>
      </div>
    </>
  );
}

/* ================== ABA 2: EM TRÂNSITO ================== */

function EmTransito({
  unidade,
  camareiraName,
  onGoReceber,
}: {
  unidade: "Botafogo" | "Ipanema";
  camareiraName: string;
  onGoReceber: () => void;
}) {
  const [lotes, setLotes] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmando, setConfirmando] = useState<Batch | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("laundry_batches" as any)
      .select("batch_id, property, sent_by, sent_at, status, items_sent, notes")
      .eq("property", unidade)
      .in("status", ["transit", "at_laundry", "partial"])
      .order("sent_at", { ascending: true });
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

  if (confirmando) {
    return (
      <ConfirmarEntradaLavanderia
        batch={confirmando}
        camareiraName={camareiraName}
        onBack={() => setConfirmando(null)}
        onDone={() => {
          setConfirmando(null);
          carregar();
        }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      {loading ? (
        <div className="text-center text-slate-400 py-12">
          <Loader2 className="animate-spin inline mr-2" size={16} /> Carregando…
        </div>
      ) : lotes.length === 0 ? (
        <div className="text-center text-slate-400 py-12">
          Nenhum malote em trânsito para {unidade}.
        </div>
      ) : (
        <div className="grid gap-3">
          {lotes.map((b) => {
            const totalPecas = (b.items_sent ?? []).reduce((s, it) => s + (it.enviado || 0), 0);
            const dias = diasEmTransito(b.sent_at);
            const alerta = dias >= ALERTA_DIAS;
            const aviso = !alerta && dias >= 2;
            const bordaCor = alerta
              ? "border-red-500"
              : aviso
                ? "border-amber-500"
                : "border-slate-700";
            const badgeCor = alerta
              ? "bg-red-500 text-white"
              : aviso
                ? "bg-amber-500 text-slate-950"
                : "bg-sky-500/20 text-sky-300";
            const statusLabel =
              b.status === "at_laundry"
                ? "Na Lavanderia"
                : b.status === "partial"
                  ? "Parcial"
                  : "Aguardando entrada";
            const talao = (b.notes ?? "").match(/Talão nº (\S+)/)?.[1] ?? "—";
            return (
              <div
                key={b.batch_id}
                className={cn("bg-slate-800 border-2 rounded-2xl p-4", bordaCor)}
              >
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Talão
                    </p>
                    <p className="text-2xl font-black text-sky-200 tracking-wider leading-tight">
                      Nº {talao}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{b.batch_id}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={cn(
                        "text-[10px] font-black uppercase px-2 py-1 rounded-md",
                        badgeCor,
                      )}
                    >
                      {statusLabel}
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1 text-[11px] font-black",
                        alerta ? "text-red-300" : aviso ? "text-amber-300" : "text-slate-400",
                      )}
                    >
                      <Clock size={11} />
                      {dias === 0 ? "hoje" : `há ${dias} dia${dias > 1 ? "s" : ""}`}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div>
                    <p className="text-slate-500 font-bold uppercase text-[10px]">Peças</p>
                    <p className="text-white font-black">{totalPecas}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold uppercase text-[10px]">Enviado por</p>
                    <p className="text-slate-200 font-bold truncate">{b.sent_by}</p>
                  </div>
                </div>
                {b.notes ? (
                  <div className="mb-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
                    <AlertTriangle size={14} className="text-amber-300 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-amber-200 leading-snug">{b.notes}</p>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfirmando(b)}
                    disabled={b.status === "at_laundry"}
                    className={cn(
                      "py-2.5 rounded-lg font-black text-[11px] uppercase tracking-wider transition-colors",
                      b.status === "at_laundry"
                        ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                        : "bg-amber-500 hover:bg-amber-600 text-slate-950",
                    )}
                  >
                    {b.status === "at_laundry" ? "✓ Entrada confirmada" : "Confirmar entrada Lav."}
                  </button>
                  <button
                    onClick={onGoReceber}
                    className="py-2.5 rounded-lg font-black text-[11px] uppercase tracking-wider bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    Receber de volta →
                  </button>
                </div>
                {alerta && (
                  <p className="mt-2 text-[11px] text-red-300 font-bold">
                    ⚠ Malote fora há {dias} dias. Cobre a lavanderia.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------- Passo: confirmar 2ª contagem (entrada na lavanderia) -------- */

function ConfirmarEntradaLavanderia({
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
  const [ents, setEnts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    (batch.items_sent ?? []).forEach((it) => {
      // por default, pré-preenche com a saída do hotel (caso a lavanderia bata igual)
      init[it.item] = String(it.ent_lav ?? it.saida_hotel ?? it.enviado ?? 0);
    });
    return init;
  });
  const [salvando, setSalvando] = useState(false);

  const linhas = useMemo(() => {
    return (batch.items_sent ?? []).map((it) => {
      const raw = ents[it.item] ?? "";
      const entNum = parseInt(raw || "0", 10) || 0;
      const saida = it.saida_hotel ?? it.enviado ?? 0;
      return { ...it, entRaw: raw, entNum, saida, dif: saida - entNum };
    });
  }, [batch, ents]);

  const totalDif = linhas.reduce((s, l) => s + l.dif, 0);

  const salvar = async () => {
    setSalvando(true);
    try {
      const items_sent: ItemSent[] = linhas.map((l) => ({
        item: l.item,
        enviado: l.saida,
        saida_hotel: l.saida,
        ent_lav: l.entNum,
        retorno_hotel: l.retorno_hotel,
      }));
      const { error } = await supabase
        .from("laundry_batches" as any)
        .update({
          items_sent,
          status: "at_laundry",
          notes: batch.notes
            ? `${batch.notes} · Entrada Lav. confirmada por ${camareiraName || "—"}`
            : `Entrada Lav. confirmada por ${camareiraName || "—"}`,
        })
        .eq("batch_id", batch.batch_id);
      if (error) throw error;
      toast.success(`Entrada da lavanderia registrada no malote ${batch.batch_id}`);
      onDone();
    } catch (err) {
      console.error("[laundry] confirmar entrada erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao confirmar");
    } finally {
      setSalvando(false);
    }
  };

  const talao = (batch.notes ?? "").match(/Talão nº (\S+)/)?.[1] ?? "—";

  return (
    <>
      <div className="p-3 border-b border-slate-800 flex items-center gap-3">
        <button onClick={onBack} className="text-xs font-bold text-slate-400 hover:text-white px-2 py-1">
          ← Voltar
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
            Confirmar 2ª contagem — Talão Nº {talao}
          </p>
          <p className="text-sm font-black text-amber-300">
            O que a lavanderia disse que recebeu
          </p>
        </div>
      </div>
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
            <tr className="text-[10px] uppercase tracking-wider text-slate-400">
              <th className="text-left p-3 font-bold">Item</th>
              <th className="p-2 font-bold w-24">Saída Hotel</th>
              <th className="p-2 font-bold w-24">Ent. Lav.</th>
              <th className="p-2 font-bold w-20">Dif.</th>
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
                <td className="p-2 text-center text-slate-300 font-bold">{l.saida}</td>
                <td className="p-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={l.entRaw}
                    onChange={(e) =>
                      setEnts((s) => ({
                        ...s,
                        [l.item]: e.target.value.replace(/[^0-9]/g, ""),
                      }))
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-center text-white text-sm outline-none focus:border-amber-500"
                    placeholder="0"
                  />
                </td>
                <td className="p-1 text-center">
                  <span
                    className={cn(
                      "inline-block min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-black",
                      l.dif > 0
                        ? "bg-red-500/30 text-red-200"
                        : l.dif < 0
                          ? "bg-amber-500/30 text-amber-200"
                          : "text-slate-500",
                    )}
                  >
                    {l.dif === 0 ? "—" : l.dif > 0 ? `-${l.dif}` : `+${-l.dif}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-slate-800 space-y-2">
        {totalDif !== 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
            <AlertTriangle size={14} />
            <span>
              Divergência de transporte: {totalDif > 0 ? `${totalDif} peça(s) que saíram não chegaram` : `${-totalDif} peça(s) a mais que a lavanderia contou`}. Será separada de perdas da lavanderia no fechamento.
            </span>
          </div>
        )}
        <button
          onClick={salvar}
          disabled={salvando}
          className={cn(
            "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2",
            salvando ? "bg-slate-800 text-slate-500" : "bg-amber-500 hover:bg-amber-600 text-slate-950",
          )}
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Confirmar entrada na lavanderia
        </button>
      </div>
    </>
  );
}

/* ================== ABA 3: RECEBER LIMPO ================== */

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
      .in("status", ["transit", "at_laundry", "partial"])
      .order("sent_at", { ascending: true });
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
          <Loader2 className="animate-spin inline mr-2" size={16} /> Carregando…
        </div>
      ) : lotes.length === 0 ? (
        <div className="text-center text-slate-400 py-12">
          Nenhum malote em trânsito para {unidade}.
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-[11px] text-slate-400 mb-1">
            Escolha o malote que está voltando. Confira pelo <span className="font-black text-sky-300">número do talão</span>.
          </p>
          {lotes.map((b) => {
            const totalPecas = (b.items_sent ?? []).reduce((s, it) => s + (it.enviado || 0), 0);
            const dias = diasEmTransito(b.sent_at);
            const talao = (b.notes ?? "").match(/Talão nº (\S+)/)?.[1] ?? "—";
            return (
              <button
                key={b.batch_id}
                onClick={() => setSelecionado(b)}
                className="text-left bg-slate-800 hover:bg-slate-750 border-2 border-slate-700 hover:border-emerald-500 rounded-2xl p-4 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Talão
                    </p>
                    <p className="text-2xl font-black text-sky-200 tracking-wider leading-tight">
                      Nº {talao}
                    </p>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300">
                    {b.status === "at_laundry" ? "Pronto p/ receber" : "Em trânsito"}
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
      const saida = it.saida_hotel ?? it.enviado ?? 0;
      const entLavRegistrado = typeof it.ent_lav === "number";
      const entLav = entLavRegistrado ? (it.ent_lav as number) : saida;
      const diffTransporte = Math.max(0, saida - entLav);
      const diffLavanderia = Math.max(0, entLav - ret);
      const emFalta = diffTransporte + diffLavanderia;
      return {
        ...it,
        retornado: raw,
        retNum: ret,
        saida,
        entLav,
        entLavRegistrado,
        diffTransporte,
        diffLavanderia,
        emFalta,
      };
    });
  }, [batch, recebidos]);

  const totalFalta = linhas.reduce((s, l) => s + l.emFalta, 0);
  const totalTransp = linhas.reduce((s, l) => s + l.diffTransporte, 0);
  const totalLav = linhas.reduce((s, l) => s + l.diffLavanderia, 0);
  const algumaEntLavRegistrada = linhas.some((l) => l.entLavRegistrado);

  const salvar = async () => {
    setSalvando(true);
    try {
      const items_received: ItemReceived[] = linhas.map((l) => ({
        item: l.item,
        enviado: l.saida,
        retornado: l.retNum,
        em_falta: l.emFalta,
        diff_transporte: l.diffTransporte,
        diff_lavanderia: l.diffLavanderia,
      }));
      const items_sent_final: ItemSent[] = linhas.map((l) => ({
        item: l.item,
        enviado: l.saida,
        saida_hotel: l.saida,
        ent_lav: l.entLavRegistrado ? l.entLav : undefined,
        retorno_hotel: l.retNum,
      }));
      const missing = items_received.filter((r) => r.em_falta > 0);
      const status = missing.length === 0 ? "completed" : "partial";

      const { error: e1 } = await supabase
        .from("laundry_batches" as any)
        .update({
          received_by: camareiraName || "—",
          received_at: new Date().toISOString(),
          items_sent: items_sent_final,
          items_received,
          missing_items: missing,
          status,
        })
        .eq("batch_id", batch.batch_id);
      if (e1) throw e1;

      if (missing.length > 0) {
        const rows: {
          property: string;
          batch_id: string;
          item_name: string;
          quantity_missing: number;
          status: "pending";
        }[] = [];
        for (const l of linhas) {
          if (l.diffTransporte > 0) {
            rows.push({
              property: batch.property,
              batch_id: batch.batch_id,
              item_name: `${l.item} [Transporte]`,
              quantity_missing: l.diffTransporte,
              status: "pending",
            });
          }
          if (l.diffLavanderia > 0) {
            rows.push({
              property: batch.property,
              batch_id: batch.batch_id,
              item_name: `${l.item} [Lavanderia]`,
              quantity_missing: l.diffLavanderia,
              status: "pending",
            });
          }
        }
        if (rows.length) {
          const { error: e2 } = await supabase.from("laundry_debt" as any).insert(rows);
          if (e2) throw e2;
        }
        toast.warning(`Malote ${batch.batch_id} fechado com ${missing.length} item(ns) em falta`);
      } else {
        toast.success(`Malote ${batch.batch_id} fechado — tudo conferido ✅`);
      }
      onDone();
    } catch (err) {
      console.error("[laundry] receber erro:", err);
      toast.error(err instanceof Error ? err.message : "Falha ao dar baixa");
    } finally {
      setSalvando(false);
    }
  };

  const talao = (batch.notes ?? "").match(/Talão nº (\S+)/)?.[1] ?? "—";

  return (
    <>
      <div className="p-3 border-b border-slate-800 flex items-center gap-3">
        <button onClick={onBack} className="text-xs font-bold text-slate-400 hover:text-white px-2 py-1">
          ← Voltar
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
            Receber malote — Talão Nº {talao}
          </p>
          <p className="text-sm font-black text-emerald-300">{batch.batch_id}</p>
        </div>
      </div>
      {!algumaEntLavRegistrada && (
        <div className="mx-3 mt-3 flex items-start gap-2 bg-sky-500/10 border border-sky-500/40 rounded-lg p-3">
          <AlertTriangle size={16} className="text-sky-300 mt-0.5 shrink-0" />
          <p className="text-[11px] text-sky-100 leading-snug">
            A entrada na lavanderia não foi confirmada. As diferenças serão contadas apenas contra a
            saída do hotel — sem separar culpa de transporte × lavanderia.
          </p>
        </div>
      )}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
            <tr className="text-[10px] uppercase tracking-wider text-slate-400">
              <th className="text-left p-3 font-bold">Item</th>
              <th className="p-2 font-bold w-20">Hotel</th>
              <th className="p-2 font-bold w-20">Lav.</th>
              <th className="p-2 font-bold w-24">Retorno</th>
              <th className="p-2 font-bold w-20">Falta</th>
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
                <td className="p-2 text-center text-slate-300 font-bold text-xs">{l.saida}</td>
                <td className="p-2 text-center text-slate-300 font-bold text-xs">
                  {l.entLavRegistrado ? l.entLav : "—"}
                </td>
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
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="inline-block min-w-[2.5rem] px-2 py-0.5 rounded-md text-xs font-black bg-red-500 text-white">
                        -{l.emFalta}
                      </span>
                      {l.entLavRegistrado && (
                        <span className="text-[9px] font-bold text-slate-400 leading-tight">
                          {l.diffTransporte > 0 && <>T:{l.diffTransporte} </>}
                          {l.diffLavanderia > 0 && <>L:{l.diffLavanderia}</>}
                        </span>
                      )}
                    </div>
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
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
              <AlertTriangle size={14} />
              <span>
                <span className="font-black">{totalFalta}</span> peça(s) em falta.
                {algumaEntLavRegistrada && (
                  <>
                    {" "}
                    Transporte: <span className="font-black">{totalTransp}</span> · Lavanderia:{" "}
                    <span className="font-black">{totalLav}</span>.
                  </>
                )}
              </span>
            </div>
            <p className="text-[10px] text-slate-500">
              Registrado automaticamente na Conta Corrente da Lavanderia, separado por origem.
            </p>
          </div>
        )}
        <button
          onClick={salvar}
          disabled={salvando}
          className={cn(
            "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2",
            salvando ? "bg-slate-800 text-slate-500" : "bg-emerald-500 hover:bg-emerald-600 text-white",
          )}
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
          Fechar Malote
        </button>
      </div>
    </>
  );
}
