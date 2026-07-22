
ALTER TABLE public.tuya_password_logs
  ADD COLUMN IF NOT EXISTS senha_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by_name TEXT,
  ADD COLUMN IF NOT EXISTS revoke_reason TEXT;

DROP POLICY IF EXISTS "Staff can revoke tuya passwords" ON public.tuya_password_logs;
CREATE POLICY "Staff can revoke tuya passwords"
ON public.tuya_password_logs FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role) OR
  private.has_role(auth.uid(), 'gestor'::app_role) OR
  private.has_role(auth.uid(), 'recepcao'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role) OR
  private.has_role(auth.uid(), 'gestor'::app_role) OR
  private.has_role(auth.uid(), 'recepcao'::app_role)
);
