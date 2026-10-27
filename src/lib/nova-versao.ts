// Detecta quando uma versão nova do app foi publicada (Lovable → Publicar → Atualizar).
// Celulares deixam o app aberto por dias e continuam rodando o código antigo. O HTML publicado
// cita o arquivo de entrada (/assets/index-XXXX.js); se esse arquivo não está entre os que esta
// tela carregou, existe versão nova.

const PADRAO = /\/assets\/index-[A-Za-z0-9_-]+\.js/;
const PADRAO_G = /\/assets\/index-[A-Za-z0-9_-]+\.js/g;

/** Arquivo de entrada citado no HTML publicado (o primeiro), ou null (ex.: desenvolvimento). */
export function versaoDoHtml(html: string): string | null {
  return html.match(PADRAO)?.[0] ?? null;
}

/** Todos os arquivos index-*.js que esta tela já carregou. */
export function versoesCarregadas(doc: Document = document): Set<string> {
  const urls = [
    ...Array.from(doc.querySelectorAll<HTMLScriptElement>("script[src]")).map((s) => s.src),
    ...Array.from(doc.querySelectorAll<HTMLLinkElement>("link[rel=modulepreload][href]")).map(
      (l) => l.href,
    ),
    ...(typeof performance !== "undefined" && performance.getEntriesByType
      ? performance.getEntriesByType("resource").map((e) => e.name)
      : []),
    ...Array.from(doc.querySelectorAll("script:not([src])")).map((s) => s.textContent ?? ""),
  ];
  const out = new Set<string>();
  for (const u of urls) for (const m of u.match(PADRAO_G) ?? []) out.add(m);
  return out;
}

/** true quando o site publicado aponta para um arquivo de entrada que esta tela nunca carregou. */
export function temVersaoNova(carregadas: Set<string>, publicada: string | null): boolean {
  return carregadas.size > 0 && !!publicada && !carregadas.has(publicada);
}

export async function buscarVersaoPublicada(): Promise<string | null> {
  const r = await fetch(`/?_v=${Date.now()}`, { cache: "no-store", credentials: "omit" });
  if (!r.ok) return null;
  return versaoDoHtml(await r.text());
}
