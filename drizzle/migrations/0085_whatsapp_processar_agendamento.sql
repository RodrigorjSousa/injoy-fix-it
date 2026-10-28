-- Joy — E3: a cada 1 minuto, se o WhatsApp estiver ligado e houver conversa esperando rascunho, chama
-- /api/public/whatsapp-processar (mesmo endereço e segredo do push-dispatcher, como as outras rotinas).
-- Com o modo "desligado" ou nada pendente, não faz nenhuma chamada. Idempotente.

CREATE OR REPLACE FUNCTION private.run_whatsapp_processar()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_url text; v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.wa_config WHERE id = 'joy' AND whatsapp_modo <> 'desligado') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_conversas c
    WHERE c.canal = 'whatsapp'
      AND c.modo = 'ia'
      AND c.ultima_msg_cliente_em IS NOT NULL
      AND c.ultima_msg_cliente_em > coalesce(c.atendida_ate, '-infinity'::timestamptz)
      AND (c.pausada_ate IS NULL OR c.pausada_ate < now())
  ) THEN
    RETURN;
  END IF;
  SELECT replace(value, '/api/public/push-dispatcher', '/api/public/whatsapp-processar')
    INTO v_url FROM public.app_settings WHERE key = 'push_dispatcher_url';
  SELECT value INTO v_secret FROM public.app_settings WHERE key = 'push_dispatcher_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'run_whatsapp_processar: push_dispatcher_url/secret não configurados';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatcher-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'run_whatsapp_processar failed: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION private.run_whatsapp_processar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.run_whatsapp_processar() TO service_role;

DO $$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname = 'whatsapp-processar-1min';
  IF v_job IS NOT NULL THEN
    PERFORM cron.unschedule(v_job);
  END IF;
  PERFORM cron.schedule('whatsapp-processar-1min', '* * * * *', 'SELECT private.run_whatsapp_processar()');
END $$;
