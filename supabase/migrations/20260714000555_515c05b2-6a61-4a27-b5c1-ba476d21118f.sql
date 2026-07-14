
DROP POLICY IF EXISTS "Gestor ou tecnico atribuido atualiza ativos" ON public.ativos_ar;
CREATE POLICY "Gestor ou tecnico atribuido atualiza ativos" ON public.ativos_ar
FOR UPDATE
USING (
  private.has_role(auth.uid(), 'gestor'::app_role) OR EXISTS (
    SELECT 1 FROM funcionarios f
    WHERE f.user_id = auth.uid()
      AND 'Ar condicionado' = ANY (f.categorias)
      AND f.nome = ativos_ar.tecnico
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'gestor'::app_role) OR EXISTS (
    SELECT 1 FROM funcionarios f
    WHERE f.user_id = auth.uid()
      AND 'Ar condicionado' = ANY (f.categorias)
      AND f.nome = ativos_ar.tecnico
  )
);

DROP POLICY IF EXISTS "Authenticated upload inspections" ON storage.objects;
CREATE POLICY "Authenticated upload inspections" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'inspections'
  AND (
    private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'recepcao'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
  )
);
