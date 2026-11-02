// Sincronização das batidas do Pontomais → public.registro_ponto_pontomais.
// Usada pela tela Controle de Ponto (gestor) e pela atualização automática da Meta da equipe.
import {
  buildPontomaisEmployeeMapByCpf,
  ensurePontomaisTokenConfigured,
  fetchPontomaisRegistrosByEmployeeId,
  sanitizePontomaisCpf,
} from "./pontomais.server";

export type PontomaisSyncResult = {
  funcionario_id: string;
  nome: string;
  dias: number;
  error?: string;
};

type FuncionarioRow = {
  id: string;
  nome: string;
  cpf: string | null;
  pontomais_employee_id: string | null;
};

export async function syncPontomaisCore(params: {
  funcionarioIds?: string[];
  startDate: string;
  endDate: string;
  /** Só quem tem CPF ou ID do Pontomais (evita erro para quem não usa Pontomais). */
  somenteVinculados?: boolean;
}): Promise<PontomaisSyncResult[]> {
  ensurePontomaisTokenConfigured();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let query = supabaseAdmin.from("funcionarios").select("id, nome, cpf, pontomais_employee_id");
  if (params.funcionarioIds && params.funcionarioIds.length > 0) {
    query = query.in("id", params.funcionarioIds);
  }
  const { data, error: fErr } = await query;
  if (fErr) throw new Error(fErr.message);

  let funcionarios = (data ?? []) as unknown as FuncionarioRow[];
  if (params.somenteVinculados) {
    funcionarios = funcionarios.filter(
      (f) => sanitizePontomaisCpf(f.cpf) || (f.pontomais_employee_id ?? "").trim() !== "",
    );
  }

  let pontomaisByCpf: Awaited<ReturnType<typeof buildPontomaisEmployeeMapByCpf>> | null = null;
  const results: PontomaisSyncResult[] = [];

  for (const f of funcionarios) {
    try {
      const cleanCpf = sanitizePontomaisCpf(f.cpf ?? null);
      const storedEmployeeId =
        typeof f.pontomais_employee_id === "string" && f.pontomais_employee_id.trim() !== ""
          ? f.pontomais_employee_id.trim()
          : null;

      let employeeId = storedEmployeeId;
      if (!employeeId) {
        if (!cleanCpf) {
          throw new Error("Funcionário sem CPF cadastrado. Preencha o CPF em Controle de Ponto.");
        }
        if (!pontomaisByCpf) pontomaisByCpf = await buildPontomaisEmployeeMapByCpf();
        const pontomaisEmployee = pontomaisByCpf[cleanCpf];
        if (!pontomaisEmployee) {
          throw new Error(`CPF ${cleanCpf} não encontrado na base da Pontomais`);
        }
        employeeId = pontomaisEmployee.employeeId;
        const { error: updErr } = await supabaseAdmin
          .from("funcionarios")
          .update({ pontomais_employee_id: employeeId })
          .eq("id", f.id);
        if (updErr) console.warn("[pontomais] falha ao salvar ID atualizado", updErr.message);
      }

      const { byDate } = await fetchPontomaisRegistrosByEmployeeId({
        employeeId,
        cpf: cleanCpf,
        startDate: params.startDate,
        endDate: params.endDate,
      });

      const rows = Object.entries(byDate).map(([date, reg]) => ({
        funcionario_id: f.id,
        data: date,
        entrada: reg.entrada ?? null,
        almoco_saida: reg.almoco_saida ?? null,
        almoco_retorno: reg.almoco_retorno ?? null,
        saida: reg.saida ?? null,
        ultima_atualizacao: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error: upErr } = await supabaseAdmin
          .from("registro_ponto_pontomais")
          .upsert(rows, { onConflict: "funcionario_id,data" });
        if (upErr) throw new Error(upErr.message);
      }
      results.push({ funcionario_id: f.id, nome: f.nome, dias: rows.length });
    } catch (err) {
      results.push({
        funcionario_id: f.id,
        nome: f.nome,
        dias: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

/** Dias do mês novo em que o mês anterior continua sendo conferido (ajustes de fechamento no Pontomais). */
export const DIAS_FECHAMENTO_MES_ANTERIOR = 10;

/** Meses a conferir: o pedido ou, sem pedido, o atual + o anterior nos primeiros dias do mês. */
export function mesesParaConferir(hoje: string, mes?: string): string[] {
  if (mes) return [mes.slice(0, 7)];
  const atual = hoje.slice(0, 7);
  if (Number(hoje.slice(8, 10)) > DIAS_FECHAMENTO_MES_ANTERIOR) return [atual];
  const [y, m] = atual.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return [`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, atual];
}

/** Último dia a buscar no mês: o fim do mês ou hoje, o que vier antes. */
export function fimDoMesAte(mes: string, hoje: string): string {
  const [y, m] = mes.split("-").map(Number);
  const fim = `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  return fim < hoje ? fim : hoje;
}

/**
 * Busca o Pontomais dos participantes da meta e recalcula atrasos/faltas.
 * Sem `mes`: mês atual e, até o dia 10, também o mês anterior — os ajustes feitos no Pontomais
 * na virada do mês (batida esquecida, horário corrigido) passam a valer para o fechamento.
 */
export async function atualizarMetaEquipe(mes?: string): Promise<{
  pontomais: PontomaisSyncResult[];
  ocorrencias: number;
  pontomaisErro?: string;
  meses: string[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { todaySP } = await import("./tz");
  const hoje = todaySP();
  const meses = mesesParaConferir(hoje, mes).filter((m) => `${m}-01` <= hoje);

  const { data: participantes, error } = await (supabaseAdmin as any)
    .from("bonus_meta_participantes")
    .select("funcionario_id")
    .eq("ativo", true);
  if (error) throw new Error(error.message);
  const ids = ((participantes ?? []) as { funcionario_id: string }[]).map((p) => p.funcionario_id);

  let pontomais: PontomaisSyncResult[] = [];
  let pontomaisErro: string | undefined;
  let ocorrencias = 0;
  for (const m of meses) {
    const inicio = `${m}-01`;
    if (ids.length) {
      try {
        pontomais = await syncPontomaisCore({
          funcionarioIds: ids,
          startDate: inicio,
          endDate: fimDoMesAte(m, hoje),
          somenteVinculados: true,
        });
      } catch (e) {
        // Sem Pontomais (token ausente/fora do ar) ainda recalculamos com o ponto do app.
        pontomaisErro = e instanceof Error ? e.message : String(e);
      }
    }
    const { data: qtd, error: apErr } = await (supabaseAdmin as any).rpc("bonus_meta_apurar", {
      _mes: inicio,
    });
    if (apErr) throw new Error(apErr.message);
    ocorrencias = Number(qtd ?? 0);
  }
  return { pontomais, ocorrencias, pontomaisErro, meses };
}
