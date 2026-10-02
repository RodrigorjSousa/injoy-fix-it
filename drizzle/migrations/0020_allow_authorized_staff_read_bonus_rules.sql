DROP POLICY IF EXISTS "Admin gestor read config bonificacao" ON public.config_bonificacao;
CREATE POLICY "Authenticated read config bonificacao"
ON public.config_bonificacao
FOR SELECT
TO authenticated
USING (true);