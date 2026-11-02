import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { TERMO_PONTO_TEXTO, TERMO_PONTO_VERSAO, sha256Texto } from "@/lib/termo-ponto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Aparece no Bater Ponto quando o registro oficial está ativo e a pessoa ainda não aceitou. */
export function TermoPontoOficial() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ponto", "termo", TERMO_PONTO_VERSAO],
    queryFn: async () => {
      const { data, error } = await db.rpc("ponto_meu_termo", { _versao: TERMO_PONTO_VERSAO });
      if (error) throw error;
      return data as { oficial: boolean; vinculado: boolean; aceito_em: string | null };
    },
  });
  const aceitar = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("ponto_aceitar_termo", {
        _versao: TERMO_PONTO_VERSAO,
        _texto_sha256: await sha256Texto(TERMO_PONTO_TEXTO),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Termo aceito. Obrigado!");
      qc.invalidateQueries({ queryKey: ["ponto", "termo"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const [li, setLi] = useState(false);

  if (!q.data?.oficial || !q.data.vinculado || q.data.aceito_em) return null;
  return (
    <Card className="space-y-3 border-indigo-300 bg-indigo-50 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-indigo-900">
        <FileSignature className="h-4 w-4" />
        Termo do ponto eletrônico
      </p>
      <p className="text-sm leading-relaxed text-indigo-950">{TERMO_PONTO_TEXTO}</p>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={li} onCheckedChange={(v) => setLi(v === true)} />
        <span>Li e concordo com o termo acima.</span>
      </label>
      <Button
        className="w-full"
        disabled={!li || aceitar.isPending}
        onClick={() => aceitar.mutate()}
      >
        {aceitar.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        Aceitar
      </Button>
      <p className="text-xs text-indigo-800">
        O ponto continua funcionando normalmente enquanto você lê.
      </p>
    </Card>
  );
}
