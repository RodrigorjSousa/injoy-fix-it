import { describe, expect, it } from "vitest";
import {
  chaveMetaReserva,
  metadataFaltando,
  reservasParaIndice,
  bloqueioPorCobrancaAnterior,
  clienteDaReserva,
  conferirReserva,
  modoDaChave,
  NOTA_AGUARDANDO_AUTENTICACAO,
  notaLinkEnviado,
  notaPagamentoNoCheckin,
  notaPagamentoOk,
  opcoesDeCartao,
  reservasDaDescricao,
  resultadoDoIntent,
  reservasDoCliente,
} from "./stripe-regras";

// Exemplo real (print do Stripe de Botafogo, 16/10/2026).
const KENYA = {
  id: "cus_Uy93qG7yG8YjHD",
  email: "kolive.964818@guest.booking.com",
  description: "Injoy Suítes & Aparts Botafogo - Reservas: 3994900033060",
};

describe("chave do Stripe", () => {
  it("só aceita chave restrita", () => {
    expect(modoDaChave("rk_test_abc")).toBe("teste");
    expect(modoDaChave("rk_live_abc")).toBe("real");
    expect(modoDaChave("sk_live_abc")).toBeNull();
    expect(modoDaChave("sk_test_abc")).toBeNull();
    expect(modoDaChave("pk_live_abc")).toBeNull();
    expect(modoDaChave(undefined)).toBeNull();
  });
});

describe("Cliente da reserva", () => {
  it("lê o número da descrição do Cloudbeds", () => {
    expect(reservasDaDescricao(KENYA.description)).toEqual(["3994900033060"]);
    expect(reservasDaDescricao("X - Reservas: 111, 222")).toEqual(["111", "222"]);
  });
  it("escolhe só o Cliente desta reserva entre os vários da mesma pessoa", () => {
    const outros = [
      { id: "cus_A", email: KENYA.email, description: "Injoy Suítes & Aparts Botafogo - Reservas: 3994900099999" },
      { id: "cus_B", email: KENYA.email, description: "Injoy Suítes & Aparts Botafogo - Reservas: 39949000330601" },
      { id: "cus_C", email: KENYA.email, description: "Kenya Oliveira 3994900033060" }, // sem "Reservas:"
    ];
    const r = clienteDaReserva([...outros, KENYA], "3994900033060");
    expect(r.ok && r.cliente.id).toBe("cus_Uy93qG7yG8YjHD");
  });
  it("acha pela metadata que o Cloudbeds grava (Reservas Id), mesmo sem descrição — caso Thiago", () => {
    const thiago = { id: "cus_VSFRcDAtlqOdF9", email: "x@guest.booking.com", description: null, metadata: { "Reservas Id": "9996102405704" } };
    expect(reservasDoCliente(thiago)).toEqual(["9996102405704"]);
    const r = clienteDaReserva([thiago], "9996102405704");
    expect(r.ok && r.cliente.id).toBe("cus_VSFRcDAtlqOdF9");
    // a etiqueta do app também vale; nº parecido não
    expect(reservasDoCliente({ description: null, metadata: { injoy_reserva_111: "1" } })).toEqual(["111"]);
    expect(clienteDaReserva([{ ...thiago, metadata: { "Reservas Id": "99961024057041" } }], "9996102405704").ok).toBe(false);
    // descrição e metadata do mesmo Cliente contam uma vez
    expect(reservasDoCliente({ description: "X - Reservas: 9996102405704", metadata: { "Reservas Id": "9996102405704" } })).toEqual(["9996102405704"]);
  });
  it("nenhum ou mais de um = não cobra", () => {
    expect(clienteDaReserva([], "3994900033060").ok).toBe(false);
    const dois = clienteDaReserva([KENYA, { ...KENYA, id: "cus_outro" }], "3994900033060");
    expect(dois.ok).toBe(false);
    expect(!dois.ok && dois.motivo).toBe("varios");
    // o mesmo Cliente repetido em duas buscas conta uma vez
    expect(clienteDaReserva([KENYA, KENYA], "3994900033060").ok).toBe(true);
    expect(clienteDaReserva([{ ...KENYA, deleted: true }], "3994900033060").ok).toBe(false);
  });
});

describe("cartões", () => {
  const hoje = "2026-10-16";
  const naReserva = [{ cardNumber: "4242", cardType: "visa" }];
  it("só cobra cartão que também está na reserva do Cloudbeds e não venceu", () => {
    const op = opcoesDeCartao(
      [
        { id: "pm_ok", card: { brand: "visa", last4: "4242", exp_month: 8, exp_year: 2027 } },
        { id: "pm_outro", card: { brand: "mastercard", last4: "5555", exp_month: 1, exp_year: 2030 } },
        { id: "pm_vencido", card: { brand: "visa", last4: "4242", exp_month: 9, exp_year: 2026 } },
        { id: "pm_mesmo_final_outra_marca", card: { brand: "mastercard", last4: "4242", exp_month: 1, exp_year: 2030 } },
      ],
      naReserva,
      hoje,
    );
    expect(op.filter((o) => o.podeCobrar).map((o) => o.id)).toEqual(["pm_ok"]);
    expect(op.find((o) => o.id === "pm_ok")?.texto).toBe("Visa final 4242, vence 08/27");
    expect(op.find((o) => o.id === "pm_outro")?.porque).toBe("Não está nesta reserva no Cloudbeds");
    expect(op.find((o) => o.id === "pm_vencido")?.porque).toBe("Vencido");
  });
  it("vence no fim do mês: outubro/2026 ainda vale em 16/10/2026", () => {
    const op = opcoesDeCartao([{ id: "pm", card: { brand: "visa", last4: "4242", exp_month: 10, exp_year: 2026 } }], naReserva, hoje);
    expect(op[0].podeCobrar).toBe(true);
  });
  it("Mastercard do Stripe casa com 'master' do Cloudbeds e final com máscara", () => {
    const op = opcoesDeCartao(
      [{ id: "pm", card: { brand: "mastercard", last4: "5555", exp_month: 1, exp_year: 2030 } }],
      [{ cardNumber: "XXXX-XXXX-XXXX-5555", cardType: "master" }],
      hoje,
    );
    expect(op[0].podeCobrar).toBe(true);
  });
  it("só no modo de teste o cartão de teste (fora da reserva) é liberado, com aviso", () => {
    const pm = [{ id: "pm", card: { brand: "visa", last4: "4242", exp_month: 1, exp_year: 2030 } }];
    expect(opcoesDeCartao(pm, [], hoje, "real")[0].podeCobrar).toBe(false);
    const t = opcoesDeCartao(pm, [], hoje, "teste")[0];
    expect(t.podeCobrar).toBe(true);
    expect(t.texto).toContain("teste");
    // vencido continua bloqueado no teste
    expect(opcoesDeCartao([{ id: "v", card: { brand: "visa", last4: "1", exp_month: 1, exp_year: 2020 } }], [], hoje, "teste")[0].podeCobrar).toBe(false);
  });
  it("reserva sem cartão no Cloudbeds = nenhum cartão liberado", () => {
    const op = opcoesDeCartao([{ id: "pm", card: { brand: "visa", last4: "4242", exp_month: 1, exp_year: 2030 } }], [], hoje);
    expect(op[0].podeCobrar).toBe(false);
  });
});

describe("valor conferido no Cloudbeds na hora", () => {
  it("cobra só o saldo de agora", () => {
    expect(conferirReserva({ status: "confirmed", balance: "826.62" }, 826.62)).toEqual({ ok: true, saldo: 826.62 });
    const mudou = conferirReserva({ status: "confirmed", balance: 500 }, 826.62);
    expect(mudou.ok).toBe(false);
    expect(!mudou.ok && mudou.texto).toContain("mudou");
  });
  it("não cobra saldo zerado nem reserva cancelada/no-show/hospedada", () => {
    expect(conferirReserva({ status: "confirmed", balance: 0 }, null).ok).toBe(false);
    for (const status of ["canceled", "no_show", "checked_in", "checked_out"]) {
      expect(conferirReserva({ status, balance: 100 }, null).ok).toBe(false);
    }
    expect(conferirReserva({ status: "not_confirmed", balance: 100 }, null).ok).toBe(true);
  });
});

describe("cobrança anterior", () => {
  const agora = 1_760_000_000;
  it("bloqueia cobrança do app já aprovada e qualquer uma em processamento", () => {
    expect(
      bloqueioPorCobrancaAnterior([{ id: "pi1", status: "succeeded", created: agora - 3600, metadata: { injoy_reserva: "R1" } }], "R1", agora),
    ).toContain("já foi cobrada");
    expect(bloqueioPorCobrancaAnterior([{ id: "pi2", status: "processing", created: agora }], "R1", agora)).toContain("processamento");
  });
  it("não bloqueia por tentativas recusadas ou incompletas, nem por cobrança do Cloudbeds", () => {
    expect(
      bloqueioPorCobrancaAnterior(
        [
          { id: "pi3", status: "requires_payment_method", created: agora, metadata: { injoy_reserva: "R1" } },
          { id: "pi4", status: "succeeded", created: agora - 100 }, // feita pelo Cloudbeds: já está no saldo
          { id: "pi5", status: "succeeded", created: agora - 8 * 86_400, metadata: { injoy_reserva: "R1" } },
        ],
        "R1",
        agora,
      ),
    ).toBeNull();
  });
});

describe("notas e resultado", () => {
  it("texto das notas como o Rodrigo pediu", () => {
    expect(notaPagamentoOk("Mayara")).toBe("Pagamento OK // Mayara");
    expect(notaPagamentoNoCheckin("Júlia")).toBe("Pagamento no check in // Júlia");
    expect(notaLinkEnviado("Mayara")).toBe("Link de pagamento enviado // Mayara");
    expect(NOTA_AGUARDANDO_AUTENTICACAO).toBe("Aguardando autenticação CC");
  });
  it("status do Stripe", () => {
    expect(resultadoDoIntent("succeeded")).toBe("aprovado");
    expect(resultadoDoIntent("requires_action")).toBe("autenticacao");
    expect(resultadoDoIntent("requires_payment_method")).toBe("recusado");
    expect(resultadoDoIntent("processing")).toBe("processando");
  });
});

describe("etiqueta do nº da reserva no Cliente", () => {
  it("chave dentro do limite do Stripe (40) e só para identificadores plausíveis", () => {
    expect(chaveMetaReserva("3994900033060")).toBe("injoy_reserva_3994900033060");
    expect(chaveMetaReserva("3994900033060").length).toBeLessThanOrEqual(40);
    expect(reservasParaIndice("Injoy Suítes & Aparts Botafogo - Reservas: 3994900033060")).toEqual(["3994900033060"]);
    expect(reservasParaIndice("X - Reservas: 111, 3994900033060")).toEqual(["3994900033060"]);
    expect(reservasParaIndice("Cliente sem reserva")).toEqual([]);
  });
  it("só grava o que falta", () => {
    const d = "Injoy - Reservas: 3994900033060";
    expect(metadataFaltando(d, {})).toEqual({ injoy_reserva_3994900033060: "1" });
    expect(metadataFaltando(d, { injoy_reserva_3994900033060: "1" })).toEqual({});
    expect(metadataFaltando(null, null)).toEqual({});
  });
});
