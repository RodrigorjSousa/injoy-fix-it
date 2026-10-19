import { describe, expect, it } from "vitest";
import { CONHECIMENTO_PADRAO } from "./conhecimento";
import {
  CARTAO_REMOVIDO,
  lerDisponibilidade,
  linkReserva,
  mascararCartao,
  mesmoTelefone,
  noites,
  statusReserva,
  unidadeDe,
  validarDatas,
  verificarResposta,
  wifiLiberado,
} from "./regras";

describe("mascararCartao", () => {
  it("remove cartão válido com ou sem espaços", () => {
    expect(mascararCartao("meu cartão 4111 1111 1111 1111 ok")).toBe(
      `meu cartão ${CARTAO_REMOVIDO} ok`,
    );
    expect(mascararCartao("5500-0000-0000-0004")).toBe(CARTAO_REMOVIDO);
    expect(mascararCartao("4111111111111111")).toBe(CARTAO_REMOVIDO);
  });
  it("não mexe em telefone, código de reserva nem número inválido no Luhn", () => {
    expect(mascararCartao("liga 21 99748-4343")).toBe("liga 21 99748-4343");
    expect(mascararCartao("reserva 1234567890123")).toBe("reserva 1234567890123");
    expect(mascararCartao("4111 1111 1111 1112")).toBe("4111 1111 1111 1112");
  });
});

describe("datas", () => {
  it("conta noites", () => {
    expect(noites("2026-11-10", "2026-11-13")).toBe(3);
  });
  it("valida cotação", () => {
    expect(validarDatas("2026-11-10", "2026-11-12", "2026-10-19")).toBeNull();
    expect(validarDatas("2026-10-18", "2026-10-20", "2026-10-19")).toBe("passado");
    expect(validarDatas("2026-11-12", "2026-11-12", "2026-10-19")).toBe("ordem");
    expect(validarDatas("10/11/2026", "2026-11-12", "2026-10-19")).toBe("formato");
    expect(validarDatas("2026-11-01", "2027-02-01", "2026-10-19")).toBe("longa");
  });
});

describe("wifiLiberado", () => {
  const hoje = "2026-10-19";
  it("libera hospedado", () => {
    expect(
      wifiLiberado({ status: "checked_in", chegada: "2026-10-15", saida: "2026-10-22" }, hoje),
    ).toBe(true);
  });
  it("libera check-in hoje e amanhã", () => {
    expect(
      wifiLiberado({ status: "confirmed", chegada: "2026-10-19", saida: "2026-10-21" }, hoje),
    ).toBe(true);
    expect(
      wifiLiberado({ status: "confirmed", chegada: "2026-10-20", saida: "2026-10-21" }, hoje),
    ).toBe(true);
  });
  it("não libera chegada depois de amanhã, cancelada ou quem já saiu", () => {
    expect(
      wifiLiberado({ status: "confirmed", chegada: "2026-10-21", saida: "2026-10-23" }, hoje),
    ).toBe(false);
    expect(
      wifiLiberado({ status: "canceled", chegada: "2026-10-19", saida: "2026-10-21" }, hoje),
    ).toBe(false);
    expect(
      wifiLiberado({ status: "checked_out", chegada: "2026-10-15", saida: "2026-10-19" }, hoje),
    ).toBe(false);
  });
  it("libera durante a estadia mesmo sem status de hospedado", () => {
    expect(
      wifiLiberado({ status: "confirmed", chegada: "2026-10-17", saida: "2026-10-21" }, hoje),
    ).toBe(true);
  });
});

describe("statusReserva / unidadeDe / telefone", () => {
  it("traduz status", () => {
    expect(statusReserva("in_house")).toBe("hospedado");
    expect(statusReserva("not_confirmed")).toBe("nao_confirmada");
    expect(statusReserva("cancelled")).toBe("cancelada");
  });
  it("reconhece unidade", () => {
    expect(unidadeDe("ipanema")).toBe("Ipanema");
    expect(unidadeDe("BOTAFOGO")).toBe("Botafogo");
    expect(unidadeDe("copacabana")).toBeNull();
  });
  it("compara telefones em formatos diferentes", () => {
    expect(mesmoTelefone("+55 (21) 99748-4343", "21997484343")).toBe(true);
    expect(mesmoTelefone("5521997484343", "997484343")).toBe(true);
    expect(mesmoTelefone("21997484343", "21997484344")).toBe(false);
    expect(mesmoTelefone("123", "123")).toBe(false);
  });
});

describe("linkReserva", () => {
  it("usa o motor do Cloudbeds da unidade", () => {
    expect(
      linkReserva(CONHECIMENTO_PADRAO, "Botafogo", {
        checkin: "2026-11-10",
        checkout: "2026-11-12",
        adultos: 2,
      }),
    ).toBe(
      "https://hotels.cloudbeds.com/reservation/vKBCEM?checkin=2026-11-10&checkout=2026-11-12&adults=2",
    );
    expect(
      linkReserva(CONHECIMENTO_PADRAO, "Ipanema", {
        checkin: "2026-11-10",
        checkout: "2026-11-12",
        adultos: 0,
      }),
    ).toContain("tGU9aM?checkin=2026-11-10&checkout=2026-11-12&adults=1");
  });
});

describe("verificarResposta", () => {
  const wifi = {
    Botafogo: { rede: "INJOY", senha: "senhaTesteB" },
    Ipanema: { rede: "INJOY", senha: "senhaTesteI" },
  };
  const base = {
    wifi,
    wifiLiberadoPara: [] as Array<"Botafogo" | "Ipanema">,
    numerosPermitidos: [] as string[],
  };

  it("deixa passar resposta normal", () => {
    expect(verificarResposta("Check-in a partir das 14h, check-out até 11h 😊", base)).toEqual([]);
    expect(verificarResposta("Temos 2 quartos livres para 3 pessoas.", base)).toEqual([]);
  });
  it("bloqueia número de acomodação", () => {
    expect(verificarResposta("Você vai ficar no quarto 005!", base)).toContain("numero_acomodacao");
    expect(verificarResposta("Your room 12 is ready", base)).toContain("numero_acomodacao");
  });
  it("não confunde nome de tipo do Cloudbeds com número de acomodação", () => {
    expect(
      verificarResposta("O Studio 2 está livre.", { ...base, nomesPermitidos: ["Studio 2"] }),
    ).toEqual([]);
  });
  it("bloqueia código de acesso", () => {
    expect(verificarResposta("Sua senha é 482913", base)).toContain("codigo_acesso");
    expect(verificarResposta("Digite 482913# no teclado", base)).toContain("codigo_acesso");
  });
  it("permite o código da própria reserva", () => {
    expect(
      verificarResposta("O código da sua reserva é 6602931", {
        ...base,
        numerosPermitidos: ["6602931"],
      }),
    ).toEqual([]);
  });
  it("bloqueia Wi-Fi não liberado e libera quando autorizado", () => {
    expect(verificarResposta("A senha do Wi-Fi é senhaTesteB", base)).toContain(
      "wifi_nao_liberado",
    );
    expect(
      verificarResposta("A senha do Wi-Fi é senhaTesteB", {
        ...base,
        wifiLiberadoPara: ["Botafogo"],
      }),
    ).toEqual([]);
    expect(
      verificarResposta("A senha é senhaTesteI", { ...base, wifiLiberadoPara: ["Botafogo"] }),
    ).toContain("wifi_nao_liberado");
  });
  it("bloqueia cartão", () => {
    expect(verificarResposta("confirma 4111 1111 1111 1111?", base)).toContain("cartao");
  });
});

describe("lerDisponibilidade", () => {
  it("lê tipos livres, soma o detalhado e ordena pelo menor preço", () => {
    const payload = {
      success: true,
      data: [
        {
          propertyRooms: [
            {
              roomTypeName: "Loft",
              roomsAvailable: 1,
              maxGuests: 3,
              roomRate: 999,
              roomRateDetailed: [{ rate: 400 }, { rate: 420 }],
            },
            { roomTypeName: "Suíte Standard", roomsAvailable: 2, maxGuests: 2, roomRate: "500.50" },
            { roomTypeName: "Mezanino", roomsAvailable: 0, roomRate: 300 },
          ],
        },
      ],
    };
    const r = lerDisponibilidade(payload, 2);
    expect(r.map((o) => o.tipo)).toEqual(["Suíte Standard", "Loft"]);
    expect(r[1].totalEstadia).toBe(820);
    expect(r[1].mediaNoite).toBe(410);
    expect(r[0].totalEstadia).toBe(500.5);
  });
  it("aguenta resposta vazia ou estranha", () => {
    expect(lerDisponibilidade(null, 2)).toEqual([]);
    expect(lerDisponibilidade({ data: "x" }, 2)).toEqual([]);
  });
});
