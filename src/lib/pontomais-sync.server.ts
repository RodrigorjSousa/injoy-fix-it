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

/** Busca o Pontomais do mês atual para os participantes da meta e recalcula atrasos/faltas. */
export async function atualizarMetaEquipe(): Promise<{
  pontomais: PontomaisSyncResult[];
  ocorrencias: number;
  pontomaisErro?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { todaySP } = await import("./tz");
  const hoje = todaySP();
  const inicio = `${hoje.slice(0, 7)}-01`;

  const { data: participantes, error } = await (supabaseAdmin as any)
    .from("bonus_meta_participantes")
    .select("funcionario_id")
    .eq("ativo", true);
  if (error) throw new Error(error.message);
  const ids = ((participantes ?? []) as { funcionario_id: string }[]).map((p) => p.funcionario_id);

  let pontomais: PontomaisSyncResult[] = [];
  let pontomaisErro: string | undefined;
  if (ids.length) {
    try {
      pontomais = await syncPontomaisCore({ funcionarioIds: ids, startDate: inicio, endDate: hoje, somenteVinculados: true });
    } catch (e) {
      // Sem Pontomais (token ausente/fora do ar) ainda recalculamos com o ponto do app.
      pontomaisErro = e instanceof Error ? e.message : String(e);
    }
  }

  const { data: qtd, error: apErr } = await (supabaseAdmin as any).rpc("bonus_meta_apurar", { _mes: inicio });
  if (apErr) throw new Error(apErr.message);
  return { pontomais, ocorrencias: Number(qtd ?? 0), pontomaisErro };
}
