import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Motivo } from "@/lib/totem/regras";

// Server functions do Totem. NÃO usam login: cada chamada leva o token do
// aparelho, conferido no servidor (autenticarTotem). Toda decisão é refeita no
// servidor na confirmação — o navegador do totem nunca decide nada sozinho.

const token = z.string().min(20).max(200);

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
};

export type PortaTotem = { label: string; tipo: string; senha: string | null; mesma: boolean };

export type RespostaCheckin =
  | { estado: "bloqueado" }
  | { estado: "nao_encontrado" }
  | { estado: "impedido"; nome: string; quartos: string[]; motivos: Motivo[] }
  | { estado: "pronto"; nome: string; quartos: string[]; checkOut: string }
  | {
      estado: "senha";
      nome: string;
      quartos: string[];
      senha: string;
      portas: PortaTotem[];
      validaAte: string;
      avisoCloudbeds: string | null;
    };

export type RespostaCheckout =
  | { estado: "bloqueado" }
  | { estado: "nao_encontrado" }
  | { estado: "impedido"; nome: string; quarto: string; motivos: Motivo[] }
  | { estado: "pronto"; nome: string; quarto: string; reservationID: string }
  | { estado: "concluido"; nome: string; quarto: string; reservationID: string };

function info(t: import("@/lib/totem/totem.server").Totem): TotemInfo {
  return { nome: t.nome, unidade: t.unidade, telefoneSuporte: t.telefone_suporte, horaCheckin: t.hora_checkin, modo: t.modo };
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

/**
 * Check-in. `confirmar=false` só confere e mostra o resumo; `confirmar=true`
 * refaz toda a conferência, gera a senha da porta e faz o check-in no Cloudbeds.
 */
async function executarCheckin(
  input: z.infer<typeof checkinInput>,
  confirmar: boolean,
): Promise<RespostaCheckin> {
  const S = await import("@/lib/totem/totem.server");
  const R = await import("@/lib/totem/regras");
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

  // Já hospedado: se a senha foi gerada antes, mostra de novo (esqueceu a senha).
  if (R.estaHospedada(status)) {
    const nomes = todosQuartos.map((q) => q.nome).filter(Boolean);
    const existente = nomes.length ? await S.senhaExistente(totem, reservationID, nomes) : null;
    if (existente) {
      if (confirmar) {
        await S.registrarEvento(totem, "senha_reexibida", { reservation_id: reservationID, quarto: nomes.join(", "), hospede: nomeCompleto });
        return { estado: "senha", nome, quartos: nomes, ...existente, avisoCloudbeds: null };
      }
      return { estado: "pronto", nome, quartos: nomes, checkOut: todosQuartos.map((q) => q.checkOut).sort().pop() ?? "" };
    }
  }

  const [limpo, fechaduras] = await Promise.all([S.quartosLimpos(totem), S.fechadurasDaUnidade(totem)]);
  const avaliacao = R.avaliarCheckin({
    status,
    quartos: todosQuartos,
    relogio: R.relogioSP(),
    horaCheckin: totem.hora_checkin,
    exigeQuartoLimpo: totem.exige_quarto_limpo,
    quartoLimpo: limpo,
    temFechadura: (q) => !!S.fechaduraDoQuarto(fechaduras, q),
    saldo: R.saldoDe(rec),
    bloqueiaSaldoAberto: totem.bloqueia_saldo_aberto,
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
  if (!confirmar) return { estado: "pronto", nome, quartos, checkOut };

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
  return { estado: "senha", nome, quartos, ...senha, avisoCloudbeds };
}

export const totemCheckinConsultar = createServerFn({ method: "POST" })
  .inputValidator((input) => checkinInput.parse(input))
  .handler(({ data }) => executarCheckin(data, false));

export const totemCheckinConfirmar = createServerFn({ method: "POST" })
  .inputValidator((input) => checkinInput.parse(input))
  .handler(({ data }) => executarCheckin(data, true));

async function executarCheckout(
  input: z.infer<typeof checkoutInput>,
  confirmar: boolean,
): Promise<RespostaCheckout> {
  const S = await import("@/lib/totem/totem.server");
  const R = await import("@/lib/totem/regras");
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

  const motivos = R.avaliarCheckout({
    status: R.statusDe(rec),
    saldo: R.saldoDe(rec),
    bloqueiaSaldoAberto: totem.bloqueia_saldo_aberto,
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
  if (!confirmar) return { estado: "pronto", nome, quarto, reservationID };

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
      (erroRevogar
        ? `ATENÇÃO: não foi possível revogar a senha da porta (${erroRevogar}).`
        : `Senhas revogadas: ${revogadas}.`),
  );
  await S.registrarEvento(totem, "checkout_ok", {
    reservation_id: reservationID,
    quarto,
    hospede: nomeCompleto,
    detalhe: erroRevogar ? `Revogação falhou: ${erroRevogar}` : `Senhas revogadas: ${revogadas}`,
  });
  return { estado: "concluido", nome, quarto, reservationID };
}

export const totemCheckoutConsultar = createServerFn({ method: "POST" })
  .inputValidator((input) => checkoutInput.parse(input))
  .handler(({ data }) => executarCheckout(data, false));

export const totemCheckoutConfirmar = createServerFn({ method: "POST" })
  .inputValidator((input) => checkoutInput.parse(input))
  .handler(({ data }) => executarCheckout(data, true));

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
