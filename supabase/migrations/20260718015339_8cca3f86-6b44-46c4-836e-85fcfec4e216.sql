
DROP POLICY IF EXISTS "Read chamados by role" ON public.chamados;

CREATE POLICY "Read chamados by role"
ON public.chamados
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR (EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = chamados.responsavel_id AND f.user_id = auth.uid()))
  OR (criado_por = auth.uid())
);
