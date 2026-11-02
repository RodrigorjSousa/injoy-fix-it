// Conteúdo do Comprovante de Registro de Ponto do Trabalhador (Portaria 671, art. 79-80),
// usado na tela, na impressão e no PDF assinado.
import { formatarCnpj, formatarCpf } from "@/lib/cpf";

export type Comprovante = {
  nsr: number;
  marcacao_em: string;
  gravado_em: string;
  cpf: string;
  hash: string;
  unidade: string;
  nome: string;
  local: string | null;
  empregador: string | null;
  tipo_doc: number | null;
  documento: string | null;
  cno_caepf: string | null;
  inpi: string | null;
};

export const TITULO_COMPROVANTE = "Comprovante de Registro de Ponto do Trabalhador";

export const dataHoraComprovante = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export function linhasComprovante(c: Comprovante): [string, string][] {
  return [
    ["Empregador", c.empregador ?? "—"],
    [
      c.tipo_doc === 2 ? "CPF do empregador" : "CNPJ",
      c.documento ? (c.tipo_doc === 2 ? formatarCpf(c.documento) : formatarCnpj(c.documento)) : "—",
    ],
    ...(c.cno_caepf ? ([["CNO/CAEPF", c.cno_caepf]] as [string, string][]) : []),
    ["Local de prestação", c.local ?? c.unidade],
    ["Trabalhador", c.nome],
    ["CPF", formatarCpf(c.cpf)],
    ["Data e hora da marcação", dataHoraComprovante(c.marcacao_em)],
    ["NSR", String(c.nsr).padStart(9, "0")],
    ["Registro do programa (INPI)", c.inpi ?? "em registro"],
    ["Código hash (SHA-256)", c.hash],
  ];
}
