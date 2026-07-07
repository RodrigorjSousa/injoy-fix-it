
CREATE TABLE public.housekeeping_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id TEXT UNIQUE,
  quarto TEXT NOT NULL,
  hospede TEXT,
  pax INTEGER DEFAULT 1,
  data_saida DATE,
  pagamento_pendente BOOLEAN NOT NULL DEFAULT false,
  documento_pendente BOOLEAN NOT NULL DEFAULT false,
  status_limpeza TEXT NOT NULL DEFAULT 'Pendente',
  unidade TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.housekeeping_tasks TO authenticated;
GRANT ALL ON public.housekeeping_tasks TO service_role;

ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view housekeeping tasks"
  ON public.housekeeping_tasks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can update housekeeping tasks"
  ON public.housekeeping_tasks FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_housekeeping_tasks_updated_at
  BEFORE UPDATE ON public.housekeeping_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
