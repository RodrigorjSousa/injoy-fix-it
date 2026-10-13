-- Sincronização automática com o Cloudbeds a cada 5 minutos (a 0051_room_housekeeping_bloqueio_cloudbeds,
-- que fazia isso, não chegou ao banco). Agendamento em migração separada. Idempotente: se o job não
-- existir ou já estiver em 5 min, não muda nada.
DO $$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname = 'consolidar-dados-15min';
  IF v_job IS NOT NULL THEN
    PERFORM cron.alter_job(v_job, schedule := '*/5 * * * *');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Agendamento não alterado: %', SQLERRM;
END $$;
