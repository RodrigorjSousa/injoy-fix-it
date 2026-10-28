import { describe, expect, it } from "vitest";
import {
  abertosDaPessoa,
  calcularDesconto,
  dividirParcelas,
  liberadoNoMes,
  mesesSeguidos,
  separarPorMes,
  mesmaPessoa,
  pessoaDoLancamento,
  valorPorExtenso,
  type Adiantamento,
} from "./adiantamentos";

const a = (o: Partial<Adiantamento>): Adiantamento => ({
  id: Math.random().toString(),
  funcionario_id: null,
  pessoa_nome: "Maria",
  unidade: "Botafogo",
  valor: 100,
  data_adiantamento: "2026-10-05",
  forma_pagamento: "pix",
  status: "aberto",
  descontado_lancamento_id: null,
  descontado_em: null,
  observacoes: null,
  anexo_path: null,
  created_at: "2026-10-05T10:00:00Z",
  ...o,
});

describe("adiantamentos", () => {
  it("acha a pessoa pelo cadastro ou pelo nome (sem acento/maiúscula)", () => {
    expect(
      mesmaPessoa({ funcionarioId: "f1", nome: "Ana" }, { funcionarioId: "f1", nome: "Outra" }),
    ).toBe(true);
    expect(
      mesmaPessoa({ funcionarioId: "f1", nome: "Ana" }, { funcionarioId: "f2", nome: "Ana" }),
    ).toBe(false);
    expect(
      mesmaPessoa(
        { funcionarioId: null, nome: "João  Silva" },
        { funcionarioId: "f9", nome: "joao silva" },
      ),
    ).toBe(true);
  });
  it("lançamento de funcionário usa o nome do cadastro", () => {
    expect(
      pessoaDoLancamento({ funcionario_id: "f1", freelancer_nome: null }, [
        { id: "f1", nome: "Ana" },
      ]),
    ).toEqual({ funcionarioId: "f1", nome: "Ana" });
    expect(pessoaDoLancamento({ funcionario_id: null, freelancer_nome: null }, [])).toBeNull();
  });
  it("só os abertos da pessoa, do mais antigo para o mais novo", () => {
    const lista = [
      a({ id: "2", data_adiantamento: "2026-10-10" }),
      a({ id: "1", data_adiantamento: "2026-10-01" }),
      a({ id: "x", status: "descontado" }),
      a({ id: "y", pessoa_nome: "Carla" }),
    ];
    expect(abertosDaPessoa({ funcionarioId: null, nome: "maria" }, lista).map((x) => x.id)).toEqual(
      ["1", "2"],
    );
  });
  it("desconto nunca passa do valor do pagamento; o que sobra continua a descontar", () => {
    expect(calcularDesconto(1500, [{ valor: 300 }, { valor: 200 }])).toEqual({
      descontado: 500,
      liquido: 1000,
      sobra: 0,
    });
    expect(calcularDesconto(500, [{ valor: 200 }, { valor: 400 }])).toEqual({
      descontado: 500,
      liquido: 0,
      sobra: 100,
    });
  });
});

describe("valor por extenso", () => {
  it.each([
    [1, "um real"],
    [100, "cem reais"],
    [150.5, "cento e cinquenta reais e cinquenta centavos"],
    [1000, "mil reais"],
    [1250, "mil duzentos e cinquenta reais"],
    [1500, "mil e quinhentos reais"],
    [2100, "dois mil e cem reais"],
    [0.01, "um centavo"],
    [21, "vinte e um reais"],
  ])("%s", (v, txt) => expect(valorPorExtenso(v)).toBe(txt));
});

describe("parcelas", () => {
  it("divide em centavos e a última leva a diferença", () => {
    expect(dividirParcelas(600, 3)).toEqual([200, 200, 200]);
    expect(dividirParcelas(100, 3)).toEqual([33.33, 33.33, 33.34]);
  });
  it("meses seguidos virando o ano", () => {
    expect(mesesSeguidos("2026-11", 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
  it("só desconta a parcela liberada para o mês do pagamento", () => {
    expect(liberadoNoMes({ descontar_a_partir: null }, "2026-10")).toBe(true);
    expect(liberadoNoMes({ descontar_a_partir: "2026-11-01" }, "2026-10-01")).toBe(false);
    expect(liberadoNoMes({ descontar_a_partir: "2026-11-01" }, "2026-11")).toBe(true);
    const r = separarPorMes(
      [
        a({ id: "p1", descontar_a_partir: "2026-10-01" }),
        a({ id: "p2", descontar_a_partir: "2026-11-01" }),
      ],
      "2026-10",
    );
    expect(r.agora.map((x) => x.id)).toEqual(["p1"]);
    expect(r.futuros.map((x) => x.id)).toEqual(["p2"]);
  });
});
