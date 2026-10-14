import { describe, expect, it } from "vitest";
import {
  analisarRoomBlocks,
  bloqueioDeHoje,
  bloqueioDoHousekeeping,
  housekeepingRoomBlocked,
  hojeNoHotel,
  scanEciLco,
  somarDias,
} from "../../../supabase/functions/_shared/cloudbeds-quarto";

const bloco = (tipo: string, motivo: string, inicio: string, fim: string, roomID = "R1") => ({
  roomBlockType: tipo,
  roomBlockReason: motivo,
  startDate: inicio,
  endDate: fim,
  rooms: [{ roomID }],
});
const resp = (...b: unknown[]) => ({ success: true, data: { roomBlocks: b } });

describe("data do hotel", () => {
  it("usa o fuso do Rio, não UTC (23h do dia 10 continua sendo dia 10)", () => {
    expect(hojeNoHotel(new Date("2026-10-11T02:00:00Z"))).toBe("2026-10-10");
    expect(hojeNoHotel(new Date("2026-10-11T03:30:00Z"))).toBe("2026-10-11");
  });
  it("soma dias", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-10-01", -1)).toBe("2026-09-30");
  });
});

describe("bloqueios do Cloudbeds", () => {
  const hoje = "2026-10-10";
  it("out_of_service vira MANUTENÇÃO com o motivo", () => {
    const m = analisarRoomBlocks(
      resp(bloco("out_of_service", "Vazamento no banheiro", "2026-10-09", "2026-10-12")),
      hoje,
    );
    expect(m.get("R1")).toMatchObject({
      bloqueio: "manutencao",
      motivoBloqueio: "Vazamento no banheiro",
      eci: false,
    });
  });
  it("bloqueio comum vira BLOQUEADO", () => {
    const m = analisarRoomBlocks(
      resp(bloco("blocked_dates", "Uso da diretoria", hoje, hoje)),
      hoje,
    );
    expect(m.get("R1")?.bloqueio).toBe("bloqueado");
  });
  it("bloqueio com motivo de manutenção vira MANUTENÇÃO mesmo sendo blocked_dates", () => {
    const m = analisarRoomBlocks(
      resp(bloco("blocked_dates", "Manutenção ar condicionado", hoje, hoje)),
      hoje,
    );
    expect(m.get("R1")?.bloqueio).toBe("manutencao");
  });
  it("ECI / LCO no motivo do bloqueio não bloqueiam o quarto, só sinalizam", () => {
    const m = analisarRoomBlocks(
      resp(
        bloco("blocked_dates", "LCO 14h", hoje, hoje, "R1"),
        bloco("blocked_dates", "Early check-in 10:30", hoje, hoje, "R2"),
      ),
      hoje,
    );
    expect(m.get("R1")).toMatchObject({ lco: true, lcoTime: "14:00", bloqueio: null });
    expect(m.get("R2")).toMatchObject({ eci: true, eciTime: "10:30", bloqueio: null });
  });
  it("ignora bloqueio que não cobre hoje e pré-reserva (courtesy hold)", () => {
    const m = analisarRoomBlocks(
      resp(
        bloco("out_of_service", "Obra", "2026-10-11", "2026-10-15"),
        bloco("courtesy_hold", "Grupo", hoje, hoje, "R2"),
      ),
      hoje,
    );
    expect(m.size).toBe(0);
  });
  it("resposta vazia ou com erro não quebra", () => {
    expect(analisarRoomBlocks(null, hoje).size).toBe(0);
    expect(analisarRoomBlocks({ success: false }, hoje).size).toBe(0);
  });
  it("roomCondition fora de serviço no housekeeping", () => {
    expect(bloqueioDoHousekeeping({ roomCondition: "out_of_service" })).toBe("manutencao");
    expect(bloqueioDoHousekeeping({ roomCondition: "dirty" })).toBeNull();
  });
});

describe("desbloqueio no Cloudbeds (caso de 14/10)", () => {
  const hoje = "2026-10-14";
  const flags = (b: ReturnType<typeof bloco>) => analisarRoomBlocks(resp(b), hoje).get("R1");

  it("bloco que termina hoje fica marcado; bloco que continua, não", () => {
    expect(flags(bloco("blocked_dates", "Diretoria", "2026-10-12", hoje))).toMatchObject({
      bloqueio: "bloqueado",
      bloqueioTerminaHoje: true,
    });
    expect(
      flags(bloco("blocked_dates", "Diretoria", "2026-10-12", "2026-10-16"))?.bloqueioTerminaHoje,
    ).toBe(false);
    expect(flags(bloco("blocked_dates", "Diretoria", hoje, hoje))?.bloqueioTerminaHoje).toBe(false);
  });

  it("dois blocos: o que continua vale mais (motivo e trava)", () => {
    const m = analisarRoomBlocks(
      resp(
        bloco("blocked_dates", "Antigo", "2026-10-10", hoje),
        bloco("out_of_service", "Vazamento", hoje, "2026-10-18"),
      ),
      hoje,
    ).get("R1");
    expect(m).toMatchObject({
      bloqueio: "manutencao",
      motivoBloqueio: "Vazamento",
      bloqueioTerminaHoje: false,
    });
  });

  it("reserva para esta noite derruba o bloqueio (o check-in aparece para as camareiras)", () => {
    const f = flags(bloco("blocked_dates", "Diretoria", "2026-10-12", "2026-10-16"));
    expect(bloqueioDeHoje(f, { roomBlocked: true }, true)).toEqual({
      tipo: null,
      motivo: null,
      descartado: "reserva_hoje",
    });
  });

  it("housekeeping com roomBlocked=false derruba o bloqueio", () => {
    const f = flags(bloco("out_of_service", "Obra", "2026-10-12", "2026-10-16"));
    expect(bloqueioDeHoje(f, { roomBlocked: false }, false).descartado).toBe("housekeeping_livre");
    expect(bloqueioDeHoje(f, { roomBlocked: "false" }, false).tipo).toBeNull();
  });

  it("bloco que termina hoje só vale se o housekeeping confirmar", () => {
    const f = flags(bloco("blocked_dates", "Diretoria", "2026-10-12", hoje));
    expect(bloqueioDeHoje(f, {}, false).descartado).toBe("termina_hoje");
    expect(bloqueioDeHoje(f, { roomBlocked: true }, false)).toEqual({
      tipo: "bloqueado",
      motivo: "Diretoria",
      descartado: null,
    });
  });

  it("bloqueio que continua e sem reserva segue valendo (com ou sem roomBlocked)", () => {
    const f = flags(bloco("out_of_service", "Vazamento", "2026-10-12", "2026-10-16"));
    expect(bloqueioDeHoje(f, {}, false)).toEqual({
      tipo: "manutencao",
      motivo: "Vazamento",
      descartado: null,
    });
    expect(bloqueioDeHoje(f, { roomBlocked: true }, false).tipo).toBe("manutencao");
  });

  it("sem bloqueio nenhum", () => {
    expect(bloqueioDeHoje(undefined, { roomBlocked: true }, false)).toEqual({
      tipo: null,
      motivo: null,
      descartado: null,
    });
  });

  it("lê roomBlocked em vários formatos", () => {
    expect(housekeepingRoomBlocked({ roomBlocked: true })).toBe(true);
    expect(housekeepingRoomBlocked({ roomBlocked: "1" })).toBe(true);
    expect(housekeepingRoomBlocked({ roomBlocked: 0 })).toBe(false);
    expect(housekeepingRoomBlocked({})).toBeNull();
  });
});

describe("ECI/LCO em texto", () => {
  it("reconhece siglas, inglês e português com hora", () => {
    expect(scanEciLco("Hóspede pediu saída atrasada até 15h")).toMatchObject({
      lco: true,
      lcoTime: "15:00",
    });
    expect(scanEciLco({ note: "ECI 9h30" })).toMatchObject({ eci: true, eciTime: "09:30" });
    expect(scanEciLco("Entrada antecipada")).toMatchObject({ eci: true, eciTime: null });
  });
  it("não confunde palavras comuns", () => {
    expect(scanEciLco("Decidiu ficar, falco, eclipse")).toMatchObject({ eci: false, lco: false });
  });
});
