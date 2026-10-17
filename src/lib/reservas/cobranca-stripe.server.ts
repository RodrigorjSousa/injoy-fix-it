// Cobrança pelo Stripe da tela Reservas (SÓ NO SERVIDOR). Regras de segurança em ./stripe-regras.ts.
//
// Cobrar agora:   relê o saldo no Cloudbeds → acha o Cliente da reserva no Stripe → cartão que também está na
//                 reserva → sem cobrança anterior → trava no banco → cobra (idempotente) → lança no Cloudbeds +
//                 nota "Pagamento OK // nome". Banco pediu confirmação do hóspede → "Aguardando autenticação".
// Enviar link:    mesmas conferências → fatura do Stripe enviada por e-mail → o webhook (invoice.paid) lança no
//                 Cloudbeds + nota "Pagamento OK // quem enviou".
// Pgto. check-in: nota "Pagamento no check in // nome" no Cloudbeds.
// Modo de teste (chave rk_test_): NADA é gravado no Cloudbeds (nem pagamento, nem nota de pagamento).
import type { SupabaseClient } from "@supabase/supabase-js";
import { todaySP } from "@/lib/tz";
import {
  bloqueioPorCobrancaAnterior,
  centavos,
  clienteDaReserva,
  conferirReserva,
  NOTA_AGUARDANDO_AUTENTICACAO,
  notaLinkEnviado,
  notaPagamentoNoCheckin,
  notaPagamentoOk,
  opcoesDeCartao,
  resultadoDoIntent,
  textoRecusa,
  type ModoStripe,
  type OpcaoCartao,
} from "./stripe-regras";
import type { Unidade } from "./stripe.server";

type Obj = Record<string, unknown>;

async function db(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ------------------------------------------------------------------ contexto

export type Quem = { userId: string; nome: string };

/** Nome de quem está logado (Equipe › nome; senão o e-mail). */
export async function nomeDoUsuario(userId: string, emailReserva?: string | null): Promise<string> {
  const c = await db();
  const { data } = await c.from("funcionarios").select("nome").eq("user_id", userId).order("nome").limit(1).maybeSingle();
  const nome = String((data as { nome?: string } | null)?.nome ?? "").trim();
  if (nome) return nome;
  const { data: u } = await c.auth.admin.getUserById(userId);
  return u?.user?.email ?? emailReserva ?? "Recepção";
}

type Linha = {
  id: string;
  unidade: Unidade;
  reservation_id: string;
  hospede: string;
  cobrado: string | null;
  data_reserva: string | null;
};

async function linhaDaLista(linhaId: string): Promise<Linha> {
  const c = await db();
  const { data, error } = await c
    .from("reservas_cobranca")
    .select("id, unidade, reservation_id, hospede, cobrado, data_reserva")
    .eq("id", linhaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Reserva não encontrada na lista.");
  return data as Linha;
}

/**
 * Muda o "Cobrado?" da reserva na lista. No MODO DE TESTE não muda nada: a reserva é real e uma marcação
 * de teste (ex.: "Pago") travaria a reserva sem ela ter sido paga. A tentativa fica registrada com [teste].
 */
async function marcarLinha(unidade: Unidade, reservationId: string, cobrado: string, quem: Quem, modo: ModoStripe = "real") {
  if (modo === "teste") return;
  const c = await db();
  await c
    .from("reservas_cobranca")
    .update({ cobrado, marcado_por: quem.userId || null, marcado_nome: quem.nome, marcado_em: new Date().toISOString() })
    .eq("unidade", unidade)
    .eq("reservation_id", reservationId);
}

// ------------------------------------------------------------------ registro das tentativas

type Tentativa = { id: string };

async function abrirTentativa(campos: Obj): Promise<Tentativa> {
  const c = await db();
  const { data, error } = await c.from("reservas_cobranca_pagamentos").insert(campos).select("id").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new Error("Já há uma cobrança em andamento para esta reserva (outro clique ou outra recepcionista). Aguarde.");
    }
    throw new Error(error.message);
  }
  return data as Tentativa;
}

async function atualizarTentativa(id: string, campos: Obj) {
  const c = await db();
  await c.from("reservas_cobranca_pagamentos").update({ ...campos, atualizado_em: new Date().toISOString() }).eq("id", id);
}

/** Pagamento aprovado no Stripe que ainda não entrou no Cloudbeds: bloqueia nova cobrança. */
async function pendenciaNoCloudbeds(unidade: Unidade, reservationId: string): Promise<string | null> {
  const c = await db();
  const { data } = await c
    .from("reservas_cobranca_pagamentos")
    .select("id, valor, criado_em")
    .eq("unidade", unidade)
    .eq("reservation_id", reservationId)
    .in("status", ["aprovado", "link_pago"])
    .eq("cloudbeds_pagamento", "falhou")
    .limit(1);
  const p = (data ?? [])[0] as { valor?: number } | undefined;
  return p
    ? `Esta reserva já foi paga no Stripe (${brl(Number(p.valor ?? 0))}), mas o pagamento não entrou no Cloudbeds. Use "Lançar no Cloudbeds" em vez de cobrar de novo.`
    : null;
}

// ------------------------------------------------------------------ conferência completa

export type Preparo = {
  modo: ModoStripe | null;
  saldo: number | null;
  hospede: string;
  reservationId: string;
  unidade: Unidade;
  emailDestino: string | null;
  cartoes: OpcaoCartao[];
  bloqueio: string | null;
  linkAberto: { url: string | null; enviadoEm: string | null; faturas: string[] } | null;
  clienteId: string | null;
};

/** Faz TODAS as conferências com dados de agora (Cloudbeds + Stripe + banco). Usado ao abrir a janela e de novo ao cobrar. */
export async function conferirTudo(linhaId: string, valorConfirmado: number | null): Promise<Preparo> {
  const linha = await linhaDaLista(linhaId);
  const base: Preparo = {
    modo: null,
    saldo: null,
    hospede: linha.hospede,
    reservationId: linha.reservation_id,
    unidade: linha.unidade,
    emailDestino: null,
    cartoes: [],
    bloqueio: null,
    linkAberto: null,
    clienteId: null,
  };
  const { chaveStripe, cartoesDoCliente, cobrancasDoCliente, faturasAbertasDoCliente } = await import("./stripe.server");
  try {
    base.modo = chaveStripe(linha.unidade).modo;
  } catch (e) {
    return { ...base, bloqueio: (e as Error).message };
  }
  if (linha.cobrado === "sim") return { ...base, bloqueio: "O pagamento desta reserva já foi confirmado." };

  const pend = await pendenciaNoCloudbeds(linha.unidade, linha.reservation_id);
  if (pend) return { ...base, bloqueio: pend };

  // 1) Saldo e status relidos no Cloudbeds AGORA.
  const { lerReservaAgora } = await import("./cloudbeds-reserva.server");
  const reserva = await lerReservaAgora(linha.unidade, linha.reservation_id);
  const conf = conferirReserva(reserva, valorConfirmado);
  if (!conf.ok) return { ...base, saldo: reserva.balance, bloqueio: conf.texto };
  base.saldo = conf.saldo;
  base.hospede = reserva.hospede || linha.hospede;

  // 2) Cliente do Stripe com EXATAMENTE esta reserva na descrição. O nº da reserva é o mesmo no Cloudbeds e no
  //    Stripe (descrição "... - Reservas: <nº>"). Ordem: e-mail (rápido) → nº da reserva (lista os Clientes criados
  //    desde a data da reserva) → nome. Em todos, a escolha exige o nº exato na descrição.
  const stripe = await import("./stripe.server");
  const nomes = reserva.nomes.length ? reserva.nomes : linha.hospede ? [linha.hospede] : [];
  // 2a) Etiqueta gravada pelo índice (metadata injoy_reserva_<nº>): busca direta. Falha da busca não bloqueia.
  let clientes: Obj[] = await stripe.clientesPelaEtiqueta(linha.unidade, linha.reservation_id).catch(() => []);
  let escolha = clienteDaReserva(clientes as never, linha.reservation_id);
  const achouPelaEtiqueta = escolha.ok;
  if (!escolha.ok && escolha.motivo === "nenhum" && reserva.emails.length) {
    clientes = [...clientes, ...(await stripe.clientesPorEmail(linha.unidade, reserva.emails))];
    escolha = clienteDaReserva(clientes as never, linha.reservation_id);
  }
  let busca: { vistos: number; completo: boolean } | null = null;
  const dataRef = reserva.dataReserva ?? linha.data_reserva;
  if (!escolha.ok && escolha.motivo === "nenhum" && dataRef) {
    const desde = Date.parse(`${dataRef}T00:00:00-03:00`) / 1000 - 2 * 86_400;
    const r = await stripe.clientesPelaReserva(linha.unidade, linha.reservation_id, desde);
    busca = { vistos: r.vistos, completo: r.completo };
    clientes = [...clientes, ...r.clientes];
    escolha = clienteDaReserva(clientes as never, linha.reservation_id);
  }
  if (!escolha.ok && escolha.motivo === "nenhum" && nomes.length) {
    clientes = [...clientes, ...(await stripe.clientesPorNome(linha.unidade, nomes))];
    escolha = clienteDaReserva(clientes as never, linha.reservation_id);
  }
  if (!escolha.ok) {
    if (escolha.motivo === "varios") return { ...base, bloqueio: escolha.texto };
    const partes = [
      reserva.emails.length ? `pelo e-mail ${reserva.emails.join(", ")}` : null,
      busca
        ? `pelo nº ${linha.reservation_id} em ${busca.vistos} cliente(s) criados desde ${dataRef?.split("-").reverse().join("/")}${busca.completo ? "" : " (busca parcial)"}`
        : null,
      nomes.length ? `pelo nome ${nomes.join(", ")}` : null,
    ].filter(Boolean);
    return {
      ...base,
      bloqueio:
        `Procurei no Stripe ${partes.join(", ")} e nenhum cliente tem a reserva ${linha.reservation_id} na descrição. ` +
        "O cartão pode estar guardado só no Cloudbeds (ex.: cartão virtual da Booking): cobre por lá.",
    };
  }
  // Achou por outro caminho: já etiqueta para a próxima vez ser direta.
  const escolhidoId = escolha.cliente.id;
  if (!achouPelaEtiqueta) {
    const { etiquetarAgora } = await import("./stripe-indice.server");
    const cli = clientes.find((x) => String(x.id) === escolhidoId);
    if (cli) await etiquetarAgora(linha.unidade, cli);
  }
  base.clienteId = escolha.cliente.id;
  base.emailDestino = escolha.cliente.email ?? null;

  // 3) Cartões desse Cliente que também estão na reserva do Cloudbeds.
  base.cartoes = opcoesDeCartao((await cartoesDoCliente(linha.unidade, escolha.cliente.id)) as never, reserva.cartoes, todaySP(), base.modo);

  // 4) Nenhuma cobrança do app já aprovada ou em processamento.
  const intents = await cobrancasDoCliente(linha.unidade, escolha.cliente.id);
  const anterior = bloqueioPorCobrancaAnterior(intents as never, linha.reservation_id, Math.floor(Date.now() / 1000));
  // No modo de teste, repetir o teste na mesma reserva é esperado (as cobranças de teste não são dinheiro).
  if (anterior && base.modo === "real") return { ...base, bloqueio: anterior };

  // Link já enviado e ainda aberto?
  const abertas = (await faturasAbertasDoCliente(linha.unidade, escolha.cliente.id)).filter(
    (f) => ((f.metadata ?? {}) as Obj).injoy_reserva === linha.reservation_id,
  );
  if (abertas.length) {
    const f = abertas[0];
    base.linkAberto = {
      url: typeof f.hosted_invoice_url === "string" ? f.hosted_invoice_url : null,
      enviadoEm: f.created ? new Date(Number(f.created) * 1000).toISOString() : null,
      faturas: abertas.map((x) => String(x.id)),
    };
  }
  return base;
}

// ------------------------------------------------------------------ lançar no Cloudbeds (pagamento + nota)

async function lancarNoCloudbeds(
  tentativaId: string,
  p: { unidade: Unidade; reservationId: string; valor: number; descricao: string; nota: string; modo: ModoStripe },
): Promise<{ pagamento: string; nota: string; mensagem: string | null }> {
  if (p.modo === "teste") {
    const r = { pagamento: "teste", nota: "teste", mensagem: `Modo de teste: nada lançado no Cloudbeds (seria "${p.nota}").` };
    await atualizarTentativa(tentativaId, { cloudbeds_pagamento: r.pagamento, cloudbeds_nota: r.nota, mensagem: r.mensagem });
    return r;
  }
  const { lancarPagamentoNoCloudbeds, escreverNotaNoCloudbeds } = await import("./cloudbeds-reserva.server");
  let pagamento = "lancado";
  let nota = "lancada";
  const erros: string[] = [];
  try {
    await lancarPagamentoNoCloudbeds(p.unidade, p.reservationId, p.valor, p.descricao);
  } catch (e) {
    pagamento = "falhou";
    erros.push((e as Error).message);
  }
  try {
    await escreverNotaNoCloudbeds(p.unidade, p.reservationId, p.nota);
  } catch (e) {
    nota = "falhou";
    erros.push((e as Error).message);
  }
  const mensagem = erros.length ? erros.join(" | ").slice(0, 500) : null;
  await atualizarTentativa(tentativaId, { cloudbeds_pagamento: pagamento, cloudbeds_nota: nota, mensagem });
  return { pagamento, nota, mensagem };
}

// ------------------------------------------------------------------ link aberto

/**
 * Anula os links (faturas) abertos da reserva e marca as tentativas como "link_cancelado".
 * Usado antes do Cobrar agora (para o hóspede não pagar duas vezes) e no botão "Cancelar link".
 * Se algum não puder ser anulado (ex.: o hóspede acabou de pagar), lança erro: NÃO cobre.
 */
async function anularLinksAbertos(unidade: Unidade, reservationId: string, faturas: string[], motivo: string) {
  const { anularFatura } = await import("./stripe.server");
  const c = await db();
  for (const id of faturas) {
    try {
      await anularFatura(unidade, id);
    } catch (e) {
      throw new Error(
        `Não foi possível cancelar o link aberto desta reserva (${(e as Error).message}). O hóspede pode ter acabado de pagar. Nada foi cobrado: atualize e confira antes de tentar de novo.`,
      );
    }
    await c
      .from("reservas_cobranca_pagamentos")
      .update({ status: "link_cancelado", mensagem: motivo, atualizado_em: new Date().toISOString() })
      .eq("stripe_invoice_id", id)
      .eq("unidade", unidade)
      .eq("reservation_id", reservationId)
      .eq("status", "link_enviado");
  }
}

export async function cancelarLink(linhaId: string, quem: Quem): Promise<{ mensagem: string }> {
  const prep = await conferirTudo(linhaId, null);
  if (!prep.linkAberto?.faturas.length) throw new Error("Não há link aberto para esta reserva.");
  await anularLinksAbertos(prep.unidade, prep.reservationId, prep.linkAberto.faturas, `Link cancelado por ${quem.nome}.`);
  const c = await db();
  await c
    .from("reservas_cobranca")
    .update({ cobrado: null, marcado_por: quem.userId, marcado_nome: quem.nome, marcado_em: new Date().toISOString() })
    .eq("unidade", prep.unidade)
    .eq("reservation_id", prep.reservationId)
    .eq("cobrado", "link_enviado");
  return { mensagem: "Link cancelado. O hóspede não consegue mais pagar por ele." };
}

// ------------------------------------------------------------------ Cobrar agora

export type ResultadoCobranca = {
  resultado: "aprovado" | "autenticacao" | "recusado" | "processando";
  mensagem: string;
  cloudbedsOk: boolean;
  modo: ModoStripe;
};

export async function cobrarAgora(linhaId: string, valorConfirmado: number, cartaoId: string, quem: Quem): Promise<ResultadoCobranca> {
  const prep = await conferirTudo(linhaId, valorConfirmado);
  if (prep.bloqueio) throw new Error(prep.bloqueio);
  const cartao = prep.cartoes.find((c) => c.id === cartaoId);
  if (!cartao?.podeCobrar) throw new Error(cartao?.porque ? `Cartão não liberado: ${cartao.porque}.` : "Escolha um cartão desta reserva.");
  const modo = prep.modo as ModoStripe;
  const saldo = prep.saldo as number;

  // Link aberto para esta reserva: cancela ANTES de cobrar, para o hóspede não pagar duas vezes.
  if (prep.linkAberto?.faturas.length) {
    await anularLinksAbertos(prep.unidade, prep.reservationId, prep.linkAberto.faturas, `Link cancelado: ${quem.nome} usou "Cobrar agora".`);
  }

  const t = await abrirTentativa({
    unidade: prep.unidade,
    reservation_id: prep.reservationId,
    tipo: "cobranca",
    modo,
    valor: saldo,
    stripe_customer_id: prep.clienteId,
    stripe_payment_method_id: cartaoId,
    cartao: cartao.texto,
    usuario_id: quem.userId,
    usuario_nome: quem.nome,
  });

  try {
    const { cobrarCartao } = await import("./stripe.server");
    const { intent, erro } = await cobrarCartao(prep.unidade, {
      clienteId: prep.clienteId as string,
      cartaoId,
      valorCentavos: centavos(saldo),
      descricao: `Reserva ${prep.reservationId} - INJOY ${prep.unidade}`,
      meta: { reservationId: prep.reservationId, unidade: prep.unidade, tentativa: t.id, usuario: quem.nome },
    });
    const status = String(intent?.status ?? "");
    const r = resultadoDoIntent(status || undefined);
    const piId = intent?.id ? String(intent.id) : null;

    if (r === "aprovado") {
      await atualizarTentativa(t.id, { status: "aprovado", stripe_payment_intent_id: piId });
      const cb = await lancarNoCloudbeds(t.id, {
        unidade: prep.unidade,
        reservationId: prep.reservationId,
        valor: saldo,
        descricao: `Stripe ${cartao.texto} (${piId}) - app INJOY - ${quem.nome}`,
        nota: notaPagamentoOk(quem.nome),
        modo,
      });
      await marcarLinha(prep.unidade, prep.reservationId, "sim", quem, modo);
      const okCb = cb.pagamento !== "falhou" && cb.nota !== "falhou";
      return {
        resultado: "aprovado",
        modo,
        cloudbedsOk: okCb,
        mensagem: okCb
          ? `${brl(saldo)} cobrados de ${prep.hospede}.${modo === "teste" ? " (Modo de teste: nada lançado no Cloudbeds.)" : " Pagamento e nota lançados no Cloudbeds."}`
          : `${brl(saldo)} cobrados no Stripe, MAS não entrou tudo no Cloudbeds: ${cb.mensagem}. Use "Lançar no Cloudbeds".`,
      };
    }
    if (r === "autenticacao") {
      await atualizarTentativa(t.id, {
        status: "autenticacao",
        stripe_payment_intent_id: piId,
        mensagem: "O banco pediu que o hóspede confirme a compra.",
      });
      await marcarLinha(prep.unidade, prep.reservationId, "aguardando_autenticacao", quem, modo);
      if (modo === "real") await notaAguardandoAutenticacao(prep.unidade, prep.reservationId).catch(() => undefined);
      return {
        resultado: "autenticacao",
        modo,
        cloudbedsOk: true,
        mensagem: "O banco pediu que o hóspede confirme a compra. Nada foi cobrado. Envie o link para ele autenticar e pagar.",
      };
    }
    if (r === "processando") {
      await atualizarTentativa(t.id, {
        status: "erro",
        stripe_payment_intent_id: piId,
        mensagem: "Cobrança em processamento no Stripe. Confira em alguns minutos.",
      });
      return { resultado: "processando", modo, cloudbedsOk: true, mensagem: "A cobrança ficou em processamento no Stripe. Confira em alguns minutos antes de tentar de novo." };
    }
    const motivo = textoRecusa(erro?.code as string | undefined, erro?.decline_code as string | undefined);
    await atualizarTentativa(t.id, { status: "recusado", stripe_payment_intent_id: piId, mensagem: motivo });
    await marcarLinha(prep.unidade, prep.reservationId, "recusado", quem, modo);
    return { resultado: "recusado", modo, cloudbedsOk: true, mensagem: `${motivo} Nada foi cobrado.` };
  } catch (e) {
    await atualizarTentativa(t.id, { status: "erro", mensagem: (e as Error).message.slice(0, 500) });
    throw e;
  }
}

// ------------------------------------------------------------------ Enviar link

export async function enviarLink(linhaId: string, valorConfirmado: number, quem: Quem): Promise<{ mensagem: string; url: string | null; modo: ModoStripe }> {
  const prep = await conferirTudo(linhaId, valorConfirmado);
  if (prep.bloqueio) throw new Error(prep.bloqueio);
  if (prep.linkAberto) throw new Error("Já existe um link aberto para esta reserva. Espere o hóspede pagar ou cancele a fatura no Stripe.");
  if (!prep.emailDestino) throw new Error("O cliente desta reserva no Stripe não tem e-mail: não dá para enviar o link.");
  const modo = prep.modo as ModoStripe;
  const saldo = prep.saldo as number;

  const t = await abrirTentativa({
    unidade: prep.unidade,
    reservation_id: prep.reservationId,
    tipo: "link",
    modo,
    valor: saldo,
    stripe_customer_id: prep.clienteId,
    email_destino: prep.emailDestino,
    usuario_id: quem.userId,
    usuario_nome: quem.nome,
  });
  try {
    const { enviarFatura } = await import("./stripe.server");
    const fatura = await enviarFatura(prep.unidade, {
      clienteId: prep.clienteId as string,
      valorCentavos: centavos(saldo),
      descricao: `Reserva ${prep.reservationId} - INJOY ${prep.unidade}`,
      diasParaPagar: 2,
      meta: { reservationId: prep.reservationId, unidade: prep.unidade, tentativa: t.id, usuario: quem.nome },
    });
    const url = typeof fatura.hosted_invoice_url === "string" ? fatura.hosted_invoice_url : null;
    await atualizarTentativa(t.id, { status: "link_enviado", stripe_invoice_id: String(fatura.id), link_url: url });
    await marcarLinha(prep.unidade, prep.reservationId, "link_enviado", quem, modo);
    // Nota no Cloudbeds: "Link de pagamento enviado // nome" (no modo de teste nada vai ao Cloudbeds).
    let aviso = "";
    if (modo === "real") {
      try {
        const { escreverNotaNoCloudbeds } = await import("./cloudbeds-reserva.server");
        await escreverNotaNoCloudbeds(prep.unidade, prep.reservationId, notaLinkEnviado(quem.nome));
        await atualizarTentativa(t.id, { cloudbeds_nota: "lancada" });
      } catch (e) {
        await atualizarTentativa(t.id, { cloudbeds_nota: "falhou", mensagem: (e as Error).message.slice(0, 500) });
        aviso = " Mas a nota não entrou no Cloudbeds: escreva à mão.";
      }
    }
    return { modo, url, mensagem: `Link de ${brl(saldo)} enviado para ${prep.emailDestino}.${aviso}` };
  } catch (e) {
    await atualizarTentativa(t.id, { status: "erro", mensagem: (e as Error).message.slice(0, 500) });
    throw e;
  }
}

// ------------------------------------------------------------------ Pagamento no check-in

export async function pagamentoNoCheckin(linhaId: string, quem: Quem): Promise<{ mensagem: string }> {
  const linha = await linhaDaLista(linhaId);
  if (linha.cobrado === "sim") throw new Error("O pagamento desta reserva já foi confirmado.");
  const t = await abrirTentativa({
    unidade: linha.unidade,
    reservation_id: linha.reservation_id,
    tipo: "checkin",
    modo: "real",
    usuario_id: quem.userId,
    usuario_nome: quem.nome,
  });
  const nota = notaPagamentoNoCheckin(quem.nome);
  try {
    const { escreverNotaNoCloudbeds } = await import("./cloudbeds-reserva.server");
    await escreverNotaNoCloudbeds(linha.unidade, linha.reservation_id, nota);
  } catch (e) {
    await atualizarTentativa(t.id, { status: "erro", cloudbeds_nota: "falhou", mensagem: (e as Error).message.slice(0, 500) });
    throw new Error(`Não foi possível escrever a nota no Cloudbeds: ${(e as Error).message}`);
  }
  await atualizarTentativa(t.id, { status: "registrado", cloudbeds_nota: "lancada", mensagem: nota });
  await marcarLinha(linha.unidade, linha.reservation_id, "pagamento_checkin", quem);
  return { mensagem: `Nota "${nota}" escrita na reserva ${linha.reservation_id}.` };
}

// ------------------------------------------------------------------ Aguardando autenticação

/**
 * Botão "Aguard. autenticação": escreve "Aguardando autenticação CC" na reserva do Cloudbeds e marca a reserva.
 * Também usado quando o "Cobrar agora" recebe do banco o pedido de confirmação do hóspede.
 */
async function notaAguardandoAutenticacao(unidade: Unidade, reservationId: string): Promise<void> {
  const { escreverNotaNoCloudbeds } = await import("./cloudbeds-reserva.server");
  await escreverNotaNoCloudbeds(unidade, reservationId, NOTA_AGUARDANDO_AUTENTICACAO);
}

export async function aguardandoAutenticacao(linhaId: string, quem: Quem): Promise<{ mensagem: string }> {
  const linha = await linhaDaLista(linhaId);
  if (linha.cobrado === "sim") throw new Error("O pagamento desta reserva já foi confirmado.");
  try {
    await notaAguardandoAutenticacao(linha.unidade, linha.reservation_id);
  } catch (e) {
    throw new Error(`Não foi possível escrever a nota no Cloudbeds: ${(e as Error).message}`);
  }
  await marcarLinha(linha.unidade, linha.reservation_id, "aguardando_autenticacao", quem);
  return { mensagem: `Nota "${NOTA_AGUARDANDO_AUTENTICACAO}" escrita na reserva ${linha.reservation_id}.` };
}

// ------------------------------------------------------------------ Lançar no Cloudbeds de novo

export async function relancarNoCloudbeds(tentativaId: string): Promise<{ mensagem: string }> {
  const c = await db();
  const { data } = await c.from("reservas_cobranca_pagamentos").select("*").eq("id", tentativaId).maybeSingle();
  const t = data as Obj | null;
  if (!t) throw new Error("Cobrança não encontrada.");
  if (!["aprovado", "link_pago"].includes(String(t.status)) || t.modo !== "real") {
    throw new Error("Só dá para lançar de novo uma cobrança aprovada no modo real.");
  }
  const unidade = t.unidade as Unidade;
  const reservationId = String(t.reservation_id);
  const valor = Number(t.valor ?? 0);
  const { lerReservaAgora, lancarPagamentoNoCloudbeds, escreverNotaNoCloudbeds } = await import("./cloudbeds-reserva.server");
  const erros: string[] = [];
  let pagamento = String(t.cloudbeds_pagamento ?? "");
  let nota = String(t.cloudbeds_nota ?? "");
  if (pagamento === "falhou") {
    // Só lança se o saldo no Cloudbeds ainda comporta o valor (ninguém lançou à mão nesse meio-tempo).
    const r = await lerReservaAgora(unidade, reservationId);
    if (centavos(r.balance) < centavos(valor)) {
      erros.push(`O saldo no Cloudbeds (${brl(r.balance)}) já é menor que ${brl(valor)}: confira se alguém lançou à mão.`);
    } else {
      try {
        await lancarPagamentoNoCloudbeds(unidade, reservationId, valor, `Stripe ${String(t.cartao ?? "")} (${String(t.stripe_payment_intent_id ?? t.stripe_invoice_id ?? "")}) - app INJOY - ${String(t.usuario_nome ?? "")}`);
        pagamento = "lancado";
      } catch (e) {
        erros.push((e as Error).message);
      }
    }
  }
  if (nota === "falhou") {
    try {
      await escreverNotaNoCloudbeds(unidade, reservationId, notaPagamentoOk(String(t.usuario_nome ?? "")));
      nota = "lancada";
    } catch (e) {
      erros.push((e as Error).message);
    }
  }
  await atualizarTentativa(tentativaId, { cloudbeds_pagamento: pagamento, cloudbeds_nota: nota, mensagem: erros.join(" | ") || null });
  if (erros.length) throw new Error(erros.join(" | "));
  return { mensagem: "Pagamento e nota lançados no Cloudbeds." };
}

// ------------------------------------------------------------------ webhook: link pago

/** Fatura paga (invoice.paid): lança no Cloudbeds e escreve "Pagamento OK // quem enviou o link". Idempotente. */
export async function linkPago(unidade: Unidade, fatura: Obj): Promise<string> {
  const c = await db();
  const invoiceId = String(fatura.id ?? "");
  // Reivindica a tentativa: só um aviso do Stripe processa (o Stripe pode repetir avisos).
  const { data } = await c
    .from("reservas_cobranca_pagamentos")
    .update({ status: "link_pago", atualizado_em: new Date().toISOString() })
    .eq("stripe_invoice_id", invoiceId)
    .eq("unidade", unidade)
    .eq("status", "link_enviado")
    .select("*");
  const t = ((data ?? []) as Obj[])[0];
  if (!t) return "ignorado (fatura não é do app ou já processada)";
  const valor = Math.round(Number(fatura.amount_paid ?? 0)) / 100;
  const nome = String(t.usuario_nome ?? "Recepção");
  await lancarNoCloudbeds(String(t.id), {
    unidade,
    reservationId: String(t.reservation_id),
    valor,
    descricao: `Stripe link de pagamento (${invoiceId}) - app INJOY - ${nome}`,
    nota: notaPagamentoOk(nome),
    modo: t.modo as ModoStripe,
  });
  await marcarLinha(unidade, String(t.reservation_id), "sim", { userId: String(t.usuario_id ?? ""), nome }, t.modo as ModoStripe);
  return "lançado";
}

// ------------------------------------------------------------------ conferir links sem depender do webhook

/**
 * Confere no Stripe os links enviados que ainda aguardam pagamento. Pago → mesmo caminho do webhook
 * (lança no Cloudbeds + nota "Pagamento OK"); anulado no Stripe → "link_cancelado".
 * Roda na atualização de hora em hora e no botão "Verificar pagamento". Seguro repetir: linkPago só
 * processa uma vez por fatura.
 */
export async function conferirLinksEnviados(unidade: Unidade, reservationId?: string): Promise<{ pagos: number; cancelados: number; abertos: number }> {
  const c = await db();
  let q = c
    .from("reservas_cobranca_pagamentos")
    .select("id, reservation_id, stripe_invoice_id")
    .eq("unidade", unidade)
    .eq("status", "link_enviado")
    .not("stripe_invoice_id", "is", null)
    .gte("criado_em", new Date(Date.now() - 45 * 86_400_000).toISOString());
  if (reservationId) q = q.eq("reservation_id", reservationId);
  const { data, error } = await q.limit(200);
  if (error) throw new Error(error.message);
  const { lerFatura } = await import("./stripe.server");
  const r = { pagos: 0, cancelados: 0, abertos: 0 };
  for (const t of (data ?? []) as { id: string; reservation_id: string; stripe_invoice_id: string }[]) {
    const fatura = await lerFatura(unidade, t.stripe_invoice_id);
    const status = String(fatura.status ?? "");
    if (status === "paid") {
      if ((await linkPago(unidade, fatura)) === "lançado") r.pagos++;
    } else if (status === "void" || status === "uncollectible") {
      await c
        .from("reservas_cobranca_pagamentos")
        .update({ status: "link_cancelado", mensagem: "Link cancelado no Stripe.", atualizado_em: new Date().toISOString() })
        .eq("id", t.id)
        .eq("status", "link_enviado");
      r.cancelados++;
    } else r.abertos++;
  }
  return r;
}

/** Botão "Verificar pagamento" do cartão da reserva. */
export async function verificarLink(linhaId: string): Promise<{ mensagem: string; pago: boolean }> {
  const linha = await linhaDaLista(linhaId);
  const r = await conferirLinksEnviados(linha.unidade, linha.reservation_id);
  if (r.pagos) return { pago: true, mensagem: "O hóspede pagou pelo link. Pagamento e nota lançados no Cloudbeds." };
  if (r.cancelados) return { pago: false, mensagem: "O link foi cancelado no Stripe." };
  return { pago: false, mensagem: "O link ainda não foi pago." };
}
