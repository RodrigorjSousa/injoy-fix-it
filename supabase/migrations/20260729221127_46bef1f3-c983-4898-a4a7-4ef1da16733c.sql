DROP POLICY IF EXISTS "gestor read settings" ON public.app_settings;

CREATE POLICY "authenticated read safe operational settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'gestor'::app_role)
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR key LIKE 'tarefas_extras_items:%'
  OR key = 'tarefas_extras_periodicity'
  OR key = 'reset_turno_password'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
  END IF;
END $$;