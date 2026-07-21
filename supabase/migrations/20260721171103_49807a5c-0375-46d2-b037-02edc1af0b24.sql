DROP POLICY IF EXISTS "prev_logs_admin_update" ON public.preventive_logs;

CREATE POLICY "prev_logs_admin_update"
ON public.preventive_logs
FOR UPDATE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'gestor')
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'gestor')
);