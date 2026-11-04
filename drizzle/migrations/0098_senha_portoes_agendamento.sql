-- A cada 15 minutos, se algum totem estiver com "senha provisória dos portões" ligada, chama
-- /api/public/senha-portoes (mesmo endereço e segredo do push-dispatcher, como as outras rotinas).
-- Idempotente.

CREATE OR REPLACE FUNCTION private.run_senha_portoes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_url text; v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.totem_dispositivos WHERE ativo AND senha_portoes_auto) THEN
    RETURN;
  END IF;
  SELECT replace(value, '/api/public/push-dispatcher', '/api/public/senha-portoes')
    INTO v_url FROM public.app_settings WHERE key = 'push_dispatcher_url';
  SELECT value INTO v_secret FROM public.app_settings WHERE key = 'push_dispatcher_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'run_senha_portoes: push_dispatcher_url/secret não configurados';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatcher-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'run_senha_portoes failed: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION private.run_senha_portoes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.run_senha_portoes() TO service_role;

DO $$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname = 'senha-portoes-15min';
  IF v_job IS NOT NULL THEN
    PERFORM cron.unschedule(v_job);
  END IF;
  PERFORM cron.schedule('senha-portoes-15min', '*/15 * * * *', 'SELECT private.run_senha_portoes()');
END $$;
