
-- Push subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.push_subscriptions (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own subs select" ON public.push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own subs insert" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own subs update" ON public.push_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own subs delete" ON public.push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Settings for dispatcher (URL + shared secret). Only service_role reads.
INSERT INTO public.app_settings (key, value) VALUES
  ('push_dispatcher_url', 'https://project--e316cfb5-227e-4195-884c-0f51635d3f28.lovable.app/api/public/push-dispatcher'),
  ('push_dispatcher_secret', 'd09ddd68faf4a9ee703caa55635ee9313cd9832ad370560f5b71c1a709c77822')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Enqueue function
CREATE OR REPLACE FUNCTION private.enqueue_push_notification(_event TEXT, _payload JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
BEGIN
  SELECT value INTO v_url FROM public.app_settings WHERE key = 'push_dispatcher_url';
  SELECT value INTO v_secret FROM public.app_settings WHERE key = 'push_dispatcher_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatcher-secret', v_secret
    ),
    body := jsonb_build_object('event', _event, 'data', _payload)
  );
EXCEPTION WHEN OTHERS THEN
  -- Never break the source transaction because of push delivery
  RAISE WARNING 'enqueue_push_notification failed: %', SQLERRM;
END;
$$;

-- Trigger: chamados INSERT
CREATE OR REPLACE FUNCTION private.tg_chamados_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.enqueue_push_notification('chamado', jsonb_build_object(
    'id', NEW.id, 'unidade', NEW.unidade, 'categoria', NEW.categoria,
    'descricao', NEW.descricao, 'responsavel_id', NEW.responsavel_id
  ));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chamados_push_after_insert ON public.chamados;
CREATE TRIGGER chamados_push_after_insert AFTER INSERT ON public.chamados
FOR EACH ROW EXECUTE FUNCTION private.tg_chamados_push();

-- Trigger: recados_camareiras INSERT
CREATE OR REPLACE FUNCTION private.tg_recados_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.enqueue_push_notification('recado_camareira', jsonb_build_object(
    'id', NEW.id, 'property', NEW.property, 'room_number', NEW.room_number,
    'message', NEW.message, 'direction', NEW.direction, 'created_by_name', NEW.created_by_name
  ));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS recados_push_after_insert ON public.recados_camareiras;
CREATE TRIGGER recados_push_after_insert AFTER INSERT ON public.recados_camareiras
FOR EACH ROW EXECUTE FUNCTION private.tg_recados_push();

-- Trigger: trocas_turno INSERT
CREATE OR REPLACE FUNCTION private.tg_trocas_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.enqueue_push_notification('troca_turno', jsonb_build_object(
    'id', NEW.id, 'unidade', NEW.unidade,
    'funcionario_saida', NEW.funcionario_saida, 'funcionario_entrada', NEW.funcionario_entrada
  ));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trocas_push_after_insert ON public.trocas_turno;
CREATE TRIGGER trocas_push_after_insert AFTER INSERT ON public.trocas_turno
FOR EACH ROW EXECUTE FUNCTION private.tg_trocas_push();

-- Trigger: purchase_requests INSERT
CREATE OR REPLACE FUNCTION private.tg_purchase_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.enqueue_push_notification('purchase_request', jsonb_build_object(
    'id', NEW.id, 'property', NEW.property, 'item_name', NEW.item_name,
    'quantity', NEW.quantity, 'urgency', NEW.urgency, 'requested_by', NEW.requested_by
  ));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS purchase_push_after_insert ON public.purchase_requests;
CREATE TRIGGER purchase_push_after_insert AFTER INSERT ON public.purchase_requests
FOR EACH ROW EXECUTE FUNCTION private.tg_purchase_push();
