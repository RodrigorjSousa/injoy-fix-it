// Assinatura digital com certificado A1 (ICP-Brasil, arquivo .pfx/.p12).
//
// * CAdES-BES destacado (arquivo .p7s): CMS SignedData sem o conteúdo, SHA-256 + RSA, com os
//   atributos assinados contentType, messageDigest, signingCertificateV2 (RFC 5035) e, no .p7s,
//   signingTime. É o formato que a Portaria 671 pede para o AFD.
// * O mesmo CMS (sem signingTime) é usado na assinatura PAdES do comprovante em PDF.
// Feito com node-forge (JavaScript puro): roda no servidor (Cloudflare Workers) e nos testes.
import forge from "node-forge";

const { asn1, pki, md, pkcs12, util } = forge;
type Asn1 = forge.asn1.Asn1;

const OID = {
  data: "1.2.840.113549.1.7.1",
  signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingTime: "1.2.840.113549.1.9.5",
  signingCertificateV2: "1.2.840.113549.1.9.16.2.47",
  sha256: "2.16.840.1.101.3.4.2.1",
  rsaEncryption: "1.2.840.113549.1.1.1",
  sha256WithRSA: "1.2.840.113549.1.1.11",
};

const U = asn1.Class.UNIVERSAL;
const T = asn1.Type;
const oid = (o: string) => asn1.create(U, T.OID, false, asn1.oidToDer(o).getBytes());
const seq = (itens: Asn1[]) => asn1.create(U, T.SEQUENCE, true, itens);
const set = (itens: Asn1[]) => asn1.create(U, T.SET, true, itens);
const octet = (bytes: string) => asn1.create(U, T.OCTETSTRING, false, bytes);
const inteiro = (bytes: string) => asn1.create(U, T.INTEGER, false, bytes);
const nulo = () => asn1.create(U, T.NULL, false, "");
const algId = (o: string) => seq([oid(o), nulo()]);
const der = (a: Asn1) => asn1.toDer(a).getBytes();

/** Número de série do certificado como INTEGER DER (positivo). */
function serialInteiro(hex: string): Asn1 {
  let bytes = util.hexToBytes(hex.length % 2 ? `0${hex}` : hex);
  if (bytes.charCodeAt(0) & 0x80) bytes = `\x00${bytes}`;
  return inteiro(bytes);
}

export type CertificadoA1 = {
  chave: forge.pki.rsa.PrivateKey;
  certificado: forge.pki.Certificate;
  cadeia: forge.pki.Certificate[];
  info: InfoCertificado;
};

export type InfoCertificado = {
  titular: string;
  /** CNPJ (14) ou CPF (11) encontrado no certificado, se houver. */
  documento: string | null;
  emissor: string;
  validoDe: string;
  validoAte: string;
};

const nomeComum = (attrs: forge.pki.Certificate["subject"]) =>
  String(attrs.getField("CN")?.value ?? attrs.attributes.map((a) => a.value).join(", "));

/** Abre o .pfx (bytes em "binary string" ou base64) com a senha. */
export function abrirPfx(pfx: string, senha: string, base64 = true): CertificadoA1 {
  const bytes = base64 ? util.decode64(pfx) : pfx;
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = pkcs12.pkcs12FromAsn1(asn1.fromDer(bytes), false, senha);
  } catch {
    throw new Error("Não foi possível abrir o certificado: arquivo inválido ou senha errada.");
  }
  const chaves = [
    ...(p12.getBags({ bagType: pki.oids.pkcs8ShroudedKeyBag })[pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: pki.oids.keyBag })[pki.oids.keyBag] ?? []),
  ];
  const chave = chaves.find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  const certs = (p12.getBags({ bagType: pki.oids.certBag })[pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);
  if (!chave || !certs.length) throw new Error("O arquivo não tem chave privada e certificado.");
  // O certificado do titular é o que corresponde à chave privada
  const certificado =
    certs.find((c) => {
      const pub = c.publicKey as forge.pki.rsa.PublicKey;
      return pub.n?.equals?.(chave.n);
    }) ?? certs[0];
  const cadeia = certs.filter((c) => c !== certificado);
  const cn = nomeComum(certificado.subject);
  // e-CNPJ ICP-Brasil: CN = "RAZAO SOCIAL:12345678000190"; e-CPF: "NOME:12345678900"
  const doc = cn.match(/:(\d{14}|\d{11})\s*$/)?.[1] ?? null;
  return {
    chave,
    certificado,
    cadeia,
    info: {
      titular: cn.replace(/:\d{11,14}\s*$/, ""),
      documento: doc,
      emissor: nomeComum(certificado.issuer),
      validoDe: certificado.validity.notBefore.toISOString(),
      validoAte: certificado.validity.notAfter.toISOString(),
    },
  };
}

/**
 * CMS SignedData destacado (DER, "binary string") sobre `conteudo` ("binary string").
 * `momento`: incluir o atributo signingTime (CAdES .p7s sim; PAdES não).
 */
export function assinarDestacado(
  conteudo: string,
  cert: CertificadoA1,
  opcoes: { momento?: Date | null } = {},
): string {
  const { certificado, cadeia, chave } = cert;
  if (new Date() > certificado.validity.notAfter)
    throw new Error("O certificado digital está vencido.");

  const resumo = md.sha256.create();
  resumo.update(conteudo);
  const certDer = der(pki.certificateToAsn1(certificado));
  const hashCert = md.sha256.create();
  hashCert.update(certDer);
  // distinguishedNameToAsn1 existe no node-forge, mas não está nos tipos (@types/node-forge)
  const emissor = (
    pki as unknown as { distinguishedNameToAsn1: (dn: forge.pki.Certificate["issuer"]) => Asn1 }
  ).distinguishedNameToAsn1(certificado.issuer);
  const serial = serialInteiro(certificado.serialNumber);

  // signingCertificateV2 { certs SEQUENCE OF ESSCertIDv2 { certHash, issuerSerial } }
  const essCertIdV2 = seq([
    octet(hashCert.digest().getBytes()),
    seq([seq([asn1.create(asn1.Class.CONTEXT_SPECIFIC, 4, true, [emissor])]), serial]),
  ]);
  const atributo = (tipo: string, valor: Asn1) => seq([oid(tipo), set([valor])]);
  const atributos = [
    atributo(OID.contentType, oid(OID.data)),
    atributo(OID.messageDigest, octet(resumo.digest().getBytes())),
    atributo(OID.signingCertificateV2, seq([seq([essCertIdV2])])),
  ];
  if (opcoes.momento)
    atributos.push(
      atributo(
        OID.signingTime,
        asn1.create(U, T.UTCTIME, false, asn1.dateToUtcTime(opcoes.momento)),
      ),
    );
  // DER: elementos de SET OF em ordem crescente da codificação
  const ordenados = atributos
    .map((a) => ({ a, d: der(a) }))
    .sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0))
    .map((x) => x.a);

  const assinarSobre = md.sha256.create();
  assinarSobre.update(der(set(ordenados)));
  const assinatura = chave.sign(assinarSobre);

  const signerInfo = seq([
    inteiro("\x01"),
    seq([emissor, serial]),
    algId(OID.sha256),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, ordenados),
    algId(OID.rsaEncryption),
    octet(assinatura),
  ]);
  const signedData = seq([
    inteiro("\x01"),
    set([algId(OID.sha256)]),
    seq([oid(OID.data)]),
    asn1.create(
      asn1.Class.CONTEXT_SPECIFIC,
      0,
      true,
      [certificado, ...cadeia].map((c) => pki.certificateToAsn1(c)),
    ),
    set([signerInfo]),
  ]);
  return der(
    seq([oid(OID.signedData), asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData])]),
  );
}

export const binarioParaBase64 = (b: string) => util.encode64(b);
export const base64ParaBinario = (b: string) => util.decode64(b);
/** Uint8Array → "binary string" (um caractere por byte). */
export function bytesParaBinario(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
}
