import { describe, expect, it } from "vitest";
import {
  calcularFechamento,
  calcularSaldo,
  faltasNaEntrega,
  gerarAlertas,
  mesesDesdeInicio,
  numerosFaltando,
  resumoTalao,
  validarRetorno,
  difItem,
  filtrarPecas,
  normalizarRetorno,
  type Peca,
  type Talao,
} from "./lavanderia";

// Catálogo igual ao de public.lav_preparar() (preços da Clean Soft).
const CATALOGO: [string, string, number][] = [
  ["Protetor Travesseiro", "Capa almofada / Prot. trav.", 9.46],
  ["Capa de Almofada", "Capa almofada / Prot. trav.", 9.46],
  ["Pillow Top", "Pillow top", 55],
  ["Cobertor / Manta", "Cobertor / Colcha", 10.37],
  ["Edredom", "Edredom", 10.37],
  ["Fronha", "Fronha", 1.26],
  ["Lençol Casal", "Lençol casal / king", 4.48],
  ["Lençol King", "Lençol casal / king", 4.48],
  ["Lençol Solteiro", "Lençol solteiro", 4.43],
  ["Lençol Casal Elástico", "Lençol casal elástico", 4.68],
  ["Lençol Solteiro Elástico", "Lençol solteiro elástico", 4.64],
  ["Piso", "Piso", 1.46],
  ["Toalha Banho", "Toalha banho", 3.42],
  ["Toalha Rosto", "Toalha rosto", 1.46],
  ["Protetor Colchão Casal", "Prot. colchão casal / saia", 6.15],
  ["Protetor Colchão Solteiro", "Prot. colchão casal / saia", 6.15],
  ["Peseira", "Prot. colchão casal / saia", 6.15],
  ["Tapete 1,50 x 2,00", "Tapete 1,50 x 2,00", 157.11],
  ["Tapete Pequeno", "Tapete pequeno / travesseiro / cortina", 21.68],
  ["Travesseiro", "Tapete pequeno / travesseiro / cortina", 21.68],
  ["Pano de Copa", "Pano de copa", 1.36],
];
const PECAS: Peca[] = CATALOGO.map(([nome, grupo_fatura, preco], i) => ({
  id: nome,
  nome,
  grupo_fatura,
  preco,
  ordem: (i + 1) * 10,
  ativo: true,
}));

let seq = 0;
function talao(p: Partial<Talao> & { itens: Talao["itens"] }): Talao {
  seq++;
  return {
    id: `t${seq}`,
    unidade: "Ipanema",
    numero: String(20000 + seq),
    data_coleta: "2026-10-01",
    coleta_por_nome: "Gleidiane",
    coleta_foto: "x.jpg",
    coleta_obs: null,
    coleta_em: "",
    retorno_data: null,
    retorno_por_nome: null,
    retorno_foto: null,
    retorno_obs: null,
    retorno_em: null,
    ...p,
  };
}
const item = (
  peca_id: string,
  saida_hotel: number,
  ent_lav: number | null = null,
  saida_lav: number | null = null,
  guardado: number | null = null,
) => ({
  peca_id,
  saida_hotel,
  ent_lav,
  saida_lav,
  guardado,
});

// Talão real nº 19383 (Ipanema): saíram 30 peças e voltaram 61 anotadas no mesmo talão.
const T19383 = () =>
  talao({
    numero: "19383",
    data_coleta: "2026-10-02",
    retorno_data: "2026-10-04",
    retorno_foto: "r.jpg",
    itens: [
      item("Cobertor / Manta", 1, 1, 1, 1),
      item("Edredom", 0, 0, 1, 1),
      item("Fronha", 10, 10, 16, 16),
      item("Lençol Casal", 4, 4, 6, 6),
      item("Lençol Solteiro", 0, 0, 4, 4),
      item("Piso", 3, 3, 6, 6),
      item("Toalha Banho", 6, 6, 11, 11),
      item("Toalha Rosto", 5, 6, 11, 10),
      item("Pano de Copa", 1, 1, 1, 1),
    ],
  });

describe("as três diferenças do talão", () => {
  it("separa coleta (A), relave (B) e desconto do pagamento (C) por peça", () => {
    // Saiu 10, lavanderia contou 9 na entrada, devolveu 8 (1 em relave), camareira contou 7.
    const d = difItem(item("Fronha", 10, 9, 8, 7));
    expect(d.difColeta).toBe(-1); // A: hotel × entrada lavanderia
    expect(d.relave).toBe(1); // B: ficou 1 para relave
    expect(d.desconto).toBe(1); // C: saiu 8, contou 7 → desconta 1
    expect(d.aPagar).toBe(7); // paga o que a camareira contou
  });

  it("camareira contou mais do que saiu: paga o que saiu da lavanderia", () => {
    const d = difItem(item("Piso", 3, 3, 6, 7));
    expect(d.aPagar).toBe(6);
    expect(d.desconto).toBe(0);
    expect(d.contouAMais).toBe(1);
    expect(d.relave).toBe(-3); // voltou relave de outro talão
  });

  it("talão 19383: totais do talão", () => {
    const r = resumoTalao(T19383(), "2026-10-08");
    expect(r.saida).toBe(30);
    expect(r.entLav).toBe(31);
    expect(r.saidaLav).toBe(57);
    expect(r.guardado).toBe(56);
    expect(r.difColeta).toBe(1); // lavanderia contou 1 toalha de rosto a mais
    expect(r.relave).toBe(-26); // voltou muito mais do que entrou: relave de outros talões
    expect(r.desconto).toBe(1); // anotou 11 toalhas de rosto, chegaram 10
    expect(r.aPagar).toBe(56);
    expect(r.dias).toBe(2);
  });

  it("talão aberto conta os dias desde a coleta e não tem diferenças", () => {
    const r = resumoTalao(
      talao({ data_coleta: "2026-10-03", itens: [item("Fronha", 8)] }),
      "2026-10-08",
    );
    expect(r.aberto).toBe(true);
    expect(r.dias).toBe(5);
    expect(r.desconto).toBeNull();
  });
});

describe("saldo de peças", () => {
  it("relave de um talão que volta em outro zera o saldo", () => {
    const a = talao({ retorno_data: "2026-10-03", itens: [item("Fronha", 20, 20, 17, 17)] });
    const b = talao({
      data_coleta: "2026-10-02",
      retorno_data: "2026-10-04",
      itens: [item("Fronha", 10, 10, 13, 13)],
    });
    const fronha = calcularSaldo([a], PECAS).find((l) => l.peca.id === "Fronha")!;
    expect(fronha.relavePendente).toBe(3);
    const depois = calcularSaldo([a, b], PECAS).find((l) => l.peca.id === "Fronha")!;
    expect(depois.relavePendente).toBe(0);
    expect(depois.saldo).toBe(0);
  });

  it("na lavanderia = talões abertos + relave pendente; acumula A e C", () => {
    const devolvido = talao({
      retorno_data: "2026-10-03",
      itens: [item("Toalha Banho", 30, 28, 26, 25)],
    });
    const aberto = talao({ data_coleta: "2026-10-07", itens: [item("Toalha Banho", 12)] });
    const l = calcularSaldo([devolvido, aberto], PECAS).find((x) => x.peca.id === "Toalha Banho")!;
    expect(l.emAberto).toBe(12);
    expect(l.relavePendente).toBe(2);
    expect(l.saldo).toBe(14);
    expect(l.difColeta).toBe(-2);
    expect(l.desconto).toBe(1);
    expect(l.aPagar).toBe(25);
  });

  it("ignora talões antes de 01/10/2026", () => {
    const antigo = talao({ data_coleta: "2026-09-30", itens: [item("Fronha", 50)] });
    expect(calcularSaldo([antigo], PECAS).find((x) => x.peca.id === "Fronha")!.saldo).toBe(0);
  });
});

describe("alertas", () => {
  it("avisa talão parado, coleta, desconto, relave e número pulado", () => {
    const parado = talao({
      numero: "20380",
      data_coleta: "2026-10-03",
      itens: [item("Fronha", 8)],
    });
    const t = talao({
      numero: "20382",
      retorno_data: "2026-10-05",
      itens: [item("Fronha", 10, 9, 8, 7), item("Toalha Rosto", 5, 5, 5, 5)],
    });
    const taloes = [parado, t];
    const alertas = gerarAlertas(taloes, calcularSaldo(taloes, PECAS), PECAS, "2026-10-08");
    const texto = (tipo: string) =>
      alertas
        .filter((a) => a.tipo === tipo)
        .map((a) => a.texto)
        .join(" | ");
    expect(texto("parado")).toContain("há 5 dias");
    expect(texto("coleta")).toContain("Fronha -1");
    expect(texto("desconto").replace(/\s/g, " ")).toContain("descontar 1 Fronha (R$ 1,26)");
    expect(texto("relave")).toContain("ficou para relave 1 Fronha");
    expect(texto("relave")).toContain("Relave ainda na lavanderia: 1 Fronha");
    expect(texto("sequencia")).toContain("20381");
  });

  it("talão com menos de 3 dias não alerta", () => {
    const t = talao({ data_coleta: "2026-10-07", itens: [item("Fronha", 8)] });
    expect(gerarAlertas([t], calcularSaldo([t], PECAS), PECAS, "2026-10-08")).toEqual([]);
  });
});

describe("faltas na entrega", () => {
  it("soma o que a lavanderia anotou e não chegou, com valor", () => {
    const f = faltasNaEntrega([T19383(), talao({ itens: [item("Toalha Rosto", 4)] })], PECAS);
    expect(f).toHaveLength(1);
    expect(f[0].peca.id).toBe("Toalha Rosto");
    expect(f[0].qtd).toBe(1);
    expect(f[0].valor).toBe(1.46);
    expect(f[0].taloes).toEqual(["19383"]);
  });
});

describe("números faltando", () => {
  it("acha buracos pequenos e ignora outro bloco de talões", () => {
    expect(numerosFaltando(["20355", "20356", "20358", "20893", "20361"])).toEqual([
      20357, 20359, 20360,
    ]);
  });
});

describe("fechamento do mês", () => {
  it("reproduz a fatura de agosto/2026 da Clean Soft (Ipanema): R$ 4.560,31", () => {
    // Totais da planilha de cobrança, um talão por grupo para simplificar.
    const totais: [string, number][] = [
      ["Protetor Travesseiro", 4],
      ["Pillow Top", 1],
      ["Cobertor / Manta", 17],
      ["Edredom", 28],
      ["Fronha", 426],
      ["Lençol Casal", 150],
      ["Lençol Solteiro", 157],
      ["Piso", 234],
      ["Toalha Banho", 373],
      ["Toalha Rosto", 244],
      ["Protetor Colchão Casal", 3],
      ["Tapete Pequeno", 2],
      ["Pano de Copa", 45],
    ];
    const t = talao({
      data_coleta: "2026-08-02",
      retorno_data: "2026-08-04",
      itens: totais.map(([p, q]) => item(p, q, q, q, q)),
    });
    const f = calcularFechamento([t], PECAS, "2026-08");
    expect(f.valorPagar).toBe(4560.31);
    expect(f.linhas.map((l) => l.grupo)).toEqual([
      "Capa almofada / Prot. trav.",
      "Pillow top",
      "Cobertor / Colcha",
      "Edredom",
      "Fronha",
      "Lençol casal / king",
      "Lençol solteiro",
      "Lençol casal elástico",
      "Lençol solteiro elástico",
      "Piso",
      "Toalha banho",
      "Toalha rosto",
      "Prot. colchão casal / saia",
      "Tapete 1,50 x 2,00",
      "Tapete pequeno / travesseiro / cortina",
      "Pano de copa",
    ]);
  });

  it("paga o menor entre Saída Lav. e Contado; compara a fatura com a Saída Lav.", () => {
    const t1 = talao({
      data_coleta: "2026-10-02",
      retorno_data: "2026-10-04",
      itens: [item("Fronha", 10, 9, 8, 7), item("Toalha Rosto", 5, 5, 6, 6)],
    });
    const t2 = talao({ data_coleta: "2026-10-20", itens: [item("Fronha", 5)] }); // ainda sem retorno
    const outroMes = talao({
      data_coleta: "2026-11-01",
      retorno_data: "2026-11-03",
      itens: [item("Fronha", 99, 99, 99, 99)],
    });
    const f = calcularFechamento([t1, t2, outroMes], PECAS, "2026-10", {
      Fronha: 9,
      "Toalha rosto": 6,
    });
    const fronha = f.linhas.find((l) => l.grupo === "Fronha")!;
    expect(fronha.qtdHotel).toBe(15);
    expect(fronha.qtdSaidaLav).toBe(8);
    expect(fronha.qtdContado).toBe(7);
    expect(fronha.qtdPagar).toBe(7);
    expect(fronha.qtdDesconto).toBe(1);
    expect(fronha.qtdRelave).toBe(1);
    expect(fronha.valorPagar).toBe(8.82); // 7 × 1,26
    expect(fronha.difQtd).toBe(1); // cobrou 9, anotou 8 no talão
    expect(f.linhas.find((l) => l.grupo === "Toalha rosto")!.qtdPagar).toBe(6);
    expect(f.valorPagar).toBe(17.58); // 8,82 + 6 × 1,46
    expect(f.valorDesconto).toBe(1.26);
    expect(f.taloes).toHaveLength(2);
    expect(f.taloesSemRetorno).toHaveLength(1);
    expect(f.valorFaturaCalculado).toBe(20.1); // 9 × 1,26 + 6 × 1,46
  });
});

describe("validação do retorno", () => {
  const nome = (id: string) => id;
  const L = (
    peca_id: string,
    saida_hotel: number,
    ent_lav = "",
    saida_lav = "",
    guardado = "",
  ) => ({
    peca_id,
    saida_hotel,
    ent_lav,
    saida_lav,
    guardado,
  });
  it("só exige a contagem da camareira quando a lavanderia anotou devolução", () => {
    expect(validarRetorno([L("Fronha", 10, "10", "16", "")], nome)).toContain("Fronha");
  });
  it("aceita campos em branco: Ent. Lav. = Saída Hotel, Saída Lav. = Contei", () => {
    const linhas = [L("Fronha", 10, "", "", "9"), L("Piso", 6), L("Edredom", 0, "", "1", "1")];
    expect(validarRetorno(linhas, nome)).toBeNull();
    expect(normalizarRetorno(linhas)).toEqual([
      { peca_id: "Fronha", ent_lav: 10, saida_lav: 9, guardado: 9 },
      { peca_id: "Piso", ent_lav: 6, saida_lav: 0, guardado: 0 },
      { peca_id: "Edredom", ent_lav: 0, saida_lav: 1, guardado: 1 },
    ]);
  });
  it("não deixa registrar retorno vazio", () => {
    expect(validarRetorno([L("Fronha", 10), L("Piso", 6)], nome)).toContain("Contei");
  });
  it("ignora peça extra que ficou toda em branco", () => {
    expect(normalizarRetorno([L("Fronha", 10, "", "10", "10"), L("Piso", 0)])).toHaveLength(1);
  });
});

describe("meses", () => {
  it("lista de outubro/2026 até hoje, mais recente primeiro", () => {
    expect(mesesDesdeInicio("2027-01-15")).toEqual(["2027-01", "2026-12", "2026-11", "2026-10"]);
  });
});

describe("busca de peças", () => {
  const nomes = (termo: string) => filtrarPecas(PECAS, termo).map((p) => p.nome);
  it("acha pelo começo do nome", () => {
    expect(nomes("fro")).toEqual(["Fronha"]);
  });
  it("ignora acento e maiúscula", () => {
    expect(nomes("LENCOL SOL")).toEqual(["Lençol Solteiro", "Lençol Solteiro Elástico"]);
  });
  it("palavra do meio também acha, mas o começo vem primeiro", () => {
    expect(nomes("toalha")).toEqual(["Toalha Banho", "Toalha Rosto"]);
    expect(nomes("rosto")).toEqual(["Toalha Rosto"]);
    expect(nomes("tapete")[0]).toBe("Tapete 1,50 x 2,00");
  });
  it("sem termo devolve tudo na ordem do talão", () => {
    expect(nomes("")).toHaveLength(PECAS.length);
  });
});
