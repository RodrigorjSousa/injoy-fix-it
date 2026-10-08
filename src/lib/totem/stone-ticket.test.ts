import { describe, expect, it, beforeAll } from "vitest";
import { resumirPedido } from "./stone.server";
import { assinarTicket, lerTicket } from "./ticket.server";

describe("resumo do pedido Stone", () => {
  it("pedido com cobrança paga vira pago, com bandeira e autorização", () => {
    const r = resumirPedido({
      id: "or_1",
      status: "pending",
      charges: [
        { id: "ch_1", status: "paid", amount: 15050, paid_amount: 15050, metadata: { scheme_name: "Visa", authorization_code: "A1B2" } },
      ],
    });
    expect(r).toMatchObject({ status: "pago", cobrancaId: "ch_1", valorPagoCentavos: 15050, bandeira: "Visa", autorizacao: "A1B2" });
  });
  it("pedido aberto sem cobrança paga continua pendente; cancelado/falhou mapeados", () => {
    expect(resumirPedido({ status: "pending", charges: [] }).status).toBe("pendente");
    expect(resumirPedido({ status: "canceled" }).status).toBe("cancelado");
    expect(resumirPedido({ status: "failed", charges: [{ status: "failed" }] }).status).toBe("falhou");
  });
});

describe("ticket de atendimento", () => {
  beforeAll(() => {
    process.env.TOTEM_TICKET_SECRET = "segredo-de-teste";
  });
  const base = { totemId: "t1", reservationID: "R1", fluxo: "checkin" as const, quarto: "005", hospede: "Maria", email: null };

  it("ida e volta", async () => {
    const tk = await assinarTicket(base);
    await expect(lerTicket(tk, "t1")).resolves.toMatchObject({ reservationID: "R1", quarto: "005" });
  });
  it("recusa outro totem, ticket alterado e ticket vencido", async () => {
    const tk = await assinarTicket(base, Date.now() - 21 * 60_000);
    await expect(lerTicket(tk, "t1")).rejects.toThrow(/expirou/);
    const bom = await assinarTicket(base);
    await expect(lerTicket(bom, "t2")).rejects.toThrow(/outro totem/);
    const [corpo, assin] = bom.split(".");
    const falso = btoa(JSON.stringify({ ...base, reservationID: "R2", exp: Date.now() + 60_000 })).replace(/=+$/, "");
    await expect(lerTicket(`${falso}.${assin}`, "t1")).rejects.toThrow(/inválido/);
    expect(corpo).toBeTruthy();
  });
});
