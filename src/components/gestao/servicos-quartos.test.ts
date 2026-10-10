import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/previsao-carga", () => ({ usePrevisaoCarga: () => ({}), useRecalcularPrevisao: () => ({}) }));
import { contarServicosHoje, contarServicosPrevistos } from "./servicos-quartos";
import { predictHousekeepingTasks } from "@/lib/cloudbeds/housekeeping-rules";

describe("contarServicosHoje", () => {
  it("conta por tipo, vazio = verificação e ignora manutenção", () => {
    const { contagem, quartosPorServico } = contarServicosHoje([
      { room_number: "001", assigned_task: "GERAL", condition: null },
      { room_number: "002", assigned_task: "GERAL - CHECK-IN", condition: null },
      { room_number: "003", assigned_task: "REVISÃO", condition: null },
      { room_number: "004", assigned_task: "ARRUMAÇÃO", condition: null },
      { room_number: "005", assigned_task: "TROCA", condition: null },
      { room_number: "006", assigned_task: null, condition: null },
      { room_number: "007", assigned_task: "GERAL", condition: "maintenance" },
    ]);
    expect(contagem).toEqual({ GERAL: 1, "GERAL - CHECK-IN": 1, "REVISÃO CHECK IN": 1, ARRUMAÇÃO: 1, "TROCA + ARRUMAÇÃO": 1, VERIFICAÇÃO: 1 });
    expect(quartosPorServico.GERAL).toEqual(["001"]);
  });
});

describe("previsão segue as regras de limpeza", () => {
  const d = "2026-10-12";
  const res = [
    { roomNumber: "A", checkIn: "2026-10-09", checkOut: d, status: "confirmed", arrivalTime: null }, // sai, ninguém entra → GERAL
    { roomNumber: "B", checkIn: "2026-10-10", checkOut: d, status: "confirmed", arrivalTime: null },
    { roomNumber: "B", checkIn: d, checkOut: "2026-10-14", status: "confirmed", arrivalTime: "14:00" }, // sai e entra → GERAL - CHECK-IN
    { roomNumber: "C", checkIn: d, checkOut: "2026-10-13", status: "confirmed", arrivalTime: null }, // só chega → REVISÃO
    { roomNumber: "D", checkIn: "2026-10-11", checkOut: "2026-10-15", status: "in_house", arrivalTime: null }, // 1º dia → ARRUMAÇÃO
    { roomNumber: "E", checkIn: "2026-10-09", checkOut: "2026-10-15", status: "in_house", arrivalTime: null }, // 3º dia → TROCA
    { roomNumber: "F", checkIn: d, checkOut: "2026-10-13", status: "canceled", arrivalTime: null }, // cancelada → nada
  ];
  const tarefas = predictHousekeepingTasks(res, ["A", "B", "C", "D", "E", "F", "G"], d);
  it("gera cada serviço", () => {
    expect(Object.fromEntries(tarefas.map((t) => [t.quarto, t.tarefa]))).toEqual({
      A: "GERAL", B: "GERAL - CHECK-IN", C: "REVISÃO", D: "ARRUMAÇÃO", E: "TROCA + ARRUMAÇÃO",
    });
  });
  it("contagem prevista inclui revisão e verificação (quartos sem serviço)", () => {
    const c = contarServicosPrevistos(
      { qtd_geral: 1, qtd_geral_checkin: 1, qtd_arrumacao: 1, qtd_troca_arrumacao: 1, detalhes: tarefas },
      7,
    );
    expect(c).toEqual({ GERAL: 1, "GERAL - CHECK-IN": 1, "REVISÃO CHECK IN": 1, ARRUMAÇÃO: 1, "TROCA + ARRUMAÇÃO": 1, VERIFICAÇÃO: 2 });
  });
});
