// Avaliação da arrumação pelas líderes das camareiras (migração 0098).
// Cada item: OK (vale 1), Ajustar (0,5) ou Refazer (0). Nota = 10 × pontos / itens.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type StatusItem = "ok" | "ajustar" | "refazer";
export const STATUS_ITEM: Record<StatusItem, { rotulo: string; pontos: number }> = {
  ok: { rotulo: "OK", pontos: 1 },
  ajustar: { rotulo: "Ajustar", pontos: 0.5 },
  refazer: { rotulo: "Refazer", pontos: 0 },
};

export type ItemChecklist = {
  id: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
};

export type ItemAvaliado = {
  item_id: string;
  nome: string;
  status: StatusItem;
  obs: string | null;
  foto_path: string | null;
};

export type Avaliacao = {
  id: string;
  property: "Botafogo" | "Ipanema";
  room_number: string;
  servico_id: string | null;
  tarefa: string | null;
  servico_concluido_em: string | null;
  camareira_nome: string;
  avaliadora_id: string;
  avaliadora_nome: string | null;
  nota: number;
  itens: ItemAvaliado[];
  refazer: boolean;
  elogio: string | null;
  observacao: string | null;
  created_at: string;
};

const arred1 = (n: number) => Math.round(n * 10) / 10;

/** Nota 0–10 a partir dos itens marcados (null se nenhum item). */
export function calcularNota(itens: Pick<ItemAvaliado, "status">[]): number | null {
  if (!itens.length) return null;
  const pontos = itens.reduce((s, i) => s + STATUS_ITEM[i.status].pontos, 0);
  return arred1((10 * pontos) / itens.length);
}

export const normNomePessoa = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export type LinhaCamareira = {
  nome: string;
  avaliacoes: number;
  media: number;
  refazer: number;
  erros: number;
  /** item → quantidade de Ajustar/Refazer */
  errosPorItem: Record<string, number>;
  piorItem: string | null;
};

export type LinhaItem = {
  nome: string;
  avaliados: number;
  ajustar: number;
  refazer: number;
  /** % das avaliações em que o item teve erro */
  taxaErro: number;
  /** participação do item no total de erros */
  participacao: number;
};

export type LinhaAvaliadora = { nome: string; avaliacoes: number; media: number };

export type ResumoQualidade = {
  avaliacoes: number;
  media: number | null;
  refazer: number;
  porCamareira: LinhaCamareira[];
  porItem: LinhaItem[];
  porAvaliadora: LinhaAvaliadora[];
};

/** Números do painel do gestor a partir das avaliações do período. */
export function resumirQualidade(lista: Avaliacao[]): ResumoQualidade {
  const cam = new Map<string, LinhaCamareira & { soma: number }>();
  const itens = new Map<string, LinhaItem>();
  const avs = new Map<string, { nome: string; n: number; soma: number }>();
  let totalErros = 0;
  for (const a of lista) {
    const k = normNomePessoa(a.camareira_nome);
    const c = cam.get(k) ?? {
      nome: a.camareira_nome.trim(),
      avaliacoes: 0,
      media: 0,
      refazer: 0,
      erros: 0,
      errosPorItem: {},
      piorItem: null,
      soma: 0,
    };
    c.avaliacoes++;
    c.soma += Number(a.nota);
    if (a.refazer) c.refazer++;
    for (const i of a.itens ?? []) {
      const li = itens.get(i.nome) ?? {
        nome: i.nome,
        avaliados: 0,
        ajustar: 0,
        refazer: 0,
        taxaErro: 0,
        participacao: 0,
      };
      li.avaliados++;
      if (i.status === "ajustar") li.ajustar++;
      if (i.status === "refazer") li.refazer++;
      itens.set(i.nome, li);
      if (i.status !== "ok") {
        c.erros++;
        c.errosPorItem[i.nome] = (c.errosPorItem[i.nome] ?? 0) + 1;
        totalErros++;
      }
    }
    cam.set(k, c);
    const ka = normNomePessoa(a.avaliadora_nome) || a.avaliadora_id;
    const av = avs.get(ka) ?? { nome: a.avaliadora_nome ?? "—", n: 0, soma: 0 };
    av.n++;
    av.soma += Number(a.nota);
    avs.set(ka, av);
  }
  const porCamareira = [...cam.values()]
    .map(({ soma, ...c }) => {
      const pior = Object.entries(c.errosPorItem).sort((x, y) => y[1] - x[1])[0];
      return { ...c, media: arred1(soma / c.avaliacoes), piorItem: pior ? pior[0] : null };
    })
    .sort((a, b) => a.media - b.media || b.avaliacoes - a.avaliacoes);
  const porItem = [...itens.values()]
    .map((i) => ({
      ...i,
      taxaErro: i.avaliados ? Math.round((100 * (i.ajustar + i.refazer)) / i.avaliados) : 0,
      participacao: totalErros ? Math.round((100 * (i.ajustar + i.refazer)) / totalErros) : 0,
    }))
    .sort((a, b) => b.ajustar + b.refazer - (a.ajustar + a.refazer));
  const porAvaliadora = [...avs.values()]
    .map((v) => ({ nome: v.nome, avaliacoes: v.n, media: arred1(v.soma / v.n) }))
    .sort((a, b) => b.avaliacoes - a.avaliacoes);
  const soma = lista.reduce((s, a) => s + Number(a.nota), 0);
  return {
    avaliacoes: lista.length,
    media: lista.length ? arred1(soma / lista.length) : null,
    refazer: lista.filter((a) => a.refazer).length,
    porCamareira,
    porItem,
    porAvaliadora,
  };
}

const semTabela = (msg: string) => /avaliac(ao|oes)_arrumacao/.test(msg);

/** Itens do checklist (cria os 7 iniciais na primeira vez). `todos` inclui os desativados. */
export function useItensAvaliacao(todos = false) {
  return useQuery({
    queryKey: ["avaliacao_arrumacao_itens", todos],
    queryFn: async (): Promise<ItemChecklist[] | null> => {
      const ler = () =>
        db.from("avaliacao_arrumacao_itens").select("*").order("ordem").order("nome");
      let { data, error } = await ler();
      if (error) {
        if (semTabela(error.message)) return null;
        throw new Error(error.message);
      }
      if (!data?.length) {
        await db.rpc("avaliacao_arrumacao_preparar");
        ({ data, error } = await ler());
        if (error) throw new Error(error.message);
      }
      const lista = (data ?? []) as ItemChecklist[];
      return todos ? lista : lista.filter((i) => i.ativo);
    },
  });
}

/** Avaliações entre duas datas (YYYY-MM-DD, inclusive), mais novas primeiro. */
export function useAvaliacoesPeriodo(
  inicio: string,
  fim: string,
  unidade: "todas" | "Botafogo" | "Ipanema" = "todas",
) {
  return useQuery({
    queryKey: ["avaliacoes_arrumacao", inicio, fim, unidade],
    queryFn: async (): Promise<Avaliacao[] | null> => {
      let q = db
        .from("avaliacoes_arrumacao")
        .select("*")
        .gte("created_at", `${inicio}T00:00:00-03:00`)
        .lte("created_at", `${fim}T23:59:59-03:00`)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (unidade !== "todas") q = q.eq("property", unidade);
      const { data, error } = await q;
      if (error) {
        if (semTabela(error.message)) return null;
        throw new Error(error.message);
      }
      return ((data ?? []) as Avaliacao[]).map((a) => ({ ...a, nota: Number(a.nota) }));
    },
  });
}

export function useInvalidarAvaliacoes() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["avaliacoes_arrumacao"] });
    void qc.invalidateQueries({ queryKey: ["avaliacao_arrumacao_itens"] });
  };
}

/** URL temporária da foto (bucket `inspections` é privado). */
export async function urlFotoAvaliacao(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("inspections").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
