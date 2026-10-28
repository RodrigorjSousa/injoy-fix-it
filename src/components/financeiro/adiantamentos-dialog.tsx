import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Eye,
  FileText,
  HandCoins,
  Loader2,
  Paperclip,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  currency,
  dateBR,
  FORMAS,
  monthNow,
  openFinanceFile,
  uploadFinanceFile,
  type Lancamento,
} from "@/lib/financeiro";
import { todaySP } from "@/lib/tz";
import {
  dividirParcelas,
  mesBR,
  mesesSeguidos,
  normNome,
  somaAdiantamentos,
  STATUS_ADIANTAMENTO,
  valorPorExtenso,
  type Adiantamento,
} from "@/lib/adiantamentos";

type Opcao = {
  chave: string;
  funcionarioId: string | null;
  nome: string;
  tipo: "Funcionário" | "Freelancer";
};
const OUTRO = "__outro";

type Props = {
  open: boolean;
  onClose: () => void;
  adiantamentos: Adiantamento[];
  funcionarios: { id: string; nome: string }[];
  lancamentos: Lancamento[];
  refresh: () => void;
};

/** Financeiro › Adiantamento: registra o dinheiro adiantado e mostra o que falta descontar por pessoa. */
export function AdiantamentosDialog({
  open,
  onClose,
  adiantamentos,
  funcionarios,
  lancamentos,
  refresh,
}: Props) {
  const freelas = useQuery({
    queryKey: ["fin_adiantamento_freelancers"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("escala_colaboradores")
        .select("nome, funcionario_id, vinculo, ativo")
        .eq("vinculo", "freelance");
      return (data ?? []) as {
        nome: string;
        funcionario_id: string | null;
        vinculo: string;
        ativo: boolean;
      }[];
    },
  });

  // Funcionários do cadastro + freelancers da Escala + nomes que já aparecem nos lançamentos.
  const opcoes = useMemo(() => {
    const vistos = new Set<string>();
    const out: Opcao[] = [];
    for (const f of [...funcionarios].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
      const k = normNome(f.nome);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      out.push({ chave: `f:${f.id}`, funcionarioId: f.id, nome: f.nome, tipo: "Funcionário" });
    }
    const nomesFreela = [
      ...(freelas.data ?? [])
        .filter((c) => c.ativo !== false && !c.funcionario_id)
        .map((c) => c.nome),
      ...lancamentos.map((l) => l.freelancer_nome ?? ""),
    ];
    for (const nome of nomesFreela.sort((a, b) => a.localeCompare(b, "pt-BR"))) {
      const k = normNome(nome);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      out.push({ chave: `n:${k}`, funcionarioId: null, nome: nome.trim(), tipo: "Freelancer" });
    }
    return out;
  }, [funcionarios, freelas.data, lancamentos]);

  const [pessoa, setPessoa] = useState("");
  const [outroNome, setOutroNome] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(todaySP());
  const [forma, setForma] = useState("pix");
  const [unidade, setUnidade] = useState("Botafogo");
  const [obs, setObs] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState<"aberto" | "todos">("aberto");
  const [parcelas, setParcelas] = useState("1");
  const [inicio, setInicio] = useState(monthNow());
  const nParc = Math.max(1, Number(parcelas) || 1);
  const valorNum = Number(valor.replace(",", "."));
  const plano =
    valorNum > 0
      ? dividirParcelas(valorNum, nParc).map((v, i) => ({
          valor: v,
          mes: mesesSeguidos(inicio, nParc)[i],
        }))
      : [];
  const fileRef = useRef<HTMLInputElement>(null);

  const abertos = adiantamentos.filter((a) => a.status === "aberto");
  const porPessoa = useMemo(() => {
    const m = new Map<string, { nome: string; total: number; qtd: number }>();
    for (const a of abertos) {
      const k = a.funcionario_id ?? `n:${normNome(a.pessoa_nome)}`;
      const atual = m.get(k) ?? { nome: a.pessoa_nome, total: 0, qtd: 0 };
      atual.total = Math.round((atual.total + a.valor) * 100) / 100;
      atual.qtd++;
      m.set(k, atual);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [abertos]);
  const lista = filtro === "aberto" ? abertos : adiantamentos;

  async function salvar() {
    const op = opcoes.find((o) => o.chave === pessoa);
    const nome = pessoa === OUTRO ? outroNome.trim() : (op?.nome ?? "");
    const v = Number(valor.replace(",", "."));
    if (!nome) return toast.error("Escolha a pessoa.");
    if (!(v > 0)) return toast.error("Informe um valor válido.");
    if (!data) return toast.error("Informe a data do adiantamento.");
    if (!inicio) return toast.error("Informe o mês do primeiro desconto.");
    setSaving(true);
    try {
      const anexo = file ? await uploadFinanceFile(file) : null;
      // Uma linha por parcela (mesmo grupo); cada uma só é descontada a partir do seu mês.
      const grupo = crypto.randomUUID();
      const meses = mesesSeguidos(inicio, nParc);
      const linhas = dividirParcelas(v, nParc).map((valorParc, i) => ({
        funcionario_id: pessoa === OUTRO ? null : (op?.funcionarioId ?? null),
        pessoa_nome: nome,
        unidade,
        valor: valorParc,
        data_adiantamento: data,
        forma_pagamento: forma,
        observacoes: obs.trim() || null,
        anexo_path: anexo,
        grupo_id: grupo,
        parcela: i + 1,
        parcelas: nParc,
        // Desconto único a partir de agora: já entra em qualquer pagamento em aberto.
        descontar_a_partir: nParc === 1 && meses[i] <= monthNow() ? null : `${meses[i]}-01`,
      }));
      const { error } = await supabase.from("fin_adiantamentos" as never).insert(linhas as never);
      if (error) throw error;
      toast.success(
        nParc > 1
          ? `Adiantamento de ${currency.format(v)} para ${nome}: ${nParc}x de ${currency.format(linhas[0].valor)}, de ${mesBR(meses[0])} a ${mesBR(meses[nParc - 1])}.`
          : `Adiantamento de ${currency.format(v)} para ${nome} registrado. Desconto a partir de ${mesBR(meses[0])}.`,
      );
      setParcelas("1");
      setValor("");
      setObs("");
      setFile(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o adiantamento.");
    } finally {
      setSaving(false);
    }
  }

  async function mudarStatus(a: Adiantamento, status: "devolvido" | "cancelado" | "aberto") {
    const msg =
      status === "devolvido"
        ? `Marcar como DEVOLVIDO (a pessoa devolveu ${currency.format(a.valor)} em dinheiro)? Ele não será mais descontado.`
        : status === "cancelado"
          ? `Cancelar o adiantamento de ${currency.format(a.valor)} de ${a.pessoa_nome}? Ele não será mais descontado.`
          : `Voltar o adiantamento de ${currency.format(a.valor)} para "a descontar"?`;
    if (!confirm(msg)) return;
    const { error } = await supabase
      .from("fin_adiantamentos" as never)
      .update({ status } as never)
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Adiantamento atualizado");
    refresh();
  }

  async function excluir(a: Adiantamento) {
    const irmas = a.grupo_id
      ? adiantamentos.filter((x) => x.grupo_id === a.grupo_id && x.status === "aberto")
      : [a];
    const msg =
      irmas.length > 1
        ? `Excluir as ${irmas.length} parcelas a descontar deste adiantamento de ${a.pessoa_nome} (${currency.format(somaAdiantamentos(irmas))})?`
        : `Excluir o adiantamento de ${currency.format(a.valor)} de ${a.pessoa_nome}?`;
    if (!confirm(msg)) return;
    const { data: apagados, error } = await supabase
      .from("fin_adiantamentos" as never)
      .delete()
      .in(
        "id",
        irmas.map((x) => x.id),
      )
      .select("id");
    if (error) return toast.error(error.message);
    if (!apagados?.length) return toast.error("Não foi possível excluir (sem permissão).");
    toast.success("Adiantamento excluído");
    refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5" />
            Adiantamentos
          </DialogTitle>
          <DialogDescription>
            Dinheiro adiantado a funcionários e freelancers. Fica "a descontar" e é abatido quando
            você marca como pago o salário ou os plantões da pessoa em Lançamentos. Não conta como
            despesa a mais no mês.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-lg border bg-amber-50/60 p-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Pessoa</Label>
            <Select value={pessoa} onValueChange={setPessoa}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o funcionário ou freelancer" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Funcionários</SelectLabel>
                  {opcoes
                    .filter((o) => o.tipo === "Funcionário")
                    .map((o) => (
                      <SelectItem key={o.chave} value={o.chave}>
                        {o.nome}
                      </SelectItem>
                    ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Freelancers</SelectLabel>
                  {opcoes
                    .filter((o) => o.tipo === "Freelancer")
                    .map((o) => (
                      <SelectItem key={o.chave} value={o.chave}>
                        {o.nome}
                      </SelectItem>
                    ))}
                </SelectGroup>
                <SelectItem value={OUTRO}>Outra pessoa (digitar o nome)</SelectItem>
              </SelectContent>
            </Select>
            {pessoa === OUTRO && (
              <Input
                placeholder="Nome completo (igual ao dos lançamentos)"
                value={outroNome}
                onChange={(e) => setOutroNome(e.target.value)}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Forma</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FORMAS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Unidade</Label>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Botafogo", "Ipanema", "Ambas"].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Descontar em</Label>
            <Select value={parcelas} onValueChange={setParcelas}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((n) => (
                  <SelectItem key={n} value={n}>
                    {n === "1" ? "1 vez (próximo pagamento)" : `${n} parcelas (meses seguidos)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{nParc > 1 ? "Mês da 1ª parcela" : "Descontar a partir de"}</Label>
            <Input type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          {plano.length > 1 && (
            <div className="rounded-md border border-amber-200 bg-white p-2 text-xs sm:col-span-2">
              <p className="mb-1 font-semibold text-amber-800">Plano de desconto</p>
              <div className="flex flex-wrap gap-1.5">
                {plano.map((p, i) => (
                  <span key={p.mes} className="rounded bg-amber-50 px-2 py-0.5">
                    {i + 1}ª · {mesBR(p.mes)} · {currency.format(p.valor)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observação (opcional)</Label>
            <Textarea
              rows={2}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex.: pedido para emergência, combinado descontar no dia 5"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="mr-1 h-4 w-4" />
              {file ? file.name : "Anexar comprovante (PIX)"}
            </Button>
            <Button className="ml-auto" onClick={salvar} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <HandCoins className="mr-1 h-4 w-4" />
              )}
              Registrar adiantamento
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">A descontar (todas as pessoas)</p>
            <p className="text-2xl font-black text-amber-700">
              {currency.format(somaAdiantamentos(abertos))}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Pessoas com adiantamento</p>
            <p className="text-2xl font-black">{porPessoa.length}</p>
          </div>
        </div>
        {porPessoa.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {porPessoa.map((p) => (
              <span
                key={p.nome}
                className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
              >
                {p.nome}: {currency.format(p.total)}
                {p.qtd > 1 ? ` (${p.qtd})` : ""}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h3 className="font-bold">Registros</h3>
          <Select value={filtro} onValueChange={(v) => setFiltro(v as "aberto" | "todos")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aberto">Só a descontar</SelectItem>
              <SelectItem value="todos">Todos (histórico)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ul className="divide-y rounded-lg border">
          {lista.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {a.pessoa_nome} · {currency.format(a.valor)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dateBR(a.data_adiantamento)} · {FORMAS[a.forma_pagamento] ?? a.forma_pagamento} ·{" "}
                  {a.unidade}
                  {(a.parcelas ?? 1) > 1 ? ` · parcela ${a.parcela}/${a.parcelas}` : ""}
                  {a.descontar_a_partir && a.status === "aberto"
                    ? ` · desconto a partir de ${mesBR(a.descontar_a_partir)}`
                    : ""}
                  {a.status === "descontado" && a.descontado_em
                    ? ` · descontado no pagamento de ${dateBR(a.descontado_em)}`
                    : ""}
                </p>
                {a.observacoes && <p className="text-xs text-slate-600">{a.observacoes}</p>}
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs font-bold ${a.status === "aberto" ? "bg-amber-100 text-amber-800" : a.status === "descontado" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
              >
                {STATUS_ADIANTAMENTO[a.status]}
              </span>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  title="Recibo para assinar"
                  onClick={() =>
                    reciboPdf(
                      a,
                      a.grupo_id
                        ? adiantamentos.filter(
                            (x) => x.grupo_id === a.grupo_id && x.status !== "cancelado",
                          )
                        : [a],
                    )
                  }
                >
                  <FileText />
                </Button>
                {a.anexo_path && (
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Ver comprovante"
                    onClick={() =>
                      openFinanceFile(a.anexo_path ?? "").catch((e) => toast.error(e.message))
                    }
                  >
                    <Eye />
                  </Button>
                )}
                {a.status === "aberto" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Pessoa devolveu o dinheiro"
                    onClick={() => mudarStatus(a, "devolvido")}
                  >
                    <Undo2 />
                  </Button>
                )}
                {(a.status === "devolvido" || a.status === "cancelado") && (
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Voltar a descontar"
                    onClick={() => mudarStatus(a, "aberto")}
                  >
                    <RotateCcw />
                  </Button>
                )}
                {a.status === "aberto" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Excluir (lançado por engano)"
                    onClick={() => excluir(a)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </li>
          ))}
          {!lista.length && (
            <li className="p-6 text-center text-sm text-muted-foreground">
              {filtro === "aberto"
                ? "Nenhum adiantamento a descontar."
                : "Nenhum adiantamento registrado."}
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Recibo para a pessoa assinar ao receber o adiantamento (total do adiantamento, com as parcelas). */
function reciboPdf(a: Adiantamento, grupo: Adiantamento[]) {
  const itens = (grupo.length ? grupo : [a])
    .slice()
    .sort((x, y) => (x.descontar_a_partir ?? "").localeCompare(y.descontar_a_partir ?? ""));
  const total = somaAdiantamentos(itens);
  const nParc = Math.max(a.parcelas ?? 1, 1);
  const meses = [
    ...new Set(itens.map((i) => i.descontar_a_partir?.slice(0, 7)).filter(Boolean)),
  ] as string[];
  const doc = new jsPDF();
  const valor = currency.format(total);
  doc.setFontSize(16);
  doc.text("RECIBO DE ADIANTAMENTO", 105, 25, { align: "center" });
  doc.setFontSize(12);
  doc.text(valor, 190, 40, { align: "right" });
  const desconto =
    nParc > 1
      ? `descontado em ${nParc} parcelas mensais` +
        (meses.length ? `, de ${mesBR(meses[0])} a ${mesBR(meses[meses.length - 1])}` : "") +
        `, dos meus pagamentos (salário ou plantões), conforme abaixo.`
      : `descontado do meu pagamento (salário ou plantões)` +
        (meses.length ? ` a partir de ${mesBR(meses[0])}.` : ".");
  const texto =
    `Eu, ${a.pessoa_nome}, declaro que recebi de IN.JOY Hostel Design Pousada (unidade ${a.unidade}) ` +
    `a quantia de ${valor} (${valorPorExtenso(total)}), em ${dateBR(a.data_adiantamento)}, por ` +
    `${FORMAS[a.forma_pagamento] ?? a.forma_pagamento}, a título de ADIANTAMENTO, e autorizo que este valor seja ` +
    desconto +
    (a.observacoes ? `\n\nObservação: ${a.observacoes}` : "");
  doc.text(doc.splitTextToSize(texto, 170), 20, 55);
  let y = 110;
  if (nParc > 1) {
    doc.setFontSize(10);
    for (const i of itens) {
      doc.text(
        `Parcela ${i.parcela}/${i.parcelas} · ${mesBR(i.descontar_a_partir)} · ${currency.format(i.valor)}`,
        25,
        y,
      );
      y += 6;
    }
    doc.setFontSize(12);
    y += 6;
  }
  doc.text(`Rio de Janeiro, ${dateBR(a.data_adiantamento)}.`, 20, y + 10);
  doc.line(20, y + 40, 110, y + 40);
  doc.text(a.pessoa_nome, 20, y + 47);
  doc.setFontSize(9);
  doc.text("Assinatura de quem recebeu", 20, y + 53);
  doc.save(
    `recibo-adiantamento-${normNome(a.pessoa_nome).replace(/\s+/g, "-")}-${a.data_adiantamento}.pdf`,
  );
}
