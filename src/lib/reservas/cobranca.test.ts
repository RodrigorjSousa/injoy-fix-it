import { describe, expect, it } from "vitest";
import {
  avaliarReserva,
  canalRecebeDoHospede,
  cobradaPeloCanal,
  compararParaLista,
  diasEntre,
  linkCloudbeds,
  motivoDeSaida,
  planoEhNR,
  planosDaReserva,
} from "./cobranca";

const HOJE = "2026-10-14";

function reserva(over: Record<string, unknown> = {}) {
  return {
    reservationID: "R1",
    propertyID: "12345",
    guestName: "Ana Souza",
    dateCreated: "2026-10-01 10:00:00",
    reservationCheckIn: "2026-11-20",
    reservationCheckOut: "2026-11-23",
    status: "confirmed",
    balance: "450.00",
    sourceName: "Booking.com",
    rooms: [{ ratePlanName: "Não reembolsável – Reserva Antecipada – NR" }],
    ...over,
  };
}

describe("planoEhNR", () => {
  it("reconhece os exemplos reais do documento", () => {
    expect(planoEhNR("Não reembolsável – Reserva Antecipada – NR")).toBe(true);
    expect(planoEhNR("Nao reembolsavel – Epoca alta")).toBe(true);
    expect(planoEhNR("Early Booking – Non refundable")).toBe(true);
  });
  it("aceita hífen, maiúsculas e NR isolado", () => {
    expect(planoEhNR("NON-REFUNDABLE")).toBe(true);
    expect(planoEhNR("Tarifa NR")).toBe(true);
    expect(planoEhNR("(nr)")).toBe(true);
  });
  it("não confunde com palavras que só contêm 'nr'", () => {
    expect(planoEhNR("Standard")).toBe(false);
    expect(planoEhNR("Henrique Special")).toBe(false);
    expect(planoEhNR("Reembolsável")).toBe(false);
    expect(planoEhNR("Flexível")).toBe(false);
    expect(planoEhNR("")).toBe(false);
  });
});

describe("planosDaReserva", () => {
  it("lê o plano de cada quarto e tolera nomes de campo diferentes", () => {
    expect(
      planosDaReserva({ rooms: [{ ratePlanName: "Standard" }, { rateName: "Early Booking – Non refundable" }] }),
    ).toEqual(["Standard", "Early Booking – Non refundable"]);
    expect(planosDaReserva({ rooms: [{ roomRateName: "Flex" }] })).toEqual(["Flex"]);
  });
  it("uma reserva com dois quartos e um NR é NR inteira", () => {
    const av = avaliarReserva(
      reserva({ rooms: [{ ratePlanName: "Standard" }, { ratePlanName: "Non refundable" }] }),
      HOJE,
    );
    expect(av.nr).toBe(true);
  });
});

describe("filtros", () => {
  it("só confirmed e not_confirmed", () => {
    for (const status of ["canceled", "no_show", "checked_in", "checked_out"]) {
      expect(avaliarReserva(reserva({ status }), HOJE).exclusao).toBe("status");
    }
    expect(avaliarReserva(reserva({ status: "not_confirmed" }), HOJE).motivo).toBe("nr_8o_dia");
  });
  it("saldo precisa ser maior que zero", () => {
    expect(avaliarReserva(reserva({ balance: 0 }), HOJE).exclusao).toBe("sem_saldo");
    expect(avaliarReserva(reserva({ balance: "-10" }), HOJE).exclusao).toBe("sem_saldo");
  });
  it("Airbnb fica de fora", () => {
    expect(avaliarReserva(reserva({ sourceName: "Airbnb (API)" }), HOJE).exclusao).toBe("canal_recebe");
    expect(canalRecebeDoHospede("AIR BNB")).toBe(true);
    expect(canalRecebeDoHospede("Booking.com")).toBe(false);
  });
  it("paymentCollect = channel fica de fora", () => {
    expect(avaliarReserva(reserva({ paymentCollect: "channel" }), HOJE).exclusao).toBe("cobrada_pelo_canal");
    expect(cobradaPeloCanal({ rooms: [{ paymentCollect: "Channel" }] })).toBe(true);
    expect(cobradaPeloCanal({ paymentCollect: "hotel" })).toBe(false);
    // Formato da v1.3: dentro de `source`.
    expect(cobradaPeloCanal({ source: { name: "Expedia", paymentCollect: "channel" } })).toBe(true);
    expect(cobradaPeloCanal({ source: { name: "Booking.com", paymentCollect: "hotel" } })).toBe(false);
  });
});

describe("formato real da v1.3 (getReservationsWithRateDetails)", () => {
  // Campos conforme a documentação: sem guestName no topo; plano em rooms[].rateName;
  // paymentCollect em source.
  const v13 = {
    propertyID: "301234",
    reservationID: "8812461877",
    dateCreated: "2026-10-12 09:15:00",
    status: "confirmed",
    reservationCheckIn: "2026-10-17",
    reservationCheckOut: "2026-10-21",
    sourceName: "Booking.com",
    source: { name: "Booking.com", paymentCollect: "hotel", sourceID: "s-1", category: "OTA" },
    balance: 1240,
    rooms: [
      { roomTypeName: "Duplo", guestName: "Carlos Mendes", rateID: "77", rateName: "Não reembolsável – Reserva Antecipada – NR" },
    ],
  };
  it("lê hóspede, plano e classifica", () => {
    const av = avaliarReserva(v13, HOJE);
    expect(av.hospede).toBe("Carlos Mendes");
    expect(av.planos).toEqual(["Não reembolsável – Reserva Antecipada – NR"]);
    expect(av.nr).toBe(true);
    expect(av.antecedencia).toBe(5);
    expect(av.motivo).toBe("nr_checkin_proximo");
    expect(av.propertyId).toBe("301234");
  });
  it("hóspede pela guestList quando o quarto não traz o nome", () => {
    const av = avaliarReserva(
      { ...v13, rooms: [{ rateName: "Standard" }], guestList: { g1: { guestFirstName: "Ana", guestLastName: "Lima" } } },
      HOJE,
    );
    expect(av.hospede).toBe("Ana Lima");
  });
});

describe("regras NR", () => {
  it("antecedência menor que 8 dias: entra na hora", () => {
    const av = avaliarReserva(
      reserva({ dateCreated: "2026-10-13 22:00:00", reservationCheckIn: "2026-10-20" }),
      HOJE,
    );
    expect(av.antecedencia).toBe(7);
    expect(av.motivo).toBe("nr_checkin_proximo");
  });
  it("antecedência ≥ 8: espera o 8º dia após a reserva", () => {
    const antes = avaliarReserva(reserva({ dateCreated: "2026-10-07 09:00:00" }), HOJE);
    expect(antes.diasDesdeReserva).toBe(7);
    expect(antes.motivo).toBeNull();
    expect(antes.exclusao).toBe("nr_aguardando_8o_dia");
    expect(antes.entraEm).toBe("2026-10-15");

    const no8 = avaliarReserva(reserva({ dateCreated: "2026-10-06 09:00:00" }), HOJE);
    expect(no8.diasDesdeReserva).toBe(8);
    expect(no8.motivo).toBe("nr_8o_dia");
  });
  it("antecedência exatamente 8 é regra do 8º dia", () => {
    const av = avaliarReserva(
      reserva({ dateCreated: "2026-10-12 09:00:00", reservationCheckIn: "2026-10-20" }),
      HOJE,
    );
    expect(av.antecedencia).toBe(8);
    expect(av.exclusao).toBe("nr_aguardando_8o_dia");
    // entra no que vier primeiro: 8º dia (20/10) ou 2 dias antes do check-in (18/10)
    expect(av.entraEm).toBe("2026-10-18");
  });
  it("NR nunca chega em cima do check-in: entra 2 dias antes mesmo sem o 8º dia (caso 7646906562553)", () => {
    // feita 16/10, check-in 24/10: o 8º dia seria o próprio check-in
    const caso = (hoje: string) => avaliarReserva(reserva({ dateCreated: "2026-10-16 10:00:00", reservationCheckIn: "2026-10-24" }), hoje);
    expect(caso("2026-10-21").exclusao).toBe("nr_aguardando_8o_dia");
    expect(caso("2026-10-21").entraEm).toBe("2026-10-22");
    expect(caso("2026-10-22").motivo).toBe("nr_checkin_proximo");
    expect(caso("2026-10-23").motivo).toBe("nr_checkin_proximo");
    expect(caso("2026-10-24").motivo).toBe("nr_8o_dia");
    // antecedência 9: idem
    const nove = avaliarReserva(reserva({ dateCreated: "2026-10-15 10:00:00", reservationCheckIn: "2026-10-24" }), "2026-10-22");
    expect(nove.motivo).toBe("nr_checkin_proximo");
    // antecedência longa continua no 8º dia, sem mudança
    const longa = avaliarReserva(reserva({ dateCreated: "2026-10-01 10:00:00", reservationCheckIn: "2026-12-20" }), "2026-10-05");
    expect(longa.entraEm).toBe("2026-10-09");
  });
});

describe("regra Standard", () => {
  const std = (checkin: string) =>
    avaliarReserva(
      reserva({ reservationCheckIn: checkin, rooms: [{ ratePlanName: "Standard – Flexível" }] }),
      HOJE,
    );
  it("entra de 2 dias antes até o dia do check-in", () => {
    expect(std("2026-10-16").motivo).toBe("standard");
    expect(std("2026-10-15").motivo).toBe("standard");
    expect(std("2026-10-14").motivo).toBe("standard");
  });
  it("fora da janela", () => {
    const longe = std("2026-10-17");
    expect(longe.exclusao).toBe("standard_antes_da_janela");
    expect(longe.entraEm).toBe("2026-10-15");
    expect(std("2026-10-13").exclusao).toBe("standard_checkin_passou");
  });
});

describe("ordenação", () => {
  it("check-in primeiro (por data), depois NR do 8º dia das mais atrasadas", () => {
    const itens = [
      { reservationId: "a", motivo: "nr_8o_dia" as const, checkin: "2026-12-01", dataReserva: "2026-10-05" },
      { reservationId: "b", motivo: "standard" as const, checkin: "2026-10-16", dataReserva: "2026-09-01" },
      { reservationId: "c", motivo: "nr_8o_dia" as const, checkin: "2026-11-01", dataReserva: "2026-09-20" },
      { reservationId: "d", motivo: "nr_checkin_proximo" as const, checkin: "2026-10-15", dataReserva: "2026-10-13" },
    ];
    expect(itens.sort(compararParaLista).map((i) => i.reservationId)).toEqual(["d", "b", "c", "a"]);
  });
});

describe("saída da lista e utilidades", () => {
  it("motivo de saída", () => {
    expect(motivoDeSaida(undefined)).toBe("nao_encontrada");
    expect(motivoDeSaida(avaliarReserva(reserva({ balance: 0 }), HOJE))).toBe("saldo_zerado");
    expect(motivoDeSaida(avaliarReserva(reserva({ status: "canceled" }), HOJE))).toBe("cancelada");
    expect(motivoDeSaida(avaliarReserva(reserva({ status: "checked_in" }), HOJE))).toBe("check_in_feito");
  });
  it("diasEntre atravessa mês e horário de verão", () => {
    expect(diasEntre("2026-10-31", "2026-11-02")).toBe(2);
    expect(diasEntre("2026-02-28", "2026-03-01")).toBe(1);
  });
  it("link do Cloudbeds", () => {
    expect(linkCloudbeds("123", "ABC")).toBe("https://hotels.cloudbeds.com/connect/123#/reservations/ABC");
  });
});
