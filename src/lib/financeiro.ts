import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compression";
import { todaySP } from "@/lib/tz";
import type { Database } from "@/integrations/supabase/types";

export type Categoria = Database["public"]["Tables"]["fin_categorias"]["Row"];
export type Fornecedor = Database["public"]["Tables"]["fin_fornecedores"]["Row"];
export type Lancamento = Database["public"]["Tables"]["fin_lancamentos"]["Row"];
export type FinConfig = Database["public"]["Tables"]["fin_config"]["Row"];
export type TipoLancamento = "despesa" | "receita";
export type UnidadeFinanceira = "Botafogo" | "Ipanema" | "Ambas";
export type FiltroUnidade = "Botafogo" | "Ipanema" | "Consolidado";

export const GRUPOS: Record<string, string> = {
  custo_fixo_operacional: "Custo fixo operacional", pessoal: "Pessoal", manutencao: "Manutenção",
  insumos_operacao: "Insumos da operação", comercial: "Comercial", impostos_taxas: "Impostos e taxas",
  administrativo: "Administrativo", receita: "Receita",
};
export const FORMAS: Record<string, string> = {
  pix: "PIX", boleto: "Boleto", cartao: "Cartão", dinheiro: "Dinheiro",
  transferencia: "Transferência", debito_automatico: "Débito automático",
};
export const STATUS: Record<string, string> = { previsto: "Previsto", a_pagar: "A pagar", pago: "Pago", cancelado: "Cancelado", vencido: "Vencido" };
export const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const dateBR = (value: string | null) => value ? value.split("-").reverse().join("/") : "—";
export const monthNow = () => todaySP().slice(0, 7);
export const statusReal = (l: Lancamento) => l.status === "a_pagar" && !!l.data_vencimento && l.data_vencimento < todaySP() ? "vencido" : l.status;
export const monthNext = (date: string) => { const [y,m]=date.split("-").map(Number); const d=new Date(Date.UTC(y,m,1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-01`; };
export function valorRateado(l: Lancamento, unidade: FiltroUnidade, config: FinConfig | null) {
  const value=Number(l.valor); if (unidade === "Consolidado" || l.unidade !== "Ambas") return value;
  const pct=unidade === "Botafogo" ? config?.rateio_botafogo_pct ?? 61.3 : config?.rateio_ipanema_pct ?? 38.7;
  return value * Number(pct) / 100;
}
export async function uploadFinanceFile(file: File) {
  const { data, error } = await supabase.auth.getUser(); if (error || !data.user) throw new Error("Sessão expirada.");
  const image=file.type.startsWith("image/"); const upload=image ? await compressImage(file) : file;
  if (!image && file.type !== "application/pdf") throw new Error("Envie uma imagem ou PDF.");
  if (upload.size > 20*1024*1024) throw new Error("Arquivo maior que 20 MB.");
  const ext=upload.name.split(".").pop()?.toLowerCase() || (image ? "jpg" : "pdf");
  const path=`${data.user.id}/${crypto.randomUUID()}.${ext}`;
  const result=await supabase.storage.from("financeiro").upload(path, upload, { contentType: upload.type, upsert:false });
  if (result.error) throw result.error; return path;
}
export async function openFinanceFile(path: string) {
  const { data,error }=await supabase.storage.from("financeiro").createSignedUrl(path, 300);
  if (error) throw error; window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
