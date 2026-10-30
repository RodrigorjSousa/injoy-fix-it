// Planilha do mês para o contador (CSV com ; e vírgula decimal, abre direto no Excel).
import { MODO_LABEL, type ResumoPessoa } from "@/lib/ponto-banco";

export const SETOR_LABEL: Record<string, string> = {
  manutencao: "Manutenção",
  recepcao: "Recepção",
  camareiras: "Camareiras",
};

export type LinhaContador = ResumoPessoa & {
  ciencia?: { ciente_em: string; comentario: string | null } | null;
};

const horasDecimais = (m: number) => (m / 60).toFixed(2).replace(".", ",");
const dataBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

export function csvContador(rows: LinhaContador[]): string {
  const linhas: string[][] = [
    [
      "Pessoa",
      "Setor",
      "Modo",
      "Previsto (h)",
      "Trabalhado (h)",
      "Extra 50% (h)",
      "Extra 100% (h)",
      "Noturno 22h-5h (h reais)",
      "Noturno (h reduzidas)",
      "Débito (h)",
      "Faltas",
      "Dias abonados",
      "Dias incompletos",
      "Jornada > 10 h",
      "Interjornada < 11 h",
      "Ajustes (h)",
      "Saldo anterior (h)",
      "Saldo do banco (h)",
      "Ciência do espelho",
    ],
    ...rows.map((p) => [
      p.nome,
      SETOR_LABEL[p.setor] ?? p.setor,
      MODO_LABEL[p.modo],
      horasDecimais(p.previsto),
      horasDecimais(p.trabalhado),
      horasDecimais(p.extra50),
      horasDecimais(p.extra100),
      horasDecimais(p.noturno),
      horasDecimais(p.noturnoReduzido),
      horasDecimais(p.debito),
      String(p.faltas),
      String(p.abonos),
      String(p.diasIncompletos),
      String(p.alertasJornadaLonga),
      String(p.alertasInterjornada),
      horasDecimais(p.ajustesPeriodo),
      horasDecimais(p.saldoAnterior),
      horasDecimais(p.saldoFinal),
      p.ciencia
        ? `Ciente em ${dataBR(p.ciencia.ciente_em)}${p.ciencia.comentario ? ` — ${p.ciencia.comentario}` : ""}`
        : "Pendente",
    ]),
  ];
  return linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
}

export function baixarCsv(conteudo: string, nome: string) {
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Resumo guardado no fechamento do mês (o que foi entregue ao contador). */
export function resumoFechamento(rows: LinhaContador[]) {
  return rows.map((p) => ({
    colaborador_id: p.colaborador_id,
    nome: p.nome,
    setor: p.setor,
    modo: p.modo,
    previsto: p.previsto,
    trabalhado: p.trabalhado,
    extra50: p.extra50,
    extra100: p.extra100,
    noturno: p.noturno,
    noturno_reduzido: p.noturnoReduzido,
    debito: p.debito,
    faltas: p.faltas,
    abonos: p.abonos,
    dias_incompletos: p.diasIncompletos,
    saldo_final: p.saldoFinal,
    ciente: !!p.ciencia,
  }));
}
