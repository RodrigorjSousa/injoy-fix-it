-- Joy — E2: testes com hóspedes simulados. Ver docs/projeto-injoy/08-whatsapp-ia.md.
--
-- Cada teste é uma conversa do simulador em que outra IA faz o papel do hóspede (um "cenário": pedido de
-- desconto, tentativa de pegar código, estrangeiro...). No fim, checagens automáticas e uma IA avaliadora
-- dão nota, listam os erros e sugerem lições. As sugestões só viram lição se o gestor aprovar
-- (origem 'revisor' em wa_licoes). Nada sai para hóspedes.
--
-- Mesmo padrão da 0074/0078: leitura só gestor/admin (private.pode_gerir_whatsapp); escrita só pelo
-- servidor. Idempotente. Sem FK para auth.users e sem INSERT de dados.

CREATE TABLE IF NOT EXISTS public.wa_testes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote uuid,
  cenario_id text NOT NULL,
  titulo text NOT NULL DEFAULT '',
  conversa_id uuid REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'rodando',
  turnos integer NOT NULL DEFAULT 0,
  nota numeric(4, 1),
  aprovado boolean,
  resumo text,
  falhas jsonb NOT NULL DEFAULT '[]'::jsonb,
  sugestoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  tokens_entrada integer NOT NULL DEFAULT 0,
  tokens_saida integer NOT NULL DEFAULT 0,
  erro text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_testes_status CHECK (status IN ('rodando', 'avaliar', 'avaliado', 'erro')),
  CONSTRAINT wa_testes_nota CHECK (nota IS NULL OR (nota >= 0 AND nota <= 10))
);
CREATE INDEX IF NOT EXISTS wa_testes_created_idx ON public.wa_testes (created_at DESC);
CREATE INDEX IF NOT EXISTS wa_testes_lote_idx ON public.wa_testes (lote);

DROP TRIGGER IF EXISTS wa_testes_updated_at ON public.wa_testes;
CREATE TRIGGER wa_testes_updated_at BEFORE UPDATE ON public.wa_testes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.wa_testes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wa_testes FROM anon;
GRANT SELECT ON public.wa_testes TO authenticated;
GRANT ALL ON public.wa_testes TO service_role;

DROP POLICY IF EXISTS "Gestor lê testes da Joy" ON public.wa_testes;
CREATE POLICY "Gestor lê testes da Joy" ON public.wa_testes
  FOR SELECT TO authenticated USING (private.pode_gerir_whatsapp(auth.uid()));
