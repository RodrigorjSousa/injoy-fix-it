// Pareamento do tablet por QR code. O QR leva o link /totem?parear=CODIGO:
// - lido pela câmera do Android, abre o totem já com o código;
// - lido pela própria tela do totem (botão "Ler QR code"), funciona dentro do Fully Kiosk.

export const PARAM_PAREAR = "parear";

export function linkPareamento(origem: string, codigo: string): string {
  const base = origem.replace(/\/+$/, "");
  return `${base}/totem?${PARAM_PAREAR}=${encodeURIComponent(codigo)}`;
}

/** Aceita o link do QR ou o código digitado; devolve o código (8 letras/números) ou null. */
export function codigoDoTexto(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  let bruto = t;
  if (/^https?:\/\//i.test(t) || t.includes(`${PARAM_PAREAR}=`)) {
    const m = t.match(new RegExp(`[?&]${PARAM_PAREAR}=([^&#\\s]+)`));
    if (!m) return null;
    try {
      bruto = decodeURIComponent(m[1]);
    } catch {
      return null;
    }
  }
  const limpo = bruto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return limpo.length === 8 ? limpo : null;
}
