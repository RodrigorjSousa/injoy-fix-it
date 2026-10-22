-- Joy — lições (correções da equipe que a Joy passa a seguir). Ver docs/projeto-injoy/08-whatsapp-ia.md.
--
-- Cada lição: a situação (o que o hóspede disse), o que a Joy respondeu de errado, como deveria ter
-- respondido e por quê. As lições ativas entram no prompt da Joy como exemplos (as mais parecidas com a
-- conversa do momento). Origem: 'correcao' (botão Corrigir), 'manual' (aba Lições), e no futuro
-- 'revisor' (revisor automático) e 'conversas' (análise das conversas reais da recepção).
--
-- Mesmo padrão da 0074: leitura só gestor/admin (private.pode_gerir_whatsapp); escrita só pelo servidor.
-- Idempotente. Sem FK para auth.users e sem INSERT de dados.

CREATE TABLE IF NOT EXISTS public.wa_licoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  situacao text NOT NULL,
  resposta_errada text,
  resposta_certa text NOT NULL,
  motivo text,
  tema text,
  ativa boolean NOT NULL DEFAULT true,
  origem text NOT NULL DEFAULT 'correcao',
  conversa_id uuid REFERENCES public.wa_conversas(id) ON DELETE SET NULL,
  mensagem_id uuid REFERENCES public.wa_mensagens(id) ON DELETE SET NULL,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_licoes_origem CHECK (origem IN ('correcao', 'manual', 'revisor', 'conversas')),
  CONSTRAINT wa_licoes_situacao CHECK (length(btrim(situacao)) > 0),
  CONSTRAINT wa_licoes_certa CHECK (length(btrim(resposta_certa)) > 0)
);
CREATE INDEX IF NOT EXISTS wa_licoes_ativa_idx ON public.wa_licoes (ativa, updated_at DESC);

DROP TRIGGER IF EXISTS wa_licoes_updated_at ON public.wa_licoes;
CREATE TRIGGER wa_licoes_updated_at BEFORE UPDATE ON public.wa_licoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.wa_licoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_licoes FROM anon;
GRANT SELECT ON public.wa_licoes TO authenticated;
GRANT ALL ON public.wa_licoes TO service_role;

DROP POLICY IF EXISTS "Gestor lê lições da Joy" ON public.wa_licoes;
CREATE POLICY "Gestor lê lições da Joy" ON public.wa_licoes
  FOR SELECT TO authenticated USING (private.pode_gerir_whatsapp(auth.uid()));

-- Quais lições foram usadas em cada resposta (para ver se a correção pegou).
ALTER TABLE public.wa_ia_execucoes ADD COLUMN IF NOT EXISTS licoes_usadas jsonb NOT NULL DEFAULT '[]'::jsonb;