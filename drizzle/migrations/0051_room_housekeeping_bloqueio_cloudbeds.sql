-- Card do quarto: tipo e motivo do bloqueio vindos do Cloudbeds (getRoomBlocks).
--   block_kind  = 'manutencao' | 'bloqueado' | null
--   block_reason = motivo escrito no Cloudbeds
-- E a sincronização automática passa de 15 para 5 minutos.
-- Pode ser aplicada mais de uma vez.

ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS block_kind text;
ALTER TABLE public.room_housekeeping ADD COLUMN IF NOT EXISTS block_reason text;

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
