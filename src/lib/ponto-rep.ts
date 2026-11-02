// Registro oficial do ponto (REP-P): empregador, ativação, ARP, AFD, comprovantes e relógio.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EmpregadorRep, RegistroRep } from "@/lib/ponto-afd";

// Tabelas e funções novas ainda não estão nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type Empregador = EmpregadorRep & { oficial_desde: string | null; updated_at: string };

export function useEmpregador() {
  return useQuery({
    queryKey: ["ponto", "rep", "empregador"],
    queryFn: async (): Promise<Empregador | null> => {
      const { data, error } = await db.from("ponto_empregador").select("*").limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as Empregador | undefined) ?? null;
    },
  });
}

export function useSalvarEmpregador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: {
      tipo_doc: number;
      documento: string;
      razao_social: string;
      cno_caepf: string;
      inpi_registro: string;
      desenvolvedor_documento: string;
    }) => {
      const { error } = await db.rpc("ponto_salvar_empregador", {
        _tipo_doc: e.tipo_doc,
        _documento: e.documento,
        _razao_social: e.razao_social,
        _cno_caepf: e.cno_caepf,
        _inpi_registro: e.inpi_registro,
        _desenvolvedor_documento: e.desenvolvedor_documento,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto", "rep"] }),
  });
}

export function useAtivarRep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("ponto_rep_ativar");
      if (error) throw error;
      return data as { pessoas: number; sem_cpf: string[] };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ponto"] }),
  });
}

const PAGINA = 1000;

/** Registros da ARP até `fim` (todos desde o NSR 1, para conferir a cadeia de hashes). */
export async function lerRegistrosRep(fim: string): Promise<RegistroRep[]> {
  const todos: RegistroRep[] = [];
  const limite = new Date(`${fim}T23:59:59-03:00`).toISOString();
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await db
      .from("ponto_rep_registros")
      .select("*")
      .lte("gravado_em", limite)
      .order("nsr")
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    todos.push(...((data ?? []) as RegistroRep[]));
    if (!data || data.length < PAGINA) break;
  }
  return todos.map((r) => ({
    ...r,
    nsr: Number(r.nsr),
    tipo: Number(r.tipo) as RegistroRep["tipo"],
  }));
}

/** Data (Brasília) em que o registro entra no período do AFD. */
export const dataDoRegistro = (r: RegistroRep) =>
  new Date(new Date(r.gravado_em).getTime() - 3 * 3600000).toISOString().slice(0, 10);

export function useResumoRep() {
  return useQuery({
    queryKey: ["ponto", "rep", "resumo"],
    queryFn: async () => {
      const conta = async (tipo: number) => {
        const { count, error } = await db
          .from("ponto_rep_registros")
          .select("nsr", { count: "exact", head: true })
          .eq("tipo", tipo);
        if (error) throw error;
        return count ?? 0;
      };
      const [t2, t5, t7] = await Promise.all([conta(2), conta(5), conta(7)]);
      return { empregador: t2, empregados: t5, marcacoes: t7 };
    },
  });
}

// ---------------------------------------------------------------- funcionário
export type Comprovante = {
  nsr: number;
  marcacao_em: string;
  gravado_em: string;
  cpf: string;
  hash: string;
  unidade: string;
  nome: string;
  local: string | null;
  empregador: string | null;
  tipo_doc: number | null;
  documento: string | null;
  cno_caepf: string | null;
  inpi: string | null;
};

export function useMeusComprovantes() {
  return useQuery({
    queryKey: ["ponto", "comprovantes"],
    queryFn: async (): Promise<Comprovante[]> => {
      const { data, error } = await db.rpc("ponto_meus_comprovantes");
      if (error) throw error;
      return (data ?? []) as Comprovante[];
    },
  });
}

/** Relógio pela hora do servidor (o celular pode estar adiantado ou atrasado). */
export function useHoraServidor() {
  const [diferenca, setDiferenca] = useState<number | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    let vivo = true;
    const sincronizar = async () => {
      const antes = Date.now();
      const { data, error } = await db.rpc("ponto_hora_servidor");
      const depois = Date.now();
      if (!vivo || error || !data) return;
      setDiferenca(new Date(data as string).getTime() - (antes + depois) / 2);
    };
    void sincronizar();
    const sync = window.setInterval(() => void sincronizar(), 5 * 60000);
    const tick = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => {
      vivo = false;
      window.clearInterval(sync);
      window.clearInterval(tick);
    };
  }, []);
  return { agora: new Date(agora + (diferenca ?? 0)), sincronizado: diferenca != null };
}
