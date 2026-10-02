CREATE OR REPLACE FUNCTION private.run_housekeeping_load_forecast()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT replace(value, '/api/public/push-dispatcher', '/api/public/previsao-carga')
    INTO v_url FROM public.app_settings WHERE key = 'push_dispatcher_url';
  SELECT value INTO v_secret FROM public.app_settings WHERE key = 'push_dispatcher_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatcher-secret', v_secret),
    body := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'run_housekeeping_load_forecast failed: %', SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION private.run_housekeeping_load_forecast() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.run_housekeeping_load_forecast() TO service_role;
SELECT cron.schedule('housekeeping-load-forecast-0700', '0 10 * * *', 'SELECT private.run_housekeeping_load_forecast()');
SELECT cron.schedule('housekeeping-load-forecast-1200', '0 15 * * *', 'SELECT private.run_housekeeping_load_forecast()');
SELECT cron.schedule('housekeeping-load-forecast-1700', '0 20 * * *', 'SELECT private.run_housekeeping_load_forecast()');