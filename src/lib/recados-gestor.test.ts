import { describe, expect, it } from "vitest";
import {
  recadoEhPara,
  resolverDestinatarios,
  setoresDaPessoa,
  textoDestino,
  type PessoaEquipe,
} from "./recados-gestor";

const p = (o: Partial<PessoaEquipe>): PessoaEquipe => ({
  userId: "u",
  nome: "X",
  roles: [],
  categorias: [],
  telas: null,
  ...o,
});
const equipe = [
  p({
    userId: "flavio",
    nome: "Flavio",
    roles: ["funcionario"],
    categorias: ["Elétrica", "Ar condicionado"],
  }),
  p({ userId: "joao", nome: "João", roles: ["funcionario"], categorias: ["Hidráulica"] }),
  p({
    userId: "maria",
    nome: "Maria",
    roles: ["funcionario"],
    categorias: [],
    telas: ["camareiras", "chat"],
  }),
  p({ userId: "raquel", nome: "Raquel", roles: ["recepcao"] }),
  p({ userId: "rodrigo", nome: "Rodrigo", roles: ["gestor"] }),
  p({ userId: null, nome: "Sem login", roles: [], categorias: ["Camareira"] }),
];

describe("recado do gestor — destinatários", () => {
  it("setores de cada pessoa", () => {
    expect([...setoresDaPessoa(equipe[0])].sort()).toEqual(["ar_condicionado", "manutencao"]);
    expect([...setoresDaPessoa(equipe[2])]).toEqual(["camareiras"]);
    expect([...setoresDaPessoa(equipe[3])]).toEqual(["recepcao"]);
  });
  it("ar condicionado vai só para quem é de ar condicionado", () => {
    expect(
      resolverDestinatarios("setor", { setores: ["ar_condicionado"] }, equipe).map((x) => x.userId),
    ).toEqual(["flavio"]);
  });
  it("vários setores juntos, sem repetir", () => {
    expect(
      resolverDestinatarios(
        "setor",
        { setores: ["manutencao", "ar_condicionado", "camareiras"] },
        equipe,
      ).map((x) => x.nome),
    ).toEqual(["Flavio", "João", "Maria"]);
  });
  it("todos = todo mundo com login, menos o gestor", () => {
    expect(resolverDestinatarios("todos", {}, equipe).map((x) => x.userId)).toEqual([
      "flavio",
      "joao",
      "maria",
      "raquel",
    ]);
  });
  it("pessoas escolhidas", () => {
    expect(
      resolverDestinatarios("pessoas", { pessoas: ["flavio"] }, equipe).map((x) => x.nome),
    ).toEqual(["Flavio"]);
  });
  it("quem vê: lista gravada manda; recado antigo vale pelo setor", () => {
    expect(
      recadoEhPara({ alvo: "pessoas", destinatarios: ["flavio"] }, "joao", new Set(["manutencao"])),
    ).toBe(false);
    expect(recadoEhPara({ alvo: "pessoas", destinatarios: ["flavio"] }, "flavio", new Set())).toBe(
      true,
    );
    expect(
      recadoEhPara(
        { alvo: "setor", setor: "camareiras", destinatarios: null },
        "maria",
        new Set(["camareiras"]),
      ),
    ).toBe(true);
    expect(
      recadoEhPara(
        { alvo: "setor", setor: "recepcao", destinatarios: null },
        "maria",
        new Set(["camareiras"]),
      ),
    ).toBe(false);
  });
  it("texto do destino", () => {
    expect(textoDestino({ alvo: "setor", setores: ["camareiras", "recepcao"] })).toBe(
      "Camareiras e Recepção",
    );
    expect(textoDestino({ alvo: "todos" })).toBe("Todos os funcionários");
    expect(textoDestino({ alvo: "pessoas", destinatarios_nomes: ["A", "B", "C", "D"] })).toBe(
      "A, B e +2",
    );
  });
});
