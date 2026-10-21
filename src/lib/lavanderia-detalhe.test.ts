import { describe, expect, it } from "vitest";
import { calcularSaldo, type Peca, type Talao } from "./lavanderia";
import { detalheIndicador } from "./lavanderia-detalhe";

const peca = (id: string, nome: string, preco: number): Peca => ({
  id,
  nome,
  grupo_fatura: "g",
  preco,
  ordem: 0,
  ativo: true,
});
const pecas = [peca("ls", "Lençol Solteiro", 2), peca("tr", "Toalha Rosto", 1)];
const talao = (
  numero: string,
  data: string,
  retorno: string | null,
  itens: Talao["itens"],
): Talao => ({
  id: numero,
  unidade: "Botafogo",
  numero,
  data_coleta: data,
  coleta_por_nome: "x",
  coleta_foto: "f",
  coleta_obs: null,
  coleta_em: data,
  retorno_data: retorno,
  retorno_por_nome: null,
  retorno_foto: null,
  retorno_obs: null,
  retorno_em: null,
  itens,
});
const taloes = [
  // aberto: 10 lençóis + 5 toalhas na lavanderia
  talao("100", "2026-10-15", null, [
    { peca_id: "ls", saida_hotel: 10, ent_lav: null, saida_lav: null, guardado: null },
    { peca_id: "tr", saida_hotel: 5, ent_lav: null, saida_lav: null, guardado: null },
  ]),
  // devolvido: coleta contou 8, lavanderia recebeu 9 (A=1); saiu 7 (relave 2); contado 6 (desconto 1)
  talao("90", "2026-10-05", "2026-10-07", [
    { peca_id: "ls", saida_hotel: 8, ent_lav: 9, saida_lav: 7, guardado: 6 },
  ]),
];

describe("detalhe dos indicadores da lavanderia", () => {
  const saldo = calcularSaldo(taloes, pecas);
  const tot = (f: (l: (typeof saldo)[number]) => number) => saldo.reduce((s, l) => s + f(l), 0);

  it("na lavanderia agora bate com o card e lista os talões abertos", () => {
    const d = detalheIndicador("agora", taloes, pecas);
    expect(d.total).toBe(tot((l) => l.saldo));
    expect(d.porTalao).toEqual([
      { numero: "100", data: "2026-10-15", qtd: 15, texto: "10 Lençol Solteiro, 5 Toalha Rosto" },
    ]);
  });
  it("A, B, C e a pagar batem com os cards", () => {
    expect(detalheIndicador("coleta", taloes, pecas).total).toBe(tot((l) => Math.abs(l.difColeta)));
    const b = detalheIndicador("relave", taloes, pecas);
    expect(b.total).toBe(tot((l) => Math.max(0, l.relavePendente)));
    expect(b.porTalao[0].texto).toBe("ficou 2 Lençol Solteiro");
    const c = detalheIndicador("descontos", taloes, pecas);
    expect(c).toMatchObject({ total: 1, valorTotal: 2 });
    expect(c.porTalao[0].texto).toBe("1 Lençol Solteiro (saiu 7, contado 6)");
    const p = detalheIndicador("pagar", taloes, pecas);
    expect(p.total).toBe(tot((l) => l.aPagar));
    expect(p.valorTotal).toBe(12);
  });
});
