
-- Reagenda o reset diário do turno para liberar TODOS os quartos às 23h (BRT = 02:00 UTC)
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'reset-turno-camareiras';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'reset-dnd-diario';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'reset-turno-camareiras',
  '0 2 * * *',
  $$
  UPDATE public.room_housekeeping
  SET service_status = 'idle',
      assigned_camareira = NULL,
      service_started_at = NULL,
      service_ended_at = NULL,
      is_dnd = false,
      dnd_photo_url = NULL,
      updated_at = now();
  $$
);
