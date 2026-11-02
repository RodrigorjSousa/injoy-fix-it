// Funções do servidor do ponto oficial: enviar o certificado A1, baixar o AFD assinado (.p7s)
// e o comprovante em PDF assinado (PAdES).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assinarDestacado, binarioParaBase64 } from "@/lib/assinatura-cms";
import { TITULO_COMPROVANTE, linhasComprovante, type Comprovante } from "@/lib/comprovante-ponto";
import { gerarAfd, nomeArquivoAfd, type EmpregadorRep, type RegistroRep } from "@/lib/ponto-afd";
import { pdfComprovanteAssinado } from "@/lib/pdf-comprovante";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function exigirGestor(supabase: Db, userId: string) {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ok = (roles ?? []).some((r: { role: string }) => r.role === "gestor" || r.role === "admin");
  if (!ok) throw new Error("Apenas gestores podem fazer isso");
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Gestor envia o .pfx (base64). O servidor confere com a senha do segredo e grava. */
export const enviarCertificadoPonto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ pfxBase64: z.string().min(100).max(60000) }).parse(i))
  .handler(async ({ data: input, context }) => {
    await exigirGestor(context.supabase, context.userId);
    const { gravarCertificado } = await import("@/lib/ponto-assinatura.server");
    return gravarCertificado(input.pfxBase64, context.userId);
  });

/** Gestor: AFD do período gerado no servidor a partir da ARP + assinatura CAdES (.p7s). */
export const afdAssinadoPonto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ inicio: data, fim: data }).parse(i))
  .handler(async ({ data: input, context }) => {
    const db = context.supabase as Db;
    await exigirGestor(db, context.userId);
    if (input.fim < input.inicio) throw new Error("A data final é antes da inicial");
    const { data: emp, error: e1 } = await db.from("ponto_empregador").select("*").limit(1);
    if (e1) throw new Error(e1.message);
    const empregador = (emp ?? [])[0] as EmpregadorRep | undefined;
    if (!empregador) throw new Error("Salve antes os dados do empregador");

    const de = new Date(`${input.inicio}T00:00:00-03:00`).toISOString();
    const ate = new Date(`${input.fim}T23:59:59.999-03:00`).toISOString();
    const registros: RegistroRep[] = [];
    for (let pag = 0; ; pag += 1000) {
      const { data: lote, error } = await db
        .from("ponto_rep_registros")
        .select("*")
        .gte("gravado_em", de)
        .lte("gravado_em", ate)
        .order("nsr")
        .range(pag, pag + 999);
      if (error) throw new Error(error.message);
      registros.push(...((lote ?? []) as RegistroRep[]).map((r) => ({ ...r, nsr: Number(r.nsr) })));
      if (!lote || lote.length < 1000) break;
    }

    const texto = gerarAfd(empregador, registros, { inicio: input.inicio, fim: input.fim });
    // ISO-8859-1: um byte por caractere
    const binario = Array.from(texto, (ch) => (ch.charCodeAt(0) < 256 ? ch : "?")).join("");
    const { carregarCertificado } = await import("@/lib/ponto-assinatura.server");
    const cert = await carregarCertificado();
    const p7s = assinarDestacado(binario, cert, { momento: new Date() });
    const nome = nomeArquivoAfd(empregador);
    return {
      nome,
      registros: registros.length,
      afdBase64: binarioParaBase64(binario),
      p7sBase64: binarioParaBase64(p7s),
      assinadoPor: cert.info.titular,
    };
  });

/** Funcionário: comprovante de uma marcação própria em PDF assinado (PAdES). */
export const comprovantePdfPonto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ nsr: z.number().int().positive() }).parse(i))
  .handler(async ({ data: input, context }) => {
    const db = context.supabase as Db;
    // A função só devolve as marcações do próprio usuário
    const { data: lista, error } = await db.rpc("ponto_meus_comprovantes");
    if (error) throw new Error(error.message);
    const c = ((lista ?? []) as Comprovante[]).find((x) => Number(x.nsr) === input.nsr);
    if (!c) throw new Error("Comprovante não encontrado (fica disponível por 7 dias)");
    const { carregarCertificado } = await import("@/lib/ponto-assinatura.server");
    const cert = await carregarCertificado();
    const pdf = pdfComprovanteAssinado(TITULO_COMPROVANTE, linhasComprovante(c), cert);
    return {
      nome: `comprovante-ponto-NSR${String(c.nsr).padStart(9, "0")}.pdf`,
      pdfBase64: binarioParaBase64(pdf),
    };
  });
