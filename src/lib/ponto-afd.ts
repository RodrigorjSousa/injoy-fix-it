// AFD — Arquivo Fonte de Dados do REP-P (Portaria MTP 671/2021, leiaute versão 004).
//
// * Texto ISO-8859-1, um registro por linha terminada em CR LF, em ordem de NSR.
// * Campo N: zeros à esquerda. Campo A: alinhado à esquerda, espaços à direita.
// * Data e hora: AAAA-MM-ddThh:mm:00-0300 (horário de Brasília, sem horário de verão).
// * CRC-16/KERMIT (4 hex) só nos registros tipo 1 a 5.
// * Tipo 7: hash SHA-256 de NSR + tipo + data/hora da marcação + CPF + data/hora da gravação
//   + coletor + on-line/off-line + hash da marcação anterior (o banco calcula ao gravar; aqui
//   só é conferido).
// * Última linha: assinatura (texto fixo; a assinatura vai no arquivo .p7s separado).

export type RegistroRep = {
  nsr: number;
  tipo: 2 | 4 | 5 | 6 | 7;
  gravado_em: string;
  marcacao_em?: string | null;
  cpf?: string | null;
  coletor?: string | null;
  offline?: boolean | null;
  hash?: string | null;
  operacao?: "I" | "A" | "E" | null;
  nome?: string | null;
  outros_dados?: string | null;
  responsavel_cpf?: string | null;
  tipo_doc?: number | null;
  documento?: string | null;
  cno_caepf?: string | null;
  razao_social?: string | null;
  local_prestacao?: string | null;
  evento_codigo?: string | null;
};

export type EmpregadorRep = {
  tipo_doc: number;
  documento: string;
  cno_caepf: string | null;
  razao_social: string;
  inpi_registro: string | null;
  desenvolvedor_documento: string | null;
};

// ---------------------------------------------------------------- formatação
const OFFSET_SP_MS = -3 * 3600000;

export function dataHoraAfd(iso: string): string {
  const d = new Date(new Date(iso).getTime() + OFFSET_SP_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00-0300`
  );
}

/** Numérico: só dígitos, zeros à esquerda (corta pela esquerda se passar). */
export function campoN(valor: string | number | null | undefined, tamanho: number): string {
  const dig = String(valor ?? "").replace(/\D/g, "");
  return dig.padStart(tamanho, "0").slice(-tamanho);
}

/** Alfanumérico: sem quebras de linha, espaços à direita, cortado no tamanho. */
export function campoA(valor: string | null | undefined, tamanho: number): string {
  const limpo = String(valor ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^ -ÿ]/g, "?");
  return limpo.slice(0, tamanho).padEnd(tamanho, " ");
}

/** CRC-16/KERMIT (CCITT-TRUE): polinômio 0x1021 refletido, início 0. "123456789" → 2189. */
export function crc16Kermit(texto: string): string {
  let crc = 0x0000;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) & 0xff;
    for (let b = 0; b < 8; b++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const comCrc = (s: string) => s + crc16Kermit(s);

// ---------------------------------------------------------------- registros
export function linhaCabecalho(
  emp: EmpregadorRep,
  periodo: { inicio: string; fim: string },
  geradoEm: string,
): string {
  const dev = emp.desenvolvedor_documento || emp.documento;
  return comCrc(
    "000000000" +
      "1" +
      campoN(emp.tipo_doc, 1) +
      campoA(emp.documento, 14) +
      campoN(emp.cno_caepf, 14) +
      campoA(emp.razao_social, 150) +
      campoN(emp.inpi_registro, 17) +
      periodo.inicio.slice(0, 10) +
      periodo.fim.slice(0, 10) +
      dataHoraAfd(geradoEm) +
      "004" +
      (dev.length === 11 ? "2" : "1") +
      campoA(dev, 14) +
      campoA("", 30),
  );
}

export function linhaRegistro(r: RegistroRep): string {
  const nsr = campoN(r.nsr, 9);
  switch (r.tipo) {
    case 2:
      return comCrc(
        nsr +
          "2" +
          dataHoraAfd(r.gravado_em) +
          campoN(r.responsavel_cpf, 14) +
          campoN(r.tipo_doc ?? 1, 1) +
          campoA(r.documento, 14) +
          campoN(r.cno_caepf, 14) +
          campoA(r.razao_social, 150) +
          campoA(r.local_prestacao, 100),
      );
    case 5:
      return comCrc(
        nsr +
          "5" +
          dataHoraAfd(r.gravado_em) +
          campoA(r.operacao, 1) +
          campoN(r.cpf, 12) +
          campoA(r.nome, 52) +
          campoA(r.outros_dados, 4) +
          campoN(r.responsavel_cpf, 11),
      );
    case 6:
      return nsr + "6" + dataHoraAfd(r.gravado_em) + campoN(r.evento_codigo, 2);
    case 7:
      return (
        nsr +
        "7" +
        dataHoraAfd(r.marcacao_em ?? r.gravado_em) +
        campoN(r.cpf, 12) +
        dataHoraAfd(r.gravado_em) +
        campoN(r.coletor ?? "02", 2) +
        (r.offline ? "1" : "0") +
        campoA(r.hash, 64)
      );
    default:
      throw new Error(`Tipo de registro não suportado no AFD: ${r.tipo}`);
  }
}

export function linhaTrailer(registros: RegistroRep[]): string {
  const qtd = (t: number) => campoN(registros.filter((r) => r.tipo === t).length, 9);
  return "999999999" + qtd(2) + qtd(3) + qtd(4) + qtd(5) + qtd(6) + qtd(7) + "9";
}

export const LINHA_ASSINATURA = campoA("ASSINATURA_DIGITAL_EM_ARQUIVO_P7S", 100);

/** Conteúdo do AFD (texto). Use `afdParaBytes` para gravar em ISO-8859-1. */
export function gerarAfd(
  emp: EmpregadorRep,
  registros: RegistroRep[],
  periodo: { inicio: string; fim: string },
  geradoEm: string = new Date().toISOString(),
): string {
  const ordenados = [...registros].sort((a, b) => a.nsr - b.nsr);
  const linhas = [
    linhaCabecalho(emp, periodo, geradoEm),
    ...ordenados.map(linhaRegistro),
    linhaTrailer(ordenados),
    LINHA_ASSINATURA,
  ];
  return linhas.join("\r\n") + "\r\n";
}

export function afdParaBytes(texto: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(texto.length));
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    bytes[i] = c < 256 ? c : 0x3f;
  }
  return bytes;
}

export function nomeArquivoAfd(emp: EmpregadorRep): string {
  return `AFD${campoN(emp.inpi_registro, 17)}${emp.documento}REP_P.txt`;
}

// ---------------------------------------------------------------- conferência
async function sha256Hex(texto: string): Promise<string> {
  const dados = new TextEncoder().encode(texto);
  const buf = await crypto.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type Conferencia = {
  ok: boolean;
  marcacoes: number;
  hashesErrados: number[];
  /** NSR que faltam na sequência (buracos). */
  buracos: number[];
};

/**
 * Recalcula a cadeia de hashes das marcações e confere a sequência de NSR.
 * `registros` deve trazer TODOS os registros desde o NSR 1 (a cadeia começa nele).
 */
export async function conferirRegistros(registros: RegistroRep[]): Promise<Conferencia> {
  const ordenados = [...registros].sort((a, b) => a.nsr - b.nsr);
  const buracos: number[] = [];
  let esperado = 1;
  for (const r of ordenados) {
    while (esperado < r.nsr && buracos.length < 50) buracos.push(esperado++);
    esperado = r.nsr + 1;
  }
  const hashesErrados: number[] = [];
  let anterior = "";
  let marcacoes = 0;
  for (const r of ordenados) {
    if (r.tipo !== 7) continue;
    marcacoes++;
    const base =
      campoN(r.nsr, 9) +
      "7" +
      dataHoraAfd(r.marcacao_em ?? r.gravado_em) +
      campoN(r.cpf, 12) +
      dataHoraAfd(r.gravado_em) +
      campoN(r.coletor ?? "02", 2) +
      (r.offline ? "1" : "0") +
      anterior;
    if ((await sha256Hex(base)) !== r.hash) hashesErrados.push(r.nsr);
    anterior = r.hash ?? "";
  }
  return { ok: !buracos.length && !hashesErrados.length, marcacoes, hashesErrados, buracos };
}
