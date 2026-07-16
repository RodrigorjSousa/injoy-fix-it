SELECT cron.unschedule('limpar-recados-camareira-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-recados-camareira-diario');

-- 23:00 America/Sao_Paulo (UTC-3) = 02:00 UTC
SELECT cron.schedule(
  'limpar-recados-camareira-diario',
  '0 2 * * *',
  $$DELETE FROM public.recados_camareiras WHERE direction = 'to_recepcao';$$
);