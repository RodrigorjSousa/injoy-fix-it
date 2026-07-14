
CREATE TABLE public.extra_tasks_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property TEXT NOT NULL,
  camareira_name TEXT NOT NULL,
  completed_tasks JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extra_tasks_logs TO authenticated;
GRANT ALL ON public.extra_tasks_logs TO service_role;
ALTER TABLE public.extra_tasks_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read extra_tasks_logs" ON public.extra_tasks_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert extra_tasks_logs" ON public.extra_tasks_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.laundry_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property TEXT NOT NULL,
  camareira_name TEXT NOT NULL,
  items_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.laundry_logs TO authenticated;
GRANT ALL ON public.laundry_logs TO service_role;
ALTER TABLE public.laundry_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read laundry_logs" ON public.laundry_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert laundry_logs" ON public.laundry_logs FOR INSERT TO authenticated WITH CHECK (true);
