import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: () => chain };
  return { createServerFn: () => chain };
});
import { receitaDaReserva } from "./cloudbeds-reservas.functions";

describe("receitaDaReserva", () => {
  it("usa o total do detalhe (getReservation)", () => {
    expect(receitaDaReserva({ total: 450.5, balance: 0 }, { reservationID: "1" })).toBe(450.5);
  });
  it("aceita total em texto", () => {
    expect(receitaDaReserva({ total: "1.234,56" })).toBe(1234.56);
  });
  it("soma os quartos quando o total vem zerado (ex.: cancelada)", () => {
    expect(
      receitaDaReserva({ total: 0, assigned: [{ roomTotal: "300" }], unassigned: [{ dailyRates: [{ date: "x", rate: 100 }, { rate: 50 }] }] }),
    ).toBe(450);
  });
  it("cai para a linha da listagem se o detalhe falhar", () => {
    expect(receitaDaReserva(undefined, { balanceDetailed: { grandTotal: 210 } })).toBe(210);
  });
  it("zero quando não há valor", () => {
    expect(receitaDaReserva({}, {})).toBe(0);
  });
});
