import { describe, expect, it } from "vitest";
import { limitesDoMes, mesAnterior, resumirPagamento } from "./bonificacao-pagamento";
import type { MetaConfig, MetaPessoa } from "./bonus-meta";
import type { RegistroBonificacao } from "./bonificacao";

const cfg: MetaConfig = {
  ativo: true,
  valor_por_pessoa: 100,
  nota_minima: 9,
  tolerancia_minutos: 10,
  max_atrasos: 3,
};
const pessoa = (o: Partial<MetaPessoa>): MetaPessoa => ({
  funcionario_id: "x",
  nome: "X",
  unidade: "Botafogo",
  ativo: true,
  setor: "recepcao",
  setor_definido: true,
  sou_eu: false,
  pontomais: true,
  atrasos: 0,
  faltas: 0,
  situacao: "ok",
  ...o,
});
let n = 0;
const reg = (o: Partial<RegistroBonificacao>): RegistroBonificacao => ({
  id: `r${n++}`,
  data: "2026-10-05",
  nome_hospede: "h",
  nota_funcionarios: 10,
  nota_limpeza: null,
  nota_geral: 10,
  observacao: null,
  teve_elogio: false,
  valor_calculado: 0,
  unidade: "Botafogo",
  setor: "recepcao",
  avaliacao_id: null,
  created_at: "",
  ...o,
});
// Botafogo: Geral 9.5, Funcionário 10, Limpeza 8 → Recepção bate, Camareiras não.
const registros = [
  reg({ avaliacao_id: "a", nota_geral: 9 }),
  reg({
    avaliacao_id: "a",
    setor: "camareiras",
    nota_geral: 9,
    nota_limpeza: 8,
    nota_funcionarios: 8,
  }),
  reg({ avaliacao_id: "b", nota_geral: 10 }),
  reg({
    avaliacao_id: "b",
    setor: "camareiras",
    nota_geral: 10,
    nota_limpeza: 8,
    nota_funcionarios: 8,
  }),
];

describe("pagamento da bonificação", () => {
  it("meta do setor + elogios, respeitando atrasos e faltas", () => {
    const r = resumirPagamento({
      cfg,
      registros,
      valorElogio: 20,
      pessoas: [
        pessoa({ funcionario_id: "julia", nome: "Julia" }),
        pessoa({ funcionario_id: "raquel", nome: "Raquel", atrasos: 4 }),
        pessoa({ funcionario_id: "gleidiane", nome: "Gleidiane", setor: "camareiras" }),
        pessoa({ funcionario_id: "mayara", nome: "Mayara", faltas: 1 }),
      ],
      elogios: [
        { funcionario_id: "julia" },
        { funcionario_id: "julia" },
        { funcionario_id: "gleidiane" },
        { funcionario_id: "raquel" },
      ],
    });
    const por = Object.fromEntries(r.linhas.map((l) => [l.nome, l]));
    expect(por.Julia).toMatchObject({
      valorMeta: 100,
      qtdElogios: 2,
      valorElogios: 40,
      total: 140,
    });
    expect(por.Gleidiane).toMatchObject({
      metaAtingida: false,
      valorMeta: 0,
      valorElogios: 20,
      total: 20,
    });
    expect(por.Raquel).toMatchObject({ perdeu: true, total: 0, motivo: "4 atrasos (máx. 3)" });
    expect(por.Mayara).toMatchObject({ perdeu: true, total: 0 });
    expect(r.totalMeta).toBe(100);
    expect(r.totalElogios).toBe(60);
    expect(r.total).toBe(160);
  });
  it("exatamente o máximo de atrasos ainda recebe", () => {
    const r = resumirPagamento({
      cfg,
      registros,
      valorElogio: 20,
      elogios: [],
      pessoas: [pessoa({ atrasos: 3 })],
    });
    expect(r.linhas[0].total).toBe(100);
  });
  it("cada unidade usa as notas dela; Ambas usa as duas", () => {
    const r = resumirPagamento({
      cfg,
      valorElogio: 20,
      elogios: [],
      registros: [...registros, reg({ unidade: "Ipanema", nota_geral: 7, nota_funcionarios: 10 })],
      pessoas: [pessoa({ funcionario_id: "i", nome: "Ipa", unidade: "Ipanema" })],
    });
    expect(r.linhas[0].valorMeta).toBe(0);
    expect(r.medias.Ipanema.geral).toBe(7);
  });
  it("elogiado fora da meta recebe só o elogio", () => {
    const r = resumirPagamento({
      cfg,
      registros,
      valorElogio: 20,
      pessoas: [],
      elogios: [{ funcionario_id: "z" }],
      nomes: { z: "Zeca" },
    });
    expect(r.linhas[0]).toMatchObject({ nome: "Zeca", total: 20, participante: false });
  });
  it("meses", () => {
    expect(limitesDoMes("2026-02")).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
    expect(mesAnterior("2026-01-15")).toBe("2025-12");
  });
});
