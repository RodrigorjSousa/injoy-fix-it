import type { Unidade } from "@/lib/store";

const IPANEMA: Record<string, string> = {
  "307": "Suíte Twin",
  "001": "Estúdio Standard Twin",
  "104": "Estúdio Triplo Standard",
  "002": "Estúdio Triplo Standard",
  "103": "Loft Queen",
  "205": "Loft Queen",
  "309": "Loft Queen",
  "308": "Loft Twin",
  "206": "Estúdio Familia",
  "411": "Mezanino Queen Varanda",
  "412": "Mezanino Queen Varanda",
  "410": "Mezanino Twin",
};

const BOTAFOGO: Record<string, string> = {
  "107": "Suíte Standard Queen",
  "110": "Suíte Standard Queen",
  "001": "Suíte Standard Twin",
  "006": "Suíte Standard Twin",
  "118": "Suíte Standard Twin",
  "108": "Suíte Superior Queen",
  "109": "Suíte Superior Queen",
  "113": "Suíte Superior Queen",
  "114": "Suíte Superior Queen",
  "111": "Suíte Superior Queen",
  "112": "Suíte Tripla",
  "002": "Estúdio Standard",
  "003": "Estúdio Standard",
  "115": "Estúdio Standard",
  "401": "Estúdio Superior",
  "005": "Apartamento Superior",
  "117": "Apartamento Superior",
  "301": "Apartamento Deluxe",
  "501": "Apartamento Deluxe",
};

export function padQuarto(num: string | number): string {
  return String(num).padStart(3, "0");
}

export function getTipoQuarto(unidade: Unidade, quarto: string | number): string {
  const key = padQuarto(quarto);
  const map = unidade === "Ipanema" ? IPANEMA : BOTAFOGO;
  return map[key] ?? "Standard";
}

export function formatQuartoTitulo(unidade: Unidade, quarto: string | number): string {
  const key = padQuarto(quarto);
  return `Quarto ${key} - ${getTipoQuarto(unidade, key)}`;
}
