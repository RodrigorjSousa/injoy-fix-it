import { describe, expect, it } from "vitest";
import { minutosDesde, syncAtrasada, textoAtraso } from "./sync-atraso";

const agora = new Date("2026-10-14T15:00:00Z");

describe("sync-atraso", () => {
  it("conta os minutos", () => {
    expect(minutosDesde("2026-10-14T14:50:00Z", agora)).toBe(10);
    expect(minutosDesde("x", agora)).toBeNull();
    expect(minutosDesde(null, agora)).toBeNull();
  });
  it("avisa só depois do limite", () => {
    expect(syncAtrasada("2026-10-14T14:50:00Z", agora)).toBe(false);
    expect(syncAtrasada("2026-10-14T14:40:00Z", agora)).toBe(true);
    expect(syncAtrasada(null, agora)).toBe(false);
  });
  it("texto", () => {
    expect(textoAtraso(42)).toBe("há 42 min");
    expect(textoAtraso(185)).toBe("há 3 h");
  });
});
