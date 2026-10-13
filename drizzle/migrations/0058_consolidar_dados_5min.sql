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