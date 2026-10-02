import { describe, expect, it } from "vitest";
import { predictHousekeepingTasks, type ForecastReservation } from "./housekeeping-rules";

const reservation=(roomNumber:string,checkIn:string,checkOut:string):ForecastReservation=>({roomNumber,checkIn,checkOut,status:"confirmed",arrivalTime:"14:00"});
describe("predictHousekeepingTasks",()=>{
  it("separa os quartos de reservas multiunidade já normalizadas",()=>{const result=predictHousekeepingTasks([reservation("107","2026-01-01","2026-01-04"),reservation("109","2026-01-01","2026-01-04")],["107","109"],"2026-01-02");expect(result.map(item=>item.quarto)).toEqual(["107","109"]);});
  it("prioriza geral com check-in quando há saída e chegada",()=>{const result=predictHousekeepingTasks([reservation("101","2026-01-01","2026-01-03"),reservation("101","2026-01-03","2026-01-05")],["101"],"2026-01-03");expect(result[0]?.tarefa).toBe("GERAL - CHECK-IN");});
  it("marca troca a cada três dias",()=>{const result=predictHousekeepingTasks([reservation("102","2026-01-01","2026-01-08")],["102"],"2026-01-04");expect(result[0]?.tarefa).toBe("TROCA + ARRUMAÇÃO");});
});