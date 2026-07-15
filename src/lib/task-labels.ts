// Rótulos canônicos das tarefas de camareira. Cloudbeds (via consolidar-dados) é
// a fonte da verdade — este helper apenas normaliza o texto para exibição
// consistente entre o painel das Camareiras e o painel da Recepção.

export type TaskLabel =
  | "ARRUMAÇÃO"
  | "VERIFICAÇÃO"
  | "REVISÃO CHECK IN"
  | "GERAL - CHECK-IN"
  | "GERAL"
  | "TROCA + ARRUMAÇÃO";

export function formatTaskLabel(raw: string | null | undefined): TaskLabel {
  const t = String(raw ?? "").trim().toUpperCase();
  switch (t) {
    case "TROCA":
    case "TROCA + ARRUMAÇÃO":
      return "TROCA + ARRUMAÇÃO";
    case "REVISÃO":
    case "REVISAO":
    case "REVISÃO CHECK IN":
    case "REVISAO CHECK IN":
      return "REVISÃO CHECK IN";
    case "GERAL - CHECK-IN":
    case "GERAL CHECK-IN":
    case "GERAL CHECKIN":
      return "GERAL - CHECK-IN";
    case "GERAL":
      return "GERAL";
    case "ARRUMAÇÃO":
    case "ARRUMACAO":
      return "ARRUMAÇÃO";
    case "":
    case "VERIFICAÇÃO":
    case "VERIFICACAO":
      return "VERIFICAÇÃO";
    default:
      return "VERIFICAÇÃO";
  }
}

/** Retorna true quando a tarefa exige vistoria (check-in do dia). */
export function isCheckInTask(raw: string | null | undefined): boolean {
  const label = formatTaskLabel(raw);
  return label === "REVISÃO CHECK IN" || label === "GERAL - CHECK-IN";
}
