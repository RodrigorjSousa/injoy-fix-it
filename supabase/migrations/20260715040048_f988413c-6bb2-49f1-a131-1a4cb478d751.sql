
-- Fix recados_camareiras: replace permissive true policies
DROP POLICY IF EXISTS "Autenticados podem ver recados" ON public.recados_camareiras;
DROP POLICY IF EXISTS "Autenticados podem criar recados" ON public.recados_camareiras;
DROP POLICY IF EXISTS "Autenticados podem atualizar recados" ON public.recados_camareiras;
DROP POLICY IF EXISTS "Autenticados podem deletar recados" ON public.recados_camareiras;

CREATE POLICY "Staff ve recados" ON public.recados_camareiras
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
);

CREATE POLICY "Staff cria recados" ON public.recados_camareiras
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'funcionario'::app_role)
  )
);

CREATE POLICY "Autor ou staff atualiza recados" ON public.recados_camareiras
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
)
WITH CHECK (
  created_by = auth.uid()
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
);

CREATE POLICY "Autor ou gestor deleta recados" ON public.recados_camareiras
FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
);

-- Fix ativos_ar UPDATE policy: restrict role scope to authenticated
DROP POLICY IF EXISTS "Gestor ou tecnico atribuido atualiza ativos" ON public.ativos_ar;
CREATE POLICY "Gestor ou tecnico atribuido atualiza ativos" ON public.ativos_ar
FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1 FROM funcionarios f
    WHERE f.user_id = auth.uid()
      AND 'Ar condicionado' = ANY (f.categorias)
      AND f.nome = ativos_ar.tecnico
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR EXISTS (
    SELECT 1 FROM funcionarios f
    WHERE f.user_id = auth.uid()
      AND 'Ar condicionado' = ANY (f.categorias)
      AND f.nome = ativos_ar.tecnico
  )
);

-- Fix daily_period_status SELECT: add role check
DROP POLICY IF EXISTS daily_period_status_select_auth ON public.daily_period_status;
CREATE POLICY daily_period_status_select_auth ON public.daily_period_status
FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
  OR private.has_role(auth.uid(), 'funcionario'::app_role)
);
