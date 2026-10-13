import { describe, expect, it } from "vitest";
import { resumoOperacao, situacaoQuarto, taxaOcupacaoCloudbeds, type LinhaQuarto } from "./operacao";

const q = (p: Partial<LinhaQuarto>): LinhaQuarto => ({
  property: "Botafogo",
  status: "clean",
  service_status: null,
  condition: "normal",
  guest_name: null,
  departing_guest_name: null,
  next_guest_name: null,
  has_pending_payment: false,
  pending_payment_amount: null,
  has_pending_docs: false,
  updated_at: "2026-10-13T11:00:00Z",
  ...p,
});

describe("situacaoQuarto", () => {
  it("segue a regra da tela inicial", () => {
    expect(situacaoQuarto({ condition: "maintenance", status: "clean", service_status: "done" })).toBe("bloqueados");
    expect(situacaoQuarto({ condition: "normal", status: "dirty", service_status: "done" })).toBe("prontos");
    expect(situacaoQuarto({ condition: "normal", status: "dirty", service_status: "in_progress" })).toBe("emFaxina");
    expect(situacaoQuarto({ condition: "normal", status: "dirty", service_status: null })).toBe("sujos");
  });
});

describe("resumoOperacao", () => {
  it("conta só a unidade pedida sem inferir ocupação pelos nomes", () => {
    const r = resumoOperacao(
      [
        q({ guest_name: "A", has_pending_payment: true, pending_payment_amount: 150.5 }),
        q({ guest_name: "B", status: "dirty", departing_guest_name: "B", next_guest_name: "C", has_pending_docs: true }),
        q({ condition: "maintenance" }),
        q({ updated_at: "2026-10-13T11:05:00Z" }),
        q({ property: "Ipanema", guest_name: "Z" }),
      ],
      "Botafogo",
    );
    expect(r).toMatchObject({
      quartos: 4,
      vendaveis: 3,
      prontos: 2,
      sujos: 1,
      bloqueados: 1,
      chegadas: 1,
      saidas: 1,
      aReceber: 150.5,
      comSaldo: 1,
      docsPendentes: 1,
      atualizadoEm: "2026-10-13T11:05:00Z",
    });
  });

  it("unidade sem dados não divide por zero", () => {
    expect(resumoOperacao([], "Ipanema").quartos).toBe(0);
  });
});

describe("taxaOcupacaoCloudbeds", () => {
  it("preserva a taxa real de Botafogo, sem excluir bloqueados do denominador", () => {
    expect(taxaOcupacaoCloudbeds(52.63)).toBe(0.5263);
  });
  it("preserva a taxa real de Ipanema", () => {
    expect(taxaOcupacaoCloudbeds(50)).toBe(0.5);
  });
  it("zero é uma ocupação válida e ausência não vira zero", () => {
    expect(taxaOcupacaoCloudbeds(0)).toBe(0);
    expect(taxaOcupacaoCloudbeds(undefined)).toBeNull();
  });
});
