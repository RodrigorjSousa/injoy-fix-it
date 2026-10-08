import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AdultoReserva, Motivo } from "@/lib/totem/regras";

// Server functions do Totem. NÃO usam login: cada chamada leva o token do
// aparelho, conferido no servidor (autenticarTotem). Toda decisão é refeita no
// servidor na confirmação — o navegador do totem nunca decide nada sozinho.
//
// Check-in:  identificar → (pagar saldo na maquininha) → (fotos dos documentos) → senha
// Check-out: identificar → (pagar saldo na maquininha) → confirmar → avaliação

const token = z.string().min(20).max(200);
const ticket = z.string().min(20).max(2000);

const identificacao = z.discriminatedUnion("modo", [
  z.object({
    modo: z.literal("codigo"),
    codigo: z.string().trim().min(4).max(40),
    sobrenome: z.string().trim().min(2).max(80),
  }),
  z.object({
    modo: z.literal("documento"),
    nome: z.string().trim().min(3).max(120),
    documento: z.string().trim().min(5).max(40),
  }),
]);

const checkinInput = z.object({ token, ident: identificacao });
const checkoutInput = z.object({
  token,
  quarto: z.string().trim().min(1).max(20),
  sobrenome: z.string().trim().min(2).max(80),
});

export type TotemInfo = {
  nome: string;
  unidade: "Botafogo" | "Ipanema";
  telefoneSuporte: string | null;
  horaCheckin: string;
  modo: "ambos" | "checkin" | "checkout";
  impressora: "nenhuma" | "rawbt";
};

export type PortaTotem = { label: string; tipo: string; senha: string | null; mesma: boolean };

export type PagamentoPendente = { valor: number };
export type DocumentosPendentes = { adultos: AdultoReserva[]; enviados: Array<{ hospede_ordem: number; lado: string }> };
export type MetodoPagamento = "credito" | "debito" | "pix";

export type Comprovante = {
  tipo: "checkin" | "checkout";
  unidade: string;
  hospede: string;
  quartos: string[];
  emitidoEm: string;
  senha: string | null;
  portas: PortaTotem[];
  validaAte: string | null;
  wifiRede: string | null;
  wifiSenha: string | null;
  telefone: string | null;
  mensagem: string | null;
  pagamento: { valor: number; metodo: MetodoPagamento; bandeira: string | null; autorizacao: string | null; pagoEm: string | null } | null;
};

export type RespostaCheckin =
  | { estado: "bloqueado" }
  | { estado: "nao_encontrado" }
  | { estado: "impedido"; nome: string; quartos: string[]; motivos: Motivo[] }
  | {
      estado: "pronto";
      nome: string;
      quartos: string[];
      checkOut: string;
      ticket: string;
      pagamento: PagamentoPendente | null;
      documentos: DocumentosPendentes | null;
    }
  | {
      estado: "senha";
      nome: string;
      quartos: string[];
      senha: string;
      portas: PortaTotem[];
      validaAte: string;
      avisoCloudbeds: string | null;
      comprovante: Comprovante;
    };

export type RespostaCheckout =
  | { estado: "bloqueado" }
  | { estado: "nao_encontrado" }
  | { estado: "impedido"; nome: string; quarto: string; motivos: Motivo[] }
  | { estado: "pronto"; nome: string; quarto: string; reservationID: string; ticket: string; pagamento: PagamentoPendente | null }
  | { estado: "concluido"; nome: string; quarto: string; reservationID: string; comprovante: Comprovante };

type TotemServidor = import("@/lib/totem/totem.server").Totem;

function info(t: TotemServidor): TotemInfo {
  return {
    nome: t.nome,
    unidade: t.unidade,
    telefoneSuporte: t.telefone_suporte,
    horaCheckin: t.hora_checkin,
    modo: t.modo,
    impressora: t.impressora,
  };
}

async function montarComprovante(
  totem: TotemServidor,
  args: {
    tipo: "checkin" | "checkout";
    reservationID: string;
    hospede: string;
    quartos: string[];
    senha?: { senha: string; portas: PortaTotem[]; validaAte: string } | null;
  },
): Promise<Comprovante> {
  const C = await import("@/lib/totem/cobranca.server");
  const pago = await C.ultimoPagamento(args.reservationID);
  const recente = pago?.pago_em && Date.now() - new Date(pago.pago_em).getTime() < 6 * 3_600_000 ? pago : null;
  return {
    tipo: args.tipo,
    unidade: totem.unidade,
    hospede: args.hospede,
    quartos: args.quartos,
    emitidoEm: new Date().toISOString(),
    senha: args.senha?.senha ?? null,
    portas: args.senha?.portas ?? [],
    validaAte: args.senha?.validaAte ?? null,
    wifiRede: args.tipo === "checkin" ? totem.wifi_rede : null,
    wifiSenha: args.tipo === "checkin" ? totem.wifi_senha : null,
    telefone: totem.telefone_suporte,
    mensagem: totem.mensagem_comprovante,
    pagamento: recente
      ? { valor: recente.valor, metodo: recente.metodo, bandeira: recente.bandeira, autorizacao: recente.autorizacao, pagoEm: recente.pago_em }
      : null,
  };
}

export const totemParear = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ codigo: z.string().trim().min(8).max(12) }).parse(input))
  .handler(async ({ data }) => {
    const { parearTotem } = await import("@/lib/totem/totem.server");
    const r = await parearTotem(data.codigo);
    return { token: r.token, totem: info(r.totem) };
  });

export const totemInfo = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token }).parse(input))
  .handler(async ({ data }) => {
    const { autenticarTotem } = await import("@/lib/totem/totem.server");
    return info(await autenticarTotem(data.token));
  });

/** Saldo que o hóspede ainda deve: Cloudbeds menos o que o totem já recebeu agora há pouco. */
async function saldoEfetivo(rec: Record<string, unknown>, reservationID: string): Promise<number> {
  const R = await import("@/lib/totem/regras");
  const C = await import("@/lib/totem/cobranca.server");
  const saldo = R.saldoDe(rec) - (await C.pagoRecente(reservationID));
  return saldo > 0.009 ? Number(saldo.toFixed(2)) : 0;
}

/**
 * Check-in. `confirmar=false` só confere e mostra o resumo (com o que falta:
 * pagamento e documentos); `confirmar=true` refaz toda a conferência, gera a
 * senha da porta e faz o check-in no Cloudbeds.
 */
async function executarCheckin(input: z.infer<typeof checkinInput>, confirmar: boolean): Promise<RespostaCheckin> {
  const S = await import("@/lib/totem/totem.server");
  const R = await import("@/lib/totem/regras");
  const C = await import("@/lib/totem/cobranca.server");
  const D = await import("@/lib/totem/documentos.server");
  const T = await import("@/lib/totem/ticket.server");
  const totem = await S.autenticarTotem(input.token);
  S.exigirModo(totem, "checkin");
  if (await S.totemBloqueado(totem)) return { estado: "bloqueado" };

  const achada = await S.identificarReservaCheckin(totem, input.ident);
  const tentativa = input.ident.modo === "codigo" ? `código ${input.ident.codigo}` : `nome ${input.ident.nome}`;
  if (!achada) {
    await S.registrarEvento(totem, "identificacao_falhou", { detalhe: `check-in · ${tentativa}` });
    return { estado: "nao_encontrado" };
  }
  const { rec, hospedes, reservationID } = achada;
  const nome = R.primeiroNome(hospedes);
  const nomeCompleto = (hospedes.find((h) => h.principal) ?? hospedes[0])?.nomeCompleto ?? nome;
  if (!confirmar) await S.registrarEvento(totem, "identificacao_ok", { reservation_id: reservationID, hospede: nomeCompleto });

  const status = R.statusDe(rec);
  const todosQuartos = R.extrairQuartos(rec);
  const novoTicket = (quartos: string[]) =>
    T.assinarTicket({ totemId: totem.id, reservationID, fluxo: "checkin", quarto: quartos.join(", "), hospede: nomeCompleto, email: S.emailDe(rec) });

  // Já hospedado: se a senha foi gerada antes, mostra de novo (esqueceu a senha).
  if (R.estaHospedada(status)) {
    const nomes = todosQuartos.map((q) => q.nome).filter(Boolean);
    const existente = nomes.length ? await S.senhaExistente(totem, reservationID, nomes) : null;
    if (existente) {
      if (confirmar) {
        await S.registrarEvento(totem, "senha_reexibida", { reservation_id: reservationID, quarto: nomes.join(", "), hospede: nomeCompleto });
        const comprovante = await montarComprovante(totem, { tipo: "checkin", reservationID, hospede: nomeCompleto, quartos: nomes, senha: existente });
        return { estado: "senha", nome, quartos: nomes, ...existente, avisoCloudbeds: null, comprovante };
      }
      return {
        estado: "pronto",
        nome,
        quartos: nomes,
        checkOut: todosQuartos.map((q) => q.checkOut).sort().pop() ?? "",
        ticket: await novoTicket(nomes),
        pagamento: null,
        documentos: null,
      };
    }
  }

  const cobraNoTotem = C.pagamentoDisponivel(totem).ok;
  const [limpo, fechaduras, saldo] = await Promise.all([S.quartosLimpos(totem), S.fechadurasDaUnidade(totem), saldoEfetivo(rec, reservationID)]);
  const avaliacao = R.avaliarCheckin({
    status,
    quartos: todosQuartos,
    relogio: R.relogioSP(),
    horaCheckin: totem.hora_checkin,
    exigeQuartoLimpo: totem.exige_quarto_limpo,
    quartoLimpo: limpo,
    temFechadura: (q) => !!S.fechaduraDoQuarto(fechaduras, q),
    saldo,
    // Com a maquininha ligada o saldo vira uma etapa de pagamento, não um bloqueio.
    bloqueiaSaldoAberto: cobraNoTotem ? false : totem.bloqueia_saldo_aberto,
  });
  const quartos = avaliacao.quartos.map((q) => q.nome).filter(Boolean);

  if (avaliacao.motivos.length) {
    await S.registrarEvento(totem, "checkin_impedido", {
      reservation_id: reservationID,
      quarto: quartos.join(", ") || null,
      hospede: nomeCompleto,
      detalhe: avaliacao.motivos.map((m) => m.codigo).join(", "),
    });
    return { estado: "impedido", nome, quartos, motivos: avaliacao.motivos };
  }

  const checkOut = avaliacao.quartos.map((q) => q.checkOut).sort().pop() ?? "";
  const adultos = R.adultosDaReserva(rec, avaliacao.quartos);
  const enviados = totem.pede_documentos ? await D.documentosEnviados(reservationID) : [];
  const pagamento = cobraNoTotem && saldo > 0 ? { valor: saldo } : null;

  if (!confirmar) {
    return {
      estado: "pronto",
      nome,
      quartos,
      checkOut,
      ticket: await novoTicket(quartos),
      pagamento,
      documentos: totem.pede_documentos ? { adultos, enviados } : null,
    };
  }

  // Confirmação: o que faltar volta como impedimento (a tela leva de volta à etapa).
  const faltam = totem.pede_documentos ? R.documentosFaltando(adultos.length, enviados) : 0;
  const pendencias: Motivo[] = [];
  if (pagamento) pendencias.push({ codigo: "saldo_aberto", valor: pagamento.valor });
  if (faltam > 0) pendencias.push({ codigo: "documentos_pendentes", faltam });
  if (pendencias.length) return { estado: "impedido", nome, quartos, motivos: pendencias };

  // Toque duplo / reenvio: reaproveita a senha gerada nos últimos 3 minutos.
  const recente = await S.senhaExistente(totem, reservationID, quartos, Date.now() - 3 * 60_000);
  let senha = recente;
  if (!senha) {
    try {
      senha = await S.gerarSenhaTuya(totem, { reservationID, hospede: nomeCompleto, quartos: avaliacao.quartos });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await S.registrarEvento(totem, "checkin_erro", { reservation_id: reservationID, quarto: quartos.join(", "), hospede: nomeCompleto, detalhe: msg });
      await S.avisarRecepcao(totem, quartos[0] ?? null, `Totem: falha ao gerar senha para ${nomeCompleto} (quarto ${quartos.join(", ")}). ${msg}`);
      throw new Error(msg);
    }
  }

  let avisoCloudbeds: string | null = null;
  try {
    await S.checkinNoCloudbeds(totem, reservationID);
  } catch (e) {
    avisoCloudbeds = e instanceof Error ? e.message : String(e);
    await S.avisarRecepcao(
      totem,
      quartos[0] ?? null,
      `Totem: senha entregue a ${nomeCompleto} (quarto ${quartos.join(", ")}), mas o Cloudbeds recusou o check-in: ${avisoCloudbeds}. Fazer o check-in manualmente.`,
    );
  }
  await S.registrarEvento(totem, "checkin_ok", {
    reservation_id: reservationID,
    quarto: quartos.join(", "),
    hospede: nomeCompleto,
    detalhe: avisoCloudbeds ? `Cloudbeds: ${avisoCloudbeds}` : null,
  });
  const comprovante = await montarComprovante(totem, { tipo: "checkin", reservationID, hospede: nomeCompleto, quartos, senha });
  return { estado: "senha", nome, quartos, ...senha, avisoCloudbeds, comprovante };
}

export const totemCheckinConsultar = createServerFn({ method: "POST" })
  .inputValidator((input) => checkinInput.parse(input))
  .handler(({ data }) => executarCheckin(data, false));

export const totemCheckinConfirmar = createServerFn({ method: "POST" })
  .inputValidator((input) => checkinInput.parse(input))
  .handler(({ data }) => executarCheckin(data, true));

async function executarCheckout(input: z.infer<typeof checkoutInput>, confirmar: boolean): Promise<RespostaCheckout> {
  const S = await import("@/lib/totem/totem.server");
  const R = await import("@/lib/totem/regras");
  const C = await import("@/lib/totem/cobranca.server");
  const T = await import("@/lib/totem/ticket.server");
  const totem = await S.autenticarTotem(input.token);
  S.exigirModo(totem, "checkout");
  if (await S.totemBloqueado(totem)) return { estado: "bloqueado" };

  const achada = await S.identificarReservaCheckout(totem, input.quarto, input.sobrenome);
  if (!achada) {
    await S.registrarEvento(totem, "identificacao_falhou", { quarto: input.quarto, detalhe: "check-out" });
    return { estado: "nao_encontrado" };
  }
  const { rec, hospedes, reservationID } = achada;
  const nome = R.primeiroNome(hospedes);
  const nomeCompleto = (hospedes.find((h) => h.principal) ?? hospedes[0])?.nomeCompleto ?? nome;
  const quarto = R.extrairQuartos(rec).find((q) => R.quartosIguais(q.nome, input.quarto))?.nome || input.quarto;
  if (!confirmar) await S.registrarEvento(totem, "identificacao_ok", { reservation_id: reservationID, quarto, hospede: nomeCompleto });

  const cobraNoTotem = C.pagamentoDisponivel(totem).ok;
  const saldo = await saldoEfetivo(rec, reservationID);
  const motivos = R.avaliarCheckout({
    status: R.statusDe(rec),
    saldo,
    bloqueiaSaldoAberto: cobraNoTotem ? false : totem.bloqueia_saldo_aberto,
  });
  if (motivos.length) {
    await S.registrarEvento(totem, "checkout_impedido", {
      reservation_id: reservationID,
      quarto,
      hospede: nomeCompleto,
      detalhe: motivos.map((m) => m.codigo).join(", "),
    });
    return { estado: "impedido", nome, quarto, motivos };
  }
  const pagamento = cobraNoTotem && saldo > 0 ? { valor: saldo } : null;
  if (!confirmar) {
    const tk = await T.assinarTicket({ totemId: totem.id, reservationID, fluxo: "checkout", quarto, hospede: nomeCompleto, email: S.emailDe(rec) });
    return { estado: "pronto", nome, quarto, reservationID, ticket: tk, pagamento };
  }
  if (pagamento) return { estado: "impedido", nome, quarto, motivos: [{ codigo: "saldo_aberto", valor: pagamento.valor }] };

  try {
    await S.checkoutNoCloudbeds(totem, rec, quarto);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await S.registrarEvento(totem, "checkout_erro", { reservation_id: reservationID, quarto, hospede: nomeCompleto, detalhe: msg });
    throw new Error(msg);
  }

  let revogadas = 0;
  let erroRevogar: string | null = null;
  try {
    revogadas = await S.revogarSenhasDoQuarto(totem, reservationID, quarto);
  } catch (e) {
    erroRevogar = e instanceof Error ? e.message : String(e);
  }
  await S.registrarCheckoutLog(totem, rec, quarto, nomeCompleto);
  await S.avisarRecepcao(
    totem,
    quarto,
    `Check-out feito no totem por ${nomeCompleto} (quarto ${quarto}). ` +
      (erroRevogar ? `ATENÇÃO: não foi possível revogar a senha da porta (${erroRevogar}).` : `Senhas revogadas: ${revogadas}.`),
  );
  await S.registrarEvento(totem, "checkout_ok", {
    reservation_id: reservationID,
    quarto,
    hospede: nomeCompleto,
    detalhe: erroRevogar ? `Revogação falhou: ${erroRevogar}` : `Senhas revogadas: ${revogadas}`,
  });
  const comprovante = await montarComprovante(totem, { tipo: "checkout", reservationID, hospede: nomeCompleto, quartos: [quarto] });
  return { estado: "concluido", nome, quarto, reservationID, comprovante };
}

export const totemCheckoutConsultar = createServerFn({ method: "POST" })
  .inputValidator((input) => checkoutInput.parse(input))
  .handler(({ data }) => executarCheckout(data, false));

export const totemCheckoutConfirmar = createServerFn({ method: "POST" })
  .inputValidator((input) => checkoutInput.parse(input))
  .handler(({ data }) => executarCheckout(data, true));

// ------------------------------------------------------------ pagamento

export type SituacaoPagamento = {
  cobrancaId: string;
  status: "pendente" | "pago" | "cancelado" | "falhou" | "expirado";
  valor: number;
  metodo: MetodoPagamento;
};

/** Manda a cobrança do saldo para a maquininha Stone ao lado do tablet. */
export const totemPagamentoIniciar = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token, ticket, metodo: z.enum(["credito", "debito", "pix"]) }).parse(input))
  .handler(async ({ data }): Promise<SituacaoPagamento | { status: "nada_a_pagar" }> => {
    const S = await import("@/lib/totem/totem.server");
    const C = await import("@/lib/totem/cobranca.server");
    const T = await import("@/lib/totem/ticket.server");
    const totem = await S.autenticarTotem(data.token);
    const tk = await T.lerTicket(data.ticket, totem.id);
    S.exigirModo(totem, tk.fluxo);
    // Valor sempre recalculado no servidor, direto do Cloudbeds.
    const rec = await S.buscarReservaPorId(S.propriedade(totem), tk.reservationID);
    if (!rec) throw new Error("Não foi possível consultar a reserva no Cloudbeds. Tente de novo.");
    const valor = await saldoEfetivo(rec, tk.reservationID);
    if (valor <= 0) return { status: "nada_a_pagar" };
    const c = await C.iniciarCobranca(totem, {
      reservationID: tk.reservationID,
      hospede: tk.hospede,
      email: tk.email,
      fluxo: tk.fluxo,
      valor,
      metodo: data.metodo,
      quarto: tk.quarto,
    });
    await S.registrarEvento(totem, "pagamento_iniciado", {
      reservation_id: tk.reservationID,
      quarto: tk.quarto,
      hospede: tk.hospede,
      detalhe: `R$ ${valor.toFixed(2)} · ${data.metodo}`,
    });
    return { cobrancaId: c.id, status: c.status, valor: c.valor, metodo: c.metodo };
  });

export const totemPagamentoStatus = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token, cobrancaId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<SituacaoPagamento> => {
    const S = await import("@/lib/totem/totem.server");
    const C = await import("@/lib/totem/cobranca.server");
    const totem = await S.autenticarTotem(data.token);
    const c = await C.acompanharCobranca(totem, data.cobrancaId);
    return { cobrancaId: c.id, status: c.status, valor: c.valor, metodo: c.metodo };
  });

export const totemPagamentoCancelar = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token, cobrancaId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<SituacaoPagamento> => {
    const S = await import("@/lib/totem/totem.server");
    const C = await import("@/lib/totem/cobranca.server");
    const totem = await S.autenticarTotem(data.token);
    const c = await C.buscarCobranca(data.cobrancaId);
    if (!c || c.totem_id !== totem.id) throw new Error("Cobrança não encontrada neste totem.");
    await C.cancelarCobranca(totem, c, "hospede_cancelou");
    const atual = (await C.buscarCobranca(c.id)) ?? c;
    return { cobrancaId: atual.id, status: atual.status, valor: atual.valor, metodo: atual.metodo };
  });

// ------------------------------------------------------------ documentos

export const totemDocumentoEnviar = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        token,
        ticket,
        ordem: z.number().int().min(1).max(12),
        nome: z.string().trim().min(3).max(120),
        tipo: z.enum(["cpf", "rg", "cnh", "passaporte", "outro"]),
        numero: z.string().trim().max(40),
        lado: z.enum(["frente", "verso"]),
        foto: z.string().min(1000).max(6_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const S = await import("@/lib/totem/totem.server");
    const D = await import("@/lib/totem/documentos.server");
    const T = await import("@/lib/totem/ticket.server");
    const totem = await S.autenticarTotem(data.token);
    const tk = await T.lerTicket(data.ticket, totem.id);
    if (tk.fluxo !== "checkin") throw new Error("Documentos só no check-in.");
    const r = await D.salvarDocumento(totem, tk, {
      ordem: data.ordem,
      nome: data.nome,
      tipo: data.tipo,
      numero: data.numero,
      lado: data.lado,
      jpegBase64: data.foto,
    });
    await S.registrarEvento(totem, "documento", {
      reservation_id: tk.reservationID,
      quarto: tk.quarto,
      hospede: data.nome,
      detalhe: `${data.tipo} ${data.lado}${r.cloudbedsErro ? ` · Cloudbeds: ${r.cloudbedsErro}` : ""}`,
    });
    return { ok: true };
  });

// ------------------------------------------------------------ avaliação

export const totemAvaliar = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        token,
        reservationID: z.string().min(1).max(40),
        quarto: z.string().min(1).max(20),
        nota: z.number().int().min(1).max(5),
        comentario: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const S = await import("@/lib/totem/totem.server");
    const totem = await S.autenticarTotem(data.token);
    S.exigirModo(totem, "checkout");
    await S.salvarAvaliacao(totem, {
      reservationID: data.reservationID,
      quarto: data.quarto,
      nota: data.nota,
      comentario: data.comentario || null,
    });
    await S.registrarEvento(totem, "avaliacao", {
      reservation_id: data.reservationID,
      quarto: data.quarto,
      detalhe: `${data.nota} estrela(s)`,
    });
    return { ok: true };
  });
