import { describe, expect, it } from "vitest";
import {
  calcularNota,
  resumirQualidade,
  type Avaliacao,
  type ItemAvaliado,
} from "./avaliacao-arrumacao";

const it_ = (nome: string, status: ItemAvaliado["status"]): ItemAvaliado => ({
  item_id: nome,
  nome,
  status,
  obs: null,
  foto_path: null,
});
const av = (o: Partial<Avaliacao>): Avaliacao => ({
  id: Math.random().toString(),
  property: "Botafogo",
  room_number: "01",
  servico_id: null,
  tarefa: null,
  servico_concluido_em: null,
  camareira_nome: "Ana",
  avaliadora_id: "g",
  avaliadora_nome: "Gleidiane",
  nota: 10,
  itens: [],
  refazer: false,
  elogio: null,
  observacao: null,
  created_at: "2026-11-04T10:00:00Z",
  ...o,
});

describe("avaliação da arrumação", () => {
  it("nota: OK vale 1, Ajustar 0,5, Refazer 0", () => {
    expect(calcularNota([it_("a", "ok"), it_("b", "ok")])).toBe(10);
    expect(
      calcularNota([it_("a", "ok"), it_("b", "ajustar"), it_("c", "refazer"), it_("d", "ok")]),
    ).toBe(6.3);
    expect(calcularNota([])).toBeNull();
  });
  it("resumo por camareira, por item e por avaliadora", () => {
    const r = resumirQualidade([
      av({
        camareira_nome: "Ana",
        nota: 7,
        itens: [it_("Banheiro", "ajustar"), it_("Cama", "ok")],
      }),
      av({
        camareira_nome: "ana ",
        nota: 5,
        refazer: true,
        itens: [it_("Banheiro", "refazer"), it_("Cama", "ajustar")],
      }),
      av({
        camareira_nome: "Bia",
        nota: 10,
        avaliadora_nome: "Maria",
        avaliadora_id: "m",
        itens: [it_("Banheiro", "ok"), it_("Cama", "ok")],
      }),
    ]);
    expect(r.avaliacoes).toBe(3);
    expect(r.media).toBe(7.3);
    expect(r.refazer).toBe(1);
    expect(r.porCamareira[0]).toMatchObject({
      nome: "Ana",
      avaliacoes: 2,
      media: 6,
      erros: 3,
      refazer: 1,
      piorItem: "Banheiro",
    });
    expect(r.porItem[0]).toMatchObject({
      nome: "Banheiro",
      ajustar: 1,
      refazer: 1,
      taxaErro: 67,
      participacao: 67,
    });
    expect(r.porAvaliadora.map((a) => a.nome)).toEqual(["Gleidiane", "Maria"]);
  });
});
