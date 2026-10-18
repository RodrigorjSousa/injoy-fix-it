// Quem recebe os avisos da RECEPÇÃO — mesma regra do menu (app-shell `podeRecepcao`):
//  - funcionário com telas liberadas individualmente → é da recepção se a lista tem "recepcao";
//  - sem lista individual → vale o papel `recepcao`.
// Antes o envio olhava só o papel, e quem entrou na recepção pela lista de telas não recebia nada.

export type PapelRow = { user_id: string | null; role: string };
export type FuncionarioTelasRow = { user_id: string | null; telas_permitidas: string[] | null };

export function usuariosDaRecepcao(
  papeis: PapelRow[],
  funcionarios: FuncionarioTelasRow[],
): string[] {
  const listaPorUsuario = new Map<string, string[] | null>();
  for (const f of funcionarios) {
    if (!f.user_id) continue;
    const atual = listaPorUsuario.get(f.user_id);
    // Mais de um cadastro para o mesmo login: basta um liberar a recepção.
    if (Array.isArray(f.telas_permitidas)) {
      listaPorUsuario.set(f.user_id, [
        ...(Array.isArray(atual) ? atual : []),
        ...f.telas_permitidas,
      ]);
    } else if (!listaPorUsuario.has(f.user_id)) {
      listaPorUsuario.set(f.user_id, null);
    }
  }
  const comPapel = new Set(
    papeis.filter((p) => p.role === "recepcao" && p.user_id).map((p) => p.user_id as string),
  );

  const saida = new Set<string>();
  for (const uid of comPapel) {
    const lista = listaPorUsuario.get(uid);
    if (!Array.isArray(lista) || lista.includes("recepcao")) saida.add(uid);
  }
  for (const [uid, lista] of listaPorUsuario) {
    if (Array.isArray(lista) && lista.includes("recepcao")) saida.add(uid);
  }
  return [...saida];
}

/** Junta listas de destinatários sem repetir. */
export function juntar(...listas: (string[] | null | undefined)[]): string[] {
  return [...new Set(listas.flatMap((l) => l ?? []).filter(Boolean))];
}
