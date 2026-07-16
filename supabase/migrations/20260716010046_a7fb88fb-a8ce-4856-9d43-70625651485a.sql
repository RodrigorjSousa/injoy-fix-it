CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove agendamento anterior se existir
SELECT cron.unschedule('limpar-recados-recepcao-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-recados-recepcao-diario');

-- 23:00 America/Sao_Paulo (UTC-3) = 02:00 UTC
SELECT cron.schedule(
  'limpar-recados-recepcao-diario',
  '0 2 * * *',
  $$DELETE FROM public.recados_camareiras WHERE direction = 'to_camareira';$$
);