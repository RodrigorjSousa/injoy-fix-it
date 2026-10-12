import { describe, expect, it } from "vitest";
import { canalPrePago, saldoACobrar } from "./canal-pagamento";
import { saldoDe } from "@/lib/totem/regras";

describe("Airbnb não gera débito", () => {
  it("reconhece Airbnb em sourceName/source/origin", () => {
    expect(canalPrePago({ sourceName: "Airbnb (API)" })).toBe(true);
    expect(canalPrePago({ source: "airbnb" })).toBe(true);
    expect(canalPrePago({ origin: "Air BnB" })).toBe(true);
    expect(canalPrePago({ sourceName: { name: "Airbnb" } } as never)).toBe(true);
    expect(canalPrePago({ sourceName: "Booking.com" })).toBe(false);
    expect(canalPrePago({ sourceName: "Website/Booking Engine" })).toBe(false);
  });
  it("saldo a cobrar zera só para Airbnb", () => {
    expect(saldoACobrar({ sourceName: "Airbnb", balance: "850.00" })).toBe(0);
    expect(saldoACobrar({ sourceName: "Booking.com", balance: "850.00" })).toBe(850);
    expect(saldoACobrar({ balanceDue: 120.456 })).toBe(120.46);
    expect(saldoACobrar({ balance: -10 })).toBe(0);
  });
  it("totem não bloqueia check-out de Airbnb", () => {
    expect(saldoDe({ sourceName: "Airbnb", balance: 500 })).toBe(0);
    expect(saldoDe({ sourceName: "Direct", balance: 500 })).toBe(500);
  });
});
