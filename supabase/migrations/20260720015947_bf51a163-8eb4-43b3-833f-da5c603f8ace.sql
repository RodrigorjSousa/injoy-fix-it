DROP POLICY IF EXISTS "Recepcao gestor admin read registros bonif" ON public.registros_bonificacao;
CREATE POLICY "Authenticated read registros bonif"
  ON public.registros_bonificacao
  FOR SELECT
  TO authenticated
  USING (true);