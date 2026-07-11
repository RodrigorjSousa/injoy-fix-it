
CREATE POLICY "Gestores can grant staff roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
  AND role IN ('camareira'::app_role, 'recepcao'::app_role, 'funcionario'::app_role)
);

CREATE POLICY "Gestores can revoke staff roles"
ON public.user_roles FOR DELETE TO authenticated
USING (
  (private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
  AND role IN ('camareira'::app_role, 'recepcao'::app_role, 'funcionario'::app_role)
);
