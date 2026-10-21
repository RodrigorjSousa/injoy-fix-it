import { useCallback, useState } from "react";
import { Loader2, MapPinOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { lerLocalizacao, type FalhaLocalizacao, type Position } from "@/lib/ponto-face";

type Posicao = NonNullable<Position>;
type Conferencia = {
  permitido: boolean;
  motivo: string | null;
  unidade?: string;
  distancia_m?: number;
  raio_m?: number;
  mensagem: string;
};

const MENSAGEM_FALHA: Record<FalhaLocalizacao, string> = {
  negada: "O acesso à localização está bloqueado para o app.",
  indisponivel:
    "O celular não conseguiu achar a localização. A localização do aparelho pode estar desligada.",
  tempo: "A localização demorou demais para responder.",
  sem_suporte: "Este navegador não informa a localização.",
};

// A função nova ainda não está nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Confere a localização ANTES da câmera: lê o GPS do aparelho e pergunta ao servidor se
 * está a até o raio (100 m) de Botafogo ou Ipanema. O servidor confere de novo ao registrar.
 */
export function useLocalPonto() {
  const [estado, setEstado] = useState<"livre" | "buscando" | "erro">("livre");
  const [erro, setErro] = useState<{ mensagem: string; instrucoes: boolean } | null>(null);

  const conferir = useCallback(async (): Promise<Posicao | null> => {
    setEstado("buscando");
    setErro(null);
    const leitura = await lerLocalizacao();
    if (!leitura.ok) {
      setErro({ mensagem: MENSAGEM_FALHA[leitura.falha], instrucoes: true });
      setEstado("erro");
      return null;
    }
    const p = leitura.posicao;
    const { data, error } = await db.rpc("ponto_verificar_local", {
      _latitude: Number(p.latitude.toFixed(6)),
      _longitude: Number(p.longitude.toFixed(6)),
      _precisao_m: Math.round(p.accuracy),
    });
    if (error) {
      setErro({
        mensagem: `Não foi possível conferir a localização: ${error.message}`,
        instrucoes: false,
      });
      setEstado("erro");
      return null;
    }
    const c = data as Conferencia;
    if (!c.permitido) {
      setErro({
        mensagem: c.mensagem,
        instrucoes: c.motivo === "sem_localizacao" || c.motivo === "localizacao_imprecisa",
      });
      setEstado("erro");
      return null;
    }
    setEstado("livre");
    return p;
  }, []);

  const limpar = useCallback(() => {
    setEstado("livre");
    setErro(null);
  }, []);

  return { estado, erro, conferir, limpar };
}

export function AvisoLocalizacao({
  local,
  onTentar,
}: {
  local: ReturnType<typeof useLocalPonto>;
  onTentar: () => void;
}) {
  if (local.estado === "buscando")
    return (
      <Card className="flex items-center justify-center gap-2 p-4 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Conferindo sua localização…
      </Card>
    );
  if (local.estado !== "erro" || !local.erro) return null;
  return (
    <Card className="space-y-3 border-rose-300 bg-rose-50 p-4 text-sm">
      <p className="flex items-start gap-2 font-semibold text-rose-800">
        <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" />
        {local.erro.mensagem}
      </p>
      {local.erro.instrucoes && (
        <div className="space-y-1 text-rose-900">
          <p className="font-semibold">Como liberar a localização:</p>
          <p>
            1. Puxe a barra do topo do celular e ligue a <b>Localização</b> (de preferência no modo
            de alta precisão).
          </p>
          <p>
            2. No navegador, toque no ícone ao lado do endereço (cadeado ou ajustes) ›{" "}
            <b>Permissões</b> › <b>Localização</b> › <b>Permitir</b>.
          </p>
          <p>
            3. No iPhone: Ajustes › Privacidade › Serviços de Localização › ligue e permita para o
            navegador.
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="gap-1" onClick={onTentar}>
          <RefreshCw className="h-4 w-4" />
          Tentar de novo
        </Button>
        <Button size="sm" variant="ghost" onClick={local.limpar}>
          Fechar
        </Button>
      </div>
    </Card>
  );
}
