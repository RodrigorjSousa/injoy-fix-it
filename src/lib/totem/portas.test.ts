import { describe, expect, it } from "vitest";
import {
  aguardandoChegada,
  cadastroPrevioFeito,
  emailAutomaticoJaSaiu,
  janelaProvisoria,
  montarSenha,
  quartoAtendido,
  type Fechadura,
} from "./portas";

const f = (x: Partial<Fechadura> & Pick<Fechadura, "device_id" | "tipo">): Fechadura => ({
  label: x.device_id,
  room_number: null,
  senha_fixa: null,
  fornecedor: "tuya",
  ...x,
});

const portao = f({ device_id: "36396334", tipo: "portao", label: "Portão Gradeado", fornecedor: "ttlock" });
const vidro = f({ device_id: "4000", tipo: "vidro", label: "Porta de Vidro", fornecedor: "ttlock" });

describe("montarSenha", () => {
  it("quarto integrado: a mesma senha em todas as portas", () => {
    const q = f({ device_id: "eb1", tipo: "quarto", label: "APT 113", room_number: "113" });
    const r = montarSenha([q, portao, vidro], { eb1: "482913", "36396334": "482913", "4000": "482913" });
    expect(r.senha).toBe("482913");
    expect(r.portas.every((p) => p.mesma && p.senha === null)).toBe(true);
  });

  it("quarto manual: senha principal é a fixa do quarto e os portões mostram a senha gerada", () => {
    const q = f({ device_id: "manual-botafogo-301", tipo: "quarto", label: "APT 301", fornecedor: "manual", senha_fixa: "1111" });
    const r = montarSenha([q, portao, vidro], { "36396334": "735102", "4000": "735102" });
    expect(r.senha).toBe("1111");
    expect(r.portas).toEqual([
      { label: "APT 301", tipo: "quarto", senha: null, mesma: true },
      { label: "Portão Gradeado", tipo: "portao", senha: "735102", mesma: false },
      { label: "Porta de Vidro", tipo: "vidro", senha: "735102", mesma: false },
    ]);
  });

  it("reserva com quarto integrado e quarto manual: o manual aparece com a própria senha", () => {
    const q1 = f({ device_id: "eb1", tipo: "quarto", label: "APT 113" });
    const q2 = f({ device_id: "manual-1", tipo: "quarto", label: "APT 401", fornecedor: "manual", senha_fixa: "2222" });
    const r = montarSenha([q1, q2, portao], { eb1: "999111", "36396334": "999111" });
    expect(r.senha).toBe("999111");
    expect(r.portas[1]).toEqual({ label: "APT 401", tipo: "quarto_senha_fixa", senha: "2222", mesma: false });
  });

  it("portão que não aceitou a senha fica sem senha (a equipe abre)", () => {
    const q = f({ device_id: "eb1", tipo: "quarto" });
    const r = montarSenha([q, portao], { eb1: "123456" });
    expect(r.portas[1]).toMatchObject({ senha: null, mesma: false });
  });
});

describe("quartoAtendido", () => {
  it("manual só vale com a senha cadastrada", () => {
    expect(quartoAtendido(f({ device_id: "m", tipo: "quarto", fornecedor: "manual" }))).toBe(false);
    expect(quartoAtendido(f({ device_id: "m", tipo: "quarto", fornecedor: "manual", senha_fixa: "1845" }))).toBe(true);
    expect(quartoAtendido(f({ device_id: "eb", tipo: "quarto" }))).toBe(true);
    expect(quartoAtendido(null)).toBe(false);
  });
});

describe("senha provisória dos portões", () => {
  it("vale da hora do check-in na chegada até 12h do dia seguinte (horário de SP)", () => {
    const j = janelaProvisoria("2026-11-30", "14:00", "12:00");
    expect(new Date(j.inicio).toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(new Date(j.fim).toISOString()).toBe("2026-12-01T15:00:00.000Z");
  });

  it("e-mail automático da véspera: antes das 17h ainda vai; depois, a recepção manda", () => {
    expect(emailAutomaticoJaSaiu("2026-11-05", "17:00", Date.parse("2026-11-04T19:59:00Z"))).toBe(false);
    expect(emailAutomaticoJaSaiu("2026-11-05", "17:00", Date.parse("2026-11-04T20:00:00Z"))).toBe(true);
  });

  it("cadastro prévio = titular com documento", () => {
    const h = (documentos: string[], principal: boolean) => ({ primeiroNome: "A", sobrenome: "B", nomeCompleto: "A B", documentos, principal });
    expect(cadastroPrevioFeito([h([], true), h(["123456"], false)])).toBe(false);
    expect(cadastroPrevioFeito([h(["12345678"], true)])).toBe(true);
    expect(cadastroPrevioFeito([])).toBe(false);
  });

  it("só reservas que ainda vão chegar", () => {
    expect(aguardandoChegada("confirmed")).toBe(true);
    expect(aguardandoChegada("checked_in")).toBe(false);
    expect(aguardandoChegada("canceled")).toBe(false);
  });
});
