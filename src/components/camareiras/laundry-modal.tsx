import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  PackageCheck,
  Plus,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { todaySP } from "@/lib/tz";
import {
  dataBR,
  diasEntre,
  DIAS_ALERTA_ABERTO,
  INICIO_SALDO,
  validarRetorno,
  linhaIncompleta,
  normalizarRetorno,
  type Peca,
  type Talao,
  type UnidadeLav,
} from "@/lib/lavanderia";
import {
  apagarFotos,
  buscarPecas,
  buscarPermissaoLavanderia,
  buscarTaloes,
  enviarFotoTalao,
  registrarColeta,
  registrarRetorno,
} from "@/lib/lavanderia-api";

export type EdicaoLavanderia = { tipo: "coleta" | "retorno"; talao: Talao };

interface Props {
  open: boolean;
  onClose: () => void;
  unidade: UnidadeLav;
  /** Mantido por compatibilidade: o nome de quem lança vem do login, no banco. */
  camareiraName?: string;
  /** Aba inicial. */
  inicial?: "coleta" | "retorno";
  /** Correção de um talão já lançado (só gestor). */
  editar?: EdicaoLavanderia | null;
  onSaved?: () => void;
}

const soNumero = (v: string, max = 4) => v.replace(/[^0-9]/g, "").slice(0, max);

export function useLavanderiaBase() {
  const permissao = useQuery({
    queryKey: ["lav_permissao"],
    queryFn: buscarPermissaoLavanderia,
    staleTime: 300_000,
  });
  const pecas = useQuery({ queryKey: ["lav_pecas"], queryFn: buscarPecas, staleTime: 60_000 });
  return { permissao, pecas };
}

export function LaundryModal({
  open,
  onClose,
  unidade,
  inicial = "coleta",
  editar,
  onSaved,
}: Props) {
  const [tab, setTab] = useState<"coleta" | "retorno">(inicial);
  const qc = useQueryClient();
  const { permissao, pecas } = useLavanderiaBase();
  const abertos = useQuery({
    queryKey: ["lav_taloes_abertos", unidade],
    queryFn: () => buscarTaloes(unidade, INICIO_SALDO, true),
    enabled: open && !editar,
  });

  useEffect(() => {
    if (open) setTab(editar?.tipo ?? inicial);
  }, [open, inicial, editar]);

  if (!open) return null;

  const gestor = !!permissao.data?.gestor;
  const salvo = () => {
    qc.invalidateQueries({ queryKey: ["lav_taloes_abertos", unidade] });
    qc.invalidateQueries({ queryKey: ["lav_taloes", unidade] });
    onSaved?.();
  };

  let corpo: React.ReactNode;
  if (permissao.isLoading || pecas.isLoading) {
    corpo = (
      <div className="p-10 text-center text-slate-400">
        <Loader2 className="animate-spin inline mr-2" size={16} /> Carregando…
      </div>
    );
  } else if (permissao.error || pecas.error) {
    corpo = (
      <ErroBox
        texto={
          (permissao.error ?? pecas.error)?.message ?? "Não foi possível carregar a lavanderia."
        }
      />
    );
  } else if (!permissao.data?.podeLancar) {
    corpo = <ErroBox texto="Seu login não tem acesso à lavanderia. Fale com o gestor." />;
  } else if (editar?.tipo === "coleta") {
    corpo = (
      <ColetaForm
        unidade={unidade}
        pecas={pecas.data ?? []}
        gestor={gestor}
        talao={editar.talao}
        onDone={() => {
          salvo();
          onClose();
        }}
      />
    );
  } else if (editar?.tipo === "retorno") {
    corpo = (
      <RetornoForm
        talao={editar.talao}
        pecas={pecas.data ?? []}
        gestor={gestor}
        onBack={onClose}
        onDone={() => {
          salvo();
          onClose();
        }}
      />
    );
  } else if (tab === "coleta") {
    corpo = (
      <ColetaForm
        unidade={unidade}
        pecas={pecas.data ?? []}
        gestor={gestor}
        onDone={salvo}
        onVerRetorno={() => setTab("retorno")}
      />
    );
  } else {
    corpo = (
      <RetornoLista
        unidade={unidade}
        taloes={abertos.data ?? []}
        loading={abertos.isLoading}
        erro={abertos.error?.message}
        pecas={pecas.data ?? []}
        gestor={gestor}
        onDone={salvo}
      />
    );
  }

  const nAbertos = abertos.data?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
          <div>
            <p className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
              🧺 Lavanderia · Clean Soft
            </p>
            <h3 className="text-base font-black text-white">
              {editar
                ? `Corrigir ${editar.tipo === "coleta" ? "coleta" : "retorno"} · Talão nº ${editar.talao.numero}`
                : "Coleta e retorno de roupa"}
            </h3>
            <p className="text-xs text-slate-400">INJOY {unidade}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {!editar && (
          <div className="grid grid-cols-2 border-b border-slate-800 shrink-0">
            <TabButton
              active={tab === "coleta"}
              onClick={() => setTab("coleta")}
              cor="sky"
              label="📤 Coleta"
            />
            <TabButton
              active={tab === "retorno"}
              onClick={() => setTab("retorno")}
              cor="emerald"
              label="📥 Retorno"
              badge={nAbertos}
            />
          </div>
        )}
        {corpo}
      </div>
    </div>
  );
}

function ErroBox({ texto }: { texto: string }) {
  return (
    <div className="m-4 flex items-start gap-2 bg-red-500/10 border border-red-500/40 rounded-lg p-3 text-sm text-red-200">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{texto}</span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  cor,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  cor: "sky" | "emerald";
  label: string;
  badge?: number;
}) {
  const ativo = cor === "sky" ? "bg-sky-500 text-white" : "bg-emerald-500 text-white";
  return (
    <button
      onClick={onClick}
      className={cn(
        "py-3 px-2 text-[12px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors",
        active ? ativo : "bg-slate-900 text-slate-400 hover:bg-slate-800",
      )}
    >
      {label}
      {badge ? (
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

/* ----------------------------------------------------------- foto do talão */

function FotoTalao({
  arquivo,
  onChange,
  obrigatoria,
  jaTem,
}: {
  arquivo: File | null;
  onChange: (f: File | null) => void;
  obrigatoria: boolean;
  jaTem?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!arquivo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wider text-sky-300 mb-1.5">
        Foto do talão {obrigatoria ? "(obrigatória)" : jaTem ? "(opcional — mantém a atual)" : ""}
      </p>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          onChange(f);
          e.target.value = "";
        }}
      />
      {preview ? (
        <div className="flex items-center gap-3">
          <img
            src={preview}
            alt="Foto do talão"
            className="h-24 w-20 object-cover rounded-lg border border-slate-700"
          />
          <div className="flex flex-col gap-2">
            <span className="text-xs text-emerald-300 font-bold flex items-center gap-1">
              <CheckCircle2 size={14} /> Foto pronta
            </span>
            <button
              type="button"
              onClick={() => ref.current?.click()}
              className="text-xs font-bold text-slate-300 underline text-left"
            >
              Tirar outra
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className={cn(
            "w-full py-4 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 font-black text-sm",
            obrigatoria
              ? "border-sky-500 text-sky-300 bg-sky-500/10"
              : "border-slate-700 text-slate-400",
          )}
        >
          <Camera size={18} /> Fotografar o talão
        </button>
      )}
    </div>
  );
}

function CampoData({
  value,
  onChange,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-black uppercase tracking-wider text-amber-300 mb-1.5">
        Data (só gestor pode mudar)
      </span>
      <input
        type="date"
        value={value}
        min={min}
        max={todaySP()}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-800 border-2 border-slate-700 focus:border-amber-500 rounded-lg px-3 py-2.5 text-white font-bold outline-none"
      />
    </label>
  );
}

const inputNum =
  "w-full bg-slate-800 border border-slate-700 rounded-md px-1 py-2 text-center text-white text-base font-bold outline-none focus:border-sky-500 placeholder:text-slate-600";

/* -------------------------------------------------------------------- coleta */

function ColetaForm({
  unidade,
  pecas,
  gestor,
  talao,
  onDone,
  onVerRetorno,
}: {
  unidade: UnidadeLav;
  pecas: Peca[];
  gestor: boolean;
  talao?: Talao;
  onDone: () => void;
  onVerRetorno?: () => void;
}) {
  const inicialQtd = () => {
    const m: Record<string, string> = {};
    talao?.itens.forEach((i) => {
      if (i.saida_hotel > 0) m[i.peca_id] = String(i.saida_hotel);
    });
    return m;
  };
  const [numero, setNumero] = useState(talao?.numero ?? "");
  const [data, setData] = useState(talao?.data_coleta ?? todaySP());
  const [qtd, setQtd] = useState<Record<string, string>>(inicialQtd);
  const [foto, setFoto] = useState<File | null>(null);
  const [obs, setObs] = useState(talao?.coleta_obs ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<{ numero: string; total: number } | null>(null);

  const visiveis = useMemo(
    () => pecas.filter((p) => p.ativo || (qtd[p.id] ?? "") !== ""),
    [pecas, qtd],
  );
  const total = visiveis.reduce((s, p) => s + (parseInt(qtd[p.id] || "0", 10) || 0), 0);
  const precisaFoto = !talao;
  const pode = numero.length > 0 && total > 0 && (!precisaFoto || !!foto) && !salvando;

  const enviar = async () => {
    if (!pode) return;
    setSalvando(true);
    setErro(null);
    let path: string | null = null;
    try {
      if (foto) path = await enviarFotoTalao(foto, unidade, "coleta");
      await registrarColeta({
        unidade,
        numero,
        data,
        itens: visiveis
          .map((p) => ({ peca_id: p.id, qtd: parseInt(qtd[p.id] || "0", 10) || 0 }))
          .filter((i) => i.qtd > 0),
        foto: path,
        obs,
        talaoId: talao?.id,
      });
      if (talao) {
        if (path && talao.coleta_foto && talao.coleta_foto !== path)
          await apagarFotos([talao.coleta_foto]);
        toast.success(`Talão nº ${numero} corrigido`);
        onDone();
      } else {
        setCriado({ numero, total });
        onDone();
      }
    } catch (e) {
      if (path) await apagarFotos([path]).catch(() => undefined);
      const msg = e instanceof Error ? e.message : "Não foi possível salvar.";
      setErro(msg);
      toast.error(msg);
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
        <h4 className="text-2xl font-black text-white">Coleta registrada!</h4>
        <p className="text-sm text-slate-300">
          Talão nº <span className="text-sky-300 font-black">{criado.numero}</span> · {criado.total}{" "}
          peças. Quando a roupa voltar, registre em{" "}
          <span className="text-emerald-300 font-bold">📥 Retorno</span>.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => {
              setCriado(null);
              setNumero("");
              setQtd({});
              setFoto(null);
              setObs("");
            }}
            className="bg-sky-500 hover:bg-sky-600 text-white font-black px-5 py-3 rounded-xl uppercase text-xs tracking-wider"
          >
            Lançar outro talão
          </button>
          {onVerRetorno && (
            <button
              onClick={onVerRetorno}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-black px-5 py-3 rounded-xl uppercase text-xs tracking-wider"
            >
              Ver retornos
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-auto flex-1">
        <div className="p-4 border-b border-slate-800 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-[10px] font-black uppercase tracking-wider text-sky-300 mb-1.5">
              Número do talão
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={numero}
              onChange={(e) => setNumero(soNumero(e.target.value, 10))}
              placeholder="Nº 20380"
              className="w-full bg-slate-800 border-2 border-slate-700 focus:border-sky-500 rounded-lg px-4 py-3 text-2xl font-black text-sky-200 tracking-widest outline-none placeholder:text-slate-600"
            />
          </label>
          {gestor && <CampoData value={data} onChange={setData} min={INICIO_SALDO} />}
        </div>
        <p className="px-4 pt-3 text-[11px] text-slate-400">
          Conte a roupa e digite a quantidade de cada peça <b>antes</b> de entregar para a
          lavanderia.
        </p>
        <div className="p-2">
          {visiveis.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                "flex items-center gap-3 px-2 py-1.5 rounded-lg",
                i % 2 ? "bg-slate-800/30" : "",
              )}
            >
              <span className="flex-1 text-sm font-semibold text-slate-200">{p.nome}</span>
              <input
                type="text"
                inputMode="numeric"
                value={qtd[p.id] ?? ""}
                onChange={(e) => setQtd((s) => ({ ...s, [p.id]: soNumero(e.target.value) }))}
                placeholder="0"
                aria-label={p.nome}
                className={cn(inputNum, "w-20")}
              />
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-800 space-y-3">
          <FotoTalao arquivo={foto} onChange={setFoto} obrigatoria={precisaFoto} jaTem={!!talao} />
          <label className="block">
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300 mb-1.5">
              <AlertTriangle size={12} /> Observações (manchas, avarias…)
            </span>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500 rounded-md px-3 py-2 text-sm text-white outline-none resize-none"
            />
          </label>
        </div>
      </div>
      <div className="p-4 border-t border-slate-800 space-y-2 shrink-0">
        {erro && <ErroBox texto={erro} />}
        {!pode && !salvando && (
          <p className="text-[11px] text-slate-400 text-center">
            Falta:{" "}
            {[
              !numero && "número do talão",
              total === 0 && "quantidades",
              precisaFoto && !foto && "foto do talão",
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
        <button
          onClick={enviar}
          disabled={!pode}
          className={cn(
            "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2",
            pode
              ? "bg-sky-500 hover:bg-sky-600 text-white"
              : "bg-slate-800 text-slate-500 cursor-not-allowed",
          )}
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {talao ? "Salvar correção" : "Registrar coleta"} · Talão {numero || "—"} · {total} peças
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- retorno */

function RetornoLista({
  unidade,
  taloes,
  loading,
  erro,
  pecas,
  gestor,
  onDone,
}: {
  unidade: UnidadeLav;
  taloes: Talao[];
  loading: boolean;
  erro?: string;
  pecas: Peca[];
  gestor: boolean;
  onDone: () => void;
}) {
  const [sel, setSel] = useState<Talao | null>(null);
  const hoje = todaySP();
  if (sel)
    return (
      <RetornoForm
        talao={sel}
        pecas={pecas}
        gestor={gestor}
        onBack={() => setSel(null)}
        onDone={() => {
          setSel(null);
          onDone();
        }}
      />
    );
  return (
    <div className="flex-1 overflow-auto p-4">
      {loading ? (
        <div className="text-center text-slate-400 py-12">
          <Loader2 className="animate-spin inline mr-2" size={16} /> Carregando…
        </div>
      ) : erro ? (
        <ErroBox texto={erro} />
      ) : taloes.length === 0 ? (
        <div className="text-center text-slate-400 py-12">
          Nenhum talão aguardando retorno em {unidade}.
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-[11px] text-slate-400">
            Escolha o <b className="text-sky-300">número do talão</b> que voltou (está escrito no
            papel).
          </p>
          {taloes.map((t) => {
            const dias = diasEntre(t.data_coleta, hoje);
            const alerta = dias >= DIAS_ALERTA_ABERTO;
            const total = t.itens.reduce((s, i) => s + i.saida_hotel, 0);
            return (
              <button
                key={t.id}
                onClick={() => setSel(t)}
                className={cn(
                  "text-left bg-slate-800 border-2 rounded-2xl p-4 hover:border-emerald-500 transition-colors",
                  alerta ? "border-red-500" : "border-slate-700",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Talão
                    </p>
                    <p className="text-2xl font-black text-sky-200 tracking-wider leading-tight">
                      Nº {t.numero}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-md",
                      alerta ? "bg-red-500 text-white" : "bg-slate-700 text-slate-200",
                    )}
                  >
                    <Clock size={11} />{" "}
                    {dias === 0 ? "saiu hoje" : `há ${dias} dia${dias > 1 ? "s" : ""}`}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Saiu em {dataBR(t.data_coleta)} · {total} peças · por {t.coleta_por_nome}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type LinhaRet = {
  peca_id: string;
  saida_hotel: number;
  ent_lav: string;
  saida_lav: string;
  guardado: string;
};

function RetornoForm({
  talao,
  pecas,
  gestor,
  onBack,
  onDone,
}: {
  talao: Talao;
  pecas: Peca[];
  gestor: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const nomePeca = useMemo(() => {
    const m = new Map(pecas.map((p) => [p.id, p.nome]));
    return (id: string) => m.get(id) ?? "Peça";
  }, [pecas]);
  const ordem = useMemo(() => new Map(pecas.map((p) => [p.id, p.ordem])), [pecas]);
  const corrigindo = !!talao.retorno_data;
  const [linhas, setLinhas] = useState<LinhaRet[]>(() =>
    talao.itens
      .map((i) => ({
        peca_id: i.peca_id,
        saida_hotel: i.saida_hotel,
        ent_lav: i.ent_lav === null ? "" : String(i.ent_lav),
        saida_lav: i.saida_lav === null ? "" : String(i.saida_lav),
        guardado: i.guardado === null ? "" : String(i.guardado),
      }))
      .sort((a, b) => (ordem.get(a.peca_id) ?? 0) - (ordem.get(b.peca_id) ?? 0)),
  );
  const [data, setData] = useState(talao.retorno_data ?? todaySP());
  const [foto, setFoto] = useState<File | null>(null);
  const [obs, setObs] = useState(talao.retorno_obs ?? "");
  const [extra, setExtra] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const disponiveis = pecas.filter((p) => p.ativo && !linhas.some((l) => l.peca_id === p.id));
  const set = (id: string, campo: "ent_lav" | "saida_lav" | "guardado", v: string) =>
    setLinhas((ls) => ls.map((l) => (l.peca_id === id ? { ...l, [campo]: soNumero(v) } : l)));
  const num = (s: string) => (s.trim() === "" ? null : parseInt(s, 10));
  const totalGuardado = linhas.reduce((s, l) => s + (num(l.guardado) ?? 0), 0);
  const precisaFoto = !talao.retorno_foto;
  const pendencia = validarRetorno(linhas, nomePeca);
  const pode = !pendencia && (!precisaFoto || !!foto) && !salvando;

  const enviar = async () => {
    if (!pode) return;
    setSalvando(true);
    setErro(null);
    let path: string | null = null;
    try {
      if (foto) path = await enviarFotoTalao(foto, talao.unidade, "retorno");
      await registrarRetorno({
        talaoId: talao.id,
        data,
        foto: path,
        obs,
        itens: normalizarRetorno(linhas),
      });
      if (path && talao.retorno_foto && talao.retorno_foto !== path)
        await apagarFotos([talao.retorno_foto]);
      toast.success(
        `Retorno do talão nº ${talao.numero} registrado · ${totalGuardado} peças guardadas`,
      );
      onDone();
    } catch (e) {
      if (path) await apagarFotos([path]).catch(() => undefined);
      const msg = e instanceof Error ? e.message : "Não foi possível salvar.";
      setErro(msg);
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <div className="p-3 border-b border-slate-800 flex items-center gap-3 shrink-0">
        <button
          onClick={onBack}
          className="text-xs font-bold text-slate-400 hover:text-white px-2 py-1"
        >
          ← Voltar
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
            Talão Nº {talao.numero} · saiu em {dataBR(talao.data_coleta)}
          </p>
          <p className="text-sm font-black text-emerald-300">
            {corrigindo ? "Corrigir retorno" : "Registrar retorno"}
          </p>
        </div>
      </div>
      <div className="overflow-auto flex-1">
        <div className="mx-3 mt-3 bg-sky-500/10 border border-sky-500/40 rounded-lg p-3 text-[11px] text-sky-100 leading-snug">
          Copie do talão o que estiver escrito em <b>Ent. Lav.</b> e <b>Saída Lav.</b> (pode deixar
          em branco o que não estiver anotado). Em <b>Contei</b>, conte você a roupa ao guardar.
        </div>
        <div className="p-3 space-y-2">
          {linhas.map((l) => {
            const ent = num(l.ent_lav);
            const sai = num(l.saida_lav);
            const gua = num(l.guardado);
            const incompleta = linhaIncompleta(l);
            const falta = sai !== null && gua !== null && gua < sai ? sai - gua : 0;
            const difColeta =
              ent !== null && l.saida_hotel > 0 && ent !== l.saida_hotel ? ent - l.saida_hotel : 0;
            return (
              <div
                key={l.peca_id}
                className={cn(
                  "bg-slate-800/60 border rounded-xl p-2.5",
                  incompleta ? "border-red-500" : "border-slate-800",
                )}
              >
                <p className="text-sm font-bold text-slate-100 mb-1.5">{nomePeca(l.peca_id)}</p>
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div>
                    <p className="text-[9px] uppercase font-black text-slate-500">Saiu</p>
                    <p className="py-2 text-base font-black text-slate-300">{l.saida_hotel}</p>
                  </div>
                  {(["ent_lav", "saida_lav", "guardado"] as const).map((campo) => (
                    <label key={campo}>
                      <span
                        className={cn(
                          "block text-[9px] uppercase font-black",
                          campo === "guardado" ? "text-emerald-300" : "text-slate-500",
                        )}
                      >
                        {campo === "ent_lav"
                          ? "Ent. Lav."
                          : campo === "saida_lav"
                            ? "Saída Lav."
                            : "Contei"}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={l[campo]}
                        onChange={(e) => set(l.peca_id, campo, e.target.value)}
                        placeholder={
                          campo === "ent_lav"
                            ? String(l.saida_hotel)
                            : campo === "saida_lav"
                              ? "0"
                              : "?"
                        }
                        aria-label={`${nomePeca(l.peca_id)} ${campo}`}
                        className={cn(
                          inputNum,
                          campo === "guardado" && "border-emerald-700 focus:border-emerald-400",
                          campo === "guardado" && incompleta && "border-red-500 bg-red-500/10",
                        )}
                      />
                    </label>
                  ))}
                </div>
                {(falta > 0 || difColeta !== 0) && (
                  <div className="mt-1.5 space-y-0.5 text-[11px] font-bold">
                    {falta > 0 && (
                      <p className="text-red-300">
                        ⚠ Lavanderia anotou {sai}, chegaram {gua}: faltou {falta}.
                      </p>
                    )}
                    {difColeta !== 0 && (
                      <p className="text-amber-300">
                        Lavanderia contou {ent} na entrada; saíram {l.saida_hotel} (
                        {difColeta > 0 ? "+" : ""}
                        {difColeta}).
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {disponiveis.length > 0 && (
            <div className="flex gap-2 pt-1">
              <select
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-200"
              >
                <option value="">Voltou peça que não saiu neste talão?</option>
                {disponiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!extra}
                onClick={() => {
                  setLinhas((ls) => [
                    ...ls,
                    { peca_id: extra, saida_hotel: 0, ent_lav: "0", saida_lav: "", guardado: "" },
                  ]);
                  setExtra("");
                }}
                className="px-3 rounded-lg bg-slate-700 text-white font-bold text-sm disabled:opacity-40 flex items-center gap-1"
              >
                <Plus size={14} /> Incluir
              </button>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-800 space-y-3">
          {gestor && <CampoData value={data} onChange={setData} min={talao.data_coleta} />}
          <FotoTalao
            arquivo={foto}
            onChange={setFoto}
            obrigatoria={precisaFoto}
            jaTem={!precisaFoto}
          />
          <label className="block">
            <span className="block text-[10px] font-black uppercase tracking-wider text-amber-300 mb-1.5">
              Observações
            </span>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500 rounded-md px-3 py-2 text-sm text-white outline-none resize-none"
            />
          </label>
        </div>
      </div>
      <div className="p-4 border-t border-slate-800 space-y-2 shrink-0">
        {erro && <ErroBox texto={erro} />}
        {!salvando && (pendencia || (precisaFoto && !foto)) && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/50 rounded-lg p-2.5 text-xs font-bold text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              {[pendencia, precisaFoto && !foto ? "Falta a foto do talão." : null]
                .filter(Boolean)
                .join(" ")}
            </span>
          </div>
        )}
        <button
          onClick={enviar}
          disabled={!pode}
          className={cn(
            "w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2",
            pode
              ? "bg-emerald-500 hover:bg-emerald-600 text-white"
              : "bg-slate-800 text-slate-500 cursor-not-allowed",
          )}
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
          {corrigindo ? "Salvar correção" : "Registrar retorno"} · {totalGuardado} peças
        </button>
      </div>
    </>
  );
}
