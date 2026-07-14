
CREATE TABLE public.period_checklist_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property TEXT NOT NULL,
  camareira_name TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('manha', 'tarde', 'noite')),
  completed_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.period_checklist_logs TO authenticated;
GRANT ALL ON public.period_checklist_logs TO service_role;

ALTER TABLE public.period_checklist_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "period_checklist_logs_select"
  ON public.period_checklist_logs
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
  );

CREATE POLICY "period_checklist_logs_insert"
  ON public.period_checklist_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'gestor'::app_role)
    OR private.has_role(auth.uid(), 'camareira'::app_role)
  );

CREATE INDEX idx_period_checklist_logs_property_created
  ON public.period_checklist_logs (property, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.period_checklist_logs;
