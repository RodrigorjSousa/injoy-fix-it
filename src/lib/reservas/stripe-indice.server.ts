// Índice dos Clientes do Stripe pelo nº da reserva (tela Reservas). SÓ NO SERVIDOR.
//
// O Cloudbeds cria no Stripe um Cliente por reserva com a descrição "... - Reservas: <nº>". A busca do Stripe não
// filtra a descrição, então o app grava no Cliente a metadata injoy_reserva_<nº> = "1" e depois acha o cartão com
// uma busca exata (metadata["injoy_reserva_<nº>"]:"1").
// Roda de hora em hora (cobranca-sync.server.ts): primeiro os Clientes criados nos últimos 3 dias, depois continua
// a varredura do histórico de onde parou (reservas_stripe_indice), sempre dentro de um limite de tempo.
// Precisa da permissão Customers: Gravação na chave restrita. Sem ela, nada quebra: o erro fica registrado e a
// cobrança continua achando o Cliente pelos outros caminhos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { metadataFaltando } from "./stripe-regras";
import { StripeErro, type Unidade } from "./stripe.server";

type Obj = Record<string, unknown>;

async function db(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

export type ResultadoIndice = { unidade: Unidade; etiquetados: number; vistos: number; historicoConcluido: boolean; erro?: string };

class SemPermissao extends Error {}

/** Etiqueta os Clientes de uma página que ainda não têm a etiqueta. Devolve quantos gravou. */
async function etiquetarPagina(unidade: Unidade, clientes: Obj[]): Promise<number> {
  const { etiquetarCliente } = await import("./stripe.server");
  const pendentes = clientes
    .filter((c) => !c.deleted)
    .map((c) => ({ id: String(c.id), falta: metadataFaltando(c.description, c.metadata as Obj | null) }))
    .filter((c) => Object.keys(c.falta).length > 0);
  let gravados = 0;
  for (let i = 0; i < pendentes.length; i += 8) {
    const lote = pendentes.slice(i, i + 8);
    const res = await Promise.allSettled(lote.map((c) => etiquetarCliente(unidade, c.id, c.falta)));
    for (const r of res) {
      if (r.status === "fulfilled") gravados++;
      else if (r.reason instanceof StripeErro && (r.reason.status === 401 || r.reason.status === 403)) {
        throw new SemPermissao(
          "A chave do Stripe não tem permissão para gravar em Clientes. No Stripe, edite a chave restrita: Customers → Gravação.",
        );
      }
    }
  }
  return gravados;
}

export async function indexarClientes(unidade: Unidade, limiteMs = 20_000): Promise<ResultadoIndice> {
  const inicio = Date.now();
  const tempoAcabou = () => Date.now() - inicio > limiteMs;
  const c = await db();
  const { paginaDeClientes, chaveStripe } = await import("./stripe.server");
  const r: ResultadoIndice = { unidade, etiquetados: 0, vistos: 0, historicoConcluido: false };
  try {
    chaveStripe(unidade); // sem chave configurada: não faz nada
  } catch (e) {
    return { ...r, erro: (e as Error).message };
  }

  const { data: estado } = await c.from("reservas_stripe_indice").select("*").eq("unidade", unidade).maybeSingle();
  const st = (estado ?? {}) as { historico_apos?: string | null; historico_concluido?: boolean; indexados?: number };
  let historicoApos = st.historico_apos ?? undefined;
  r.historicoConcluido = st.historico_concluido === true;

  try {
    // 1) Clientes novos (últimos 3 dias): as reservas recém-feitas entram logo no índice.
    let depois: string | undefined;
    const desde = Math.floor(Date.now() / 1000) - 3 * 86_400;
    for (let p = 0; p < 10 && !tempoAcabou(); p++) {
      const pg = await paginaDeClientes(unidade, { desdeSeg: desde, depoisDe: depois });
      r.vistos += pg.clientes.length;
      r.etiquetados += await etiquetarPagina(unidade, pg.clientes);
      if (!pg.temMais || !pg.clientes.length) break;
      depois = String(pg.clientes[pg.clientes.length - 1].id);
    }

    // 2) Histórico: continua de onde parou até terminar (mais novos → mais antigos).
    while (!r.historicoConcluido && !tempoAcabou()) {
      const pg = await paginaDeClientes(unidade, { depoisDe: historicoApos });
      r.vistos += pg.clientes.length;
      r.etiquetados += await etiquetarPagina(unidade, pg.clientes);
      if (pg.clientes.length) historicoApos = String(pg.clientes[pg.clientes.length - 1].id);
      if (!pg.temMais || !pg.clientes.length) r.historicoConcluido = true;
    }
  } catch (e) {
    r.erro = (e instanceof SemPermissao ? e.message : `Índice do Stripe: ${(e as Error).message}`).slice(0, 500);
  }

  await c.from("reservas_stripe_indice").upsert(
    {
      unidade,
      historico_apos: historicoApos ?? null,
      historico_concluido: r.historicoConcluido,
      indexados: Number(st.indexados ?? 0) + r.etiquetados,
      ultima_execucao: new Date().toISOString(),
      erro: r.erro ?? null,
    },
    { onConflict: "unidade" },
  );
  return r;
}

/** Etiqueta um Cliente achado por outro caminho (e-mail, lista, nome), para a próxima busca ser direta. */
export async function etiquetarAgora(unidade: Unidade, cliente: Obj): Promise<void> {
  const falta = metadataFaltando(cliente.description, cliente.metadata as Obj | null);
  if (!Object.keys(falta).length) return;
  const { etiquetarCliente } = await import("./stripe.server");
  await etiquetarCliente(unidade, String(cliente.id), falta).catch(() => undefined);
}
