// Comprovante de Registro de Ponto do Trabalhador em PDF, assinado em PAdES (ETSI.CAdES.detached)
// com o certificado A1 do empregador. PDF mínimo escrito à mão (uma página A4, Helvetica,
// WinAnsi) para não depender de biblioteca de PDF no servidor.
import { assinarDestacado, type CertificadoA1 } from "@/lib/assinatura-cms";

const TAM_ASSINATURA = 16384; // bytes reservados para o CMS (hex = o dobro)

/** Texto para dentro de ( ) no PDF, em WinAnsi/Latin-1. */
function textoPdf(t: string): string {
  return t
    .normalize("NFC")
    .replace(/[^ -ÿ]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** Quebra um texto longo (ex.: o hash) em pedaços que cabem na linha. */
function quebrar(t: string, max: number): string[] {
  const partes: string[] = [];
  for (let i = 0; i < t.length; i += max) partes.push(t.slice(i, i + max));
  return partes.length ? partes : [""];
}

function dataPdf(d: Date): string {
  const sp = new Date(d.getTime() - 3 * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `D:${sp.getUTCFullYear()}${p(sp.getUTCMonth() + 1)}${p(sp.getUTCDate())}` +
    `${p(sp.getUTCHours())}${p(sp.getUTCMinutes())}${p(sp.getUTCSeconds())}-03'00'`
  );
}

export type LinhaComprovante = [rotulo: string, valor: string];

/**
 * Monta o PDF com um campo de assinatura reservado e assina. Devolve o PDF como
 * "binary string" (um caractere por byte).
 */
export function pdfComprovanteAssinado(
  titulo: string,
  linhas: LinhaComprovante[],
  cert: CertificadoA1,
  agora: Date = new Date(),
): string {
  // Conteúdo da página
  let y = 790;
  const ops: string[] = ["BT", "/F2 13 Tf", `50 ${y} Td`, `(${textoPdf(titulo)}) Tj`, "ET"];
  y -= 34;
  for (const [rotulo, valor] of linhas) {
    ops.push("BT", "/F2 8 Tf", `50 ${y} Td`, `(${textoPdf(rotulo.toUpperCase())}) Tj`, "ET");
    y -= 13;
    const pedacos = rotulo.toLowerCase().includes("hash") ? quebrar(valor, 64) : [valor];
    for (const p of pedacos) {
      ops.push(
        "BT",
        rotulo.toLowerCase().includes("hash") ? "/F3 10 Tf" : "/F1 11 Tf",
        `50 ${y} Td`,
        `(${textoPdf(p)}) Tj`,
        "ET",
      );
      y -= 14;
    }
    y -= 8;
  }
  ops.push(
    "BT",
    "/F1 8 Tf",
    `50 ${Math.max(y - 10, 40)} Td`,
    `(${textoPdf(`Documento assinado digitalmente com certificado ICP-Brasil de ${cert.info.titular}.`)}) Tj`,
    "ET",
  );
  const conteudo = ops.join("\n");

  const placeholderBR = "/ByteRange [0 0000000000 0000000000 0000000000]";
  const objetos: string[] = [
    "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R] /SigFlags 3 >> >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 7 0 R /F3 9 0 R >> >> /Contents 6 0 R /Annots [5 0 R] >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Annot /Subtype /Widget /FT /Sig /T (Assinatura) /Rect [0 0 0 0] /F 132 /P 3 0 R /V 8 0 R >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached ${placeholderBR} /Contents <${"0".repeat(TAM_ASSINATURA * 2)}> /M (${dataPdf(agora)}) /Name (${textoPdf(cert.info.titular)}) /Reason (Comprovante de Registro de Ponto do Trabalhador) >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
  ];

  let pdf = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  const posicoes: number[] = [];
  objetos.forEach((o, i) => {
    posicoes.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posicoes) pdf += `${String(p).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // ByteRange: tudo menos o valor de /Contents <...>
  const ini = pdf.indexOf("/Contents <") + "/Contents ".length;
  const fim = pdf.indexOf(">", ini) + 1;
  const br = `/ByteRange [0 ${String(ini).padStart(10, "0")} ${String(fim).padStart(10, "0")} ${String(pdf.length - fim).padStart(10, "0")}]`;
  if (br.length !== placeholderBR.length) throw new Error("Falha ao montar o PDF");
  pdf = pdf.replace(placeholderBR, br);

  const assinado = pdf.slice(0, ini) + pdf.slice(fim);
  const cms = assinarDestacado(assinado, cert, { momento: null });
  if (cms.length > TAM_ASSINATURA) throw new Error("Assinatura maior que o espaço reservado");
  let hex = "";
  for (let i = 0; i < cms.length; i++) hex += cms.charCodeAt(i).toString(16).padStart(2, "0");
  return pdf.slice(0, ini) + `<${hex.padEnd(TAM_ASSINATURA * 2, "0")}>` + pdf.slice(fim);
}
