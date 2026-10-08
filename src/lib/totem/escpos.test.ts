import { describe, expect, it } from "vitest";
import { ascii, montarEscPos, paraBase64, quebrar } from "./escpos";
import { TEXTOS } from "./i18n";
import type { Comprovante } from "@/lib/totem.functions";

const comprovante: Comprovante = {
  tipo: "checkin",
  unidade: "Botafogo",
  hospede: "María José da Silva",
  quartos: ["005"],
  emitidoEm: "2026-10-08T18:30:00Z",
  senha: "482917",
  portas: [
    { label: "Quarto 005", tipo: "quarto", senha: "482917", mesma: true },
    { label: "Portão Principal", tipo: "portao", senha: "1357", mesma: false },
    { label: "Porta de Vidro", tipo: "vidro", senha: null, mesma: true },
  ],
  validaAte: "2026-10-10T15:00:00Z",
  wifiRede: "INJOY-Hospedes",
  wifiSenha: "bemvindo2026",
  telefone: "(21) 99999-0000",
  mensagem: "Café da manhã das 7h às 10h.",
  pagamento: { valor: 180.5, metodo: "credito", bandeira: "Visa", autorizacao: "A1B2C3", pagoEm: "2026-10-08T18:29:00Z" },
};

const fmt = {
  dataHora: (iso: string) => iso.slice(0, 16).replace("T", " "),
  valor: (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`,
  metodo: (m: "credito" | "debito" | "pix") => ({ credito: "Credito", debito: "Debito", pix: "Pix" })[m],
};

describe("comprovante ESC/POS", () => {
  const bytes = montarEscPos(comprovante, TEXTOS.pt.rc, fmt);
  const texto = String.fromCharCode(...bytes);

  it("começa inicializando e termina cortando o papel", () => {
    expect([...bytes.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...bytes.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it("traz senha, portas, Wi-Fi, pagamento e mensagem, sem acentos", () => {
    expect(texto).toContain("4 8 2 9 1 7  #");
    expect(texto).toContain("Portao Principal");
    expect(texto).toContain("1357 #");
    expect(texto).toContain("mesma senha");
    expect(texto).toContain("INJOY-Hospedes");
    expect(texto).toContain("R$ 180,50");
    expect(texto).toContain("Cafe da manha das 7h as 10h.");
    expect(texto).toContain("Maria Jose da Silva");
    expect([...bytes].every((b) => b < 0x80)).toBe(true);
  });

  it("check-out sem senha não imprime bloco de porta", () => {
    const t = String.fromCharCode(...montarEscPos({ ...comprovante, tipo: "checkout", senha: null, portas: [], wifiRede: null }, TEXTOS.en.rc, fmt));
    expect(t).toContain("CHECK-OUT RECEIPT");
    expect(t).not.toContain("DOOR CODE");
  });

  it("utilitários", () => {
    expect(ascii("Ação — “ok”…")).toBe('Acao - "ok"...');
    expect(quebrar("a ".repeat(30).trim(), 10).every((l) => l.length <= 10)).toBe(true);
    expect(paraBase64(Uint8Array.from([0x1b, 0x40]))).toBe("G0A=");
  });
});
