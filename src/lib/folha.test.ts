import { describe, expect, it } from "vitest";
import {
  CONFIG_FOLHA_PADRAO,
  calcularFolha,
  csvFolha,
  diasDoMes,
  dividirValor,
  montarLancamentoFolha,
  precoTabela,
  type ColaboradorFolha,
  type DiaEscalaFolha,
  type FolhaAjuste,
  type FolhaPessoaCfg,
  type PontoPessoaFolha,
} from "@/lib/folha";

const FIXO: ColaboradorFolha = {
  id: "c-fixo",
  funcionario_id: "f-fixo",
  nome: "Flávio",
  setor: "manutencao",
  unidade: "Ambas",
  vinculo: "fixo",
  ativo: true,
  vale_alimentacao: null,
  vale_transporte_dia: 10,
};
const FREELA: ColaboradorFolha = {
  id: "c-free",
  funcionario_id: null,
  nome: "Ana Freela",
  setor: "camareiras",
  unidade: "Botafogo",
  vinculo: "freelance",
  ativo: true,
  vale_alimentacao: null,
  vale_transporte_dia: 12,
};
const FERIADOS = ["2026-11-02", "2026-11-15", "2026-11-20"];

const dia = (
  p: Partial<DiaEscalaFolha> & { data: string; colaborador_id: string },
): DiaEscalaFolha => ({
  id: `${p.colaborador_id}-${p.data}`,
  unidade: "Botafogo",
  status: "trabalho",
  horas_contratadas: null,
  valor_combinado: null,
  ...p,
});

const cfgFixo: FolhaPessoaCfg = {
  colaborador_id: "c-fixo",
  salario_base: 2200,
  divisor: null,
  freela_modo: "plantao",
  freela_valor_mensal: null,
  recebe_vt: null,
  recebe_vr: null,
  recebe_bonus: null,
};

const pontoFixo = (modo: "pagamento" | "banco"): PontoPessoaFolha => ({
  colaborador_id: "c-fixo",
  modo,
  dias: [
    {
      data: "2026-11-01",
      classe: "domingo_feriado",
      extra50: 0,
      extra100: 120,
      debito: 0,
      noturnoReduzido: 0,
    },
    {
      data: "2026-11-07",
      classe: "folga_trabalhada",
      extra50: 60,
      extra100: 0,
      debito: 0,
      noturnoReduzido: 0,
    },
    {
      data: "2026-11-09",
      classe: "normal",
      extra50: 30,
      extra100: 0,
      debito: 0,
      noturnoReduzido: 105,
    },
    {
      data: "2026-11-10",
      classe: "normal",
      extra50: 0,
      extra100: 0,
      debito: 60,
      noturnoReduzido: 0,
    },
  ],
});

const base = {
  mes: "2026-11",
  config: CONFIG_FOLHA_PADRAO,
  colaboradores: [FIXO, FREELA],
  pessoas: [cfgFixo],
  ajustes: [] as FolhaAjuste[],
  dias: [
    dia({ colaborador_id: "c-fixo", data: "2026-11-09" }),
    dia({ colaborador_id: "c-fixo", data: "2026-11-10", unidade: "Ipanema" }),
    dia({ colaborador_id: "c-fixo", data: "2026-11-11" }),
    dia({ colaborador_id: "c-fixo", data: "2026-11-12", status: "folga" }),
    dia({
      colaborador_id: "c-free",
      data: "2026-11-03",
      status: "extra",
      horas_contratadas: 8,
      valor_combinado: 140,
    }),
    dia({
      colaborador_id: "c-free",
      data: "2026-11-04",
      status: "extra",
      horas_contratadas: 12,
      valor_combinado: null,
    }),
    dia({
      colaborador_id: "c-free",
      data: "2026-11-05",
      status: "extra",
      horas_contratadas: 6,
      valor_combinado: 90,
    }),
  ],
  ponto: [pontoFixo("pagamento")],
  bonus: [{ funcionario_id: "f-fixo", grupo: 100, individual: 40, perdeu: false, motivo: null }],
  feriados: FERIADOS,
};

describe("diasDoMes", () => {
  it("conta domingos e feriados fora do domingo como descanso", () => {
    // Nov/2026: 5 domingos (15/11 é domingo e feriado) + 02/11 e 20/11.
    expect(diasDoMes("2026-11", FERIADOS)).toEqual({ uteis: 23, descanso: 7 });
  });
});

describe("tabela e divisão", () => {
  it("acha o preço pelas horas", () => {
    expect(precoTabela(CONFIG_FOLHA_PADRAO.tabela_freela, 8)?.valor).toBe(150);
    expect(precoTabela(CONFIG_FOLHA_PADRAO.tabela_freela, 12)?.valor).toBe(200);
    expect(precoTabela(CONFIG_FOLHA_PADRAO.tabela_freela, 6)).toBeNull();
    expect(precoTabela(CONFIG_FOLHA_PADRAO.tabela_freela, null)).toBeNull();
  });
  it("divide em centavos sem perder nada", () => {
    expect(dividirValor(1000, 3)).toEqual([333.33, 333.33, 333.34]);
    expect(dividirValor(10, 0)).toEqual([]);
  });
});

describe("calcularFolha — fixo pagando extras na folha", () => {
  const r = calcularFolha(base);
  const f = r.linhas.find((l) => l.colaborador.id === "c-fixo")!;
  it("separa as horas extras por tipo e calcula pelo valor da hora (2200 ÷ 220 = 10)", () => {
    expect(f.valorHora).toBe(10);
    expect(f.horas).toMatchObject({
      he100: 120,
      he50Folga: 60,
      he50Horario: 30,
      noturnoReduzido: 105,
    });
    expect(f.valores.he100).toBe(40); // 2 h × 10 × 2
    expect(f.valores.he50Folga).toBe(15); // 1 h × 10 × 1,5
    expect(f.valores.he50Horario).toBe(7.5); // 0,5 h × 10 × 1,5
    expect(f.valores.noturno).toBe(3.5); // 1,75 h × 10 × 20%
  });
  it("DSR sobre extras e noturno: 66 ÷ 23 × 7", () => {
    expect(f.valores.dsr).toBe(20.09);
  });
  it("VT pelos dias de trabalho, VR padrão e bônus da Bonificação", () => {
    expect(f.diasVT).toBe(3);
    expect(f.vtPorUnidade).toEqual({ Botafogo: 2, Ipanema: 1 });
    expect(f.valores.vt).toBe(30);
    expect(f.valores.vr).toBe(385);
    expect(f.valores.bonusGrupo).toBe(100);
    expect(f.valores.bonusInd).toBe(40);
  });
  it("não desconta faltas por padrão; desconta quando ligado", () => {
    expect(f.valores.descontoFaltas).toBe(0);
    const r2 = calcularFolha({
      ...base,
      config: { ...CONFIG_FOLHA_PADRAO, descontar_debitos: true },
    });
    expect(r2.linhas.find((l) => l.colaborador.id === "c-fixo")!.valores.descontoFaltas).toBe(10);
  });
  it("total = soma dos itens", () => {
    expect(f.total).toBe(2200 + 30 + 385 + 40 + 100 + 40 + 15 + 7.5 + 3.5 + 20.09);
  });
});

describe("calcularFolha — fixo no banco de horas", () => {
  it("extras ficam no banco; noturno continua pago", () => {
    const r = calcularFolha({ ...base, ponto: [pontoFixo("banco")] });
    const f = r.linhas.find((l) => l.colaborador.id === "c-fixo")!;
    expect(f.modo).toBe("banco");
    expect(f.horas.noBanco).toBe(210);
    expect(f.valores.he100 + f.valores.he50Folga + f.valores.he50Horario).toBe(0);
    expect(f.valores.noturno).toBe(3.5);
    expect(f.valores.dsr).toBe(1.07); // 3,5 ÷ 23 × 7
  });
});

describe("calcularFolha — fixo escalado como extra", () => {
  it("com batida: entra como hora extra pelo ponto, sem diária de plantão", () => {
    const r = calcularFolha({
      ...base,
      dias: [
        ...base.dias,
        dia({
          colaborador_id: "c-fixo",
          data: "2026-11-07",
          status: "extra",
          horas_contratadas: 8,
          valor_combinado: 150,
        }),
      ],
    });
    const f = r.linhas.find((l) => l.colaborador.id === "c-fixo")!;
    expect(f.valores.plantoes).toBe(0);
    expect(f.horas.he50Folga).toBe(60); // o que o ponto marcou no dia 07
    expect(f.extrasFixo).toEqual([
      expect.objectContaining({
        data: "2026-11-07",
        fonte: "ponto",
        cem: false,
        valorCombinado: 150,
      }),
    ]);
    // ao lançar, a diária do dia vai a zero
    expect(montarLancamentoFolha(r, "11/2026").plantoes).toContainEqual({
      id: "c-fixo-2026-11-07",
      valor: 0,
    });
  });
  it("sem batida em feriado: 100% pelas horas da escala", () => {
    const r = calcularFolha({
      ...base,
      dias: [
        ...base.dias,
        dia({
          colaborador_id: "c-fixo",
          data: "2026-11-20",
          status: "extra",
          horas_contratadas: null,
          valor_combinado: 150,
          hora_entrada: "07:00",
          hora_saida: "15:00",
        }),
      ],
    });
    const f = r.linhas.find((l) => l.colaborador.id === "c-fixo")!;
    expect(f.horas.he100).toBe(120 + 480);
    expect(f.valores.he100).toBe(200); // 10 h × 10 × 2
    expect(f.avisos.some((a) => /sem batida/.test(a))).toBe(true);
  });
  it("folga trabalhada em feriado cadastrado conta como 100%", () => {
    const r = calcularFolha({
      ...base,
      ponto: [
        {
          colaborador_id: "c-fixo",
          modo: "pagamento",
          dias: [
            {
              data: "2026-11-02",
              classe: "folga_trabalhada",
              extra50: 480,
              extra100: 0,
              debito: 0,
              noturnoReduzido: 0,
            },
          ],
        },
      ],
    });
    const f = r.linhas.find((l) => l.colaborador.id === "c-fixo")!;
    expect(f.horas.he100).toBe(480);
    expect(f.horas.he50Folga).toBe(0);
  });
});

describe("horas digitadas", () => {
  it("o gestor digita as horas e o valor é calculado", () => {
    const r = calcularFolha({
      ...base,
      ajustes: [
        {
          colaborador_id: "c-fixo",
          valores: { min_he100: 480, min_he50Folga: 0, min_noturno: 105 },
          pagar_vt: null,
          pagar_vr: null,
          pagar_bonus: null,
          outros_proventos: 0,
          outros_descontos: 0,
          observacao: null,
        },
      ],
    });
    const f = r.linhas.find((l) => l.colaborador.id === "c-fixo")!;
    expect(f.horasDigitadas.sort()).toEqual(["he100", "he50Folga", "noturno"]);
    expect(f.horasCalculadas.he100).toBe(120);
    expect(f.valores.he100).toBe(160); // 8 h × 10 × 2
    expect(f.valores.he50Folga).toBe(0);
    expect(f.horas.noturnoReduzido).toBe(120); // 1h45 reais = 2 h reduzidas
    expect(f.valores.noturno).toBe(4);
    expect(f.valores.he50Horario).toBe(7.5); // não digitado: segue o ponto
  });
});

describe("calcularFolha — freelancer", () => {
  it("por plantão: preço da tabela; fora da tabela usa o combinado; sem VT/VR/bônus", () => {
    const r = calcularFolha(base);
    const l = r.linhas.find((x) => x.colaborador.id === "c-free")!;
    expect(l.plantoes.map((p) => [p.valor, p.fonte])).toEqual([
      [150, "tabela"],
      [200, "tabela"],
      [90, "combinado"],
    ]);
    expect(l.valores.plantoes).toBe(440);
    expect(l.valores.vt + l.valores.vr + l.valores.bonusGrupo + l.valores.bonusInd).toBe(0);
    expect(l.total).toBe(440);
    expect(l.avisos[0]).toMatch(/fora da tabela/);
  });
  it("valor cheio do mês", () => {
    const r = calcularFolha({
      ...base,
      pessoas: [
        cfgFixo,
        {
          ...cfgFixo,
          colaborador_id: "c-free",
          salario_base: null,
          freela_modo: "mensal",
          freela_valor_mensal: 1000,
        },
      ],
    });
    const l = r.linhas.find((x) => x.colaborador.id === "c-free")!;
    expect(l.plantoes.map((p) => p.valor)).toEqual([333.33, 333.33, 333.34]);
    expect(l.total).toBe(1000);
  });
  it("gestor marca VT e VR só neste mês", () => {
    const r = calcularFolha({
      ...base,
      ajustes: [
        {
          colaborador_id: "c-free",
          valores: {},
          pagar_vt: true,
          pagar_vr: true,
          pagar_bonus: null,
          outros_proventos: 0,
          outros_descontos: 0,
          observacao: null,
        },
      ],
    });
    const l = r.linhas.find((x) => x.colaborador.id === "c-free")!;
    expect(l.valores.vt).toBe(36); // 3 dias × 12
    expect(l.valores.vr).toBe(52.5); // 385 ÷ 22 × 3
  });
  it("sem plantão no mês não aparece (a não ser que peça)", () => {
    const r = calcularFolha({
      ...base,
      dias: base.dias.filter((d) => d.colaborador_id !== "c-free"),
    });
    expect(r.linhas.some((l) => l.colaborador.id === "c-free")).toBe(false);
    const r2 = calcularFolha({
      ...base,
      dias: base.dias.filter((d) => d.colaborador_id !== "c-free"),
      incluirSemMovimento: true,
    });
    expect(r2.linhas.some((l) => l.colaborador.id === "c-free")).toBe(true);
  });
});

describe("trocas à mão", () => {
  it("valor trocado vale no total e fica marcado", () => {
    const r = calcularFolha({
      ...base,
      ajustes: [
        {
          colaborador_id: "c-fixo",
          valores: { bonusInd: 0, he100: 50 },
          pagar_vt: null,
          pagar_vr: false,
          pagar_bonus: null,
          outros_proventos: 25,
          outros_descontos: 5,
          observacao: "acerto",
        },
      ],
    });
    const f = r.linhas.find((l) => l.colaborador.id === "c-fixo")!;
    expect(f.valores.bonusInd).toBe(0);
    expect(f.valores.he100).toBe(50);
    expect(f.valores.vr).toBe(0);
    expect(f.trocados.sort()).toEqual(["bonusInd", "he100"]);
    expect(f.total).toBe(2200 + 30 + 0 + 0 + 100 + 50 + 15 + 7.5 + 3.5 + 20.09 + 25 - 5);
  });
});

describe("montarLancamentoFolha", () => {
  it("salário por pessoa, VT/VR pelos benefícios e preço nos plantões", () => {
    const r = calcularFolha(base);
    const m = montarLancamentoFolha(r, "11/2026");
    expect(m.plantoes).toEqual([
      { id: "c-free-2026-11-03", valor: 150 },
      { id: "c-free-2026-11-04", valor: 200 },
      { id: "c-free-2026-11-05", valor: 90 },
    ]);
    expect(m.beneficios.filter((b) => b.tipo === "vt")).toEqual([
      expect.objectContaining({ unidade: "Botafogo", valor: 20 }),
      expect.objectContaining({ unidade: "Ipanema", valor: 10 }),
    ]);
    expect(m.beneficios.find((b) => b.tipo === "va")?.valor).toBe(385);
    expect(m.itens).toHaveLength(1);
    expect(m.itens[0]).toMatchObject({ colaborador_id: "c-fixo", unidade: "Ambas" });
    expect(m.itens[0].valor).toBe(2200 + 40 + 100 + 40 + 15 + 7.5 + 3.5 + 20.09);
  });
  it("total de plantões trocado à mão é repartido nos plantões", () => {
    const r = calcularFolha({
      ...base,
      ajustes: [
        {
          colaborador_id: "c-free",
          valores: { plantoes: 500 },
          pagar_vt: null,
          pagar_vr: null,
          pagar_bonus: null,
          outros_proventos: 0,
          outros_descontos: 0,
          observacao: null,
        },
      ],
    });
    const m = montarLancamentoFolha(r, "11/2026");
    const soma = m.plantoes.reduce((s, p) => s + p.valor, 0);
    expect(Math.round(soma * 100) / 100).toBe(500);
  });
});

describe("csvFolha", () => {
  it("gera cabeçalho e uma linha por pessoa", () => {
    const csv = csvFolha(calcularFolha(base));
    const linhas = csv.split("\n");
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toContain("Hora extra 100% (domingo/feriado)");
    expect(linhas[1]).toContain('"Flávio"');
  });
});
