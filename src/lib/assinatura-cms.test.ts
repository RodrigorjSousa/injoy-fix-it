import forge from "node-forge";
import { describe, expect, it } from "vitest";
import { abrirPfx, assinarDestacado } from "@/lib/assinatura-cms";
import { pdfComprovanteAssinado } from "@/lib/pdf-comprovante";
import {
  AC_TESTE_PEM,
  PFX_TESTE_AES,
  PFX_TESTE_LEGADO,
  SENHA_TESTE,
} from "@/lib/__fixtures__/certificado-teste";

describe("certificado A1", () => {
  it.each([
    ["AES (OpenSSL 3)", PFX_TESTE_AES],
    ["legado 3DES/RC2", PFX_TESTE_LEGADO],
  ])("abre .pfx %s e lê titular e CNPJ", (_, pfx) => {
    const c = abrirPfx(pfx, SENHA_TESTE);
    expect(c.info.titular).toBe("IN.JOY HOSTEL DESIGN POUSADA LTDA");
    expect(c.info.documento).toBe("12345678000190");
    expect(c.info.emissor).toBe("AC TESTE INJOY");
    expect(c.cadeia).toHaveLength(1);
  });
  it("senha errada dá mensagem clara", () => {
    expect(() => abrirPfx(PFX_TESTE_AES, "errada")).toThrow(/senha errada/);
  });
});

describe("CAdES destacado", () => {
  const cert = abrirPfx(PFX_TESTE_AES, SENHA_TESTE);
  const conteudo = "000000000123\r\nlinha \xc1\r\n";
  const p7s = assinarDestacado(conteudo, cert, { momento: new Date("2026-11-02T19:00:00Z") });
  const msg = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(p7s)) as unknown as {
    rawCapture: { authenticatedAttributes: forge.asn1.Asn1[]; signature: string };
    certificates: forge.pki.Certificate[];
  };

  it("traz os atributos assinados e o certificado", () => {
    const oids = msg.rawCapture.authenticatedAttributes.map((a) =>
      forge.asn1.derToOid((a.value as forge.asn1.Asn1[])[0].value as string),
    );
    expect(oids.sort()).toEqual(
      [
        "1.2.840.113549.1.9.3",
        "1.2.840.113549.1.9.4",
        "1.2.840.113549.1.9.5",
        "1.2.840.113549.1.9.16.2.47",
      ].sort(),
    );
    expect(msg.certificates.length).toBe(2);
  });

  it("a assinatura confere com a chave pública e o resumo do conteúdo", () => {
    const attrsSet = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      msg.rawCapture.authenticatedAttributes,
    );
    const h = forge.md.sha256.create();
    h.update(forge.asn1.toDer(attrsSet).getBytes());
    const pub = cert.certificado.publicKey as forge.pki.rsa.PublicKey;
    expect(pub.verify(h.digest().getBytes(), msg.rawCapture.signature)).toBe(true);
    const ac = forge.pki.certificateFromPem(AC_TESTE_PEM);
    expect(ac.verify(cert.certificado)).toBe(true);
  });
});

describe("PDF PAdES", () => {
  it("reserva o ByteRange e embute a assinatura", () => {
    const cert = abrirPfx(PFX_TESTE_AES, SENHA_TESTE);
    const pdf = pdfComprovanteAssinado("Comprovante", [["Trabalhador", "FLÁVIO (teste)"]], cert);
    expect(pdf.startsWith("%PDF-1.7")).toBe(true);
    const br = pdf.match(/\/ByteRange \[0 (\d+) (\d+) (\d+)\]/)!;
    const [a, b, c] = br.slice(1).map(Number);
    expect(b + c).toBe(pdf.length);
    expect(pdf[a]).toBe("<");
    expect(pdf[b - 1]).toBe(">");
    expect(pdf).toContain("/SubFilter /ETSI.CAdES.detached");
    expect(pdf).toContain("(FL\xc1VIO \\(teste\\))");
  });
});
