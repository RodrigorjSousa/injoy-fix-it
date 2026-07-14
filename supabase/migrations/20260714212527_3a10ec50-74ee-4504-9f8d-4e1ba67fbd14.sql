
CREATE TABLE IF NOT EXISTS public.daily_period_status (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property text NOT NULL,
  period text NOT NULL,
  is_completed boolean DEFAULT false NOT NULL,
  completed_by text,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(property, period)
);

GRANT SELECT, INSERT, UPDATE ON public.daily_period_status TO authenticated;
GRANT ALL ON public.daily_period_status TO service_role;

ALTER TABLE public.daily_period_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_period_status_select_auth" ON public.daily_period_status
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "daily_period_status_update_auth" ON public.daily_period_status
  FOR UPDATE TO authenticated USING (
    private.has_role(auth.uid(), 'admin'::app_role) OR
    private.has_role(auth.uid(), 'gestor'::app_role) OR
    private.has_role(auth.uid(), 'camareira'::app_role) OR
    private.has_role(auth.uid(), 'funcionario'::app_role)
  ) WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role) OR
    private.has_role(auth.uid(), 'gestor'::app_role) OR
    private.has_role(auth.uid(), 'camareira'::app_role) OR
    private.has_role(auth.uid(), 'funcionario'::app_role)
  );

INSERT INTO public.daily_period_status (property, period) VALUES
('Botafogo', 'manha'), ('Botafogo', 'tarde'), ('Botafogo', 'noite'),
('Ipanema', 'manha'), ('Ipanema', 'tarde'), ('Ipanema', 'noite')
ON CONFLICT (property, period) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_period_status;
