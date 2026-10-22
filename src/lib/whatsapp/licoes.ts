// Lições da Joy: correções da equipe que entram no prompt como exemplos de "assim não, assim sim".
// Funções puras (testes em licoes.test.ts).

export type Licao = {
  id: string;
  situacao: string;
  resposta_errada: string | null;
  resposta_certa: string;
  motivo: string | null;
  tema: string | null;
  ativa: boolean;
  updated_at: string;
};

/** Até quantas lições entram em cada resposta (o prompt não pode crescer sem limite). */
export const MAX_LICOES_POR_RESPOSTA = 12;
const MAX_CHARS_CAMPO = 600;

const PARADAS_TEXTO =
  "a o e é de da do das dos em no na nos nas um uma uns umas para pra por com sem que se ao aos à às " +
  "me te eu você voce vc vcs nós nos ele ela eles elas meu minha seu sua isso isto esse essa este esta " +
  "tem ter tá ta está esta estou sou foi vai vou ser era como qual quais quando onde mais muito pouco " +
  "oi olá ola bom boa dia tarde noite obrigado obrigada por favor sim não nao ok então entao já ja " +
  "the a an and or of to in on for is are be it i you we they my your this that what how when where " +
  "el la los las un una y o de en para por con es que mi tu su vocês voces";

// (a lista também passa pela normalização, para "você" bater com "voce")
const PARADAS = new Set<string>();

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Radical bem simples: "quartos"/"quarto" → "quart", "pets"/"pet" → "pet". */
function radical(p: string): string {
  if (p.length <= 4) return p.replace(/s$/, "");
  const semPlural = p.replace(/(oes|aes|es|s)$/, "");
  return semPlural.length > 4 ? semPlural.replace(/[ao]$/, "") : semPlural;
}

export function palavras(texto: string): Set<string> {
  if (PARADAS.size === 0) for (const p of normalizar(PARADAS_TEXTO).split(" ")) PARADAS.add(p);
  const out = new Set<string>();
  for (const p of normalizar(texto).split(" ")) {
    if (p.length < 3 || PARADAS.has(p)) continue;
    // radical simples: tira plural/gênero para "pets"≈"pet", "quartos"≈"quarto"
    out.add(radical(p));
  }
  return out;
}

/** Quanto a lição tem a ver com o que o hóspede está falando agora (0 = nada). */
export function pontuar(licao: Licao, contexto: Set<string>): number {
  if (contexto.size === 0) return 0;
  const forte = palavras(`${licao.situacao} ${licao.tema ?? ""}`);
  const fraca = palavras(`${licao.resposta_certa} ${licao.motivo ?? ""}`);
  let pontos = 0;
  for (const p of contexto) {
    if (forte.has(p)) pontos += 2;
    else if (fraca.has(p)) pontos += 1;
  }
  return pontos;
}

/**
 * Escolhe as lições ativas que entram na resposta: se couberem todas, vão todas; senão, as mais
 * parecidas com as últimas mensagens do hóspede (empate: a mais recente).
 */
export function escolherLicoes(
  licoes: Licao[],
  textoRecente: string,
  max = MAX_LICOES_POR_RESPOSTA,
): Licao[] {
  const ativas = licoes.filter((l) => l.ativa && l.situacao.trim() && l.resposta_certa.trim());
  if (ativas.length <= max) return ativas;
  const ctx = palavras(textoRecente);
  return ativas
    .map((l) => ({ l, p: pontuar(l, ctx) }))
    .sort((a, b) => b.p - a.p || b.l.updated_at.localeCompare(a.l.updated_at))
    .slice(0, max)
    .map((x) => x.l);
}

function corta(t: string | null | undefined): string {
  const s = (t ?? "").replace(/\s+/g, " ").trim();
  return s.length > MAX_CHARS_CAMPO ? `${s.slice(0, MAX_CHARS_CAMPO)}…` : s;
}

/** Bloco do prompt com as lições escolhidas. Vazio se não houver nenhuma. */
export function textoLicoes(licoes: Licao[]): string {
  if (licoes.length === 0) return "";
  const linhas = [
    "=== LIÇÕES DA EQUIPE ===",
    "Correções reais feitas pela equipe da Injoy. Em situações parecidas, siga a resposta CERTA (o conteúdo e o jeito de falar). Nunca repita a resposta ERRADA. Se uma lição contrariar as regras absolutas, valem as regras absolutas.",
  ];
  licoes.forEach((l, i) => {
    linhas.push("");
    linhas.push(`Lição ${i + 1}${l.tema ? ` — ${corta(l.tema)}` : ""}`);
    linhas.push(`Situação (hóspede): ${corta(l.situacao)}`);
    if (l.resposta_errada?.trim()) linhas.push(`ERRADO: ${corta(l.resposta_errada)}`);
    linhas.push(`CERTO: ${corta(l.resposta_certa)}`);
    if (l.motivo?.trim()) linhas.push(`Por quê: ${corta(l.motivo)}`);
  });
  return linhas.join("\n");
}
