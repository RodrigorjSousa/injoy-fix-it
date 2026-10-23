import { describe, expect, it } from "vitest";
import { CONHECIMENTO_PADRAO } from "./conhecimento";
import {
  CARTAO_REMOVIDO,
  avaliarCancelamento,
  canalDaOrigem,
  ehBrasileiro,
  tipoTarifa,
  type DadosCancelamento,
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
      "https://hotels.cloudbeds.com/pt-br/reservation/vKBCEM?checkin=2026-11-10&checkout=2026-11-12&adults=2&currency=brl",
    );
    expect(
      linkReserva(CONHECIMENTO_PADRAO, "Ipanema", {
        checkin: "2026-11-10",
        checkout: "2026-11-12",
        adultos: 0,
      }),
    ).toContain("tGU9aM?checkin=2026-11-10&checkout=2026-11-12&adults=1&currency=brl");
  });
  it("abre no idioma do hóspede e não duplica idioma já cadastrado", () => {
    expect(
      linkReserva(CONHECIMENTO_PADRAO, "Ipanema", {
        checkin: "2026-11-10",
        checkout: "2026-11-12",
        adultos: 2,
        idioma: "en",
      }),
    ).toContain("https://hotels.cloudbeds.com/en/reservation/tGU9aM?");
    const c = structuredClone(CONHECIMENTO_PADRAO);
    c.unidades.Botafogo.motorReserva = "https://hotels.cloudbeds.com/pt-br/reservation/vKBCEM";
    expect(
      linkReserva(c, "Botafogo", {
        checkin: "2026-11-10",
        checkout: "2026-11-12",
        adultos: 2,
        idioma: "en",
      }),
    ).toContain("https://hotels.cloudbeds.com/pt-br/reservation/vKBCEM?");
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

describe("avaliarCancelamento", () => {
  const base: DadosCancelamento = {
    canal: "direto",
    canalNome: "Website/Booking Engine",
    dataReserva: "2026-10-01",
    chegada: "2026-11-20",
    saida: "2026-11-23",
    tarifa: "flexivel",
    brasileiro: true,
    hoje: "2026-10-20",
    hora: "15:00",
    datasEspeciais: [],
  };
  const av = (d: Partial<DadosCancelamento>) => avaliarCancelamento({ ...base, ...d }).resultado;

  it("reserva de canal cancela pelo canal", () => {
    expect(av({ canal: "canal", canalNome: "Booking.com" })).toBe("canal");
  });
  it("sem dados vai para a equipe", () => {
    expect(av({ canal: null })).toBe("equipe");
    expect(av({ dataReserva: null })).toBe("equipe");
    expect(av({ tarifa: null })).toBe("equipe");
  });
  it("CDC: até o fim do 7º dia após a reserva (reserva dia 1 → até dia 8), qualquer tarifa", () => {
    expect(av({ tarifa: "nao_reembolsavel", hoje: "2026-10-08" })).toBe("reembolso_cdc");
    expect(av({ tarifa: "nao_reembolsavel", hoje: "2026-10-09" })).toBe("sem_reembolso");
  });
  it("CDC com check-in dentro dos 7 dias: só até as 11h do dia do check-in", () => {
    const d = {
      tarifa: "nao_reembolsavel" as const,
      dataReserva: "2026-10-20",
      chegada: "2026-10-23",
      saida: "2026-10-25",
    };
    expect(av({ ...d, hoje: "2026-10-22", hora: "23:00" })).toBe("reembolso_cdc");
    expect(av({ ...d, hoje: "2026-10-23", hora: "10:59" })).toBe("reembolso_cdc");
    expect(av({ ...d, hoje: "2026-10-23", hora: "11:00" })).toBe("sem_reembolso");
  });
  it("CDC vale para brasileiro; país não informado vai para a equipe; estrangeiro segue a tarifa", () => {
    expect(av({ tarifa: "nao_reembolsavel", hoje: "2026-10-05", brasileiro: null })).toBe("equipe");
    expect(av({ tarifa: "nao_reembolsavel", hoje: "2026-10-05", brasileiro: false })).toBe(
      "sem_reembolso",
    );
    expect(av({ tarifa: "flexivel", hoje: "2026-10-05", brasileiro: false })).toBe("gratis");
  });
  it("tarifa flexível: grátis até 3 dias antes (chegada dia 20 → até dia 17)", () => {
    expect(av({ hoje: "2026-11-17" })).toBe("gratis");
    expect(av({ hoje: "2026-11-18" })).toBe("sem_reembolso");
  });
  it("Não reembolsável fora do CDC não tem reembolso", () => {
    expect(av({ tarifa: "nao_reembolsavel" })).toBe("sem_reembolso");
  });
  it("datas especiais: toda tarifa vira Não reembolsável (mas o CDC continua valendo)", () => {
    const datasEspeciais = [{ nome: "Réveillon", inicio: "2026-12-29", fim: "2027-01-01" }];
    const d = { chegada: "2026-12-30", saida: "2027-01-03", datasEspeciais };
    const r = avaliarCancelamento({ ...base, ...d });
    expect(r.resultado).toBe("sem_reembolso");
    expect(r.data_especial).toBe("Réveillon");
    expect(av({ ...d, hoje: "2026-10-03" })).toBe("reembolso_cdc");
    // saída no primeiro dia do período não toca as noites especiais
    expect(av({ chegada: "2026-12-26", saida: "2026-12-29", datasEspeciais })).toBe("gratis");
  });
});

describe("tipoTarifa, ehBrasileiro e canalDaOrigem", () => {
  it("classifica o plano", () => {
    expect(tipoTarifa(["TARIFA EXCLUSIVA SITE"])).toBe("flexivel");
    expect(tipoTarifa(["Standard Rate"])).toBe("flexivel");
    expect(tipoTarifa(["Não Reembolsável"])).toBe("nao_reembolsavel");
    expect(tipoTarifa(["Standard", "Non-refundable"])).toBe("nao_reembolsavel");
    expect(tipoTarifa([])).toBeNull();
  });
  it("país", () => {
    expect(ehBrasileiro("BR")).toBe(true);
    expect(ehBrasileiro("Brasil")).toBe(true);
    expect(ehBrasileiro("AR")).toBe(false);
    expect(ehBrasileiro("")).toBeNull();
  });
  it("origem", () => {
    expect(canalDaOrigem("Website/Booking Engine")).toBe("direto");
    expect(canalDaOrigem("Walk-In")).toBe("direto");
    expect(canalDaOrigem("Booking.com")).toBe("canal");
    expect(canalDaOrigem("Expedia")).toBe("canal");
    expect(canalDaOrigem("Agência XYZ")).toBeNull();
    expect(canalDaOrigem("")).toBeNull();
  });
});
