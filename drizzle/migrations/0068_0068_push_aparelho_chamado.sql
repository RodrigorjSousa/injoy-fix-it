-- Notificações: garante que o aparelho avisa QUEM está logado nele, e avisa o técnico quando o
-- chamado é designado (ou redesignado) para ele depois de aberto. Idempotente.
--
-- Problema: a inscrição push é do aparelho (endpoint único). Num celular/tablet usado por mais de
-- uma pessoa, a linha ficava com o primeiro usuário; o segundo tentava gravar e a regra de
-- segurança (só altera a própria linha) recusava. O sininho ficava verde (o navegador está
-- inscrito), mas os avisos iam para a outra pessoa — ou para ninguém.

CREATE OR REPLACE FUNCTION public.push_registrar_aparelho(
  _endpoint text,
  _p256dh text,
  _auth text,
  _user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login novamente.'; END IF;
  IF coalesce(btrim(_endpoint), '') = '' OR coalesce(btrim(_p256dh), '') = '' OR coalesce(btrim(_auth), '') = '' THEN
    RAISE EXCEPTION 'Inscrição de notificação inválida.';
  END IF;
  -- O aparelho passa a avisar só quem está logado nele agora.
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent, last_used_at)
  VALUES (v_uid, _endpoint, _p256dh, _auth, left(_user_agent, 300), now())
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth_key = EXCLUDED.auth_key,
        user_agent = EXCLUDED.user_agent,
        last_used_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.push_registrar_aparelho(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_registrar_aparelho(text, text, text, text) TO authenticated;

-- Chamado designado depois de aberto (troca de técnico): avisa o novo responsável.
CREATE OR REPLACE FUNCTION private.tg_chamados_push_designado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.responsavel_id IS NOT NULL AND NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    PERFORM private.enqueue_push_notification('chamado_designado', jsonb_build_object(
      'id', NEW.id, 'unidade', NEW.unidade, 'categoria', NEW.categoria,
      'descricao', NEW.descricao, 'responsavel_id', NEW.responsavel_id
    ));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.tg_chamados_push_designado() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chamados_push_after_update_responsavel ON public.chamados;
CREATE TRIGGER chamados_push_after_update_responsavel
AFTER UPDATE OF responsavel_id ON public.chamados
FOR EACH ROW EXECUTE FUNCTION private.tg_chamados_push_designado();