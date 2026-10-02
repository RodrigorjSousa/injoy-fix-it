import { describe, expect, it } from "vitest";
import { BlinkDetector, averageDescriptor, euclidean, eyeAspectRatio } from "./ponto-face";

const olho = (abertura: number) => [
  { x: 0, y: 0 },
  { x: 1, y: -abertura },
  { x: 2, y: -abertura },
  { x: 3, y: 0 },
  { x: 2, y: abertura },
  { x: 1, y: abertura },
];

describe("ponto-face", () => {
  it("calcula a abertura do olho", () => {
    expect(eyeAspectRatio(olho(0.5))).toBeCloseTo(1 / 3, 3);
    expect(eyeAspectRatio(olho(0.05))).toBeLessThan(0.05);
  });
  it("só reconhece piscada com olho aberto → fechado → aberto", () => {
    const b = new BlinkDetector();
    for (let i = 0; i < 5; i++) b.push(0.3);
    expect(b.blinked).toBe(false);
    b.push(0.12);
    expect(b.blinked).toBe(false);
    b.push(0.3);
    expect(b.blinked).toBe(true);
  });
  it("não aceita olho sempre aberto ou foto parada", () => {
    const b = new BlinkDetector();
    for (let i = 0; i < 50; i++) b.push(0.29 + (i % 2) * 0.01);
    expect(b.blinked).toBe(false);
  });
  it("média e distância dos vetores", () => {
    const a = new Array(128).fill(0.1),
      c = new Array(128).fill(0.3);
    expect(averageDescriptor([a, c])[0]).toBeCloseTo(0.2, 5);
    expect(euclidean(a, a)).toBe(0);
    expect(euclidean(a, c)).toBeCloseTo(Math.sqrt(128 * 0.04), 5);
  });
});
