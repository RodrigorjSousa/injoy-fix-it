// Líder das camareiras (migração 0097: funcionarios.lider_camareiras).
// A líder faz a vistoria antes do check-in pela tela das Camareiras (Botafogo e Ipanema).
// Lido à parte (e não no useMe) para a tela continuar funcionando antes da migração ser aplicada.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const semColuna = (msg: string) => /lider_camareiras/.test(msg);

/** O login atual é líder das camareiras? */
export function useSouLiderCamareiras(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["lider_camareiras", "eu", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await db
        .from("funcionarios")
        .select("lider_camareiras")
        .eq("user_id", userId);
      if (error) {
        if (semColuna(error.message)) return false;
        throw new Error(error.message);
      }
      return ((data ?? []) as { lider_camareiras: boolean }[]).some((f) => f.lider_camareiras);
    },
  });
}

/** Gestor: lê se o cadastro é líder (null = migração ainda não aplicada). */
export function useLiderCamareirasDoCadastro(funcionarioId: string | null | undefined) {
  return useQuery({
    queryKey: ["lider_camareiras", "cadastro", funcionarioId],
    enabled: !!funcionarioId,
    queryFn: async (): Promise<boolean | null> => {
      const { data, error } = await db
        .from("funcionarios")
        .select("lider_camareiras")
        .eq("id", funcionarioId)
        .maybeSingle();
      if (error) {
        if (semColuna(error.message)) return null;
        throw new Error(error.message);
      }
      return !!data?.lider_camareiras;
    },
  });
}

export function useSalvarLiderCamareiras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { funcionarioId: string; lider: boolean }) => {
      const { data, error } = await db
        .from("funcionarios")
        .update({ lider_camareiras: input.lider })
        .eq("id", input.funcionarioId)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("Não foi possível salvar a liderança (sem permissão).");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lider_camareiras"] }),
  });
}
