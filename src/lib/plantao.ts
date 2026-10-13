// Regras puras dos plantões de freelancer (dias "extra" da Escala) usadas no Financeiro e na Previsão.

export type MotivoChamada = "reforco_ocupacao" | "cobertura_falta" | "outro";

export const MOTIVO_CHAMADA: Record<MotivoChamada, string> = {
  reforco_ocupacao: "Reforço",
  cobertura_falta: "Cobertura de falta",
  outro: "Outro",
};

/** "07:30" + 8 h → "15:30" (passa da meia-noite volta ao início do dia). */
export function horaSaida(entrada: string, horas: number): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(entrada ?? "");
  if (!m || !(horas > 0)) return "";
  const total = (Number(m[1]) * 60 + Number(m[2]) + Math.round(horas * 60)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** origem_escala do Financeiro: "<colaborador_id>:<competência YYYY-MM-01>:<unidade>". */
export function lerOrigemEscala(
  origem: string | null | undefined,
): { colaboradorId: string; mes: string; unidade: "Botafogo" | "Ipanema" } | null {
  const m = /^([0-9a-f-]{36}):(\d{4}-\d{2})-\d{2}:(Botafogo|Ipanema)$/i.exec(String(origem ?? ""));
  return m ? { colaboradorId: m[1], mes: m[2], unidade: m[3] as "Botafogo" | "Ipanema" } : null;
}

export function limitesMes(mes: string): { inicio: string; fim: string } {
  const [a, m] = mes.split("-").map(Number);
  return { inicio: `${mes}-01`, fim: new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) };
}

export type DadosPlantao = {
  data: string;
  valor: number | null;
  horas: number | null;
  entrada: string;
};

/** Confere o formulário antes de salvar; devolve a mensagem do primeiro problema. */
export function validarPlantao(p: DadosPlantao): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data)) return "Escolha a data.";
  if (p.valor == null || !Number.isFinite(p.valor) || p.valor < 0) return "Informe o valor.";
  if (p.horas == null || !Number.isFinite(p.horas) || p.horas <= 0 || p.horas > 24)
    return "Informe as horas (entre 1 e 24).";
  if (!/^\d{2}:\d{2}$/.test(p.entrada)) return "Informe o horário de entrada.";
  return null;
}
