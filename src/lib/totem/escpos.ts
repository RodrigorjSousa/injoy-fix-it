// Comprovante para impressora térmica 80 mm (ESC/POS), enviado pelo app RawBT
// no tablet (rawbt:base64,...). Texto sem acentos: as impressoras baratas não têm
// a mesma página de código, e sem acento sai igual em todas.

import type { Comprovante } from "@/lib/totem.functions";

const ESC = 0x1b;
const GS = 0x1d;
const LARGURA = 48; // colunas na fonte A em papel de 80 mm

export type TextosComprovante = {
  checkin: string;
  checkout: string;
  hospede: string;
  quarto: string;
  senha: string;
  digite: string;
  valida: string;
  portas: string;
  mesma: string;
  wifi: string;
  rede: string;
  senhaWifi: string;
  pagamento: string;
  ajuda: string;
  obrigado: string;
  boaEstadia: string;
};

export function ascii(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\n]/g, "?");
}

export function quebrar(texto: string, largura = LARGURA): string[] {
  const linhas: string[] = [];
  for (const paragrafo of ascii(texto).split("\n")) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      if (!atual) atual = palavra;
      else if ((atual + " " + palavra).length <= largura) atual += " " + palavra;
      else {
        linhas.push(atual);
        atual = palavra;
      }
      while (atual.length > largura) {
        linhas.push(atual.slice(0, largura));
        atual = atual.slice(largura);
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

class Bytes {
  private partes: number[] = [];
  cmd(...b: number[]) {
    this.partes.push(...b);
    return this;
  }
  texto(t: string) {
    for (const ch of ascii(t)) this.partes.push(ch.charCodeAt(0));
    return this;
  }
  linha(t = "") {
    return this.texto(t).cmd(0x0a);
  }
  centro() {
    return this.cmd(ESC, 0x61, 1);
  }
  esquerda() {
    return this.cmd(ESC, 0x61, 0);
  }
  negrito(on: boolean) {
    return this.cmd(ESC, 0x45, on ? 1 : 0);
  }
  tamanho(largura: 1 | 2 | 3, altura: 1 | 2 | 3) {
    return this.cmd(GS, 0x21, ((largura - 1) << 4) | (altura - 1));
  }
  separador() {
    return this.linha("-".repeat(LARGURA));
  }
  par(rotulo: string, valor: string) {
    const r = ascii(rotulo);
    const v = ascii(valor);
    if (r.length + v.length + 1 > LARGURA) {
      this.linha(r);
      for (const l of quebrar(v)) this.linha(`  ${l}`);
      return this;
    }
    return this.linha(r + " ".repeat(LARGURA - r.length - v.length) + v);
  }
  pronto(): Uint8Array {
    return Uint8Array.from(this.partes);
  }
}

export function montarEscPos(
  c: Comprovante,
  t: TextosComprovante,
  fmt: { dataHora: (iso: string) => string; valor: (v: number) => string; metodo: (m: "credito" | "debito" | "pix") => string },
): Uint8Array {
  const b = new Bytes();
  b.cmd(ESC, 0x40); // inicializa
  b.centro().negrito(true).tamanho(2, 2).linha("IN.JOY").tamanho(1, 1).negrito(false);
  b.linha(c.unidade);
  b.linha();
  b.negrito(true).linha(c.tipo === "checkin" ? t.checkin : t.checkout).negrito(false);
  b.linha(fmt.dataHora(c.emitidoEm));
  b.esquerda().separador();
  b.par(t.hospede, c.hospede);
  b.par(t.quarto, c.quartos.join(", "));

  if (c.senha) {
    b.separador().centro();
    b.linha(t.senha);
    b.negrito(true).tamanho(3, 3).linha(`${c.senha.split("").join(" ")}  #`).tamanho(1, 1).negrito(false);
    for (const l of quebrar(t.digite)) b.linha(l);
    if (c.validaAte) b.linha(`${t.valida} ${fmt.dataHora(c.validaAte)}`);
    const entrada = c.portas.filter((p) => p.tipo !== "quarto");
    if (entrada.length) {
      b.esquerda().linha().negrito(true).linha(t.portas).negrito(false);
      for (const p of entrada) b.par(`  ${p.label}`, p.senha ? `${p.senha} #` : p.mesma ? t.mesma : "-");
    }
    b.esquerda();
  }

  if (c.wifiRede) {
    b.separador().negrito(true).linha(t.wifi).negrito(false);
    b.par(t.rede, c.wifiRede);
    if (c.wifiSenha) b.par(t.senhaWifi, c.wifiSenha);
  }

  if (c.pagamento) {
    b.separador().negrito(true).linha(t.pagamento).negrito(false);
    b.par(fmt.metodo(c.pagamento.metodo) + (c.pagamento.bandeira ? ` ${c.pagamento.bandeira}` : ""), fmt.valor(c.pagamento.valor));
    if (c.pagamento.autorizacao) b.par("Aut.", c.pagamento.autorizacao);
  }

  b.separador().centro();
  if (c.mensagem) for (const l of quebrar(c.mensagem)) b.linha(l);
  if (c.telefone) b.linha(`${t.ajuda}: ${c.telefone}`);
  b.negrito(true).linha(c.tipo === "checkin" ? t.boaEstadia : t.obrigado).negrito(false);
  b.cmd(ESC, 0x64, 4); // avança 4 linhas
  b.cmd(GS, 0x56, 0x42, 0x00); // corte parcial
  return b.pronto();
}

export function paraBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin);
}

/** Abre o RawBT (app Android) com os bytes; ele manda para a impressora configurada nele. */
export function imprimirRawBT(bytes: Uint8Array) {
  window.location.href = `rawbt:base64,${paraBase64(bytes)}`;
}
