import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GeneratedDay } from "@/lib/escala-engine";

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
  padrao?: Omit<EscalaPadrao, "id" | "colaborador_id" | "vigente_ate">;
}

const scheduleKeys = [["escala-colaboradores"], ["escala-modalidades"], ["escala-feriados"], ["escala-dias"], ["escala-meses"]] as const;
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
  return useMutation({mutationFn:async(input:{unidade:"Botafogo"|"Ipanema";setor:EscalaSetor;competencia:string})=>{const {error}=await supabase.rpc("escala_publicar_mes",{_unidade:input.unidade,_setor:input.setor,_competencia:input.competencia});if(error)throw error;},onSuccess:refresh});
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
        turno_padrao: input.vinculo === "freelance" ? null : input.turno_padrao,
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

const DAY_MS = 86_400_000;
function utcDate(value: string) { const [y,m,d] = value.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function dayDiff(a: Date, b: Date) { return Math.round((a.getTime() - b.getTime()) / DAY_MS); }
export function patternWorksOn(p: EscalaPadrao, date: Date): boolean {
  const dow = date.getUTCDay();
  if (p.tipo === "5x2_fixo") return !p.folgas_fixas.includes(dow);
  if (!p.data_base) return false;
  const base = utcDate(p.data_base);
  const diff = dayDiff(date, base);
  if (p.tipo === "12x36") return ((diff % 2) + 2) % 2 === 0;
  if (p.tipo === "6x1") return ((diff % 7) + 7) % 7 !== 0;
  const sunday = new Date(date); sunday.setUTCDate(date.getUTCDate() - dow);
  const week = Math.floor(dayDiff(sunday, base) / 7);
  const weekA = ((week % 2) + 2) % 2 === 0;
  const off = weekA ? new Set([...(p.folgas_fixas ?? []), p.folga_semana_a ?? 0]) : new Set([...(p.folgas_fixas ?? []), p.folga_semana_b ?? 1]);
  return !off.has(dow);
}
