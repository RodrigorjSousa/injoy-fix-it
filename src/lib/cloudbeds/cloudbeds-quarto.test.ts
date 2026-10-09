import { describe, expect, it } from "vitest";
import {
  analisarRoomBlocks,
  bloqueioDoHousekeeping,
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
    const m = analisarRoomBlocks(resp(bloco("out_of_service", "Vazamento no banheiro", "2026-10-09", "2026-10-12")), hoje);
    expect(m.get("R1")).toMatchObject({ bloqueio: "manutencao", motivoBloqueio: "Vazamento no banheiro", eci: false });
  });
  it("bloqueio comum vira BLOQUEADO", () => {
    const m = analisarRoomBlocks(resp(bloco("blocked_dates", "Uso da diretoria", hoje, hoje)), hoje);
    expect(m.get("R1")?.bloqueio).toBe("bloqueado");
  });
  it("bloqueio com motivo de manutenção vira MANUTENÇÃO mesmo sendo blocked_dates", () => {
    const m = analisarRoomBlocks(resp(bloco("blocked_dates", "Manutenção ar condicionado", hoje, hoje)), hoje);
    expect(m.get("R1")?.bloqueio).toBe("manutencao");
  });
  it("ECI / LCO no motivo do bloqueio não bloqueiam o quarto, só sinalizam", () => {
    const m = analisarRoomBlocks(
      resp(bloco("blocked_dates", "LCO 14h", hoje, hoje, "R1"), bloco("blocked_dates", "Early check-in 10:30", hoje, hoje, "R2")),
      hoje,
    );
    expect(m.get("R1")).toMatchObject({ lco: true, lcoTime: "14:00", bloqueio: null });
    expect(m.get("R2")).toMatchObject({ eci: true, eciTime: "10:30", bloqueio: null });
  });
  it("ignora bloqueio que não cobre hoje e pré-reserva (courtesy hold)", () => {
    const m = analisarRoomBlocks(
      resp(bloco("out_of_service", "Obra", "2026-10-11", "2026-10-15"), bloco("courtesy_hold", "Grupo", hoje, hoje, "R2")),
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

describe("ECI/LCO em texto", () => {
  it("reconhece siglas, inglês e português com hora", () => {
    expect(scanEciLco("Hóspede pediu saída atrasada até 15h")).toMatchObject({ lco: true, lcoTime: "15:00" });
    expect(scanEciLco({ note: "ECI 9h30" })).toMatchObject({ eci: true, eciTime: "09:30" });
    expect(scanEciLco("Entrada antecipada")).toMatchObject({ eci: true, eciTime: null });
  });
  it("não confunde palavras comuns", () => {
    expect(scanEciLco("Decidiu ficar, falco, eclipse")).toMatchObject({ eci: false, lco: false });
  });
});
