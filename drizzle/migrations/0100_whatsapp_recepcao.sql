-- WhatsApp da assistente: acesso da RECEPÇÃO (04/11/2026). Ver docs/projeto-injoy/08-whatsapp-ia.md.
--
-- A recepção passa a ver as conversas (reais e do simulador), aprovar/editar rascunhos e conversar no
-- simulador. NÃO vê a configuração (prompt, base, senhas do Wi-Fi), as execuções nem os testes.
-- Correções feitas pela recepção viram SUGESTÃO de lição (wa_licoes.aprovada = false, ativa = false) e só
-- entram na assistente depois que um gestor aprovar.
-- Mesmo padrão: leitura via RLS, escrita só pelo servidor. Idempotente, sem INSERT de dados.

CREATE OR REPLACE FUNCTION private.pode_usar_whatsapp(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT _uid IS NOT NULL AND (
    private.has_role(_uid, 'gestor') OR private.has_role(_uid, 'admin') OR private.has_role(_uid, 'recepcao')
  );
$$;
REVOKE ALL ON FUNCTION private.pode_usar_whatsapp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.pode_usar_whatsapp(uuid) TO authenticated, service_role;

-- gerir = gestor/admin (tudo); usar = gestor/admin/recepção (conversas, rascunhos, simulador).
CREATE OR REPLACE FUNCTION public.minha_permissao_whatsapp()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT jsonb_build_object(
    'gerir', coalesce(private.pode_gerir_whatsapp(auth.uid()), false),
    'usar', coalesce(private.pode_usar_whatsapp(auth.uid()), false)
  );
$$;
REVOKE ALL ON FUNCTION public.minha_permissao_whatsapp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_permissao_whatsapp() TO authenticated;

DROP POLICY IF EXISTS "Recepção lê conversas da assistente" ON public.wa_conversas;
CREATE POLICY "Recepção lê conversas da assistente" ON public.wa_conversas
  FOR SELECT TO authenticated USING (private.pode_usar_whatsapp(auth.uid()));

DROP POLICY IF EXISTS "Recepção lê mensagens da assistente" ON public.wa_mensagens;
CREATE POLICY "Recepção lê mensagens da assistente" ON public.wa_mensagens
  FOR SELECT TO authenticated USING (private.pode_usar_whatsapp(auth.uid()));

DROP POLICY IF EXISTS "Recepção lê passagens da assistente" ON public.wa_passagens;
CREATE POLICY "Recepção lê passagens da assistente" ON public.wa_passagens
  FOR SELECT TO authenticated USING (private.pode_usar_whatsapp(auth.uid()));

-- Sugestões de lição da recepção esperam aprovação do gestor.
ALTER TABLE public.wa_licoes ADD COLUMN IF NOT EXISTS aprovada boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS wa_licoes_pendentes_idx ON public.wa_licoes (created_at DESC) WHERE aprovada = false;
