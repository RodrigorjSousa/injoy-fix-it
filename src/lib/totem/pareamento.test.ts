import { describe, expect, it } from "vitest";
import { codigoDoTexto, linkPareamento } from "./pareamento";

describe("pareamento por QR", () => {
  it("monta o link do QR", () => {
    expect(linkPareamento("https://app.injoy.com.br/", "K7M29QXP")).toBe(
      "https://app.injoy.com.br/totem?parear=K7M29QXP",
    );
  });
  it("lê o código do link ou do texto digitado", () => {
    expect(codigoDoTexto("https://app.injoy.com.br/totem?parear=K7M29QXP")).toBe("K7M29QXP");
    expect(codigoDoTexto("https://x.y/totem?a=1&parear=k7m2-9qxp#z")).toBe("K7M29QXP");
    expect(codigoDoTexto("k7m2-9qxp")).toBe("K7M29QXP");
  });
  it("recusa QR de outra coisa", () => {
    expect(codigoDoTexto("https://google.com")).toBeNull();
    expect(codigoDoTexto("ABC")).toBeNull();
    expect(codigoDoTexto("")).toBeNull();
  });
});
