// Termo do ponto oficial (REP-P) e da biometria, aceito pelo próprio funcionário no app.
// Mudou o texto? Troque a versão: todos aceitam de novo.
export const TERMO_PONTO_VERSAO = "2026-11-oficial-v1";

export const TERMO_PONTO_TEXTO =
  "Declaro estar ciente de que o aplicativo da IN.JOY Hostel Design Pousada é o sistema de registro " +
  "eletrônico de ponto da empresa (REP-P, Portaria MTP nº 671/2021). Em cada marcação são gravados, " +
  "com a hora oficial do servidor: meu CPF, a data e a hora, a unidade, a localização do aparelho e " +
  "uma foto do momento. As marcações não podem ser alteradas nem apagadas; ajustes são feitos à parte, " +
  "com motivo, e ficam registrados. Recebo no aplicativo o comprovante de cada marcação e posso consultar " +
  "o meu espelho de ponto. Autorizo o uso de um modelo numérico do meu rosto (dado biométrico, LGPD art. 11) " +
  "exclusivamente para confirmar a minha identidade nas marcações. Posso pedir a exclusão do cadastro " +
  "biométrico a qualquer momento; nesse caso o ponto será marcado por outro meio indicado pela empresa. " +
  "As marcações e os dados exigidos por lei são guardados pelo prazo legal.";

export async function sha256Texto(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
