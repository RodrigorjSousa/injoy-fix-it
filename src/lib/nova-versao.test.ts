import { describe, expect, it } from "vitest";
import { temVersaoNova, versaoDoHtml } from "./nova-versao";

describe("aviso de nova versão", () => {
  it("lê o arquivo de entrada do HTML publicado", () => {
    expect(
      versaoDoHtml('<link rel="modulepreload" href="/assets/index-CcjKnxaa.js"><script>x</script>'),
    ).toBe("/assets/index-CcjKnxaa.js");
    expect(versaoDoHtml("<html>sem build</html>")).toBeNull();
  });
  it("avisa só quando a entrada publicada não foi carregada nesta tela", () => {
    const carregadas = new Set(["/assets/index-A.js", "/assets/index-lib.js"]);
    expect(temVersaoNova(carregadas, "/assets/index-B.js")).toBe(true);
    expect(temVersaoNova(carregadas, "/assets/index-A.js")).toBe(false);
    expect(temVersaoNova(new Set(), "/assets/index-B.js")).toBe(false); // desenvolvimento
    expect(temVersaoNova(carregadas, null)).toBe(false);
  });
});
