// Lavanderia — acesso ao banco (tabelas lav_* e funções lav_* da migração 0043).
import type { SupabaseClient } from "@supabase/supabase-js";
import imageCompression from "browser-image-compression";
import { supabase } from "@/integrations/supabase/client";
import { INICIO_SALDO, type Peca, type Talao, type UnidadeLav } from "@/lib/lavanderia";

// As tabelas novas ainda não estão no types.ts gerado pelo Lovable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as SupabaseClient<any>;

export const BUCKET_LAVANDERIA = "lavanderia";

function erro(e: unknown): Error {
  if (e instanceof Error) return e;
  const m = (e as { message?: string })?.message;
  return new Error(m || "Erro inesperado.");
}

export type PermissaoLavanderia = { gestor: boolean; podeLancar: boolean };

export async function buscarPermissaoLavanderia(): Promise<PermissaoLavanderia> {
  const { data, error } = await db.rpc("lav_minha_permissao");
  if (error) throw erro(error);
  const d = (data ?? {}) as { gestor?: boolean; pode_lancar?: boolean };
  return { gestor: !!d.gestor, podeLancar: !!d.pode_lancar };
}

/** Busca o catálogo; na primeira vez cria as peças com os preços da Clean Soft. */
export async function buscarPecas(): Promise<Peca[]> {
  const ler = async () => {
    const { data, error } = await db
      .from("lav_pecas")
      .select("id, nome, grupo_fatura, preco, ordem, ativo")
      .order("ordem")
      .order("nome");
    if (error) throw erro(error);
    return ((data ?? []) as Peca[]).map((p) => ({ ...p, preco: Number(p.preco) }));
  };
  let pecas = await ler();
  if (pecas.length === 0) {
    const { error } = await db.rpc("lav_preparar");
    if (error) throw erro(error);
    pecas = await ler();
  }
  return pecas;
}

type TalaoRow = Omit<Talao, "itens"> & { lav_talao_itens: Talao["itens"] | null };

/** Todos os talões da unidade desde `desde` (paginado: o servidor devolve no máximo 1000 por vez). */
export async function buscarTaloes(
  unidade: UnidadeLav,
  desde = INICIO_SALDO,
  somenteAbertos = false,
): Promise<Talao[]> {
  const out: Talao[] = [];
  const PAGINA = 500;
  for (let de = 0; ; de += PAGINA) {
    let q = db
      .from("lav_taloes")
      .select(
        "id, unidade, numero, data_coleta, coleta_por_nome, coleta_foto, coleta_obs, coleta_em, retorno_data, retorno_por_nome, retorno_foto, retorno_obs, retorno_em, lav_talao_itens(peca_id, saida_hotel, ent_lav, saida_lav, guardado)",
      )
      .eq("unidade", unidade)
      .gte("data_coleta", desde);
    if (somenteAbertos) q = q.is("retorno_data", null);
    const { data, error } = await q
      .order("data_coleta", { ascending: true })
      .order("numero", { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw erro(error);
    const rows = (data ?? []) as TalaoRow[];
    for (const { lav_talao_itens, ...t } of rows) out.push({ ...t, itens: lav_talao_itens ?? [] });
    if (rows.length < PAGINA) break;
  }
  return out;
}

/** Comprime mantendo a letra do talão legível e envia para <uid>/<unidade>/<arquivo>.jpg. */
export async function enviarFotoTalao(file: File, unidade: UnidadeLav, tipo: "coleta" | "retorno") {
  if (!file.type.startsWith("image/")) throw new Error("Envie uma foto (imagem) do talão.");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Sessão expirada. Entre de novo.");
  let upload: Blob = file;
  if (file.size > 900 * 1024) {
    upload = await imageCompression(file, {
      maxSizeMB: 0.9,
      maxWidthOrHeight: 2200,
      useWebWorker: true,
      initialQuality: 0.85,
      fileType: "image/jpeg",
    });
  }
  const tipoArquivo = upload.type || "image/jpeg";
  const ext = tipoArquivo === "image/png" ? "png" : tipoArquivo === "image/webp" ? "webp" : "jpg";
  const path = `${auth.user.id}/${unidade}/${tipo}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET_LAVANDERIA)
    .upload(path, upload, { contentType: tipoArquivo, upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message))
      throw new Error('O armazenamento "lavanderia" ainda não foi criado. Avise o gestor.');
    throw erro(error);
  }
  return path;
}

export async function apagarFotos(paths: (string | null | undefined)[]) {
  const lista = paths.filter((p): p is string => !!p);
  if (!lista.length) return;
  await supabase.storage.from(BUCKET_LAVANDERIA).remove(lista);
}

export async function urlFotoTalao(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET_LAVANDERIA).createSignedUrl(path, 600);
  if (error) throw erro(error);
  return data.signedUrl;
}

export async function registrarColeta(args: {
  unidade: UnidadeLav;
  numero: string;
  data: string;
  itens: { peca_id: string; qtd: number }[];
  foto: string | null;
  obs?: string;
  talaoId?: string;
}) {
  const { data, error } = await db.rpc("lav_registrar_coleta", {
    p_unidade: args.unidade,
    p_numero: args.numero,
    p_data: args.data,
    p_itens: args.itens,
    p_foto: args.foto,
    p_obs: args.obs ?? null,
    p_talao_id: args.talaoId ?? null,
  });
  if (error) throw erro(error);
  return data as string;
}

export async function registrarRetorno(args: {
  talaoId: string;
  data: string;
  itens: { peca_id: string; ent_lav: number; saida_lav: number; guardado: number }[];
  foto: string | null;
  obs?: string;
}) {
  const { error } = await db.rpc("lav_registrar_retorno", {
    p_talao_id: args.talaoId,
    p_data: args.data,
    p_itens: args.itens,
    p_foto: args.foto,
    p_obs: args.obs ?? null,
  });
  if (error) throw erro(error);
}

export async function desfazerRetorno(talaoId: string) {
  const { data, error } = await db.rpc("lav_desfazer_retorno", { p_talao_id: talaoId });
  if (error) throw erro(error);
  await apagarFotos([data as string | null]);
}

export async function excluirTalao(talaoId: string) {
  const { data, error } = await db.rpc("lav_excluir_talao", { p_talao_id: talaoId });
  if (error) throw erro(error);
  await apagarFotos((data as string[] | null) ?? []);
}

export async function salvarPeca(p: Omit<Peca, "id"> & { id?: string }) {
  const row = {
    nome: p.nome.trim(),
    grupo_fatura: p.grupo_fatura.trim(),
    preco: p.preco,
    ordem: p.ordem,
    ativo: p.ativo,
  };
  if (!row.nome || !row.grupo_fatura) throw new Error("Preencha o nome e o grupo da fatura.");
  const q = p.id
    ? db.from("lav_pecas").update(row).eq("id", p.id).select("id")
    : db.from("lav_pecas").insert(row).select("id");
  const { data, error } = await q;
  if (error) throw erro(error);
  if (!data?.length) throw new Error("Nada foi salvo. Só o gestor pode alterar o catálogo.");
}

export type FaturaLav = {
  id: string;
  unidade: UnidadeLav;
  competencia: string;
  qtd_fatura: Record<string, number>;
  valor_fatura: number | null;
  valor_esperado: number | null;
  status: "rascunho" | "aprovada";
  obs: string | null;
  aprovado_por_nome: string | null;
  aprovado_em: string | null;
};

export async function buscarFatura(unidade: UnidadeLav, mes: string): Promise<FaturaLav | null> {
  const { data, error } = await db
    .from("lav_faturas")
    .select("*")
    .eq("unidade", unidade)
    .eq("competencia", `${mes}-01`)
    .limit(1)
    .maybeSingle();
  if (error) throw erro(error);
  if (!data) return null;
  const f = data as FaturaLav;
  return {
    ...f,
    valor_fatura: f.valor_fatura === null ? null : Number(f.valor_fatura),
    valor_esperado: f.valor_esperado === null ? null : Number(f.valor_esperado),
  };
}

export async function salvarFatura(args: {
  unidade: UnidadeLav;
  mes: string;
  qtdFatura: Record<string, number>;
  valorFatura: number | null;
  valorEsperado: number;
  obs: string | null;
}) {
  const { data, error } = await db
    .from("lav_faturas")
    .upsert(
      {
        unidade: args.unidade,
        competencia: `${args.mes}-01`,
        qtd_fatura: args.qtdFatura,
        valor_fatura: args.valorFatura,
        valor_esperado: args.valorEsperado,
        obs: args.obs,
      },
      { onConflict: "unidade,competencia" },
    )
    .select("id");
  if (error) throw erro(error);
  if (!data?.length) throw new Error("Nada foi salvo. Só o gestor pode salvar a fatura.");
  return (data[0] as { id: string }).id;
}

export async function aprovarFatura(faturaId: string, aprovar: boolean) {
  const { error } = await db.rpc("lav_aprovar_fatura", {
    p_fatura_id: faturaId,
    p_aprovar: aprovar,
  });
  if (error) throw erro(error);
}
