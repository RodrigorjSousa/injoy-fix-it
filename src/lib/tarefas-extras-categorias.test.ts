import { describe, expect, it } from "vitest";
import { configPadrao, mesclarConfig, montarCategoria, registroDaCategoria } from "./tarefas-extras-categorias";

describe("categorias das tarefas extras", () => {
  it("sem configuração salva usa os 8 cards padrão nas unidades certas", () => {
    const l = mesclarConfig(null);
    expect(l).toHaveLength(8);
    expect(l.find((c) => c.key === "cozinha")?.unidades).toEqual(["Botafogo"]);
    expect(l.find((c) => c.key === "banheiro_ipanema")?.unidades).toEqual(["Ipanema"]);
  });
  it("aplica edição e acrescenta card novo", () => {
    const padrao = configPadrao();
    const salva = [
      { ...padrao[0], label: "Cozinha Café", nomesAnteriores: ["Geral Cozinha"] },
      { key: "c_recepcao", label: "Geral Recepção", icone: "Sofa" as const, cor: "rosa" as const, unidades: ["Botafogo" as const], ativo: true, nomesAnteriores: [], custom: true },
    ];
    const l = mesclarConfig(salva);
    expect(l).toHaveLength(9);
    expect(l[0].label).toBe("Cozinha Café");
    expect(l[8].custom).toBe(true);
  });
  it("histórico do nome antigo continua no card renomeado", () => {
    const c = montarCategoria({ ...configPadrao()[0], label: "Cozinha Café", nomesAnteriores: [] });
    expect(registroDaCategoria("[Geral Cozinha] Lavar louça", c)).toBe(true);
    expect(registroDaCategoria("[Cozinha Café] Lavar louça", c)).toBe(true);
    expect(registroDaCategoria("[Geral Pátio] Varrer", c)).toBe(false);
  });
});
