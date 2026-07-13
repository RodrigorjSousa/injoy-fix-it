
-- Job dedicado para resetar o status "Não Perturbe" diariamente às 23:00 BRT (02:00 UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('reset-dnd-diario');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reset-dnd-diario',
  '0 2 * * *',
  $$
  UPDATE public.room_housekeeping
  SET
    is_dnd = false,
    dnd_photo_url = NULL,
    updated_at = now()
  WHERE is_dnd = true;
  $$
);
