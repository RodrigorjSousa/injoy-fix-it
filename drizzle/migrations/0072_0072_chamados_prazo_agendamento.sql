-- Confere os chamados fora do prazo (3 dias) a cada 1 hora, no minuto 13 (fora da hora cheia).
-- A função foi criada na 0071. Idempotente.
DO $$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname = 'chamados-prazo-1h';
  IF v_job IS NOT NULL THEN
    PERFORM cron.unschedule(v_job);
  END IF;
  PERFORM cron.schedule('chamados-prazo-1h', '13 * * * *', 'SELECT private.chamados_avisar_atrasados()');
END $$;
