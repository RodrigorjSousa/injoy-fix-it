
CREATE TABLE IF NOT EXISTS public.room_housekeeping_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property TEXT NOT NULL,
  room_number TEXT NOT NULL,
  camareira_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  task_name TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  photo_url TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.room_housekeeping_history TO authenticated;
GRANT ALL ON public.room_housekeeping_history TO service_role;

ALTER TABLE public.room_housekeeping_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ler histórico"
  ON public.room_housekeeping_history FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Autenticados podem inserir histórico"
  ON public.room_housekeeping_history FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rhh_created_at ON public.room_housekeeping_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rhh_property ON public.room_housekeeping_history (property);
CREATE INDEX IF NOT EXISTS idx_rhh_camareira ON public.room_housekeeping_history (camareira_name);

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove agendamento anterior (se existir) para permitir reexecução idempotente
DO $$
BEGIN
  PERFORM cron.unschedule('reset-turno-camareiras');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reset-turno-camareiras',
  '0 2 * * *',
  $$
  UPDATE public.room_housekeeping
  SET
    service_status = NULL,
    assigned_camareira = NULL,
    service_started_at = NULL,
    service_ended_at = NULL,
    is_dnd = false,
    dnd_photo_url = NULL,
    room_comment = NULL,
    status = 'dirty',
    updated_at = now();
  $$
);
