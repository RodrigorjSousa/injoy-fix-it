
DROP POLICY IF EXISTS "Gestor or assigned funcionario updates chamados" ON public.chamados;
CREATE POLICY "Authenticated users update chamados"
  ON public.chamados FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Owner or gestor read fotos-manutencao" ON storage.objects;
CREATE POLICY "Authenticated read fotos-manutencao"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'fotos-manutencao');
