import { describe, expect, it } from "vitest";
import {
  calcularDia,
  diaDaSemana,
  lerHoras,
  movimentoBanco,
  resumirBanco,
  type DiaPonto,
} from "@/lib/ponto-banco";

// 2026-10-07 = quarta; 2026-10-10 = sábado; 2026-10-11 = domingo; 2026-10-12 = feriado (segunda)
const iso = (data: string, hora: string) => `${data}T${hora}:00-03:00`;

function dia(p: Partial<DiaPonto> & { data: string }): DiaPonto {
  return {
    status_escala: "trabalho",
    feriado: false,
    entrada_prevista: iso(p.data, "08:00"),
    saida_prevista: iso(p.data, "17:00"),
    entrada_real: iso(p.data, "08:00"),
    saida_real: iso(p.data, "17:00"),
    minutos_trabalhados: 480,
    minutos_previstos: 480,
    falta_sem_registro: false,
    sem_saida: false,
    almoco_sem_volta: false,
    ...p,
  };
}

describe("diaDaSemana", () => {
  it("não depende do fuso", () => {
    expect(diaDaSemana("2026-10-11")).toBe(0);
    expect(diaDaSemana("2026-10-10")).toBe(6);
  });
});

describe("calcularDia", () => {
  it("dia normal exato não gera nada", () => {
    const r = calcularDia(dia({ data: "2026-10-07" }));
    expect(r).toMatchObject({ classe: "normal", extra50: 0, debito: 0 });
  });

  it("tolerância: 4 min na entrada e 4 min na saída são ignorados", () => {
    const r = calcularDia(
      dia({
        data: "2026-10-07",
        entrada_real: iso("2026-10-07", "08:04"),
        saida_real: iso("2026-10-07", "16:56"),
        minutos_trabalhados: 472,
      }),
    );
    expect(r).toMatchObject({ debito: 0, toleranciaAplicada: true });
  });

  it("passou de 5 min em uma batida: conta tudo", () => {
    const r = calcularDia(
      dia({
        data: "2026-10-07",
        entrada_real: iso("2026-10-07", "08:07"),
        minutos_trabalhados: 473,
      }),
    );
    expect(r).toMatchObject({ debito: 7, toleranciaAplicada: false });
  });

  it("6 + 5 min somam 11 (> 10 no dia): conta tudo", () => {
    const r = calcularDia(
      dia({
        data: "2026-10-07",
        entrada_real: iso("2026-10-07", "08:05"),
        saida_real: iso("2026-10-07", "17:06"),
        minutos_trabalhados: 481,
      }),
    );
    expect(r.extra50).toBe(1);
  });

  it("saiu 1 h depois do horário: 60 min de extra 50%", () => {
    const r = calcularDia(
      dia({ data: "2026-10-07", saida_real: iso("2026-10-07", "18:00"), minutos_trabalhados: 540 }),
    );
    expect(r).toMatchObject({ classe: "normal", extra50: 60, extra100: 0 });
  });

  it("almoço 30 min mais curto com entrada/saída no horário: conta como extra", () => {
    const r = calcularDia(dia({ data: "2026-10-07", minutos_trabalhados: 510 }));
    expect(r.extra50).toBe(30);
  });

  it("sábado de folga (manutenção) trabalhado: tudo 50%", () => {
    const r = calcularDia(
      dia({
        data: "2026-10-10",
        status_escala: "folga",
        entrada_prevista: null,
        saida_prevista: null,
        minutos_previstos: null,
        minutos_trabalhados: 240,
      }),
    );
    expect(r).toMatchObject({ classe: "folga_trabalhada", extra50: 240, extra100: 0 });
  });

  it("domingo de folga trabalhado: tudo 100%", () => {
    const r = calcularDia(
      dia({
        data: "2026-10-11",
        status_escala: "folga",
        minutos_previstos: null,
        minutos_trabalhados: 300,
      }),
    );
    expect(r).toMatchObject({ classe: "domingo_feriado", extra100: 300, extra50: 0 });
  });

  it("feriado sem escala trabalhado: 100%", () => {
    const r = calcularDia(
      dia({
        data: "2026-10-12",
        status_escala: null,
        feriado: true,
        minutos_previstos: null,
        minutos_trabalhados: 200,
      }),
    );
    expect(r.extra100).toBe(200);
  });

  it("domingo que é dia de trabalho na escala: normal, sem 100%", () => {
    const r = calcularDia(dia({ data: "2026-10-11" }));
    expect(r).toMatchObject({ classe: "normal", extra100: 0, extra50: 0 });
  });

  it("feriado na escala de trabalho com 1 h a mais: 50% (não 100%)", () => {
    const r = calcularDia(
      dia({
        data: "2026-10-12",
        feriado: true,
        minutos_trabalhados: 540,
        saida_real: iso("2026-10-12", "18:00"),
      }),
    );
    expect(r).toMatchObject({ extra50: 60, extra100: 0 });
  });

  it("plantão extra em dia útil: tudo 50%", () => {
    const r = calcularDia(
      dia({ data: "2026-10-07", status_escala: "extra", minutos_trabalhados: 360 }),
    );
    expect(r).toMatchObject({ classe: "folga_trabalhada", extra50: 360 });
  });

  it("atestado abona", () => {
    const r = calcularDia(
      dia({
        data: "2026-10-07",
        status_escala: "atestado",
        entrada_real: null,
        saida_real: null,
        minutos_trabalhados: null,
      }),
    );
    expect(r).toMatchObject({ classe: "abonado", debito: 0 });
  });

  it("falta (dia passado sem registro) vira débito do previsto", () => {
    const r = calcularDia(
      dia({
        data: "2026-10-07",
        entrada_real: null,
        saida_real: null,
        minutos_trabalhados: null,
        falta_sem_registro: true,
      }),
    );
    expect(r).toMatchObject({ classe: "falta", debito: 480 });
  });

  it("dia de hoje ainda sem registro não é falta", () => {
    const r = calcularDia(
      dia({ data: "2026-10-07", entrada_real: null, saida_real: null, minutos_trabalhados: null }),
    );
    expect(r).toMatchObject({ classe: "sem_registro", debito: 0 });
  });

  it("sem saída: incompleto, não calcula", () => {
    const r = calcularDia(
      dia({ data: "2026-10-07", saida_real: null, sem_saida: true, minutos_trabalhados: null }),
    );
    expect(r).toMatchObject({
      classe: "incompleto",
      extra50: 0,
      debito: 0,
      aviso: "Falta a saída",
    });
  });
});

describe("movimentoBanco", () => {
  const r = calcularDia(
    dia({ data: "2026-10-11", status_escala: "folga", minutos_trabalhados: 120 }),
  );
  it("modo banco: extras entram 1 por 1", () => {
    expect(movimentoBanco(r, "banco").saldo).toBe(120);
  });
  it("modo pagamento: extras não entram no banco", () => {
    expect(movimentoBanco(r, "pagamento").saldo).toBe(0);
  });
});

describe("resumirBanco", () => {
  const base = { colaborador_id: "a", nome: "Ana", vinculo: "fixo", setor: "manutencao" };
  const linhas = [
    {
      ...base,
      ...dia({
        data: "2026-09-30",
        saida_real: iso("2026-09-30", "18:00"),
        minutos_trabalhados: 540,
      }),
    },
    {
      ...base,
      ...dia({
        data: "2026-10-05",
        saida_real: iso("2026-10-05", "18:00"),
        minutos_trabalhados: 540,
      }),
    },
    {
      ...base,
      ...dia({
        data: "2026-10-06",
        entrada_real: iso("2026-10-06", "09:00"),
        minutos_trabalhados: 420,
      }),
    },
    { ...base, ...dia({ data: "2026-10-11", status_escala: "folga", minutos_trabalhados: 120 }) },
    {
      ...base,
      ...dia({
        data: "2026-11-02",
        saida_real: iso("2026-11-02", "18:00"),
        minutos_trabalhados: 540,
      }),
    },
    {
      ...base,
      colaborador_id: "f",
      nome: "Free",
      vinculo: "freelance",
      ...dia({ data: "2026-10-05", minutos_trabalhados: 600 }),
    },
  ];

  it("modo banco: saldo anterior, período e ajustes; ignora freelancer e antes do início", () => {
    const [p, ...resto] = resumirBanco(
      linhas,
      [
        {
          id: "1",
          colaborador_id: "a",
          data: "2026-10-20",
          minutos: -60,
          tipo: "folga_compensada",
          motivo: "x",
        },
        {
          id: "2",
          colaborador_id: "a",
          data: "2026-10-03",
          minutos: 30,
          tipo: "correcao",
          motivo: "y",
        },
      ],
      [{ colaborador_id: "a", modo: "banco", inicio: "2026-10-01" }],
      { inicio: "2026-10-04", fim: "2026-10-31" },
    );
    expect(resto).toHaveLength(0);
    expect(p).toMatchObject({
      extra50: 60,
      extra100: 120,
      debito: 60,
      saldoAnterior: 30,
      saldoPeriodo: 120,
      ajustesPeriodo: -60,
      saldoFinal: 90,
    });
    expect(p.dias).toHaveLength(3);
  });

  it("sem configuração: paga extra, só débitos vão ao banco", () => {
    const [p] = resumirBanco(linhas, [], [], { inicio: "2026-10-01", fim: "2026-10-31" });
    expect(p).toMatchObject({
      configurado: false,
      modo: "pagamento",
      extra50: 60,
      extra100: 120,
      saldoFinal: -60,
    });
  });
});

describe("lerHoras", () => {
  it.each([
    ["2", 120],
    ["1h30", 90],
    ["1:30", 90],
    ["-0:45", -45],
    ["1,5", 90],
    ["2h", 120],
    ["abc", null],
    ["1:75", null],
  ])("%s → %s", (t, m) => expect(lerHoras(t)).toBe(m));
});
