// Servidor: certificado A1 do empregador e assinaturas do ponto oficial.
// O .pfx fica em public.ponto_certificado (só o service_role lê); a senha é o segredo
// CERT_A1_SENHA do Lovable (nunca vai para o banco nem para o navegador).
import process from "node:process";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { abrirPfx, type CertificadoA1 } from "@/lib/assinatura-cms";

export function senhaCertificado(): string {
  const senha = process.env.CERT_A1_SENHA;
  if (!senha)
    throw new Error(
      "A senha do certificado não está configurada. No Lovable, crie o segredo CERT_A1_SENHA com a senha do arquivo .pfx.",
    );
  return senha;
}

export async function carregarCertificado(): Promise<CertificadoA1> {
  const db = supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          k: string,
          v: number,
        ) => {
          maybeSingle: () => Promise<{
            data: { pfx_base64: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await db
    .from("ponto_certificado")
    .select("pfx_base64")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ler o certificado: ${error.message}`);
  if (!data) throw new Error("Nenhum certificado enviado. Envie o e-CNPJ A1 na aba Fiscalização.");
  return abrirPfx(data.pfx_base64, senhaCertificado());
}

export async function gravarCertificado(pfxBase64: string, userId: string) {
  const cert = abrirPfx(pfxBase64, senhaCertificado());
  if (new Date(cert.info.validoAte) < new Date()) throw new Error("Este certificado está vencido.");
  const db = supabaseAdmin as unknown as {
    from: (t: string) => {
      upsert: (r: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  const { error } = await db.from("ponto_certificado").upsert({
    id: 1,
    pfx_base64: pfxBase64,
    titular: cert.info.titular,
    documento: cert.info.documento,
    emissor: cert.info.emissor,
    valido_de: cert.info.validoDe,
    valido_ate: cert.info.validoAte,
    enviado_em: new Date().toISOString(),
    enviado_por: userId,
  });
  if (error) throw new Error(`Não foi possível gravar o certificado: ${error.message}`);
  return cert.info;
}
