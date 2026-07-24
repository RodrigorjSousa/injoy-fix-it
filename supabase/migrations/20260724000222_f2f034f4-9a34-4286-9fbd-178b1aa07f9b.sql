DROP POLICY IF EXISTS "Gestor ou tecnico AC visualiza ativos" ON public.ativos_ar;
DROP POLICY IF EXISTS "Gestor ou tecnico atribuido atualiza ativos" ON public.ativos_ar;
DROP POLICY IF EXISTS "Gestor inserts ativos" ON public.ativos_ar;
DROP POLICY IF EXISTS "Gestor deletes ativos" ON public.ativos_ar;

CREATE POLICY "Gestao e tecnicos AC visualizam ativos"
ON public.ativos_ar
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.funcionarios f
    WHERE f.user_id = auth.uid()
      AND 'Ar condicionado'::text = ANY (f.categorias)
  )
);

CREATE POLICY "Gestao e tecnicos AC atualizam ativos"
ON public.ativos_ar
FOR UPDATE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.funcionarios f
    WHERE f.user_id = auth.uid()
      AND 'Ar condicionado'::text = ANY (f.categorias)
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.funcionarios f
    WHERE f.user_id = auth.uid()
      AND 'Ar condicionado'::text = ANY (f.categorias)
  )
);

CREATE POLICY "Gestao insere ativos"
ON public.ativos_ar
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
);

CREATE POLICY "Gestao exclui ativos"
ON public.ativos_ar
FOR DELETE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
);