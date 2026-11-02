import { describe, expect, it } from "vitest";
import {
  LINHA_ASSINATURA,
  afdParaBytes,
  campoA,
  campoN,
  conferirRegistros,
  crc16Kermit,
  dataHoraAfd,
  gerarAfd,
  linhaCabecalho,
  linhaRegistro,
  linhaTrailer,
  nomeArquivoAfd,
  type EmpregadorRep,
  type RegistroRep,
} from "@/lib/ponto-afd";

const emp: EmpregadorRep = {
  tipo_doc: 1,
  documento: "12345678000190",
  cno_caepf: null,
  razao_social: "IN.JOY HOSTEL DESIGN POUSADA LTDA",
  inpi_registro: null,
  desenvolvedor_documento: null,
};

// Gerados pelo banco (migração 0092) no teste local de 02/11/2026
const marc1: RegistroRep = {
  nsr: 4,
  tipo: 7,
  gravado_em: "2026-11-02T18:37:05.123Z",
  marcacao_em: "2026-11-02T18:37:05.123Z",
  cpf: "052998224725",
  coletor: "02",
  offline: false,
  hash: "8e9b49ab4be38ba20d7ec648bd477375d032b5bbf4b0c19a15d246c4730387b9",
};
const marc2: RegistroRep = {
  ...marc1,
  nsr: 5,
  hash: "00f6bf6cfbbb04eb33f8da170e042edbc716d67a5dac034735093f84adc9f058",
};
const tipo2 = (nsr: number, local: string): RegistroRep => ({
  nsr,
  tipo: 2,
  gravado_em: "2026-11-02T18:37:00Z",
  responsavel_cpf: "11144477735",
  tipo_doc: 1,
  documento: "12345678000190",
  razao_social: emp.razao_social,
  local_prestacao: local,
});
const tipo5: RegistroRep = {
  nsr: 3,
  tipo: 5,
  gravado_em: "2026-11-02T18:37:00Z",
  operacao: "I",
  cpf: "052998224725",
  nome: "FLÁVIO",
  responsavel_cpf: "11144477735",
};

describe("formatação", () => {
  it("CRC-16/KERMIT de referência", () => {
    expect(crc16Kermit("123456789")).toBe("2189");
  });
  it("data e hora em Brasília", () => {
    expect(dataHoraAfd("2026-11-02T18:37:59Z")).toBe("2026-11-02T15:37:00-0300");
    expect(dataHoraAfd("2026-11-03T01:05:00Z")).toBe("2026-11-02T22:05:00-0300");
  });
  it("campos N e A", () => {
    expect(campoN("529.982.247-25", 12)).toBe("052998224725");
    expect(campoA("Ana\nMaria", 6)).toBe("Ana Ma");
    expect(campoA("Zé", 4)).toBe("Zé  ");
  });
});

describe("registros", () => {
  it("tamanhos do leiaute", () => {
    expect(
      linhaCabecalho(emp, { inicio: "2026-11-01", fim: "2026-11-30" }, "2026-11-02T18:40:00Z"),
    ).toHaveLength(302);
    expect(linhaRegistro(tipo2(1, "R. Estácio Coimbra, 80"))).toHaveLength(331);
    expect(linhaRegistro(tipo5)).toHaveLength(118);
    expect(linhaRegistro(marc1)).toHaveLength(137);
    expect(
      linhaRegistro({ nsr: 9, tipo: 6, gravado_em: "2026-11-02T18:37:00Z", evento_codigo: "7" }),
    ).toHaveLength(36);
    expect(linhaTrailer([marc1, tipo5])).toHaveLength(64);
    expect(LINHA_ASSINATURA).toHaveLength(100);
  });
  it("marcação tipo 7 posição a posição", () => {
    const l = linhaRegistro(marc1);
    expect(l.slice(0, 9)).toBe("000000004");
    expect(l[9]).toBe("7");
    expect(l.slice(10, 34)).toBe("2026-11-02T15:37:00-0300");
    expect(l.slice(34, 46)).toBe("052998224725");
    expect(l.slice(70, 72)).toBe("02");
    expect(l[72]).toBe("0");
    expect(l.slice(73)).toBe(marc1.hash);
  });
  it("CRC no fim dos tipos 1 a 5", () => {
    const l = linhaRegistro(tipo5);
    expect(l.slice(-4)).toBe(crc16Kermit(l.slice(0, -4)));
  });
});

describe("arquivo", () => {
  it("cabeçalho, registros em ordem de NSR, trailer e assinatura com CR LF", () => {
    const txt = gerarAfd(emp, [marc2, tipo5, marc1, tipo2(1, "B"), tipo2(2, "I")], {
      inicio: "2026-11-01",
      fim: "2026-11-30",
    });
    const linhas = txt.split("\r\n");
    expect(linhas.at(-1)).toBe("");
    expect(linhas[0].slice(9, 10)).toBe("1");
    expect(linhas.slice(1, 6).map((l) => Number(l.slice(0, 9)))).toEqual([1, 2, 3, 4, 5]);
    expect(linhas[6]).toBe(
      "999999999" +
        "000000002" +
        "000000000" +
        "000000000" +
        "000000001" +
        "000000000" +
        "000000002" +
        "9",
    );
    expect(linhas[7].trim()).toBe("ASSINATURA_DIGITAL_EM_ARQUIVO_P7S");
    expect(afdParaBytes("Á")[0]).toBe(0xc1);
    expect(nomeArquivoAfd(emp)).toBe("AFD0000000000000000012345678000190REP_P.txt");
  });
});

describe("conferência da cadeia", () => {
  const todos = [tipo2(1, "B"), tipo2(2, "I"), tipo5, marc1, marc2];
  it("bate com o hash calculado no banco", async () => {
    expect(await conferirRegistros(todos)).toEqual({
      ok: true,
      marcacoes: 2,
      hashesErrados: [],
      buracos: [],
    });
  });
  it("aponta hash adulterado e NSR faltando", async () => {
    const r = await conferirRegistros([
      tipo2(1, "B"),
      tipo5,
      { ...marc1, cpf: "039053344705" },
      marc2,
    ]);
    expect(r.ok).toBe(false);
    expect(r.buracos).toEqual([2]);
    expect(r.hashesErrados).toEqual([4]);
  });
});
