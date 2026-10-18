import { describe, expect, it } from "vitest";
import { dataHoraBR, duracaoChamado } from "./chamado-tempo";

describe("duracaoChamado", () => {
  const ini = "2026-10-15T12:00:00Z";
  it("minutos, horas e dias", () => {
    expect(duracaoChamado(ini, "2026-10-15T12:35:00Z")).toBe("35 min");
    expect(duracaoChamado(ini, "2026-10-15T16:20:00Z")).toBe("4 h 20 min");
    expect(duracaoChamado(ini, "2026-10-15T14:00:00Z")).toBe("2 h");
    expect(duracaoChamado(ini, "2026-10-17T15:10:00Z")).toBe("2 d 3 h");
    expect(duracaoChamado(ini, "2026-10-16T12:00:00Z")).toBe("1 d");
    expect(duracaoChamado(ini, "2026-10-15T12:00:20Z")).toBe("menos de 1 min");
  });
  it("sem data ou data invertida", () => {
    expect(duracaoChamado(ini, null)).toBeNull();
    expect(duracaoChamado(ini, "2026-10-14T12:00:00Z")).toBeNull();
  });
  it("data e hora do Rio", () => {
    expect(dataHoraBR("2026-10-18T12:36:00Z")).toBe("18/10/2026, 09:36");
  });
});
