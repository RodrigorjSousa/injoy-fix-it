import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Eye, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  normNomePessoa,
  resumirQualidade,
  STATUS_ITEM,
  urlFotoAvaliacao,
  useAvaliacoesPeriodo,
  useInvalidarAvaliacoes,
  useItensAvaliacao,
  type Avaliacao,
  type ItemChecklist,
} from "@/lib/avaliacao-arrumacao";
import { todaySP } from "@/lib/tz";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/gestor/qualidade-arrumacao")({
  component: QualidadeArrumacao,
});

const corNota = (n: number | null) =>
  n == null
    ? "text-slate-400"
    : n >= 9
      ? "text-emerald-700"
      : n >= 7
        ? "text-amber-700"
        : "text-rose-700";
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const fimDoMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/** Gestor: qualidade das arrumações avaliadas pelas líderes (notas, erros mais comuns, por camareira). */
function QualidadeArrumacao() {
  const [mes, setMes] = useState(todaySP().slice(0, 7));
  const [unidade, setUnidade] = useState<"todas" | "Botafogo" | "Ipanema">("todas");
  const [camareira, setCamareira] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Avaliacao | null>(null);
  const q = useAvaliacoesPeriodo(`${mes}-01`, fimDoMes(mes), unidade);
  const lista = useMemo(() => q.data ?? [], [q.data]);
  const r = useMemo(() => resumirQualidade(lista), [lista]);
  const daCamareira = camareira
    ? lista.filter((a) => normNomePessoa(a.camareira_nome) === camareira)
    : lista;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Star className="h-6 w-6 text-amber-500" /> Qualidade da arrumação
          </h1>
          <p className="text-sm text-muted-foreground">
            Avaliações feitas pelas líderes das camareiras.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Mês</Label>
            <Input
              type="month"
              value={mes}
              onChange={(e) => e.target.value && setMes(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unidade</Label>
            <Select value={unidade} onValueChange={(v) => setUnidade(v as typeof unidade)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">As duas</SelectItem>
                <SelectItem value="Botafogo">Botafogo</SelectItem>
                <SelectItem value="Ipanema">Ipanema</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {q.data === null && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Aplique a migração <strong>0098_avaliacao_arrumacao</strong> no Lovable para ativar as
          avaliações.
        </p>
      )}
      {q.isLoading && (
        <div className="grid place-items-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

      {q.data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi titulo="Avaliações" valor={String(r.avaliacoes)} />
            <Kpi
              titulo="Nota média"
              valor={r.media == null ? "—" : r.media.toFixed(1)}
              cor={corNota(r.media)}
            />
            <Kpi
              titulo="Mandadas refazer"
              valor={String(r.refazer)}
              cor={r.refazer ? "text-rose-700" : undefined}
            />
          </div>

          <section className="space-y-2">
            <h2 className="font-bold">Erros mais comuns</h2>
            {!r.porItem.length && (
              <p className="text-sm text-muted-foreground">Nenhuma avaliação no período.</p>
            )}
            <ul className="space-y-1.5">
              {r.porItem.map((i) => (
                <li key={i.nome} className="rounded-lg border bg-white p-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{i.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {i.ajustar} ajustar · {i.refazer} refazer · erro em {i.taxaErro}% das
                      avaliações
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-rose-400"
                      style={{ width: `${i.participacao}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {i.participacao}% de todos os erros
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold">Por camareira</h2>
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Camareira</th>
                    <th className="p-2 text-right">Avaliações</th>
                    <th className="p-2 text-right">Nota</th>
                    <th className="p-2 text-right">Erros</th>
                    <th className="p-2 text-right">Refazer</th>
                    <th className="p-2 text-left">Mais erra em</th>
                  </tr>
                </thead>
                <tbody>
                  {r.porCamareira.map((c) => {
                    const k = normNomePessoa(c.nome);
                    return (
                      <tr
                        key={k}
                        onClick={() => setCamareira(camareira === k ? null : k)}
                        className={cn(
                          "cursor-pointer border-t hover:bg-muted/30",
                          camareira === k && "bg-amber-50",
                        )}
                      >
                        <td className="p-2 font-semibold">{c.nome}</td>
                        <td className="p-2 text-right">{c.avaliacoes}</td>
                        <td className={cn("p-2 text-right font-black", corNota(c.media))}>
                          {c.media.toFixed(1)}
                        </td>
                        <td className="p-2 text-right">{c.erros}</td>
                        <td className="p-2 text-right">{c.refazer}</td>
                        <td className="p-2">{c.piorItem ?? "—"}</td>
                      </tr>
                    );
                  })}
                  {!r.porCamareira.length && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        Nenhuma avaliação no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Toque numa camareira para ver só as avaliações dela.
            </p>
          </section>

          {r.porAvaliadora.length > 1 && (
            <section className="space-y-2">
              <h2 className="font-bold">Por líder (quem avaliou)</h2>
              <div className="flex flex-wrap gap-2">
                {r.porAvaliadora.map((a) => (
                  <span key={a.nome} className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <strong>{a.nome}</strong> · {a.avaliacoes} avaliação(ões) · média{" "}
                    <strong className={corNota(a.media)}>{a.media.toFixed(1)}</strong>
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Médias muito diferentes podem indicar critérios diferentes entre as líderes.
              </p>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="font-bold">
              Avaliações {camareira ? `de ${daCamareira[0]?.camareira_nome ?? ""}` : "do mês"} (
              {daCamareira.length})
            </h2>
            <ul className="divide-y rounded-lg border bg-white">
              {daCamareira.slice(0, 100).map((a) => {
                const erros = (a.itens ?? []).filter((i) => i.status !== "ok");
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setDetalhe(a)}
                      className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/30"
                    >
                      <span className={cn("w-10 text-xl font-black", corNota(a.nota))}>
                        {a.nota.toFixed(1)}
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <strong>{a.camareira_nome}</strong> · {a.property} {a.room_number}
                        {a.refazer && (
                          <span className="ml-1 rounded bg-rose-100 px-1.5 text-[11px] font-bold text-rose-700">
                            REFAZER
                          </span>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {dataHora(a.created_at)} · por {a.avaliadora_nome ?? "—"}
                          {erros.length
                            ? ` · ${erros.map((e) => e.nome).join(", ")}`
                            : " · tudo OK"}
                        </span>
                        {a.elogio && (
                          <span className="block text-xs text-emerald-700">💚 {a.elogio}</span>
                        )}
                      </span>
                      <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <EditorItens />
      <DetalheAvaliacao a={detalhe} onClose={() => setDetalhe(null)} />
    </div>
  );
}

function Kpi({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={cn("text-3xl font-black", cor)}>{valor}</p>
    </div>
  );
}

function DetalheAvaliacao({ a, onClose }: { a: Avaliacao | null; onClose: () => void }) {
  const invalidar = useInvalidarAvaliacoes();
  const fotos = useMemo(
    () => (a?.itens ?? []).filter((i) => i.foto_path).map((i) => i.foto_path as string),
    [a],
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [carregadas, setCarregadas] = useState<string | null>(null);
  if (a && carregadas !== a.id) {
    setCarregadas(a.id);
    void Promise.all(fotos.map(async (p) => [p, await urlFotoAvaliacao(p)] as const)).then(
      (pares) =>
        setUrls(Object.fromEntries(pares.filter(([, u]) => !!u)) as Record<string, string>),
    );
  }
  const apagar = async () => {
    if (!a || !confirm("Apagar esta avaliação? Ela sai das médias.")) return;
    const { data, error } = await db
      .from("avaliacoes_arrumacao")
      .delete()
      .eq("id", a.id)
      .select("id");
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("Não foi possível apagar (sem permissão).");
    toast.success("Avaliação apagada");
    invalidar();
    onClose();
  };
  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {a && (
          <>
            <DialogHeader>
              <DialogTitle>
                {a.camareira_nome} · {a.property} {a.room_number} ·{" "}
                <span className={corNota(a.nota)}>{a.nota.toFixed(1)}</span>
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Avaliado em {dataHora(a.created_at)} por {a.avaliadora_nome ?? "—"}
              {a.tarefa ? ` · serviço: ${a.tarefa}` : ""}
              {a.servico_concluido_em ? ` (concluído ${dataHora(a.servico_concluido_em)})` : ""}
            </p>
            <ul className="space-y-2">
              {(a.itens ?? []).map((i) => (
                <li key={i.item_id} className="rounded-lg border p-2 text-sm">
                  <p className="flex items-center justify-between">
                    <span className="font-semibold">{i.nome}</span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-xs font-bold",
                        i.status === "ok"
                          ? "bg-emerald-100 text-emerald-700"
                          : i.status === "ajustar"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-700",
                      )}
                    >
                      {STATUS_ITEM[i.status].rotulo}
                    </span>
                  </p>
                  {i.obs && <p className="text-xs text-slate-600">{i.obs}</p>}
                  {i.foto_path && urls[i.foto_path] && (
                    <a href={urls[i.foto_path]} target="_blank" rel="noreferrer">
                      <img
                        src={urls[i.foto_path]}
                        alt={i.nome}
                        className="mt-1.5 max-h-48 rounded object-cover"
                      />
                    </a>
                  )}
                </li>
              ))}
            </ul>
            {a.elogio && <p className="text-sm text-emerald-700">💚 {a.elogio}</p>}
            {a.observacao && <p className="text-sm text-slate-700">📝 {a.observacao}</p>}
            <Button variant="outline" size="sm" onClick={apagar} className="text-rose-700">
              <Trash2 className="mr-1 h-4 w-4" /> Apagar avaliação
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Gestor edita a lista de itens do checklist (vale para as próximas avaliações). */
function EditorItens() {
  const q = useItensAvaliacao(true);
  const invalidar = useInvalidarAvaliacoes();
  const [novo, setNovo] = useState("");
  const [novoDesc, setNovoDesc] = useState("");
  const itens = q.data ?? [];

  const salvar = async (id: string, campos: Partial<ItemChecklist>) => {
    const { error } = await db.from("avaliacao_arrumacao_itens").update(campos).eq("id", id);
    if (error) return toast.error(error.message);
    invalidar();
  };
  const mover = async (idx: number, dir: -1 | 1) => {
    const a = itens[idx];
    const b = itens[idx + dir];
    if (!a || !b) return;
    await Promise.all([
      db.from("avaliacao_arrumacao_itens").update({ ordem: b.ordem }).eq("id", a.id),
      db
        .from("avaliacao_arrumacao_itens")
        .update({ ordem: a.ordem === b.ordem ? a.ordem + dir : a.ordem })
        .eq("id", b.id),
    ]);
    invalidar();
  };
  const adicionar = async () => {
    if (!novo.trim()) return;
    const ordem = Math.max(0, ...itens.map((i) => i.ordem)) + 1;
    const { error } = await db
      .from("avaliacao_arrumacao_itens")
      .insert({ nome: novo.trim(), descricao: novoDesc.trim() || null, ordem });
    if (error) return toast.error(error.message);
    setNovo("");
    setNovoDesc("");
    invalidar();
  };

  if (q.data === null) return null;
  return (
    <section className="space-y-2 rounded-xl border bg-white p-4">
      <h2 className="font-bold">Itens do checklist</h2>
      <p className="text-xs text-muted-foreground">
        O que as líderes avaliam em cada quarto. Mudanças valem para as próximas avaliações;
        desativar tira o item sem apagar o histórico.
      </p>
      {q.isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      <ul className="space-y-2">
        {itens.map((i, idx) => (
          <li
            key={i.id}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-lg border p-2",
              !i.ativo && "opacity-60",
            )}
          >
            <div className="flex flex-col">
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => mover(idx, -1)}
                className="disabled:opacity-30"
                aria-label="Subir"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={idx === itens.length - 1}
                onClick={() => mover(idx, 1)}
                className="disabled:opacity-30"
                aria-label="Descer"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <Input
              defaultValue={i.nome}
              className="w-44"
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value.trim() !== i.nome &&
                salvar(i.id, { nome: e.target.value.trim() })
              }
            />
            <Input
              defaultValue={i.descricao ?? ""}
              placeholder="O que conferir"
              className="min-w-0 flex-1"
              onBlur={(e) =>
                e.target.value.trim() !== (i.descricao ?? "") &&
                salvar(i.id, { descricao: e.target.value.trim() || null })
              }
            />
            <Button variant="outline" size="sm" onClick={() => salvar(i.id, { ativo: !i.ativo })}>
              {i.ativo ? "Desativar" : "Ativar"}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Novo item (ex.: Varanda)"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          className="w-44"
        />
        <Input
          placeholder="O que conferir"
          value={novoDesc}
          onChange={(e) => setNovoDesc(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Button size="sm" onClick={adicionar} disabled={!novo.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Adicionar
        </Button>
      </div>
    </section>
  );
}
