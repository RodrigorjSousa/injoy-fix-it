-- Tela RESERVAS: recalcula a lista de cobrança a cada 1 hora (minuto 7, para não coincidir com
-- os outros agendamentos da hora cheia). A função foi criada na 0061. Idempotente.
DO $$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname = 'reservas-cobranca-1h';
  IF v_job IS NOT NULL THEN
    PERFORM cron.unschedule(v_job);
  END IF;
  PERFORM cron.schedule('reservas-cobranca-1h', '7 * * * *', 'SELECT private.run_reservas_cobranca_sync()');
END $$;