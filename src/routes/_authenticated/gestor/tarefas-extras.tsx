import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { loadItems, saveItems } from "@/components/camareiras/tarefas-extras-modal";
import {
  CORES,
  ICONES,
  montarCategoria,
  novaChave,
  salvarConfigCategorias,
  useConfigCategorias,
  type CategoriaConfig,
  type NomeCor,
  type NomeIcone,
  type UnidadeTE,
} from "@/lib/tarefas-extras-categorias";
import { PERIODO_PADRAO_DIAS } from "@/lib/tarefas-extras-status";

export const Route = createFileRoute("/_authenticated/gestor/tarefas-extras")({
  component: GestaoTarefasExtras,
});

const PERIODICITY_KEY = "tarefas_extras_periodicity";
const UNIDADES: UnidadeTE[] = ["Botafogo", "Ipanema"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function usePeriodicidade() {
  return useQuery({
    queryKey: ["tarefas_extras_periodicidade"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data } = await db.from("app_settings").select("value").eq("key", PERIODICITY_KEY).maybeSingle();
      try {
        const v = JSON.parse(data?.value ?? "{}");
        return v && typeof v === "object" ? v : {};
      } catch {
        return {};
      }
    },
  });
}

type Rascunho = CategoriaConfig & { periodo: number; itens: Record<UnidadeTE, string> };

function Editor({
  inicial,
  lista,
  periodicidade,
  onClose,
}: {
  inicial: Rascunho;
  lista: CategoriaConfig[];
  periodicidade: Record<string, number>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [r, setR] = useState<Rascunho>(inicial);
  const [salvando, setSalvando] = useState(false);
  const novo = !lista.some((c) => c.key === r.key);
  const Icone = ICONES[r.icone];

  const toggleUnidade = (u: UnidadeTE) =>
    setR((x) => ({ ...x, unidades: x.unidades.includes(u) ? x.unidades.filter((y) => y !== u) : [...x.unidades, u] }));

  const salvar = async () => {
    const label = r.label.trim();
    if (!label) return toast.error("Dê um nome ao card.");
    if (!r.unidades.length) return toast.error("Escolha pelo menos uma unidade.");
    if (!Number.isFinite(r.periodo) || r.periodo < 1) return toast.error("Frequência inválida (1 dia ou mais).");
    setSalvando(true);
    try {
      const anterior = lista.find((c) => c.key === r.key);
      const nomesAnteriores = Array.from(
        new Set([...(anterior?.nomesAnteriores ?? []), ...(anterior && anterior.label !== label ? [anterior.label] : [])]),
      ).filter((n) => n !== label);
      const item: CategoriaConfig = {
        key: r.key, label, icone: r.icone, cor: r.cor, unidades: r.unidades, ativo: r.ativo, nomesAnteriores, custom: r.custom,
      };
      const nova = novo ? [...lista, item] : lista.map((c) => (c.key === r.key ? item : c));
      await salvarConfigCategorias(nova);

      if (periodicidade[r.key] !== r.periodo) {
        const { error } = await db
          .from("app_settings")
          .upsert({ key: PERIODICITY_KEY, value: JSON.stringify({ ...periodicidade, [r.key]: Math.round(r.periodo) }) });
        if (error) throw new Error(error.message);
      }
      for (const u of r.unidades) {
        const itens = r.itens[u].split("\n").map((t) => t.trim()).filter(Boolean);
        await saveItems(u, r.key, itens);
      }
      toast.success(novo ? "Card criado" : "Card atualizado");
      void qc.invalidateQueries({ queryKey: ["tarefas_extras_categorias"] });
      void qc.invalidateQueries({ queryKey: ["tarefas_extras_periodicidade"] });
      void qc.invalidateQueries({ queryKey: ["tarefas_extras_status"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{novo ? "Novo card de Tarefas Extras" : `Editar: ${inicial.label}`}</DialogTitle>
          <DialogDescription>Área comum que as camareiras vão limpar e registrar.</DialogDescription>
        </DialogHeader>

        <div className={cn("flex items-center gap-3 rounded-xl bg-gradient-to-br p-3 text-white", CORES[r.cor].gradient)}>
          <div className="rounded-lg bg-white/20 p-2"><Icone size={22} /></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-90">Prévia</p>
            <p className="font-black">{r.label || "Nome do card"}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={r.label} onChange={(e) => setR({ ...r, label: e.target.value })} placeholder="Ex.: Geral Recepção" />
            {!novo && r.label.trim() !== inicial.label && (
              <p className="mt-1 text-xs text-muted-foreground">O histórico do nome antigo continua ligado a este card.</p>
            )}
          </div>

          <div>
            <Label>Ícone</Label>
            <div className="mt-1 grid grid-cols-9 gap-1.5">
              {(Object.keys(ICONES) as NomeIcone[]).map((n) => {
                const I = ICONES[n];
                return (
                  <button key={n} type="button" onClick={() => setR({ ...r, icone: n })} aria-label={n}
                    className={cn("grid h-9 place-items-center rounded-lg border", r.icone === n ? "border-slate-900 bg-slate-900 text-white" : "hover:bg-slate-100")}>
                    <I size={18} />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Cor</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {(Object.keys(CORES) as NomeCor[]).map((c) => (
                <button key={c} type="button" onClick={() => setR({ ...r, cor: c })} aria-label={CORES[c].nome} title={CORES[c].nome}
                  className={cn("h-8 w-8 rounded-full bg-gradient-to-br", CORES[c].gradient, r.cor === c ? "ring-2 ring-slate-900 ring-offset-2" : "")} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Unidades</Label>
              <div className="mt-1 space-y-1">
                {UNIDADES.map((u) => (
                  <label key={u} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={r.unidades.includes(u)} onChange={() => toggleUnidade(u)} /> {u}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Repetir a cada (dias)</Label>
              <Input type="number" min={1} value={r.periodo} onChange={(e) => setR({ ...r, periodo: Number(e.target.value) })} />
            </div>
          </div>

          {r.unidades.map((u) => (
            <div key={u}>
              <Label>Itens do checklist · {u} (um por linha)</Label>
              <Textarea rows={6} value={r.itens[u]} onChange={(e) => setR({ ...r, itens: { ...r.itens, [u]: e.target.value } })}
                placeholder={"Varrer e passar pano no piso\nRecolher e trocar o lixo"} />
            </div>
          ))}

          <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span>Card ativo (aparece para as camareiras)</span>
            <Switch checked={r.ativo} onCheckedChange={(v) => setR({ ...r, ativo: v })} />
          </label>

          <Button className="w-full" onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GestaoTarefasExtras() {
  const qc = useQueryClient();
  const { data: lista = [], isLoading } = useConfigCategorias();
  const { data: periodicidade = {} } = usePeriodicidade();
  const [filtro, setFiltro] = useState<UnidadeTE | "todas">("todas");
  const [editando, setEditando] = useState<Rascunho | null>(null);

  const visiveis = useMemo(
    () => lista.filter((c) => filtro === "todas" || c.unidades.includes(filtro)),
    [lista, filtro],
  );

  const abrir = (c: CategoriaConfig | null) => {
    const base: CategoriaConfig = c ?? {
      key: novaChave("area"), label: "", icone: "Sparkles", cor: "turquesa",
      unidades: filtro === "todas" ? ["Botafogo"] : [filtro], ativo: true, nomesAnteriores: [], custom: true,
    };
    const cat = montarCategoria(base);
    setEditando({
      ...base,
      periodo: periodicidade[base.key] ?? PERIODO_PADRAO_DIAS,
      itens: {
        Botafogo: c ? loadItems("Botafogo", base.key, cat.defaults).join("\n") : "",
        Ipanema: c ? loadItems("Ipanema", base.key, cat.defaults).join("\n") : "",
      },
    });
  };

  const salvarLista = async (nova: CategoriaConfig[], msg: string) => {
    try {
      await salvarConfigCategorias(nova);
      toast.success(msg);
      void qc.invalidateQueries({ queryKey: ["tarefas_extras_categorias"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/gestor" className="rounded-lg border bg-white p-2 hover:bg-slate-100" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black"><Sparkles className="h-6 w-6 text-fuchsia-600" /> Tarefas Extras</h1>
            <p className="text-sm text-slate-500">Crie e edite os cards das áreas comuns que as camareiras registram.</p>
          </div>
        </div>
        <Button onClick={() => abrir(null)} className="gap-1"><Plus className="h-4 w-4" /> Novo card</Button>
      </div>

      <div className="flex gap-2">
        {(["todas", ...UNIDADES] as const).map((u) => (
          <button key={u} type="button" onClick={() => setFiltro(u)}
            className={cn("rounded-full border px-3 py-1 text-sm font-semibold", filtro === u ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100")}>
            {u === "todas" ? "Todas" : u}
          </button>
        ))}
      </div>

      {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visiveis.map((c) => {
          const cat = montarCategoria(c);
          const I = cat.icon;
          return (
            <div key={c.key} className={cn("flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm", !c.ativo && "opacity-60")}>
              <div className="flex items-center gap-3">
                <div className={cn("grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br text-white", cat.gradient)}><I size={22} /></div>
                <div className="min-w-0">
                  <p className="truncate font-black">{c.label}</p>
                  <p className="text-xs text-slate-500">{c.unidades.join(" · ")} · a cada {periodicidade[c.key] ?? PERIODO_PADRAO_DIAS} dias</p>
                  {!c.ativo && <p className="text-xs font-semibold text-amber-700">Desativado</p>}
                </div>
              </div>
              <div className="mt-auto flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => abrir(c)}><Pencil className="h-4 w-4" /> Editar</Button>
                <Button size="sm" variant="outline" className="gap-1" title={c.ativo ? "Desativar" : "Ativar"}
                  onClick={() => salvarLista(lista.map((x) => (x.key === c.key ? { ...x, ativo: !x.ativo } : x)), c.ativo ? "Card desativado" : "Card ativado")}>
                  {c.ativo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                {c.custom && (
                  <Button size="sm" variant="outline" className="text-red-600" title="Excluir"
                    onClick={() => confirm(`Excluir o card "${c.label}"? O histórico já registrado continua salvo.`) &&
                      salvarLista(lista.filter((x) => x.key !== c.key), "Card excluído")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editando && (
        <Editor inicial={editando} lista={lista} periodicidade={periodicidade} onClose={() => setEditando(null)} />
      )}
    </div>
  );
}
