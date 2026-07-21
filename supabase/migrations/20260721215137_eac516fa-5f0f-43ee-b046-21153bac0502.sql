
CREATE TABLE public.boas_vindas_config (
  audience text PRIMARY KEY,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.boas_vindas_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.boas_vindas_config TO authenticated;
GRANT ALL ON public.boas_vindas_config TO service_role;

ALTER TABLE public.boas_vindas_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boas_vindas_config_select_auth"
ON public.boas_vindas_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "boas_vindas_config_admin_write"
ON public.boas_vindas_config FOR INSERT TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
);

CREATE POLICY "boas_vindas_config_admin_update"
ON public.boas_vindas_config FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
);

CREATE POLICY "boas_vindas_config_admin_delete"
ON public.boas_vindas_config FOR DELETE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'gestor'::app_role)
);

CREATE TRIGGER boas_vindas_config_updated_at
BEFORE UPDATE ON public.boas_vindas_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
