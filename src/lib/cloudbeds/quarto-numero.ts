/** "APT 001", "001", "Apto 1" → "1" (comparação de número de quarto entre o app e o Cloudbeds). */
export function chaveQuarto(valor: unknown): string {
  const t = String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\b(APT|APTO|APARTAMENTO|QUARTO|ROOM)\b/g, "")
    .trim();
  const digitos = t.replace(/\D+/g, "").replace(/^0+/, "");
  return digitos || t.replace(/\s+/g, " ");
}
