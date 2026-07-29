DROP POLICY IF EXISTS "authenticated read safe operational settings" ON public.app_settings;

CREATE POLICY "authenticated read safe operational settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR key LIKE 'tarefas_extras_items:%'
  OR key = 'tarefas_extras_periodicity'
);