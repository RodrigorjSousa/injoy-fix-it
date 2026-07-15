CREATE TABLE public.recados_camareiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property TEXT NOT NULL CHECK (property IN ('Botafogo','Ipanema')),
  room_number TEXT,
  message TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  read_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recados_camareiras TO authenticated;
GRANT ALL ON public.recados_camareiras TO service_role;

ALTER TABLE public.recados_camareiras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ver recados"
  ON public.recados_camareiras FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Autenticados podem criar recados"
  ON public.recados_camareiras FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados podem atualizar recados"
  ON public.recados_camareiras FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Autenticados podem deletar recados"
  ON public.recados_camareiras FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER trg_recados_camareiras_updated_at
  BEFORE UPDATE ON public.recados_camareiras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_recados_camareiras_property_created ON public.recados_camareiras (property, created_at DESC);
CREATE INDEX idx_recados_camareiras_unread ON public.recados_camareiras (property, read_at) WHERE read_at IS NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.recados_camareiras;