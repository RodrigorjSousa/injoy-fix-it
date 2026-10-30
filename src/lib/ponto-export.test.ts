import { describe, expect, it } from "vitest";
import { resumirBanco } from "@/lib/ponto-banco";
import { csvContador, resumoFechamento } from "@/lib/ponto-export";

const iso = (data: string, hora: string) => `${data}T${hora}:00-03:00`;

describe("csvContador", () => {
  const [p] = resumirBanco(
    [
      {
        colaborador_id: "a",
        nome: 'Ana "Recepção"',
        vinculo: "fixo",
        setor: "recepcao",
        data: "2026-10-07",
        status_escala: "trabalho",
        feriado: false,
        entrada_prevista: iso("2026-10-07", "19:00"),
        saida_prevista: iso("2026-10-08", "07:00"),
        entrada_real: iso("2026-10-07", "19:00"),
        saida_real: iso("2026-10-08", "07:00"),
        almoco_saida: iso("2026-10-08", "00:00"),
        almoco_volta: iso("2026-10-08", "01:00"),
        minutos_trabalhados: 660,
        minutos_previstos: 660,
        falta_sem_registro: false,
        sem_saida: false,
        almoco_sem_volta: false,
      },
    ],
    [],
    [{ colaborador_id: "a", modo: "banco", inicio: "2026-10-01" }],
    { inicio: "2026-10-01", fim: "2026-10-31" },
  );

  it("traz noturno, alertas e ciência, com vírgula decimal e aspas escapadas", () => {
    const csv = csvContador([{ ...p, ciencia: null }]);
    const [cab, linha] = csv.split("\n");
    expect(cab).toContain('"Noturno (h reduzidas)"');
    expect(linha).toContain('"Ana ""Recepção"""');
    expect(linha).toContain('"6,00";"6,85"');
    expect(linha).toContain('"Pendente"');
  });

  it("resumo do fechamento marca quem deu ciência", () => {
    const [r] = resumoFechamento([
      { ...p, ciencia: { ciente_em: "2026-11-02T12:00:00Z", comentario: null } },
    ]);
    expect(r).toMatchObject({ nome: 'Ana "Recepção"', noturno: 360, ciente: true });
  });
});
