
DROP POLICY IF EXISTS "Gestor creates chamados" ON public.chamados;
CREATE POLICY "Gestor recepcao camareira create chamados"
ON public.chamados FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'recepcao'::app_role)
  OR private.has_role(auth.uid(), 'camareira'::app_role)
);

DROP POLICY IF EXISTS "Gestor sees all chamados, funcionario sees own" ON public.chamados;
CREATE POLICY "Read chamados by role"
ON public.chamados FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR (EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = chamados.responsavel_id AND f.user_id = auth.uid()))
  OR (criado_por = auth.uid())
);
