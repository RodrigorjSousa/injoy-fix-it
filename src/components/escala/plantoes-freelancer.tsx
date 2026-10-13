// Plantões (dias "extra") de um freelancer numa unidade e mês: resumo dia a dia com editar, excluir e incluir.
// Usado no Financeiro (linha que veio da Escala) e na Previsão de Carga (reforços lançados).
// Tudo grava na Escala; o lançamento do Financeiro se ajusta sozinho pela sincronização do banco.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Edit3, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useEscalaColaboradores, useEscalaModalidades, type EscalaDia } from "@/lib/escala";
import {
  horaSaida,
  limitesMes,
  MOTIVO_CHAMADA,
  validarPlantao,
  type MotivoChamada,
} from "@/lib/plantao";

export type AlvoPlantoes = {
  colaboradorId: string;
  unidade: "Botafogo" | "Ipanema";
  mes: string;
  pago?: boolean;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (v: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${v}T12:00:00Z`));

function useAtualizarTudo() {
  const qc = useQueryClient();
  return () => {
    for (const k of [
      "plantoes-freelancer",
      "escala-dias",
      "escala-colaboradores",
      "financeiro",
      "previsao_reforco_pedidos",
      "previsao-reforcos-chamados",
      "previsao-carga",
      "dashboard",
    ])
      void qc.invalidateQueries({ queryKey: [k] });
  };
}

function usePlantoes(alvo: AlvoPlantoes | null) {
  return useQuery({
    queryKey: ["plantoes-freelancer", alvo?.colaboradorId, alvo?.unidade, alvo?.mes],
    enabled: !!alvo,
    queryFn: async (): Promise<EscalaDia[]> => {
      const { inicio, fim } = limitesMes(alvo!.mes);
      const { data, error } = await supabase
        .from("escala_dias")
        .select("*")
        .eq("colaborador_id", alvo!.colaboradorId)
        .eq("unidade", alvo!.unidade)
        .eq("status", "extra")
        .gte("data", inicio)
        .lte("data", fim)
        .order("data");
      if (error) throw new Error(error.message);
      return (data ?? []) as EscalaDia[];
    },
  });
}

async function excluirDias(ids: string[]) {
  const { data, error } = await supabase.from("escala_dias").delete().in("id", ids).select("id");
  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) !== ids.length)
    throw new Error("O banco não apagou todos os dias. Só o gestor pode excluir plantões.");
}

export function PlantoesDialog({
  alvo,
  onClose,
}: {
  alvo: AlvoPlantoes | null;
  onClose: () => void;
}) {
  const q = usePlantoes(alvo);
  const pessoas = useEscalaColaboradores();
  const atualizar = useAtualizarTudo();
  const [editando, setEditando] = useState<EscalaDia | "novo" | null>(null);
  const pessoa = pessoas.data?.find((p) => p.id === alvo?.colaboradorId);
  const nome = (id: string | null) => pessoas.data?.find((p) => p.id === id)?.nome ?? "—";
  const dias = q.data ?? [];
  const total = dias.reduce((s, d) => s + Number(d.valor_combinado ?? 0), 0);
  const excluir = useMutation({ mutationFn: excluirDias, onSuccess: atualizar });
  useEffect(() => setEditando(null), [alvo]);

  const apagar = (ids: string[], texto: string) => {
    if (!confirm(texto)) return;
    excluir.mutate(ids, {
      onSuccess: () =>
        toast.success(
          ids.length > 1 ? "Plantões excluídos da escala" : "Plantão excluído da escala",
        ),
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <Dialog open={!!alvo} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plantões de {pessoa?.nome ?? "freelancer"}</DialogTitle>
          <DialogDescription>
            {alvo?.unidade} · {alvo ? alvo.mes.split("-").reverse().join("/") : ""} · {dias.length}{" "}
            plantão(ões) · {brl.format(total)}. As mudanças vão para a Escala e o Financeiro se
            ajusta sozinho.
          </DialogDescription>
        </DialogHeader>

        {alvo?.pago && (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Este lançamento já está pago: a
            Escala muda, mas o valor pago no Financeiro não. Ajuste o lançamento à mão se precisar.
          </p>
        )}

        {editando ? (
          <PlantaoForm
            alvo={alvo!}
            inicial={editando === "novo" ? null : editando}
            setor={pessoa?.setor ?? "camareiras"}
            turno={pessoa?.turno_padrao ?? "dia"}
            entradaPadrao={pessoa?.hora_entrada?.slice(0, 5) ?? "08:00"}
            onCancel={() => setEditando(null)}
            onSaved={() => {
              setEditando(null);
              atualizar();
            }}
          />
        ) : q.isLoading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : q.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {(q.error as Error).message}
          </p>
        ) : (
          <div className="space-y-2">
            {!dias.length && (
              <p className="rounded-md border p-4 text-sm text-slate-500">
                Nenhum plantão desta pessoa neste mês e unidade.
              </p>
            )}
            {dias.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-black capitalize">{dataBR(d.data)}</p>
                  <p className="text-xs text-slate-600">
                    {MOTIVO_CHAMADA[(d.motivo_chamada ?? "outro") as MotivoChamada]}
                    {d.substitui_colaborador_id
                      ? ` de ${nome(d.substitui_colaborador_id)}`
                      : ""} · {d.hora_entrada?.slice(0, 5) ?? "--:--"}–
                    {d.hora_saida?.slice(0, 5) ?? "--:--"} · {d.horas_contratadas ?? "?"} h
                  </p>
                  {d.motivo && <p className="text-xs text-slate-500">{d.motivo}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-black">
                    {d.valor_combinado == null
                      ? "sem valor"
                      : brl.format(Number(d.valor_combinado))}
                  </span>
                  <Button size="icon" variant="ghost" title="Editar" onClick={() => setEditando(d)}>
                    <Edit3 />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Excluir"
                    disabled={excluir.isPending}
                    onClick={() =>
                      apagar([d.id], `Excluir o plantão de ${dataBR(d.data)} da escala?`)
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!editando && (
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <Button
              variant="outline"
              className="text-red-700"
              disabled={!dias.length || excluir.isPending}
              onClick={() =>
                apagar(
                  dias.map((d) => d.id),
                  `Excluir os ${dias.length} plantões deste mês da escala?`,
                )
              }
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Excluir todos
            </Button>
            <Button onClick={() => setEditando("novo")}>
              <Plus className="mr-1.5 h-4 w-4" /> Incluir plantão
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlantaoForm({
  alvo,
  inicial,
  setor,
  turno,
  entradaPadrao,
  onCancel,
  onSaved,
}: {
  alvo: AlvoPlantoes;
  inicial: EscalaDia | null;
  setor: string;
  turno: string;
  entradaPadrao: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const modalidades = useEscalaModalidades();
  const pessoas = useEscalaColaboradores();
  const { inicio, fim } = limitesMes(alvo.mes);
  const [data, setData] = useState(inicial?.data ?? inicio);
  const [motivo, setMotivo] = useState<MotivoChamada>(
    (inicial?.motivo_chamada as MotivoChamada) ?? "reforco_ocupacao",
  );
  const [modalidadeId, setModalidadeId] = useState(inicial?.modalidade_id ?? "");
  const [entrada, setEntrada] = useState(inicial?.hora_entrada?.slice(0, 5) ?? entradaPadrao);
  const [horas, setHoras] = useState(String(inicial?.horas_contratadas ?? 8));
  const [valor, setValor] = useState(
    inicial?.valor_combinado != null ? String(inicial.valor_combinado) : "",
  );
  const [cobre, setCobre] = useState(inicial?.substitui_colaborador_id ?? "");
  const [obs, setObs] = useState(inicial?.motivo ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const opcoes = useMemo(
    () =>
      (modalidades.data ?? []).filter(
        (m) =>
          m.ativo && (m.unidade === alvo.unidade || m.unidade === "Ambas") && m.motivo === motivo,
      ),
    [modalidades.data, alvo.unidade, motivo],
  );
  const fixos = (pessoas.data ?? []).filter(
    (p) => p.ativo && p.vinculo === "fixo" && (p.unidade === alvo.unidade || p.unidade === "Ambas"),
  );
  const escolherModalidade = (id: string) => {
    setModalidadeId(id);
    const m = opcoes.find((x) => x.id === id);
    if (m) {
      setHoras(String(m.horas));
      setValor(String(m.valor));
    }
  };

  const salvar = async () => {
    const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
    const problema = validarPlantao({ data, valor: num(valor), horas: num(horas), entrada });
    if (problema) return setErro(problema);
    if (data < inicio || data > fim)
      return setErro(
        `Escolha um dia de ${alvo.mes.split("-").reverse().join("/")}. Para outro mês, use a Escala.`,
      );
    if (motivo === "cobertura_falta" && !cobre) return setErro("Escolha quem está sendo coberto.");
    setErro(null);
    setSalvando(true);
    const { data: auth } = await supabase.auth.getUser();
    const campos = {
      data,
      motivo_chamada: motivo,
      modalidade_id: modalidadeId || null,
      hora_entrada: entrada,
      hora_saida: horaSaida(entrada, num(horas)!),
      horas_contratadas: num(horas),
      valor_combinado: num(valor),
      substitui_colaborador_id: motivo === "cobertura_falta" ? cobre : null,
      motivo: obs.trim() || null,
      origem: "manual",
      updated_by: auth.user?.id ?? null,
    };
    const res = inicial
      ? await supabase
          .from("escala_dias")
          .update(campos as never)
          .eq("id", inicial.id)
          .select("id")
      : await supabase
          .from("escala_dias")
          .insert({
            ...campos,
            colaborador_id: alvo.colaboradorId,
            unidade: alvo.unidade,
            setor,
            turno,
            status: "extra",
          } as never)
          .select("id");
    setSalvando(false);
    if (res.error) {
      const msg = /duplicate key|unique/i.test(res.error.message)
        ? "Esta pessoa já tem um dia lançado nessa data. Edite o dia existente na lista ou na Escala."
        : res.error.message;
      return setErro(msg);
    }
    if (!res.data?.length) return setErro("O banco não gravou. Só o gestor pode alterar plantões.");
    toast.success(inicial ? "Plantão atualizado" : "Plantão incluído na escala");
    onSaved();
  };

  return (
    <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
      <p className="text-sm font-black">
        {inicial ? `Editar plantão de ${dataBR(inicial.data)}` : "Incluir plantão"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Data">
          <Input
            type="date"
            min={inicio}
            max={fim}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Tipo">
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoChamada)}
          >
            {(Object.keys(MOTIVO_CHAMADA) as MotivoChamada[]).map((k) => (
              <option key={k} value={k}>
                {MOTIVO_CHAMADA[k]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Modalidade (preenche horas e valor)">
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={modalidadeId}
            onChange={(e) => escolherModalidade(e.target.value)}
          >
            <option value="">— sem modalidade —</option>
            {opcoes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} · {m.horas} h · {brl.format(Number(m.valor))}
              </option>
            ))}
          </select>
        </Campo>
        {motivo === "cobertura_falta" && (
          <Campo rotulo="Cobre quem">
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={cobre}
              onChange={(e) => setCobre(e.target.value)}
            >
              <option value="">Escolha…</option>
              {fixos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo rotulo="Entrada">
          <Input type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
        </Campo>
        <Campo
          rotulo={`Horas${horaSaida(entrada, Number(horas)) ? ` (saída ${horaSaida(entrada, Number(horas))})` : ""}`}
        >
          <Input inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} />
        </Campo>
        <Campo rotulo="Valor (R$)">
          <Input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="150"
          />
        </Campo>
        <Campo rotulo="Observação">
          <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
        </Campo>
      </div>
      {erro && (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm font-semibold text-red-700">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Voltar
        </Button>
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{rotulo}</Label>
      {children}
    </div>
  );
}
