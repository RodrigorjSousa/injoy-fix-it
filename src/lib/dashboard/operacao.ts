// Operação de hoje por unidade, a partir de room_housekeeping (mesma regra da tela inicial).

export type SituacaoQuarto = "prontos" | "emFaxina" | "sujos" | "bloqueados";

export type LinhaQuarto = {
  property: string;
  status: string | null;
  service_status: string | null;
  condition: string | null;
  guest_name: string | null;
  departing_guest_name: string | null;
  next_guest_name: string | null;
  has_pending_payment: boolean | null;
  pending_payment_amount: number | null;
  has_pending_docs: boolean | null;
  updated_at: string;
};

/** Igual a classifyRoom da tela inicial (boas-vindas.tsx). */
export function situacaoQuarto(r: Pick<LinhaQuarto, "status" | "service_status" | "condition">): SituacaoQuarto {
  if (r.condition === "maintenance") return "bloqueados";
  if (r.service_status === "done") return "prontos";
  if (r.service_status === "in_progress") return "emFaxina";
  if (r.status === "clean") return "prontos";
  if (r.status === "cleaning") return "emFaxina";
  return "sujos";
}

export type ResumoOperacao = {
  quartos: number;
  vendaveis: number;
  ocupados: number;
  ocupacao: number; // 0..1 sobre os vendáveis
  prontos: number;
  emFaxina: number;
  sujos: number;
  bloqueados: number;
  chegadas: number;
  saidas: number;
  aReceber: number;
  comSaldo: number;
  docsPendentes: number;
  atualizadoEm: string | null;
};

export function resumoOperacao(linhas: LinhaQuarto[], unidade: string): ResumoOperacao {
  const q = linhas.filter((l) => l.property === unidade);
  const cont = { prontos: 0, emFaxina: 0, sujos: 0, bloqueados: 0 };
  for (const l of q) cont[situacaoQuarto(l)] += 1;
  const vendaveis = q.length - cont.bloqueados;
  const ocupados = q.filter((l) => !!l.guest_name && l.condition !== "maintenance").length;
  const comSaldo = q.filter((l) => l.has_pending_payment === true);
  const atualizado = q.map((l) => l.updated_at).filter(Boolean).sort().at(-1) ?? null;
  return {
    quartos: q.length,
    vendaveis,
    ocupados,
    ocupacao: vendaveis > 0 ? Math.min(1, ocupados / vendaveis) : 0,
    ...cont,
    chegadas: q.filter((l) => !!l.next_guest_name).length,
    saidas: q.filter((l) => !!l.departing_guest_name).length,
    aReceber: Math.round(comSaldo.reduce((s, l) => s + (Number(l.pending_payment_amount) || 0), 0) * 100) / 100,
    comSaldo: comSaldo.length,
    docsPendentes: q.filter((l) => l.has_pending_docs === true).length,
    atualizadoEm: atualizado,
  };
}
