
DROP POLICY IF EXISTS "Staff cria recados" ON public.recados_camareiras;
DROP POLICY IF EXISTS "Staff ve recados" ON public.recados_camareiras;
DROP POLICY IF EXISTS "Autor ou staff atualiza recados" ON public.recados_camareiras;
DROP POLICY IF EXISTS "Autor ou gestor deleta recados" ON public.recados_camareiras;

CREATE POLICY "Staff cria recados" ON public.recados_camareiras
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'recepcao'::app_role)
    OR private.has_role(auth.uid(), 'funcionario'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
  )
);

CREATE POLICY "Staff ve recados" ON public.recados_camareiras
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
);

CREATE POLICY "Autor ou staff atualiza recados" ON public.recados_camareiras
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
)
WITH CHECK (
  created_by = auth.uid()
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
);

CREATE POLICY "Autor ou gestor deleta recados" ON public.recados_camareiras
FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
);
