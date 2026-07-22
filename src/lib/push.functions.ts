import { createServerFn } from "@tanstack/react-start";

// Devolve a chave pública VAPID para o navegador se inscrever no push.
export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return process.env.VAPID_PUBLIC_KEY ?? "";
});
