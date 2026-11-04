// Regras puras das portas do totem (sem banco nem rede), com testes em portas.test.ts.
//
// Três tipos de fechadura em `tuya_devices.fornecedor`:
//   - tuya / ttlock: a senha é gerada na hora pela edge function tuya-password;
//   - manual: fechadura com teclado sem integração (ex.: 108, 301, 401, 501 de
//     Botafogo). A senha é fixa, cadastrada pelo gestor em `senha_fixa`, e o
//     totem só a mostra. Nunca vai para a edge function.

import type { Hospede } from "./regras";

export type Fechadura = {
  device_id: string;
  tipo: string;
  label: string;
  room_number: string | null;
  senha_fixa: string | null;
  fornecedor?: string | null;
};

/** senha = senha própria da porta; mesma = abre com a senha principal; nenhum dos dois = sem senha (equipe abre). */
export type Porta = { label: string; tipo: string; senha: string | null; mesma: boolean };

export const ehManual = (f: Pick<Fechadura, "fornecedor">) => f.fornecedor === "manual";

/** Senha fixa de uma fechadura manual (só dígitos), ou null se o gestor ainda não cadastrou. */
export function senhaManual(f: Fechadura): string | null {
  if (!ehManual(f)) return null;
  const s = (f.senha_fixa ?? "").replace(/\D/g, "");
  return s.length >= 4 ? s : null;
}

/** O quarto tem como abrir: fechadura integrada, ou manual com a senha cadastrada. */
export const quartoAtendido = (f: Fechadura | null) => !!f && (!ehManual(f) || !!senhaManual(f));

/** Aparelhos que recebem senha gerada (vão para a edge function). */
export const integradas = (fs: Fechadura[]) => fs.filter((f) => !ehManual(f));

/**
 * Monta a senha principal e a lista de portas.
 * - Principal: a senha gerada no quarto integrado; sem quarto integrado (quarto
 *   manual), a senha fixa do quarto.
 * - Cada porta mostra a própria senha quando ela é diferente da principal (ex.:
 *   quarto manual com os portões na senha gerada).
 * - Quarto com senha própria vira tipo "quarto_senha_fixa", para a tela listar.
 */
export function montarSenha(usadas: Fechadura[], senhas: Record<string, string>): { senha: string; portas: Porta[] } {
  const senhaDe = (f: Fechadura): string | null =>
    ehManual(f) ? senhaManual(f) : (senhas[f.device_id] ?? (f.tipo !== "quarto" ? f.senha_fixa : null) ?? null);
  const quartos = usadas.filter((f) => f.tipo === "quarto");
  const principal =
    quartos.filter((f) => !ehManual(f)).map(senhaDe).find(Boolean) ??
    quartos.map(senhaDe).find(Boolean) ??
    usadas.map(senhaDe).find(Boolean) ??
    "";
  const portas = usadas.map((f): Porta => {
    const s = senhaDe(f);
    const mesma = !!s && s === principal;
    const tipo = f.tipo === "quarto" && !mesma ? "quarto_senha_fixa" : f.tipo;
    return { label: f.label, tipo, senha: s && !mesma ? s : null, mesma };
  });
  return { senha: principal, portas };
}

// --------------------------------------------- senha provisória dos portões

/** Reserva que ainda vai chegar (não cancelada, não hospedada, sem check-out). */
export function aguardandoChegada(status: string): boolean {
  return ["confirmed", "not_confirmed", "confirmada", "pending"].includes(status.toLowerCase());
}

/** Cadastro prévio (check-in online) feito: o titular já tem documento na reserva. */
export function cadastroPrevioFeito(hospedes: Hospede[]): boolean {
  const titular = hospedes.find((h) => h.principal) ?? hospedes[0];
  return !!titular && titular.documentos.length > 0;
}

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Horário de São Paulo (sem horário de verão desde 2019). */
const emSP = (data: string, hora: string) => new Date(`${data}T${hora}:00-03:00`).getTime();

/**
 * Validade da senha provisória (só portões): da hora do check-in no dia da
 * chegada até a hora do check-out (12h) do dia seguinte.
 */
export function janelaProvisoria(chegada: string, horaCheckin: string, horaCheckout: string) {
  return { inicio: emSP(chegada, horaCheckin), fim: emSP(somarDias(chegada, 1), horaCheckout) };
}

/**
 * O e-mail automático do Cloudbeds com os códigos sai na véspera, no horário
 * configurado. Senha criada depois disso não vai nesse e-mail: a recepção
 * precisa mandar o modelo à mão pela reserva.
 */
export function emailAutomaticoJaSaiu(chegada: string, horaEmail: string, agoraMs: number): boolean {
  return agoraMs >= emSP(somarDias(chegada, -1), horaEmail);
}

export const amanhaDe = (hoje: string) => somarDias(hoje, 1);
