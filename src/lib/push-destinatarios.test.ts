import { describe, expect, it } from "vitest";
import { juntar, usuariosDaRecepcao } from "./push-destinatarios";

describe("usuariosDaRecepcao", () => {
  it("papel recepcao sem lista individual entra", () => {
    expect(
      usuariosDaRecepcao(
        [{ user_id: "a", role: "recepcao" }],
        [{ user_id: "a", telas_permitidas: null }],
      ),
    ).toEqual(["a"]);
    expect(usuariosDaRecepcao([{ user_id: "a", role: "recepcao" }], [])).toEqual(["a"]);
  });
  it("funcionário com a tela Recepção liberada entra mesmo sem o papel", () => {
    expect(
      usuariosDaRecepcao(
        [{ user_id: "m", role: "funcionario" }],
        [{ user_id: "m", telas_permitidas: ["painel", "recepcao"] }],
      ),
    ).toEqual(["m"]);
  });
  it("lista individual sem Recepção tira, mesmo com o papel", () => {
    expect(
      usuariosDaRecepcao(
        [{ user_id: "a", role: "recepcao" }],
        [{ user_id: "a", telas_permitidas: ["camareiras"] }],
      ),
    ).toEqual([]);
  });
  it("camareira e técnico não entram", () => {
    expect(
      usuariosDaRecepcao(
        [{ user_id: "c", role: "camareira" }],
        [
          { user_id: "c", telas_permitidas: null },
          { user_id: null, telas_permitidas: ["recepcao"] },
        ],
      ),
    ).toEqual([]);
  });
  it("juntar sem repetir", () => {
    expect(juntar(["a", "b"], ["b", "c"], null)).toEqual(["a", "b", "c"]);
  });
});
