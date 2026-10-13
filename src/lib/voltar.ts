// Botão "Voltar" do app: onde aparece e para onde vai quando não há tela anterior.

/** Telas iniciais: não mostram "Voltar". */
export const TELAS_INICIAIS = ["/", "/gestor", "/boas-vindas"];

export function mostraVoltar(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return !TELAS_INICIAIS.includes(p);
}

/** Sem histórico (link aberto direto, notificação): gestor vai ao Início da Área; equipe à tela inicial. */
export function destinoSemHistorico(gestor: boolean): "/gestor" | "/" {
  return gestor ? "/gestor" : "/";
}
