import { describe, expect, it } from "vitest";
import { chaveQuarto } from "./quarto-numero";
describe("chaveQuarto", () => {
  it("compara números de quarto do app e do Cloudbeds", () => {
    expect(chaveQuarto("APT 001")).toBe(chaveQuarto("001"));
    expect(chaveQuarto("Apto 1")).toBe("1");
    expect(chaveQuarto("APT 107")).toBe("107");
    expect(chaveQuarto("APT 107")).not.toBe(chaveQuarto("APT 017"));
  });
});
