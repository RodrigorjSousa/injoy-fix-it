
CREATE TABLE public.cloudbeds_checkout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property text NOT NULL CHECK (property IN ('Botafogo','Ipanema')),
  room_number text NOT NULL,
  guest_name text,
  reservation_id text,
  camareira_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  camareira_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ckout_logs_prop_created ON public.cloudbeds_checkout_logs(property, created_at DESC);

GRANT SELECT, INSERT ON public.cloudbeds_checkout_logs TO authenticated;
GRANT ALL ON public.cloudbeds_checkout_logs TO service_role;

ALTER TABLE public.cloudbeds_checkout_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff ve checkout logs" ON public.cloudbeds_checkout_logs
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(),'gestor'::app_role)
    OR private.has_role(auth.uid(),'admin'::app_role)
    OR private.has_role(auth.uid(),'camareira'::app_role)
    OR private.has_role(auth.uid(),'funcionario'::app_role)
  );

CREATE POLICY "Staff cria checkout logs" ON public.cloudbeds_checkout_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    camareira_id = auth.uid()
    AND (
      private.has_role(auth.uid(),'gestor'::app_role)
      OR private.has_role(auth.uid(),'admin'::app_role)
      OR private.has_role(auth.uid(),'camareira'::app_role)
      OR private.has_role(auth.uid(),'funcionario'::app_role)
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.cloudbeds_checkout_logs;
