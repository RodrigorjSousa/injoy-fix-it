// Consultas do dashboard do gestor. Cada bloco busca sozinho e, se uma fonte falhar
// (ex.: migração ainda não aplicada), só aquele item mostra o erro — o resto continua.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { sincronizarRendimentoMes, type ResultadoSincronizacao } from "@/lib/dashboard-rendimento.functions";
import { somarDias, type FontesReclamacao, type NoiteLida, type UnidadeDash } from "@/lib/dashboard/rendimento";
import { valorRateado, type FinConfig, type Lancamento } from "@/lib/financeiro";
import { todaySP } from "@/lib/tz";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const UNIDADES_DASH: UnidadeDash[] = ["Botafogo", "Ipanema"];

function msg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function inicioMes(mes: string) {
  return `${mes}-01`;
}
export function fimMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}
export function mesesAtras(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------
// A · Precisa de você hoje

export type Pendencia = {
  chave: string;
  rotulo: string;
  qtd: number;
  detalhe?: string;
  link: string;
  erro?: string;
};

async function contar(fn: () => Promise<{ count: number | null; error: unknown }>): Promise<{ qtd: number; erro?: string }> {
  try {
    const { count, error } = await fn();
    if (error) return { qtd: 0, erro: msg(error) };
    return { qtd: count ?? 0 };
  } catch (e) {
    return { qtd: 0, erro: msg(e) };
  }
}

export function usePendencias() {
  return useQuery({
    queryKey: ["dashboard", "pendencias", todaySP()],
    refetchInterval: 120_000,
    queryFn: async (): Promise<Pendencia[]> => {
      const hoje = todaySP();
      const ha3dias = somarDias(hoje, -2); // coleta há 3 dias ou mais (hoje conta como dia 1)
      const ontem = somarDias(hoje, -1);
      const [reforco, ponto, atestados, lav, chamados, checkouts, limpo] = await Promise.all([
        contar(() => db.from("previsao_reforco_pedidos").select("id", { count: "exact", head: true }).eq("status", "pendente")),
        contar(() => db.from("ponto_batidas").select("id", { count: "exact", head: true }).eq("status", "pendente")),
        contar(() => db.from("ponto_atestados").select("id", { count: "exact", head: true }).eq("status", "pendente")),
        contar(() =>
          db.from("lav_taloes").select("id", { count: "exact", head: true }).is("retorno_data", null).lt("data_coleta", ha3dias),
        ),
        (async () => {
          try {
            const { data, error } = await db.from("chamados").select("descricao").neq("status", "Concluído").limit(500);
            if (error) return { qtd: 0, erro: msg(error) };
            const urg = (data ?? []).filter((c: { descricao: string }) =>
              /^\s*\[URGENTE\]/i.test(c.descricao) || /urgente|emerg[êe]ncia|bloqueia|sem refriger/i.test(c.descricao),
            ).length;
            return { qtd: urg, total: (data ?? []).length };
          } catch (e) {
            return { qtd: 0, erro: msg(e) };
          }
        })(),
        contar(() =>
          db
            .from("cloudbeds_checkout_logs")
            .select("id", { count: "exact", head: true })
            .is("conferido_em", null)
            .gte("created_at", `${ontem}T03:00:00Z`),
        ),
        contar(() => db.from("room_housekeeping").select("id", { count: "exact", head: true }).eq("cloudbeds_limpo_status", "falhou")),
      ]);
      const ch = chamados as { qtd: number; total?: number; erro?: string };
      return [
        { chave: "reforco", rotulo: "Pedidos de reforço para autorizar", ...reforco, link: "/gestor/previsao-carga" },
        { chave: "ponto", rotulo: "Batidas de ponto pendentes", ...ponto, link: "/gestor/ponto" },
        { chave: "atestados", rotulo: "Atestados para revisar", ...atestados, link: "/gestor/ponto" },
        { chave: "lavanderia", rotulo: "Talões na lavanderia há 3 dias ou mais", ...lav, link: "/relatorio-operacoes" },
        {
          chave: "chamados",
          rotulo: "Chamados urgentes abertos",
          qtd: ch.qtd,
          erro: ch.erro,
          detalhe: ch.total != null ? `${ch.total} chamado(s) abertos no total` : undefined,
          link: "/painel",
        },
        { chave: "checkouts", rotulo: "Check-outs das camareiras sem conferência", ...checkouts, link: "/recepcao" },
        {
          chave: "limpo-cloudbeds",
          rotulo: "Quartos limpos no app que o Cloudbeds não confirmou",
          ...limpo,
          detalhe: "marque como limpo no Cloudbeds",
          link: "/camareiras",
        },
      ];
    },
  });
}

// ---------------------------------------------------------------------------------------------
// B · Operação de hoje

export type QuartoHoje = {
  property: string;
  room_number: string;
  status: string | null;
  service_status: string | null;
  condition: string | null;
  guest_name: string | null;
  departing_guest_name: string | null;
  next_guest_name: string | null;
  has_pending_payment: boolean | null;
  pending_payment_amount: number | null;
  has_pending_docs: boolean | null;
  updated_at: string;
};

export function useQuartosHoje() {
  return useQuery({
    queryKey: ["dashboard", "quartos-hoje"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<QuartoHoje[]> => {
      const { data, error } = await db
        .from("room_housekeeping")
        .select(
          "property,room_number,status,service_status,condition,guest_name,departing_guest_name,next_guest_name,has_pending_payment,pending_payment_amount,has_pending_docs,updated_at",
        );
      if (error) throw new Error(msg(error));
      return (data ?? []) as QuartoHoje[];
    },
  });
}

// ---------------------------------------------------------------------------------------------
// C · Mês em curso

export type MesUnidade = {
  receita: number;
  despesa: number;
  ocupacaoMedia: number | null; // % (hotel_metrics, dias até hoje)
  diasComMedicao: number;
  notaGeral: number | null;
  notaFuncionarios: number | null;
  notaLimpeza: number | null;
  avaliacoesBonificacao: number;
  totemMedia: number | null;
  totemAvaliacoes: number;
  pecasLavanderia: number;
  taloesLavanderia: number;
  erros: string[];
};

const media = (v: number[]) => (v.length ? v.reduce((s, n) => s + n, 0) / v.length : null);

export function useMesEmCurso(mes: string) {
  return useQuery({
    queryKey: ["dashboard", "mes", mes],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<UnidadeDash, MesUnidade>> => {
      const de = inicioMes(mes);
      const ate = fimMes(mes);
      const vazio = (): MesUnidade => ({
        receita: 0,
        despesa: 0,
        ocupacaoMedia: null,
        diasComMedicao: 0,
        notaGeral: null,
        notaFuncionarios: null,
        notaLimpeza: null,
        avaliacoesBonificacao: 0,
        totemMedia: null,
        totemAvaliacoes: 0,
        pecasLavanderia: 0,
        taloesLavanderia: 0,
        erros: [],
      });
      const out: Record<UnidadeDash, MesUnidade> = { Botafogo: vazio(), Ipanema: vazio() };
      const erroGeral = (fonte: string, e: unknown) => UNIDADES_DASH.forEach((u) => out[u].erros.push(`${fonte}: ${msg(e)}`));

      const [fin, cfg, metr, bon, tot, lav] = await Promise.all([
        db.from("fin_lancamentos").select("tipo,valor,unidade,status").gte("competencia", de).lte("competencia", ate).neq("status", "cancelado"),
        db.from("fin_config").select("*").limit(1).maybeSingle(),
        db.from("hotel_metrics").select("property,date,occupancy_percentage").gte("date", de).lte("date", ate),
        db.from("registros_bonificacao").select("unidade,nota_geral,nota_funcionarios,nota_limpeza").gte("data", de).lte("data", ate),
        db.from("totem_avaliacoes").select("unidade,nota").gte("criado_em", `${de}T03:00:00Z`).lte("criado_em", `${somarDias(ate, 1)}T03:00:00Z`),
        db.from("lav_taloes").select("unidade, lav_talao_itens(saida_hotel)").gte("data_coleta", de).lte("data_coleta", ate),
      ]);

      // Financeiro: "Ambas" é rateado como na tela do Financeiro (valorRateado + fin_config).
      if (fin.error) erroGeral("Financeiro", fin.error);
      else
        for (const l of (fin.data ?? []) as Lancamento[]) {
          for (const u of UNIDADES_DASH) {
            if (l.unidade !== u && l.unidade !== "Ambas") continue;
            const valor = valorRateado(l, u, (cfg.data ?? null) as FinConfig | null) || 0;
            if (l.tipo === "receita") out[u].receita += valor;
            else if (l.tipo === "despesa") out[u].despesa += valor;
          }
        }

      if (metr.error) erroGeral("Ocupação", metr.error);
      else
        for (const u of UNIDADES_DASH) {
          const linhas = (metr.data ?? []).filter((r: { property: string; date: string }) => r.property === u && r.date <= todaySP());
          out[u].diasComMedicao = linhas.length;
          out[u].ocupacaoMedia = media(linhas.map((r: { occupancy_percentage: number }) => Number(r.occupancy_percentage) || 0));
        }

      if (bon.error) erroGeral("Bonificação", bon.error);
      else
        for (const u of UNIDADES_DASH) {
          const r = (bon.data ?? []).filter((x: { unidade: string }) => x.unidade === u);
          out[u].avaliacoesBonificacao = r.length;
          out[u].notaGeral = media(r.map((x: { nota_geral: number }) => Number(x.nota_geral)).filter(Number.isFinite));
          out[u].notaFuncionarios = media(r.map((x: { nota_funcionarios: number }) => Number(x.nota_funcionarios)).filter(Number.isFinite));
          out[u].notaLimpeza = media(
            r.filter((x: { nota_limpeza: number | null }) => x.nota_limpeza != null).map((x: { nota_limpeza: number }) => Number(x.nota_limpeza)),
          );
        }

      if (tot.error) erroGeral("Totem", tot.error);
      else
        for (const u of UNIDADES_DASH) {
          const r = (tot.data ?? []).filter((x: { unidade: string }) => x.unidade === u).map((x: { nota: number }) => Number(x.nota));
          out[u].totemAvaliacoes = r.length;
          out[u].totemMedia = media(r);
        }

      if (lav.error) erroGeral("Lavanderia", lav.error);
      else
        for (const u of UNIDADES_DASH) {
          const r = (lav.data ?? []).filter((x: { unidade: string }) => x.unidade === u);
          out[u].taloesLavanderia = r.length;
          out[u].pecasLavanderia = r.reduce(
            (s: number, t: { lav_talao_itens?: { saida_hotel: number }[] }) =>
              s + (t.lav_talao_itens ?? []).reduce((a, i) => a + (Number(i.saida_hotel) || 0), 0),
            0,
          );
        }

      return out;
    },
  });
}

// ---------------------------------------------------------------------------------------------
// D · Rendimento por unidade

export type Sincronizacao = { unidade: UnidadeDash; mes: string; noites: number; reservas: number; fonte: string | null; avisos: string | null; sincronizado_em: string };

export function useSincronizacoes() {
  return useQuery({
    queryKey: ["dashboard", "sincronizacoes"],
    queryFn: async (): Promise<Sincronizacao[]> => {
      const { data, error } = await db.from("dash_sincronizacoes").select("*").order("mes", { ascending: false });
      if (error) throw new Error(msg(error));
      return (data ?? []) as Sincronizacao[];
    },
  });
}

/** Noites vendidas no período, das duas unidades (lê em blocos de 1000). */
export function useNoitesVendidas(de: string, ate: string) {
  return useQuery({
    queryKey: ["dashboard", "noites", de, ate],
    queryFn: async (): Promise<(NoiteLida & { unidade: UnidadeDash })[]> => {
      const todas: (NoiteLida & { unidade: UnidadeDash })[] = [];
      for (let inicio = 0; inicio < 100_000; inicio += 1000) {
        const { data, error } = await db
          .from("dash_reserva_noites")
          .select("unidade,data,quarto,reservation_id,valor,origem")
          .gte("data", de)
          .lte("data", ate)
          .order("data")
          .order("id")
          .range(inicio, inicio + 999);
        if (error) throw new Error(msg(error));
        todas.push(...((data ?? []) as (NoiteLida & { unidade: UnidadeDash })[]).map((n) => ({ ...n, valor: Number(n.valor) || 0 })));
        if (!data || data.length < 1000) break;
      }
      return todas;
    },
  });
}

export function useReclamacoes(de: string, ate: string) {
  return useQuery({
    queryKey: ["dashboard", "reclamacoes", de, ate],
    queryFn: async (): Promise<FontesReclamacao & { erros: string[] }> => {
      const desde = `${de}T03:00:00Z`;
      const ateTs = `${somarDias(ate, 1)}T03:00:00Z`;
      const [c, v, a] = await Promise.all([
        db.from("chamados").select("descricao,unidade").gte("created_at", desde).lt("created_at", ateTs).limit(5000),
        db.from("room_inspection_issues").select("room_number,property").gte("created_at", desde).lt("created_at", ateTs).limit(5000),
        db.from("totem_avaliacoes").select("quarto,unidade,nota").gte("criado_em", desde).lt("criado_em", ateTs).limit(5000),
      ]);
      const erros = [
        c.error && `Chamados: ${msg(c.error)}`,
        v.error && `Vistorias: ${msg(v.error)}`,
        a.error && `Totem: ${msg(a.error)}`,
      ].filter(Boolean) as string[];
      return { chamados: c.data ?? [], vistorias: v.data ?? [], avaliacoes: a.data ?? [], erros };
    },
  });
}

/** Atualiza os meses pedidos, um de cada vez, nas duas unidades. */
export function useSincronizarRendimento() {
  const chamar = useServerFn(sincronizarRendimentoMes);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { meses: string[]; aoProgredir?: (feito: number, total: number) => void }) => {
      const resultados: ResultadoSincronizacao[] = [];
      const falhas: string[] = [];
      const tarefas = args.meses.flatMap((mes) => UNIDADES_DASH.map((unidade) => ({ unidade, mes })));
      let feito = 0;
      for (const t of tarefas) {
        try {
          resultados.push(await chamar({ data: t }));
        } catch (e) {
          falhas.push(`${t.unidade} ${t.mes}: ${msg(e)}`);
        }
        feito += 1;
        args.aoProgredir?.(feito, tarefas.length);
      }
      return { resultados, falhas };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", "noites"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "sincronizacoes"] });
    },
  });
}
