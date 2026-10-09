import { supabase } from "@/integrations/supabase/client";

const SESSION_MESSAGE = "Sua sessão expirou. Entre novamente para atualizar os dados do Cloudbeds.";

/** Always send the user's token; retry a rejected session once, never with the public key. */
async function chamarCloudbeds(name: string, method: "GET" | "POST") {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error(SESSION_MESSAGE);

  const invoke = (token: string) => supabase.functions.invoke(name, {
    method,
    ...(method === "POST" ? { body: {} } : {}),
    headers: { Authorization: `Bearer ${token}` },
  });

  let result = await invoke(data.session.access_token);
  if (result.error?.context?.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session?.access_token) throw new Error(SESSION_MESSAGE);
    result = await invoke(refreshed.data.session.access_token);
    if (result.error?.context?.status === 401) throw new Error(SESSION_MESSAGE);
  }
  if (result.error) throw result.error;
  if (result.data?.success === false) {
    throw new Error(result.data.error || "Falha na sincronização com Cloudbeds.");
  }
  return result.data;
}

export function sincronizarCloudbeds() {
  return chamarCloudbeds("consolidar-dados", "POST");
}

export function buscarRecepcaoCloudbeds(unidade: "Botafogo" | "Ipanema") {
  return chamarCloudbeds(`dados-recepcao?property=${encodeURIComponent(unidade)}`, "GET");
}