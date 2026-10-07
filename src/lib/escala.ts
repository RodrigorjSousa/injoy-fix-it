import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateEndTime, formatCivilDate, planejarFerias, worksOnDate, type EnginePattern, type GeneratedDay } from "@/lib/escala-engine";

export type EscalaSetor = "manutencao" | "recepcao" | "camareiras";
export type EscalaUnidade = "Botafogo" | "Ipanema" | "Ambas";
export type EscalaVinculo = "fixo" | "freelance";
export type EscalaTurno = "manha" | "noite" | "dia";
export type EscalaPadraoTipo = "12x36" | "5x2_fixo" | "5x2_revezamento" | "6x1";
export type ModalidadeMotivo = "reforco_ocupacao" | "cobertura_falta" | "outro";

export interface EscalaColaborador {
  id: string;
  funcionario_id: string | null;
  nome: string;
  setor: EscalaSetor;
  unidade: EscalaUnidade;
  vinculo: EscalaVinculo;
  turno_padrao: EscalaTurno | null;
  telefone: string | null;
  ativo: boolean;
  /** Horário habitual do freelancer (sugestão ao escalar); os fixos usam o horário do padrão. */
  hora_entrada?: string | null;
  hora_saida?: string | null;
  /** Vale alimentação do mês e vale transporte por dia desta pessoa (vazio = valor padrão do quadro; 0 = não recebe). */
  vale_alimentacao?: number | null;
  vale_transporte_dia?: number | null;
  created_at: string;
  updated_at: string;
  escala_padroes?: EscalaPadrao[];
}
export interface EscalaPadrao {
  id: string;
  colaborador_id: string;
  tipo: EscalaPadraoTipo;
  hora_entrada: string | null;
  hora_saida: string | null;
  intervalo_minutos: number | null;
  data_base: string | null;
  folgas_fixas: number[];
  folga_semana_a: number | null;
  folga_semana_b: number | null;
  dias_ipanema?: number[] | null;
  proporcao_botafogo?: number | null;
  proporcao_ipanema?: number | null;
  distribuicao?: "semana" | "bloco" | null;
  vigente_desde: string;
  vigente_ate: string | null;
}
export interface EscalaModalidade {
  id: string;
  nome: string;
  motivo: ModalidadeMotivo;
  horas: number;
  valor: number;
  unidade: EscalaUnidade;
  ativo: boolean;
  ordem: number;
  updated_at: string;
  updated_by: string | null;
}
export interface FeriadoEscala {
  id: string;
  data: string;
  nome: string;
  abrangencia: "nacional" | "estadual_RJ" | "municipal_Rio";
}
export interface EscalaDia {
  id: string;
  colaborador_id: string;
  unidade: "Botafogo" | "Ipanema";
  setor: EscalaSetor;
  data: string;
  turno: EscalaTurno;
  hora_entrada: string | null;
  hora_saida: string | null;
  status: "trabalho" | "folga" | "falta" | "atestado" | "ferias" | "extra";
  origem: "gerado" | "manual";
  substitui_colaborador_id: string | null;
  motivo: string | null;
  modalidade_id: string | null;
  motivo_chamada: ModalidadeMotivo | null;
  horas_contratadas: number | null;
  valor_combinado: number | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}
export interface EscalaMes { id:string; unidade:"Botafogo"|"Ipanema"; setor:EscalaSetor; competencia:string; status:"rascunho"|"publicada"; publicada_em:string|null; publicada_por:string|null; }
export interface ColaboradorInput {
  id?: string;
  funcionario_id: string | null;
  nome: string;
  setor: EscalaSetor;
  unidade: EscalaUnidade;
  vinculo: EscalaVinculo;
  turno_padrao: EscalaTurno | null;
  telefone: string | null;
  ativo: boolean;
  hora_entrada?: string | null;
  hora_saida?: string | null;
  padrao?: Omit<EscalaPadrao, "id" | "colaborador_id" | "vigente_ate">;
}

const scheduleKeys = [["escala-colaboradores"], ["escala-modalidades"], ["escala-feriados"], ["escala-dias"], ["escala-meses"], ["escala-ferias"]] as const;
function useRefreshSchedule() {
  const queryClient = useQueryClient();
  return () => scheduleKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: [...key] }));
}

export function useEscalaColaboradores() {
  return useQuery({
    queryKey: ["escala-colaboradores"],
    queryFn: async (): Promise<EscalaColaborador[]> => {
      const { data, error } = await supabase
        .from("escala_colaboradores")
        .select("*, escala_padroes(*)")
        .order("setor")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as EscalaColaborador[];
    },
  });
}

export function useEscalaModalidades() {
  return useQuery({
    queryKey: ["escala-modalidades"],
    queryFn: async (): Promise<EscalaModalidade[]> => {
      const { data, error } = await supabase
        .from("escala_freelance_modalidades")
        .select("*")
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as EscalaModalidade[];
    },
  });
}

export function useEscalaFeriados() {
  return useQuery({
    queryKey: ["escala-feriados"],
    queryFn: async (): Promise<FeriadoEscala[]> => {
      const { data, error } = await supabase.from("feriados").select("id,data,nome,abrangencia").order("data");
      if (error) throw error;
      return (data ?? []) as FeriadoEscala[];
    },
  });
}

export function useEscalaDias(start: string, end: string) {
  return useQuery({
    queryKey: ["escala-dias", start, end],
    queryFn: async (): Promise<EscalaDia[]> => {
      const { data, error } = await supabase.from("escala_dias").select("*").gte("data", start).lte("data", end).order("data").order("turno");
      if (error) throw error;
      return (data ?? []) as EscalaDia[];
    },
  });
}

export function useEscalaMeses(competencia: string) {
  return useQuery({
    queryKey: ["escala-meses", competencia],
    queryFn: async (): Promise<EscalaMes[]> => {
      const { data, error } = await supabase.from("escala_meses").select("*").eq("competencia", competencia);
      if (error) throw error;
      return (data ?? []) as EscalaMes[];
    },
  });
}

export function useGerarEscalaMes() {
  const refresh=useRefreshSchedule();
  return useMutation({
    mutationFn: async (input:{unidade:"Botafogo"|"Ipanema";setor:EscalaSetor;competencia:string;dias:(GeneratedDay&{colaborador_id:string;turno:EscalaTurno;hora_entrada:string|null;hora_saida:string|null})[]}) => {
      const { data,error }=await supabase.rpc("escala_regenerar_mes",{_unidade:input.unidade,_setor:input.setor,_competencia:input.competencia,_dias:input.dias});
      if(error)throw error; return data;
    },onSuccess:refresh,
  });
}

export function usePublicarEscalaMes() {
  const refresh=useRefreshSchedule();
  return useMutation({mutationFn:async(input:{unidade:"Botafogo"|"Ipanema";setor:EscalaSetor;competencia:string;justificativa?:string|null})=>{const {error}=await supabase.rpc("escala_publicar_mes",{_unidade:input.unidade,_setor:input.setor,_competencia:input.competencia,_justificativa:input.justificativa??null});if(error)throw error;},onSuccess:refresh});
}

export type EscalaDiaInput=Omit<EscalaDia,"id"|"created_at"|"updated_at"|"updated_by">;
export function useSalvarEscalaDia(){
  const refresh=useRefreshSchedule();
  return useMutation({mutationFn:async(input:EscalaDiaInput)=>{const {data:auth}=await supabase.auth.getUser();const {error}=await supabase.from("escala_dias").upsert({...input,updated_by:auth.user?.id??null},{onConflict:"colaborador_id,data,turno"});if(error)throw error;},onSuccess:refresh});
}

export function useSalvarEscalaDias(){
  const refresh=useRefreshSchedule();
  return useMutation({mutationFn:async(inputs:EscalaDiaInput[])=>{const {data:auth}=await supabase.auth.getUser();const {error}=await supabase.from("escala_dias").upsert(inputs.map(input=>({...input,updated_by:auth.user?.id??null})),{onConflict:"colaborador_id,data,turno"});if(error)throw error;},onSuccess:refresh});
}

/** Apaga dias da escala e confere se o banco realmente apagou (RLS apaga 0 linhas sem erro). */
export function useExcluirEscalaDias(){
  const refresh=useRefreshSchedule();
  return useMutation({mutationFn:async(ids:string[])=>{if(!ids.length)return 0;const {data,error}=await supabase.from("escala_dias").delete().in("id",ids).select("id");if(error)throw error;if((data?.length??0)!==ids.length)throw new Error(`Só ${data?.length??0} de ${ids.length} dias foram apagados. Verifique a permissão de gestor.`);return data.length;},onSuccess:refresh});
}

export type MinhaEscalaDia={id:string;data:string;unidade:string;setor:string;turno:string;hora_entrada:string|null;hora_saida:string|null;status:string;motivo:string|null;publicada_em:string|null};
export function useMinhaEscala(start:string,end:string){return useQuery({queryKey:["minha-escala",start,end],queryFn:async():Promise<MinhaEscalaDia[]>=>{const {data,error}=await supabase.rpc("minha_escala_publicada",{_inicio:start,_fim:end});if(error)throw error;return (data??[]) as MinhaEscalaDia[];}});}

export function useSalvarEscalaFeriado() {
  const refresh = useRefreshSchedule();
  return useMutation({
    mutationFn: async (input: FeriadoEscala) => {
      const row = { data: input.data, nome: input.nome.trim(), abrangencia: input.abrangencia };
      const result = input.id ? await supabase.from("feriados").update(row).eq("id", input.id) : await supabase.from("feriados").insert(row);
      if (result.error) throw result.error;
    },
    onSuccess: refresh,
  });
}

export function useExcluirEscalaFeriado() {
  const refresh = useRefreshSchedule();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("feriados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useSalvarEscalaColaborador() {
  const refresh = useRefreshSchedule();
  return useMutation({
    mutationFn: async (input: ColaboradorInput) => {
      const row = {
        funcionario_id: input.funcionario_id,
        nome: input.nome.trim(),
        setor: input.setor,
        unidade: input.unidade,
        vinculo: input.vinculo,
        turno_padrao: input.turno_padrao,
        hora_entrada: input.vinculo === "freelance" ? input.hora_entrada || null : null,
        hora_saida: input.vinculo === "freelance" ? input.hora_saida || null : null,
        telefone: input.telefone?.trim() || null,
        ativo: input.ativo,
      };
      let colaboradorId = input.id;
      if (input.id) {
        const { error } = await supabase.from("escala_colaboradores").update(row).eq("id", input.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("escala_colaboradores").insert(row).select("id").single();
        if (error) throw error;
        colaboradorId = data.id;
      }
      if (input.vinculo === "fixo" && input.padrao && colaboradorId) {
        const { data: existing, error: findError } = await supabase
          .from("escala_padroes").select("id").eq("colaborador_id", colaboradorId).is("vigente_ate", null).maybeSingle();
        if (findError) throw findError;
        const pattern = {
          tipo: input.padrao.tipo,
          hora_entrada: input.padrao.hora_entrada || null,
          hora_saida: input.padrao.hora_saida || null,
          intervalo_minutos: input.padrao.intervalo_minutos,
          data_base: input.padrao.data_base || null,
          folgas_fixas: input.padrao.folgas_fixas,
          folga_semana_a: input.padrao.folga_semana_a,
          folga_semana_b: input.padrao.folga_semana_b,
          dias_ipanema: input.padrao.dias_ipanema?.length ? input.padrao.dias_ipanema : null,
          proporcao_botafogo: input.padrao.dias_ipanema?.length || input.padrao.distribuicao === "bloco" ? input.padrao.proporcao_botafogo ?? null : null,
          proporcao_ipanema: input.padrao.dias_ipanema?.length || input.padrao.distribuicao === "bloco" ? input.padrao.proporcao_ipanema ?? null : null,
          distribuicao: input.padrao.distribuicao === "bloco" ? "bloco" : null,
          vigente_desde: input.padrao.vigente_desde,
        };
        if (existing) {
          const { error } = await supabase.from("escala_padroes").update(pattern).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("escala_padroes").insert({ colaborador_id: colaboradorId, ...pattern });
          if (error) throw error;
        }
      }
      return colaboradorId;
    },
    onSuccess: refresh,
  });
}

export function useAlternarEscalaColaborador() {
  const refresh = useRefreshSchedule();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("escala_colaboradores").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useSalvarEscalaModalidade() {
  const refresh = useRefreshSchedule();
  return useMutation({
    mutationFn: async (input: Omit<EscalaModalidade, "updated_at" | "updated_by">) => {
      const { data: auth } = await supabase.auth.getUser();
      const row = { nome: input.nome.trim(), motivo: input.motivo, horas: input.horas, valor: input.valor, unidade: input.unidade, ativo: input.ativo, ordem: input.ordem, updated_by: auth.user?.id ?? null };
      const result = input.id
        ? await supabase.from("escala_freelance_modalidades").update(row).eq("id", input.id)
        : await supabase.from("escala_freelance_modalidades").insert(row);
      if (result.error) throw result.error;
    },
    onSuccess: refresh,
  });
}

export type LegacyEscalaMember = { id?: string; nome?: string; setor?: string; unidade?: string; tipo?: string; turno?: string };
export function useImportarEquipeLocal() {
  const refresh = useRefreshSchedule();
  return useMutation({
    mutationFn: async (legacy: LegacyEscalaMember[]) => {
      const { data: current, error: currentError } = await supabase.from("escala_colaboradores").select("nome,setor,unidade");
      if (currentError) throw currentError;
      const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const existing = new Set((current ?? []).map((row) => `${normalize(row.nome)}|${row.setor}|${row.unidade}`));
      const rows = legacy.flatMap((member) => {
        if (!member.nome || !["manutencao", "recepcao", "camareiras"].includes(member.setor ?? "")) return [];
        const unidade = member.unidade === "todas" ? "Ambas" : member.unidade === "ipanema" ? "Ipanema" : "Botafogo";
        const key = `${normalize(member.nome)}|${member.setor}|${unidade}`;
        if (existing.has(key)) return [];
        existing.add(key);
        return [{ nome: member.nome.trim(), setor: member.setor as EscalaSetor, unidade: unidade as EscalaUnidade, vinculo: member.tipo === "Freelance" ? "freelance" as const : "fixo" as const, turno_padrao: member.turno === "manha" || member.turno === "noite" ? member.turno : member.tipo === "Freelance" ? null : "dia" as const, ativo: true }];
      });
      if (rows.length) {
        const { error } = await supabase.from("escala_colaboradores").insert(rows);
        if (error) throw error;
      }
      return { imported: rows.length, ignored: legacy.length - rows.length };
    },
    onSuccess: refresh,
  });
}

/** Prévia do cadastro: usa o mesmo motor do gerador para a prévia nunca divergir da escala gerada. */
export function patternWorksOn(p: EscalaPadrao, date: Date): boolean {
  return worksOnDate({ tipo: p.tipo, data_base: p.data_base, folgas_fixas: p.folgas_fixas ?? [], folga_semana_a: p.folga_semana_a, folga_semana_b: p.folga_semana_b }, formatCivilDate(date));
}

// ---------------------------------------------------------------------------
// Férias: lançamento (tabela escala_ferias) + dias na escala (status "ferias" e cobertura "extra")
// ---------------------------------------------------------------------------
export interface EscalaFerias {
  id: string; colaborador_id: string; unidade: "Botafogo" | "Ipanema"; inicio: string; fim: string;
  substituto_id: string | null; modalidade_id: string | null; hora_entrada: string | null;
  horas_contratadas: number | null; valor_combinado: number | null; observacao: string | null;
  folgas_extra?: boolean; folgas_modalidade_id?: string | null; folgas_hora_entrada?: string | null;
  folgas_horas?: number | null; folgas_valor?: number | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export const FERIAS_MOTIVO = "Férias";
/** Nas férias, a própria pessoa trabalha como extra nos dias que seriam folga dela (a freelancer folga). */
export const EXTRA_FERIAS_PREFIXO = "Extra nas férias";
const COBERTURA_FOLGA_PREFIXO = "Cobertura de folga";
const COBERTURA_FERIAS_PREFIXO = "Cobertura de férias";
export const coberturaFeriasMotivo = (nome: string) => `${COBERTURA_FERIAS_PREFIXO} — ${nome}`;

export function useEscalaFerias() {
  return useQuery({ queryKey: ["escala-ferias"], queryFn: async (): Promise<EscalaFerias[]> => {
    const { data, error } = await supabase.from("escala_ferias").select("*").order("inicio", { ascending: false });
    if (error) throw error;
    return (data ?? []) as EscalaFerias[];
  } });
}

async function apagarComConferencia(ids: string[]) {
  if (!ids.length) return 0;
  const { data, error } = await supabase.from("escala_dias").delete().in("id", ids).select("id");
  if (error) throw error;
  if ((data?.length ?? 0) !== ids.length) throw new Error(`Só ${data?.length ?? 0} de ${ids.length} dias foram apagados. Verifique a permissão de gestor.`);
  return data.length;
}

/** Desfaz os dias de um lançamento de férias: tira a cobertura e devolve os dias da pessoa ao padrão. */
async function desfazerDiasFerias(f: Pick<EscalaFerias, "colaborador_id" | "inicio" | "fim" | "substituto_id">, pattern: EnginePattern | null) {
  if (f.substituto_id) {
    const { data, error } = await supabase.from("escala_dias").select("id").eq("colaborador_id", f.substituto_id)
      .eq("substitui_colaborador_id", f.colaborador_id).eq("status", "extra").like("motivo", `${COBERTURA_FERIAS_PREFIXO}%`)
      .gte("data", f.inicio).lte("data", f.fim);
    if (error) throw error;
    await apagarComConferencia((data ?? []).map((d) => d.id));
  }
  const { data: diasFerias, error } = await supabase.from("escala_dias").select("id,data").eq("colaborador_id", f.colaborador_id)
    .eq("status", "ferias").eq("motivo", FERIAS_MOTIVO).gte("data", f.inicio).lte("data", f.fim);
  if (error) throw error;
  const { data: diasExtra, error: eX } = await supabase.from("escala_dias").select("id,data").eq("colaborador_id", f.colaborador_id)
    .eq("status", "extra").like("motivo", `${EXTRA_FERIAS_PREFIXO}%`).gte("data", f.inicio).lte("data", f.fim);
  if (eX) throw eX;
  const dias = [...(diasFerias ?? []), ...(diasExtra ?? [])];
  const trabalho = (dias ?? []).filter((d) => pattern && worksOnDate(pattern, d.data)).map((d) => d.id);
  const folga = (dias ?? []).filter((d) => !trabalho.includes(d.id)).map((d) => d.id);
  for (const [ids, status] of [[trabalho, "trabalho"], [folga, "folga"]] as const) {
    if (!ids.length) continue;
    const { error: e } = await supabase.from("escala_dias").update({
      status, origem: "gerado", motivo: null, modalidade_id: null, motivo_chamada: null, horas_contratadas: null, valor_combinado: null,
      hora_entrada: status === "trabalho" ? pattern?.hora_entrada ?? null : null,
      hora_saida: status === "trabalho" ? pattern?.hora_saida ?? null : null,
    }).in("id", ids);
    if (e) throw e;
  }
}

export type FeriasInput = {
  id?: string; colaborador: EscalaColaborador; pattern: EnginePattern; unidade: "Botafogo" | "Ipanema";
  inicio: string; fim: string; substituto: EscalaColaborador | null; modalidade: EscalaModalidade | null;
  hora_entrada: string; horas: number; valor: number; observacao: string | null;
  /** A própria pessoa trabalha como extra nas folgas dela (a freelancer folga nesses dias). */
  folgasExtra?: { modalidade: EscalaModalidade; hora_entrada: string; horas: number; valor: number } | null;
};
export type FeriasResultado = { diasFerias: number; diasCobertura: number; ocupados: string[]; diasExtra: number; coberturasFolgaRemovidas: number };

export function useSalvarFerias() {
  const refresh = useRefreshSchedule();
  return useMutation({ mutationFn: async (input: FeriasInput): Promise<FeriasResultado> => {
    if (input.fim < input.inicio) throw new Error("A data final é antes do início.");
    if (input.substituto && !input.modalidade) throw new Error("Escolha a modalidade da freelancer.");
    let anterior: EscalaFerias | null = null;
    if (input.id) {
      const { data: old, error } = await supabase.from("escala_ferias").select("*").eq("id", input.id).single();
      if (error) throw error;
      anterior = old as EscalaFerias;
    }
    const record = {
      colaborador_id: input.colaborador.id, unidade: input.unidade, inicio: input.inicio, fim: input.fim,
      substituto_id: input.substituto?.id ?? null, modalidade_id: input.substituto ? input.modalidade?.id ?? null : null,
      hora_entrada: input.substituto ? input.hora_entrada : null, horas_contratadas: input.substituto ? input.horas : null,
      valor_combinado: input.substituto ? input.valor : null, observacao: input.observacao,
      folgas_extra: !!input.folgasExtra, folgas_modalidade_id: input.folgasExtra?.modalidade.id ?? null,
      folgas_hora_entrada: input.folgasExtra?.hora_entrada ?? null, folgas_horas: input.folgasExtra?.horas ?? null,
      folgas_valor: input.folgasExtra?.valor ?? null,
    };
    const saved = input.id
      ? await supabase.from("escala_ferias").update(record).eq("id", input.id).select("id").single()
      : await supabase.from("escala_ferias").insert(record).select("id").single();
    if (saved.error) throw saved.error;
    // Edição: só depois de salvar (o banco recusa períodos sobrepostos) desfaz os dias do lançamento anterior
    if (anterior) await desfazerDiasFerias(anterior, input.pattern);

    const { data: existentes, error: e1 } = await supabase.from("escala_dias").select("data,status,turno")
      .eq("colaborador_id", input.colaborador.id).gte("data", input.inicio).lte("data", input.fim);
    if (e1) throw e1;
    const atuais = (existentes ?? []) as { data: string; status: EscalaDia["status"]; turno: EscalaTurno }[];
    // Folgas já cobertas por freelancer ("Cobertura de folga") contam como folga da pessoa nesses dias
    const { data: cobFolga, error: eF } = await supabase.from("escala_dias").select("id,data,colaborador_id")
      .eq("substitui_colaborador_id", input.colaborador.id).eq("status", "extra").like("motivo", `${COBERTURA_FOLGA_PREFIXO}%`)
      .gte("data", input.inicio).lte("data", input.fim);
    if (eF) throw eF;
    const folgaConhecida = new Set((cobFolga ?? []).map((d) => d.data));
    const base: { data: string; status: EscalaDia["status"] }[] = atuais.filter((d) => d.status !== "ferias")
      .map((d) => folgaConhecida.has(d.data) ? { data: d.data, status: "folga" as const } : { data: d.data, status: d.status });
    for (const data of folgaConhecida) if (!base.some((d) => d.data === data)) base.push({ data, status: "folga" });
    const plano = planejarFerias(input.pattern, input.inicio, input.fim, base);
    const folgasDaPessoa = plano.diasFerias.filter((d) => !plano.diasCobertura.includes(d));
    // Durante as férias a freelancer que cobre não faz mais o plantão de folga da pessoa
    let coberturasFolgaRemovidas = 0;
    if (input.substituto) {
      const ids = (cobFolga ?? []).filter((d) => d.colaborador_id === input.substituto!.id).map((d) => d.id);
      coberturasFolgaRemovidas = await apagarComConferencia(ids);
    }
    const turnoDe = new Map(atuais.map((d) => [d.data, d.turno]));
    const { data: auth } = await supabase.auth.getUser();
    const by = auth.user?.id ?? null;
    const fx = input.folgasExtra ?? null;
    const diasPessoa = plano.diasFerias.map((data) => {
      const extra = !!fx && folgasDaPessoa.includes(data);
      return {
        colaborador_id: input.colaborador.id, unidade: input.unidade, setor: input.colaborador.setor, data,
        turno: turnoDe.get(data) ?? input.colaborador.turno_padrao ?? "dia",
        hora_entrada: extra ? fx!.hora_entrada : null, hora_saida: extra ? calculateEndTime(fx!.hora_entrada, fx!.horas) : null,
        status: extra ? "extra" as const : "ferias" as const, origem: "manual" as const,
        substitui_colaborador_id: extra ? input.substituto?.id ?? null : null,
        motivo: extra ? `${EXTRA_FERIAS_PREFIXO} — folga de ${input.substituto?.nome ?? "quem cobre"}` : FERIAS_MOTIVO,
        modalidade_id: extra ? fx!.modalidade.id : null, motivo_chamada: extra ? fx!.modalidade.motivo : null,
        horas_contratadas: extra ? fx!.horas : null, valor_combinado: extra ? fx!.valor : null, updated_by: by,
      };
    });
    const { error: e2 } = await supabase.from("escala_dias").upsert(diasPessoa, { onConflict: "colaborador_id,data,turno" });
    if (e2) throw e2;

    let ocupados: string[] = []; let cobertos = 0;
    if (input.substituto && input.modalidade && plano.diasCobertura.length) {
      const { data: agenda, error: e3 } = await supabase.from("escala_dias").select("data")
        .eq("colaborador_id", input.substituto.id).in("data", plano.diasCobertura);
      if (e3) throw e3;
      ocupados = [...new Set((agenda ?? []).map((d) => d.data))].sort();
      const turno = input.substituto.turno_padrao ?? "dia";
      const cobertura = plano.diasCobertura.filter((d) => !ocupados.includes(d)).map((data) => ({
        colaborador_id: input.substituto!.id, unidade: input.unidade, setor: input.colaborador.setor, data, turno,
        hora_entrada: input.hora_entrada, hora_saida: calculateEndTime(input.hora_entrada, input.horas),
        status: "extra" as const, origem: "manual" as const, substitui_colaborador_id: input.colaborador.id,
        motivo: coberturaFeriasMotivo(input.colaborador.nome), modalidade_id: input.modalidade!.id,
        motivo_chamada: input.modalidade!.motivo, horas_contratadas: input.horas, valor_combinado: input.valor, updated_by: by,
      }));
      if (cobertura.length) {
        const { error: e4 } = await supabase.from("escala_dias").upsert(cobertura, { onConflict: "colaborador_id,data,turno" });
        if (e4) throw e4;
      }
      cobertos = cobertura.length;
    }
    return { diasFerias: plano.diasFerias.length, diasCobertura: cobertos, ocupados, diasExtra: fx ? folgasDaPessoa.length : 0, coberturasFolgaRemovidas };
  }, onSuccess: refresh });
}

export function useExcluirFerias() {
  const refresh = useRefreshSchedule();
  return useMutation({ mutationFn: async (input: { ferias: EscalaFerias; pattern: EnginePattern | null }) => {
    await desfazerDiasFerias(input.ferias, input.pattern);
    const { data, error } = await supabase.from("escala_ferias").delete().eq("id", input.ferias.id).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("As férias não foram apagadas. Verifique a permissão de gestor.");
  }, onSuccess: refresh });
}

/** Lança o VA e o VT do mês no Financeiro (um lançamento por pessoa, benefício e unidade). */
export function useLancarBeneficios(){
  return useMutation({mutationFn:async(input:{competencia:string;itens:{colaborador_id:string;nome:string;tipo:"va"|"vt";unidade:string;valor:number;qtd:number;descricao:string}[]})=>{
    const {data,error}=await supabase.rpc("escala_lancar_beneficios",{_competencia:input.competencia,_itens:input.itens});
    if(error)throw error;
    return data as unknown as {criados:number;atualizados:number;ja_pagos:number;cancelados:number};
  }});
}

/** Ajusta o VA e o VT por dia de uma pessoa (null = volta ao padrão do quadro). */
export function useSalvarBeneficioColaborador(){
  const queryClient=useQueryClient();
  return useMutation({mutationFn:async(input:{id:string;vale_alimentacao:number|null;vale_transporte_dia:number|null})=>{
    const {data,error}=await supabase.from("escala_colaboradores").update({vale_alimentacao:input.vale_alimentacao,vale_transporte_dia:input.vale_transporte_dia}).eq("id",input.id).select("id");
    if(error)throw error;
    if(!data?.length)throw new Error("Não foi possível salvar. Verifique a permissão de gestor.");
  },onSuccess:()=>queryClient.invalidateQueries({queryKey:["escala-colaboradores"]})});
}
