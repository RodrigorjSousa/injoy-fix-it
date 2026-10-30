-- Lembrete de saída do ponto a cada 15 minutos (minutos 7, 22, 37 e 52, fora da hora cheia).
-- A função foi criada na 0088. Idempotente.
DO $$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname = 'ponto-lembrete-saida';
  IF v_job IS NOT NULL THEN
    PERFORM cron.unschedule(v_job);
  END IF;
  PERFORM cron.schedule('ponto-lembrete-saida', '7,22,37,52 * * * *', 'SELECT private.ponto_lembrar_saidas()');
END $$;
