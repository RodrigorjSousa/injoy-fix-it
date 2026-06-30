import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowLeft, Building2, BedDouble, CheckCircle2, ClipboardCheck,
  AlertTriangle, Sparkles, Wrench, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useMe, useFuncionarios, useCriarChamado,
  type Categoria, type Unidade as UnidadeStore,
} from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/vistoria")({
  component: VistoriaPage,
});

type Unidade = UnidadeStore;

const QUARTOS_POR_UNIDADE: Record<Unidade, string[]> = {
  Botafogo: ["001","002","003","005","006","107","108","109","110","111","112","113","114","115","117","118","301","401","501"],
  Ipanema: ["001","002","103","104","205","206","307","308","309","410","411","412"],
};

const CHECKLIST = [
  { id: "limpeza", label: "Limpeza geral do quarto (piso, móveis, vidros)" },
  { id: "banheiro", label: "Banheiro higienizado (vaso, pia, box, espelho)" },
  { id: "enxoval", label: "Enxoval completo (lençóis, fronhas, toalhas)" },
  { id: "amenities", label: "Amenities reabastecidos (shampoo, sabonete, papel)" },
  { id: "frigobar", label: "Frigobar abastecido e funcionando" },
  { id: "ar", label: "Ar condicionado funcionando e em temperatura adequada" },
  { id: "tv", label: "TV funcionando e controle remoto com pilhas" },
  { id: "iluminacao", label: "Iluminação completa (todas as lâmpadas acesas)" },
  { id: "tomadas", label: "Tomadas e interruptores funcionando" },
  { id: "hidraulica", label: "Hidráulica em ordem (descarga, torneiras, chuveiro)" },
  { id: "fechadura", label: "Fechadura e chaves/cartões testados" },
  { id: "janelas", label: "Janelas e cortinas em bom estado" },
  { id: "odor", label: "Ambiente sem odores / aromatizado" },
];

type Registro = {
  id: string;
  unidade: Unidade;
  quarto: string;
  responsavel: string;
  data: string;
  itens: Record<string, boolean>;
  observacoes: string;
  liberado: boolean;
  tipoPendencia?: "Camareira" | "Serviço";
};

const STORAGE_KEY = "injoy:vistorias";
export const PRIORIDADE_KEY = "injoy.camareiras.prioridade.v1";

function loadRegistros(): Registro[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveRegistros(list: Registro[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

type PrioridadeEntry = {
  key: string; // `${unidade}-${quarto}`
  unidade: Unidade;
  quarto: string;
  motivo: string;
  criadoEm: string;
};
function loadPrioridade(): PrioridadeEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(PRIORIDADE_KEY) || "[]"); } catch { return []; }
}
function savePrioridade(list: PrioridadeEntry[]) {
  localStorage.setItem(PRIORIDADE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent("injoy:prioridade-changed"));
}

const CATEGORIAS_SERVICO: { label: string; backend: Categoria }[] = [
  { label: "Elétrica", backend: "Elétrica" },
  { label: "Hidráulica", backend: "Hidráulica" },
  { label: "Ar Condicionado", backend: "Ar condicionado" },
  { label: "Automação / TV", backend: "Automação" },
  { label: "Alvenaria / Mobiliário", backend: "Alvenaria" },
  { label: "Pintura", backend: "Pintura" },
  { label: "Marcenaria", backend: "Marcenaria" },
];

function VistoriaPage() {
  const { data: me } = useMe();
  const { data: funcionarios = [] } = useFuncionarios();
  const criarChamado = useCriarChamado();
  const podeAcessar = !!me && (me.isGestor || me.isAdmin || me.isRecepcao);

  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [quarto, setQuarto] = useState<string | null>(null);
  const [itens, setItens] = useState<Record<string, boolean>>({});
  const [obs, setObs] = useState("");
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [bloqueioOpen, setBloqueioOpen] = useState(false);

  // form de bloqueio
  const [tipoPend, setTipoPend] = useState<"Camareira" | "Serviço" | "">("");
  const [catLabel, setCatLabel] = useState<string>("");
  const [tecnicoId, setTecnicoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { setRegistros(loadRegistros()); }, []);

  const quartos = unidade ? QUARTOS_POR_UNIDADE[unidade] : [];
  const total = CHECKLIST.length;
  const concluidos = Object.values(itens).filter(Boolean).length;
  const todosOk = concluidos === total;
  const ultima = useMemo(
    () => (unidade && quarto ? registros.find((r) => r.unidade === unidade && r.quarto === quarto) : null),
    [registros, unidade, quarto],
  );

  const catSelecionada = CATEGORIAS_SERVICO.find((c) => c.label === catLabel);
  const tecnicosDaCategoria = catSelecionada
    ? funcionarios.filter((f) => f.categorias.includes(catSelecionada.backend))
    : [];
  useEffect(() => {
    if (tecnicosDaCategoria.length === 1) setTecnicoId(tecnicosDaCategoria[0].id);
    else setTecnicoId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catLabel, funcionarios.length]);

  if (me && !podeAcessar) return <Navigate to="/painel" replace />;

  const reset = () => {
    setQuarto(null); setItens({}); setObs("");
    setTipoPend(""); setCatLabel(""); setTecnicoId(null);
  };

  const liberar = () => {
    if (!unidade || !quarto) return;
    if (!todosOk) { toast.error("Marque todos os itens antes de liberar."); return; }
    const novo: Registro = {
      id: crypto.randomUUID(), unidade, quarto,
      responsavel: me?.funcionario?.nome || me?.email || "Recepção",
      data: new Date().toISOString(), itens, observacoes: obs, liberado: true,
    };
    const updated = [novo, ...registros.filter((r) => !(r.unidade === unidade && r.quarto === quarto))];
    saveRegistros(updated); setRegistros(updated);
    // limpa flag de prioridade
    const pri = loadPrioridade().filter((p) => p.key !== `${unidade}-${quarto}`);
    savePrioridade(pri);
    toast.success(`Quarto ${quarto} (${unidade}) liberado para check-in.`);
    reset();
  };

  const abrirBloqueio = () => {
    if (!obs.trim()) {
      toast.error("Descreva o motivo nas observações antes de bloquear.");
      return;
    }
    setBloqueioOpen(true);
  };

  const confirmarBloqueio = async () => {
    if (!unidade || !quarto || !tipoPend || !me) return;

    if (tipoPend === "Serviço") {
      if (!catSelecionada) { toast.error("Selecione a categoria do serviço."); return; }
      if (tecnicosDaCategoria.length >= 2 && !tecnicoId) {
        toast.error("Selecione qual técnico será acionado."); return;
      }
    }

    setEnviando(true);
    const responsavel = me.funcionario?.nome || me.email || "Recepção";

    // 1) registra vistoria como NÃO liberada
    const novo: Registro = {
      id: crypto.randomUUID(), unidade, quarto, responsavel,
      data: new Date().toISOString(), itens, observacoes: obs, liberado: false,
      tipoPendencia: tipoPend,
    };
    const updated = [novo, ...registros.filter((r) => !(r.unidade === unidade && r.quarto === quarto))];
    saveRegistros(updated); setRegistros(updated);

    try {
      if (tipoPend === "Camareira") {
        // marca como ALTA PRIORIDADE
        const pri = loadPrioridade().filter((p) => p.key !== `${unidade}-${quarto}`);
        pri.unshift({
          key: `${unidade}-${quarto}`, unidade, quarto,
          motivo: obs.trim(), criadoEm: new Date().toISOString(),
        });
        savePrioridade(pri);

        // notifica camareiras via chat
        const { data: destinos, error } = await supabase.rpc("get_camareiras_user_ids");
        if (error) throw error;
        const lista = (destinos ?? []).filter((r: { user_id: string }) => r.user_id !== me.userId);
        if (lista.length > 0) {
          const aviso =
            `🚨 ALTA PRIORIDADE — Q. ${quarto} (INJOY ${unidade})\n` +
            `Vistoria de check-in REPROVADA pela recepção (${responsavel}).\n` +
            `Pendência de LIMPEZA / ENXOVAL.\n` +
            `Motivo: ${obs.trim()}\n` +
            `⚠️ Refaça este quarto imediatamente — hóspede aguardando.`;
          const rows = lista.map((r: { user_id: string }) => ({
            remetente_id: me.userId!, destinatario_id: r.user_id, conteudo: aviso,
          }));
          const { error: msgErr } = await supabase.from("mensagens").insert(rows);
          if (msgErr) throw msgErr;
          toast.success(`Camareiras notificadas (${lista.length}). Quarto marcado como ALTA PRIORIDADE.`);
        } else {
          toast.message("Quarto marcado, mas não há camareiras cadastradas para notificar.");
        }
      } else {
        // SERVIÇO — cria chamado URGENTE e notifica técnico
        const tecnico = tecnicosDaCategoria.find((f) => f.id === tecnicoId) ?? null;
        const descricao =
          `[Quarto ${quarto}] 🚨 URGENTE — Vistoria de check-in REPROVADA. ` +
          `${catLabel}. Obs.: ${obs.trim()} ` +
          `[Solicitado por: ${responsavel}] ` +
          `[Técnico responsável: ${tecnico?.nome ?? "Pendente de Atribuição"}]`;

        await new Promise<string>((resolve, reject) => {
          criarChamado.mutate(
            {
              unidade, categoria: catSelecionada!.backend, descricao,
              responsavelId: tecnico?.id ?? null,
            },
            { onSuccess: resolve, onError: reject },
          );
        });

        if (tecnico?.userId) {
          const aviso =
            `🚨 CHAMADO URGENTE — Q. ${quarto} (INJOY ${unidade})\n` +
            `Vistoria de check-in REPROVADA — pendência de ${catLabel}.\n` +
            `Motivo: ${obs.trim()}\n` +
            `Solicitado por: ${responsavel}.\n` +
            `⚠️ Atender imediatamente — hóspede aguardando liberação.`;
          const { error: msgErr } = await supabase.from("mensagens").insert({
            remetente_id: me.userId!, destinatario_id: tecnico.userId, conteudo: aviso,
          });
          if (msgErr) console.warn("[vistoria] falha ao notificar técnico", msgErr);
        }
        toast.success(
          tecnico
            ? `Chamado URGENTE enviado para ${tecnico.nome}.`
            : "Chamado URGENTE criado (pendente de atribuição).",
        );
      }

      setBloqueioOpen(false); reset();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Falha ao processar bloqueio.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Link to="/recepcao" className="h-9 w-9 grid place-items-center rounded-lg border border-border hover:bg-muted" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vistoria para Check-in</h1>
          <p className="text-sm text-muted-foreground">
            Verifique o quarto antes da entrada do hóspede e libere para check-in.
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="font-medium">1. Selecione a unidade</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(["Botafogo", "Ipanema"] as Unidade[]).map((u) => (
            <button key={u}
              onClick={() => { setUnidade(u); setQuarto(null); setItens({}); setObs(""); }}
              className={cn("rounded-lg border p-4 text-left transition-all",
                unidade === u ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/40")}>
              <div className="font-semibold">{u}</div>
              <div className="text-xs text-muted-foreground">{QUARTOS_POR_UNIDADE[u].length} quartos</div>
            </button>
          ))}
        </div>
      </section>

      {unidade && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <BedDouble className="h-4 w-4 text-primary" />
            <h2 className="font-medium">2. Selecione o quarto ({unidade})</h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
            {quartos.map((q) => {
              const r = registros.find((x) => x.unidade === unidade && x.quarto === q);
              const liberado = r?.liberado;
              return (
                <button key={q}
                  onClick={() => { setQuarto(q); setItens({}); setObs(""); }}
                  className={cn("relative rounded-lg border py-3 text-sm font-medium transition-all",
                    quarto === q ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/40")}>
                  {q}
                  {r && (<span className={cn("absolute top-1 right-1 h-2 w-2 rounded-full", liberado ? "bg-emerald-500" : "bg-red-500")} />)}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {unidade && quarto && (
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h2 className="font-medium">3. Checklist — Quarto {quarto} / {unidade}</h2>
            </div>
            <div className="text-xs font-medium px-2 py-1 rounded-full bg-muted">{concluidos}/{total} itens</div>
          </div>

          {ultima && (
            <div className={cn("rounded-lg border p-3 text-xs",
              ultima.liberado ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900")}>
              Última vistoria: {new Date(ultima.data).toLocaleString("pt-BR")} por {ultima.responsavel} — {ultima.liberado ? "Liberado" : "NÃO liberado"}
              {ultima.tipoPendencia && <> · Pendência: <b>{ultima.tipoPendencia}</b></>}
              {ultima.observacoes && <div className="mt-1 opacity-80">Obs: {ultima.observacoes}</div>}
            </div>
          )}

          <ul className="space-y-2">
            {CHECKLIST.map((item) => {
              const checked = !!itens[item.id];
              return (
                <li key={item.id}>
                  <label className={cn("flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    checked ? "border-emerald-300 bg-emerald-50/50" : "border-border hover:bg-muted/40")}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600"
                      checked={checked}
                      onChange={(e) => setItens((p) => ({ ...p, [item.id]: e.target.checked }))} />
                    <span className="text-sm">{item.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div>
            <label className="text-sm font-medium block mb-1">Observações / motivo do bloqueio</label>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3}
              placeholder="Registre pendências, avarias ou informações relevantes…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <button onClick={abrirBloqueio}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 text-red-700 px-4 py-2.5 text-sm font-medium hover:bg-red-100">
              <AlertTriangle className="h-4 w-4" /> Não liberar (com pendências)
            </button>
            <button onClick={liberar} disabled={!todosOk}
              className={cn("w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white",
                todosOk ? "bg-emerald-600 hover:bg-emerald-700" : "bg-muted text-muted-foreground cursor-not-allowed")}>
              <CheckCircle2 className="h-4 w-4" /> Liberar para check-in
            </button>
          </div>
        </section>
      )}

      {registros.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-medium mb-3">Vistorias recentes</h2>
          <ul className="divide-y divide-border">
            {registros.slice(0, 8).map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{r.unidade} · Quarto {r.quarto}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.data).toLocaleString("pt-BR")} · {r.responsavel}
                    {r.tipoPendencia && <> · <b>{r.tipoPendencia}</b></>}
                  </div>
                </div>
                <span className={cn("text-xs font-semibold px-2 py-1 rounded-full",
                  r.liberado ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
                  {r.liberado ? "Liberado" : "Bloqueado"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Modal bloqueio */}
      {bloqueioOpen && unidade && quarto && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => !enviando && setBloqueioOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 bg-red-600 text-white">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                <div className="font-bold">Bloquear Q. {quarto} — {unidade}</div>
              </div>
              <button onClick={() => !enviando && setBloqueioOpen(false)} aria-label="Fechar" className="p-1 hover:bg-red-700 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold mb-2">A pendência é de:</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setTipoPend("Camareira")}
                    className={cn("flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition",
                      tipoPend === "Camareira" ? "border-red-500 bg-red-50 dark:bg-red-950/30" : "border-border hover:border-red-300")}>
                    <Sparkles className="h-6 w-6 text-red-600" />
                    <span className="text-sm font-bold">Camareira</span>
                    <span className="text-[11px] text-muted-foreground text-center">Limpeza, enxoval, amenities</span>
                  </button>
                  <button type="button" onClick={() => setTipoPend("Serviço")}
                    className={cn("flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition",
                      tipoPend === "Serviço" ? "border-red-500 bg-red-50 dark:bg-red-950/30" : "border-border hover:border-red-300")}>
                    <Wrench className="h-6 w-6 text-red-600" />
                    <span className="text-sm font-bold">Serviço</span>
                    <span className="text-[11px] text-muted-foreground text-center">Manutenção técnica</span>
                  </button>
                </div>
              </div>

              {tipoPend === "Serviço" && (
                <>
                  <div>
                    <p className="text-sm font-semibold mb-2">Categoria do serviço</p>
                    <div className="grid grid-cols-2 gap-2">
                      {CATEGORIAS_SERVICO.map((c) => (
                        <button key={c.label} type="button" onClick={() => setCatLabel(c.label)}
                          className={cn("py-2.5 px-3 rounded-lg border text-sm font-semibold",
                            catLabel === c.label
                              ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                              : "border-border hover:border-primary/40")}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {catLabel && tecnicosDaCategoria.length >= 2 && (
                    <div>
                      <p className="text-sm font-semibold mb-2">Qual técnico vai atender?</p>
                      <div className="space-y-2">
                        {tecnicosDaCategoria.map((t) => (
                          <button key={t.id} type="button" onClick={() => setTecnicoId(t.id)}
                            className={cn("w-full text-left rounded-lg border p-3 text-sm font-medium",
                              tecnicoId === t.id ? "border-red-500 bg-red-50 dark:bg-red-950/30" : "border-border hover:border-primary/40")}>
                            {t.nome}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {catLabel && tecnicosDaCategoria.length === 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                      Nenhum técnico cadastrado para esta categoria — chamado ficará pendente de atribuição.
                    </p>
                  )}
                </>
              )}

              <div className="text-xs bg-muted/50 rounded p-3 border border-border">
                <b>Motivo registrado:</b> {obs.trim() || "—"}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setBloqueioOpen(false)} disabled={enviando}
                  className="flex-1 rounded-lg border border-border bg-card py-2.5 text-sm font-semibold hover:bg-muted">
                  Cancelar
                </button>
                <button onClick={confirmarBloqueio}
                  disabled={enviando || !tipoPend || (tipoPend === "Serviço" && (!catLabel || (tecnicosDaCategoria.length >= 2 && !tecnicoId)))}
                  className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-muted disabled:text-muted-foreground text-white py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {enviando ? "Enviando..." : "Bloquear e notificar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
