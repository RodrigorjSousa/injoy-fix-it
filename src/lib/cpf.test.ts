import { describe, expect, it } from "vitest";
import { cpfValido, formatarCnpj, formatarCpf } from "@/lib/cpf";

describe("cpf", () => {
  it("valida dígitos", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224724")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("123")).toBe(false);
  });
  it("formata", () => {
    expect(formatarCpf("052998224725")).toBe("529.982.247-25");
    expect(formatarCnpj("12345678000190")).toBe("12.345.678/0001-90");
  });
});
