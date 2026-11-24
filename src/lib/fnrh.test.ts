import { describe, expect, it } from "vitest";
import {
  cpfValido,
  ufDoCep,
  ufDoEstado,
  pendenciasDoHospede,
  pendenciasFnrhDaReserva,
  resumoFnrh,
} from "../../supabase/functions/_shared/fnrh";

// CPFs de teste (válidos pelo dígito verificador, não são de ninguém).
const CPF_A = "529.982.247-25";
const CPF_B = "111.444.777-35";

const ok = {
  guestFirstName: "Ana",
  guestLastName: "Souza",
  guestBirthdate: "1990-05-10",
  guestCountry: "BR",
  guestCity: "Rio de Janeiro",
  guestState: "RJ",
  guestZip: "22250-040",
  guestDocumentType: "cpf",
  guestDocumentNumber: CPF_A,
};

describe("FNRH — pré-checagem do cadastro", () => {
  it("CPF com dígito verificador", () => {
    expect(cpfValido(CPF_A)).toBe(true);
    expect(cpfValido("52998224726")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("123")).toBe(false);
  });

  it("cadastro completo não tem pendência", () => {
    expect(pendenciasDoHospede(ok).faltando).toEqual([]);
  });

  it("brasileiro sem cidade/UF/nascimento", () => {
    const r = pendenciasDoHospede({
      ...ok,
      guestCity: "",
      guestState: "",
      guestBirthdate: "0000-00-00",
    });
    expect(r.faltando).toEqual(["nascimento", "cidade", "estado (UF)"]);
  });

  it("CEP obrigatório e tem que ser do estado informado", () => {
    expect(pendenciasDoHospede({ ...ok, guestZip: "" }).faltando).toEqual(["CEP"]);
    expect(pendenciasDoHospede({ ...ok, guestZip: "2225" }).faltando).toEqual(["CEP inválido"]);
    // Caso real: Minas Gerais com cidade/CEP de Sergipe (Poço Redondo).
    expect(
      pendenciasDoHospede({
        ...ok,
        guestState: "Minas Gerais",
        guestCity: "Poço Redondo",
        guestZip: "49810-000",
      }).faltando,
    ).toEqual(["estado (MG) não bate com o CEP (SE)"]);
    expect(
      pendenciasDoHospede({
        ...ok,
        guestState: "Sao Paulo",
        guestCity: "Osasco",
        guestZip: "06010000",
      }).faltando,
    ).toEqual([]);
  });

  it("UF pelo nome e pelo CEP", () => {
    expect(ufDoEstado("São Paulo")).toBe("SP");
    expect(ufDoEstado("rj")).toBe("RJ");
    expect(ufDoEstado("Mato Grosso do Sul")).toBe("MS");
    expect(ufDoEstado("Narnia")).toBeNull();
    expect(ufDoCep("70040-010")).toBe("DF");
    expect(ufDoCep("74000-000")).toBe("GO");
    expect(ufDoCep("69301-000")).toBe("RR");
  });

  it("brasileiro com CPF inválido ou ausente; CPF pode estar no taxID", () => {
    expect(pendenciasDoHospede({ ...ok, guestDocumentNumber: "52998224726" }).faltando).toEqual([
      "CPF inválido",
    ]);
    expect(pendenciasDoHospede({ ...ok, guestDocumentNumber: "" }).faltando).toEqual(["CPF"]);
    expect(
      pendenciasDoHospede({ ...ok, guestDocumentNumber: "MG123", taxID: CPF_B }).faltando,
    ).toEqual([]);
  });

  it("estrangeiro precisa de passaporte, não de CPF nem UF", () => {
    const g = { ...ok, guestCountry: "AR", guestState: "", guestZip: "", guestDocumentNumber: "" };
    expect(pendenciasDoHospede(g).faltando).toEqual(["documento (passaporte)"]);
    expect(pendenciasDoHospede({ ...g, guestDocumentNumber: "AAB123456" }).faltando).toEqual([]);
  });

  it("motivo/transporte só quando o campo existe e está vazio", () => {
    const g = {
      ...ok,
      customFields: [
        { customFieldName: "motivo_da_viagem", customFieldValue: "" },
        { customFieldName: "meio_transporte", customFieldValue: "Avião" },
      ],
    };
    expect(pendenciasDoHospede(g).faltando).toEqual(["motivo da viagem"]);
  });

  it("reserva: mesmo CPF em dois hóspedes e acompanhante sem cadastro", () => {
    const r = pendenciasFnrhDaReserva([ok, { ...ok, guestFirstName: "Nícolas" }], 3);
    expect(r).toEqual([
      { hospede: "Ana Souza", faltando: ["CPF repetido em outro hóspede"] },
      { hospede: "Nícolas Souza", faltando: ["CPF repetido em outro hóspede"] },
      { hospede: "1 acompanhante", faltando: ["cadastrar no Cloudbeds"] },
    ]);
    expect(pendenciasFnrhDaReserva([ok, { ...ok, guestDocumentNumber: CPF_B }], 2)).toEqual([]);
    expect(resumoFnrh(r)).toBe("CPF repetido em outro hóspede, cadastrar no Cloudbeds");
  });
});
