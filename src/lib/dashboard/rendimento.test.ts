import { describe, expect, it } from "vitest";
import {
  noitesDaReserva,
  noitesEntre,
  noitesNoPeriodo,
  quartoDoApp,
  quartoDoChamado,
  reclamacoesPorQuarto,
  resumoRendimento,
  SEM_QUARTO,
  type NoiteLida,
} from "./rendimento";

describe("noitesEntre", () => {
  it("check-in entra, check-out não", () => {
    expect(noitesEntre("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });
  it("vazio se as datas não fecham", () => {
    expect(noitesEntre("2026-10-02", "2026-10-02")).toEqual([]);
    expect(noitesEntre("", "2026-10-02")).toEqual([]);
  });
});

describe("quartoDoApp", () => {
  it("casa o nome do Cloudbeds com o quarto do app", () => {
    expect(quartoDoApp("APT 107", "Botafogo")).toBe("107");
    expect(quartoDoApp("1", "Ipanema")).toBe("01");
    expect(quartoDoApp("Apto 05", "Botafogo")).toBe("05");
  });
  it("mantém o nome se não achar e marca sem quarto se vazio", () => {
    expect(quartoDoApp("Suíte X", "Botafogo")).toBe("Suíte X");
    expect(quartoDoApp("", "Botafogo")).toBe(SEM_QUARTO);
  });
});

describe("noitesDaReserva", () => {
  it("usa a tarifa de cada dia (getReservationsWithRateDetails)", () => {
    const n = noitesDaReserva(
      {
        reservationID: "R1",
        status: "checked_out",
        sourceName: "Booking.com",
        dateCreated: "2026-09-20 10:00:00",
        rooms: [
          {
            roomName: "APT 107",
            roomTypeName: "Duplo",
            roomCheckIn: "2026-10-03",
            roomCheckOut: "2026-10-05",
            detailedRoomRates: { "2026-10-03": "280.00", "2026-10-04": 320 },
          },
        ],
      },
      "Botafogo",
    );
    expect(n.map((x) => [x.data, x.quarto, x.valor])).toEqual([
      ["2026-10-03", "107", 280],
      ["2026-10-04", "107", 320],
    ]);
    expect(n[0].origem).toBe("Booking.com");
    expect(n[0].reservado_em).toBe("2026-09-20");
  });

  it("usa dailyRates em lista (getReservation)", () => {
    const n = noitesDaReserva(
      {
        reservationID: "R2",
        status: "confirmed",
        startDate: "2026-10-10",
        endDate: "2026-10-12",
        assigned: [{ roomName: "205", dailyRates: [{ date: "2026-10-10", rate: 200 }, { date: "2026-10-11", rate: 210 }] }],
      },
      "Ipanema",
    );
    expect(n.map((x) => x.valor)).toEqual([200, 210]);
  });

  it("divide o total do quarto quando não há tarifa por dia", () => {
    const n = noitesDaReserva(
      { reservationID: "R3", status: "checked_in", rooms: [{ roomName: "301", roomCheckIn: "2026-10-01", roomCheckOut: "2026-10-04", roomTotal: "900" }] },
      "Botafogo",
    );
    expect(n.map((x) => x.valor)).toEqual([300, 300, 300]);
  });

  it("divide o total da reserva entre quartos e noites quando nada mais existe", () => {
    const n = noitesDaReserva(
      {
        reservationID: "R4",
        status: "confirmed",
        reservationCheckIn: "2026-10-01",
        reservationCheckOut: "2026-10-03",
        balanceDetailed: { subTotal: 800 },
        rooms: [{ roomName: "01" }, { roomName: "02" }],
      },
      "Botafogo",
    );
    expect(n).toHaveLength(4);
    expect(n.every((x) => x.valor === 200)).toBe(true);
  });

  it("ignora canceladas e no-show", () => {
    const base = { reservationID: "R5", rooms: [{ roomName: "01", roomCheckIn: "2026-10-01", roomCheckOut: "2026-10-02", roomTotal: 100 }] };
    expect(noitesDaReserva({ ...base, status: "canceled" }, "Botafogo")).toEqual([]);
    expect(noitesDaReserva({ ...base, status: "no_show" }, "Botafogo")).toEqual([]);
  });

  it("quarto não atribuído vira 'Sem quarto'", () => {
    const n = noitesDaReserva(
      { reservationID: "R6", status: "confirmed", unassigned: [{ roomTypeName: "Duplo", startDate: "2026-10-20", endDate: "2026-10-21", roomTotal: 150 }] },
      "Ipanema",
    );
    expect(n[0].quarto).toBe(SEM_QUARTO);
  });
});

describe("noitesNoPeriodo", () => {
  it("corta o que está fora do mês e não repete a mesma noite", () => {
    const r = {
      reservationID: "R7",
      status: "confirmed",
      rooms: [{ roomName: "01", roomCheckIn: "2026-09-29", roomCheckOut: "2026-10-03", roomTotal: 400 }],
    };
    const n = noitesNoPeriodo([r, r], "Botafogo", "2026-10-01", "2026-10-31");
    expect(n.map((x) => x.data)).toEqual(["2026-10-01", "2026-10-02"]);
  });
});

describe("resumoRendimento", () => {
  const quartos = ["01", "02", "03"];
  const noite = (data: string, quarto: string, valor: number, reservation_id: string, origem = "Booking.com"): NoiteLida => ({
    data,
    quarto,
    valor,
    reservation_id,
    origem,
  });
  // 2026-10-03 é sábado, 04 domingo, 05 segunda, 06 terça.
  const noites: NoiteLida[] = [
    noite("2026-10-03", "01", 300, "A"),
    noite("2026-10-04", "01", 300, "A"),
    noite("2026-10-03", "02", 250, "B", "Direto"),
    noite("2026-10-03", "03", 280, "C"),
    noite("2026-10-05", "02", 180, "D", "Direto"),
    noite("2026-09-30", "01", 999, "X"), // fora do período
  ];
  const r = resumoRendimento(noites, { de: "2026-10-03", ate: "2026-10-06", quartos });

  it("receita, noites, ocupação, diária média, RevPAR", () => {
    expect(r.dias).toBe(4);
    expect(r.receita).toBe(1310);
    expect(r.noites).toBe(5);
    expect(r.reservas).toBe(4);
    expect(r.ocupacao).toBeCloseTo(5 / 12);
    expect(r.diariaMedia).toBe(262);
    expect(r.revpar).toBe(109.17);
    expect(r.ticketMedio).toBe(327.5);
    expect(r.estadiaMedia).toBe(1.3);
  });

  it("quartos mais e menos alugados", () => {
    expect(r.maisAlugados.map((q) => q.quarto)).toEqual(["01", "02", "03"]);
    expect(r.menosAlugados[0]).toMatchObject({ quarto: "03", noites: 1 });
  });

  it("dias de alta e de baixa", () => {
    expect(r.diasAlta[0]).toMatchObject({ data: "2026-10-03", ocupados: 3, ocupacao: 1 });
    expect(r.diasBaixa[0]).toMatchObject({ data: "2026-10-06", ocupados: 0 });
  });

  it("ocupação por dia da semana", () => {
    expect(r.porDiaSemana[6].ocupacao).toBe(1); // sábado
    expect(r.porDiaSemana[2].ocupacao).toBe(0); // terça
    expect(r.porDiaSemana[0].diariaMedia).toBe(300); // domingo
  });

  it("faixa de diária que mais vende e canais", () => {
    expect(r.faixaMaisVendida).toMatchObject({ de: 250, ate: 300, noites: 2 });
    expect(r.faixas.reduce((s, f) => s + f.noites, 0)).toBe(5);
    expect(r.canais[0]).toMatchObject({ origem: "Booking.com", noites: 3, receita: 880 });
  });

  it("período sem vendas não quebra", () => {
    const vazio = resumoRendimento([], { de: "2026-10-01", ate: "2026-10-31", quartos });
    expect(vazio.ocupacao).toBe(0);
    expect(vazio.diariaMedia).toBe(0);
    expect(vazio.faixaMaisVendida).toBeNull();
    expect(vazio.menosAlugados).toHaveLength(3);
  });
});

describe("reclamações por quarto", () => {
  it("lê o quarto do chamado", () => {
    expect(quartoDoChamado("[URGENTE] [Quarto 107] Ar não gela")).toBe("107");
    expect(quartoDoChamado("[Área comum] Lâmpada")).toBeNull();
  });

  it("soma chamados, problemas de vistoria e avaliações ruins do totem", () => {
    const r = reclamacoesPorQuarto(
      {
        chamados: [
          { descricao: "[Quarto 107] Chuveiro", unidade: "Botafogo" },
          { descricao: "[Quarto 107] Ar", unidade: "Botafogo" },
          { descricao: "[Quarto 01] Tomada", unidade: "Ipanema" },
          { descricao: "[Área comum] Porta", unidade: "Botafogo" },
        ],
        vistorias: [{ room_number: "01", property: "Botafogo" }],
        avaliacoes: [
          { quarto: "1", unidade: "Botafogo", nota: 2 },
          { quarto: "107", unidade: "Botafogo", nota: 5 },
        ],
      },
      "Botafogo",
    );
    expect(r).toEqual([
      { quarto: "01", total: 2, chamados: 0, vistorias: 1, avaliacoesRuins: 1 },
      { quarto: "107", total: 2, chamados: 2, vistorias: 0, avaliacoesRuins: 0 },
    ]);
  });
});
