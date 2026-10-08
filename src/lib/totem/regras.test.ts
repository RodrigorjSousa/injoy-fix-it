import { describe, expect, it } from "vitest";
import {
  avaliarCheckin,
  avaliarCheckout,
  codigoConfere,
  documentoConfere,
  extrairHospedes,
  extrairQuartos,
  instanteSP,
  nomeConfere,
  primeiroNome,
  quartosIguais,
  relogioSP,
  saldoDe,
  sobrenomeConfere,
  tentativasEsgotadas,
  adultosDaReserva,
  documentosFaltando,
  type EntradaCheckin,
} from "./regras";

// Formato observado em getReservations?includeGuestsDetails=true&includeAllRooms=true
const reserva = {
  reservationID: "8741236985",
  thirdPartyIdentifier: "4.512.778.903",
  status: "confirmed",
  guestName: "María José da Silva",
  reservationCheckIn: "2026-10-08",
  reservationCheckOut: "2026-10-10",
  balance: "0.00",
  rooms: [
    { roomName: "005", roomID: "r5", subReservationID: "8741236985-1", roomCheckIn: "2026-10-08", roomCheckOut: "2026-10-10", roomStatus: "not_checked_in" },
  ],
  guestList: {
    "111": { guestFirstName: "María José", guestLastName: "da Silva", guestDocumentType: "cpf", guestDocumentNumber: "123.456.789-00", isMainGuest: true },
    "112": { guestFirstName: "John", guestLastName: "O'Connor", guestDocumentNumber: "", isMainGuest: false },
  },
};

const relogio = (iso: string) => relogioSP(new Date(iso));

function entrada(over: Partial<EntradaCheckin> = {}): EntradaCheckin {
  return {
    status: "confirmed",
    quartos: extrairQuartos(reserva),
    relogio: relogio("2026-10-08T18:30:00Z"), // 15:30 em SP
    horaCheckin: "14:00",
    exigeQuartoLimpo: true,
    quartoLimpo: () => true,
    temFechadura: () => true,
    saldo: 0,
    bloqueiaSaldoAberto: true,
    ...over,
  };
}

describe("identificação", () => {
  const hospedes = extrairHospedes(reserva);

  it("lê hóspedes do guestList e documento sem pontuação", () => {
    expect(hospedes).toHaveLength(2);
    expect(hospedes[0].documentos).toContain("12345678900");
    expect(primeiroNome(hospedes)).toBe("María");
  });

  it("aceita código do Cloudbeds e do canal, com ou sem pontos", () => {
    expect(codigoConfere(reserva, "8741236985")).toBe(true);
    expect(codigoConfere(reserva, "4512778903")).toBe(true);
    expect(codigoConfere(reserva, "4.512.778.903")).toBe(true);
    expect(codigoConfere(reserva, "874123")).toBe(false);
    expect(codigoConfere(reserva, "")).toBe(false);
  });

  it("sobrenome sem acento/maiúscula; parte do sobrenome composto vale", () => {
    expect(sobrenomeConfere(hospedes, "SILVA")).toBe(true);
    expect(sobrenomeConfere(hospedes, "da silva")).toBe(true);
    expect(sobrenomeConfere(hospedes, "oconnor")).toBe(false); // apóstrofo vira espaço: "o connor"
    expect(sobrenomeConfere(hospedes, "o'connor")).toBe(true);
    expect(sobrenomeConfere(hospedes, "Souza")).toBe(false);
    expect(sobrenomeConfere(hospedes, "S")).toBe(false);
  });

  it("nome exige ao menos duas palavras do hóspede", () => {
    expect(nomeConfere(hospedes[0], "maria silva")).toBe(true);
    expect(nomeConfere(hospedes[0], "Maria")).toBe(false);
    expect(nomeConfere(hospedes[0], "Maria Souza")).toBe(false);
  });

  it("documento confere ignorando pontuação; documento vazio nunca confere", () => {
    expect(documentoConfere(hospedes[0], "12345678900")).toBe(true);
    expect(documentoConfere(hospedes[0], "123.456.789-00")).toBe(true);
    expect(documentoConfere(hospedes[0], "1234")).toBe(false);
    expect(documentoConfere(hospedes[1], "")).toBe(false);
  });
});

describe("quartos e saldo", () => {
  it("extrai quarto atribuído com sub-reserva", () => {
    expect(extrairQuartos(reserva)).toEqual([
      { nome: "005", roomID: "r5", subReservationID: "8741236985-1", checkIn: "2026-10-08", checkOut: "2026-10-10", status: "not_checked_in" },
    ]);
  });
  it("sem lista de quartos vira um quarto sem nome (não atribuído)", () => {
    const q = extrairQuartos({ status: "confirmed", startDate: "2026-10-08", endDate: "2026-10-09" });
    expect(q[0].nome).toBe("");
  });
  it("compara números de quarto", () => {
    expect(quartosIguais("005", "Apto 5")).toBe(true);
    expect(quartosIguais("101", "1010")).toBe(false);
    expect(quartosIguais("", "")).toBe(false);
  });
  it("saldo aceita texto", () => {
    expect(saldoDe({ balance: "150.50" })).toBe(150.5);
    expect(saldoDe({ balance: "1.234,56" })).toBe(1234.56);
    expect(saldoDe({})).toBe(0);
  });
});

describe("avaliarCheckin", () => {
  it("libera quando tudo está certo", () => {
    const r = avaliarCheckin(entrada());
    expect(r.motivos).toEqual([]);
    expect(r.quartos.map((q) => q.nome)).toEqual(["005"]);
  });

  it("antes das 14h não libera", () => {
    const r = avaliarCheckin(entrada({ relogio: relogio("2026-10-08T15:00:00Z") })); // 12:00 SP
    expect(r.motivos).toEqual([{ codigo: "antes_do_horario", hora: "14:00" }]);
  });

  it("chegada de ontem ainda vale de madrugada, sem regra de horário", () => {
    const r = avaliarCheckin(entrada({ relogio: relogio("2026-10-09T05:00:00Z") })); // 02:00 SP do dia 9
    expect(r.motivos).toEqual([]);
  });

  it("chegada em outro dia informa a data", () => {
    const r = avaliarCheckin(entrada({ relogio: relogio("2026-10-07T18:00:00Z") }));
    expect(r.motivos).toEqual([{ codigo: "chegada_outro_dia", data: "2026-10-08" }]);
  });

  it("junta todos os impedimentos de uma vez", () => {
    const r = avaliarCheckin(
      entrada({ quartoLimpo: () => false, temFechadura: () => false, saldo: 80 }),
    );
    expect(r.motivos.map((m) => m.codigo)).toEqual(["quarto_nao_limpo", "saldo_aberto", "sem_fechadura"]);
  });

  it("saldo e limpeza podem ser dispensados pela configuração", () => {
    const r = avaliarCheckin(
      entrada({ quartoLimpo: () => false, exigeQuartoLimpo: false, saldo: 80, bloqueiaSaldoAberto: false }),
    );
    expect(r.motivos).toEqual([]);
  });

  it("quarto não atribuído bloqueia", () => {
    const r = avaliarCheckin(
      entrada({ quartos: [{ nome: "", checkIn: "2026-10-08", checkOut: "2026-10-09", status: "" }] }),
    );
    expect(r.motivos).toEqual([{ codigo: "sem_quarto" }]);
  });

  it("status da reserva", () => {
    expect(avaliarCheckin(entrada({ status: "canceled" })).motivos[0].codigo).toBe("reserva_cancelada");
    expect(avaliarCheckin(entrada({ status: "checked_in" })).motivos[0].codigo).toBe("ja_hospedado");
    expect(avaliarCheckin(entrada({ status: "checked_out" })).motivos[0].codigo).toBe("ja_saiu");
  });
});

describe("avaliarCheckout", () => {
  it("só hospedado pode sair; saldo bloqueia se configurado", () => {
    expect(avaliarCheckout({ status: "checked_in", saldo: 0, bloqueiaSaldoAberto: true })).toEqual([]);
    expect(avaliarCheckout({ status: "in_house", saldo: 10, bloqueiaSaldoAberto: true })[0].codigo).toBe("saldo_aberto");
    expect(avaliarCheckout({ status: "in_house", saldo: 10, bloqueiaSaldoAberto: false })).toEqual([]);
    expect(avaliarCheckout({ status: "confirmed", saldo: 0, bloqueiaSaldoAberto: true })[0].codigo).toBe("nao_hospedado");
  });
});

describe("relógio e bloqueio", () => {
  it("usa o fuso de São Paulo", () => {
    expect(relogioSP(new Date("2026-10-09T02:30:00Z"))).toEqual({ hoje: "2026-10-08", ontem: "2026-10-07", hhmm: "23:30" });
    expect(new Date(instanteSP("2026-10-10", "12:00")).toISOString()).toBe("2026-10-10T15:00:00.000Z");
  });

  it("bloqueia após 5 erros seguidos em 10 minutos; um acerto zera", () => {
    const agora = new Date("2026-10-08T18:00:00Z").getTime();
    const ev = (min: number, tipo: string) => ({ tipo, criado_em: new Date(agora - min * 60_000).toISOString() });
    const cinco = [1, 2, 3, 4, 5].map((m) => ev(m, "identificacao_falhou"));
    expect(tentativasEsgotadas(cinco, agora)).toBe(true);
    expect(tentativasEsgotadas([ev(0.5, "identificacao_ok"), ...cinco], agora)).toBe(false);
    expect(tentativasEsgotadas([1, 2, 3, 4, 12].map((m) => ev(m, "identificacao_falhou")), agora)).toBe(false);
  });
});

describe("adultos e documentos", () => {
  it("usa o número de adultos e preenche os nomes conhecidos, titular primeiro", () => {
    const r = adultosDaReserva({ ...reserva, adults: 3 });
    expect(r).toEqual([
      { ordem: 1, nome: "María José da Silva" },
      { ordem: 2, nome: "John O'Connor" },
      { ordem: 3, nome: null },
    ]);
  });
  it("sem número de adultos usa a soma dos quartos ou os hóspedes; nunca menos de 1", () => {
    expect(adultosDaReserva({ rooms: [{ roomName: "005", adults: 2 }] })).toHaveLength(2);
    expect(adultosDaReserva({ guestList: {} })).toHaveLength(1);
  });
  it("conta só a frente do documento", () => {
    expect(documentosFaltando(2, [{ hospede_ordem: 1, lado: "frente" }, { hospede_ordem: 2, lado: "verso" }])).toBe(1);
    expect(documentosFaltando(2, [{ hospede_ordem: 1, lado: "frente" }, { hospede_ordem: 2, lado: "frente" }])).toBe(0);
  });
});
