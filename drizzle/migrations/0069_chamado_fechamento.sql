-- Fechamento do chamado: grava QUEM fechou (e quando, já existia concluido_em) e avisa quem abriu.
-- O app só muda o status; o banco preenche os dados — ninguém consegue forjar quem fechou.
-- Reabrir o chamado apaga o fechamento. Idempotente.

ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS concluido_por uuid;
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS concluido_por_nome text;

CREATE OR REPLACE FUNCTION private.tg_chamados_fechamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NEW.status = 'Concluído' AND OLD.status IS DISTINCT FROM 'Concluído' THEN
    NEW.concluido_em := now();
    NEW.concluido_por := v_uid;
    NEW.concluido_por_nome := coalesce(
      (SELECT f.nome FROM public.funcionarios f WHERE f.user_id = v_uid ORDER BY f.nome LIMIT 1),
      (SELECT p.nome FROM public.profiles p WHERE p.id = v_uid),
      (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
      CASE WHEN v_uid IS NULL THEN 'Sistema' END
    );
  ELSIF NEW.status = 'Concluído' THEN
    -- Continua fechado: mantém o registro original do fechamento.
    NEW.concluido_em := OLD.concluido_em;
    NEW.concluido_por := OLD.concluido_por;
    NEW.concluido_por_nome := OLD.concluido_por_nome;
  ELSE
    NEW.concluido_em := NULL;
    NEW.concluido_por := NULL;
    NEW.concluido_por_nome := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.tg_chamados_fechamento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_chamados_fechamento ON public.chamados;
CREATE TRIGGER tr_chamados_fechamento
BEFORE UPDATE ON public.chamados
FOR EACH ROW EXECUTE FUNCTION private.tg_chamados_fechamento();

-- Aviso para quem abriu o chamado (se não foi a mesma pessoa que fechou).
CREATE OR REPLACE FUNCTION private.tg_chamados_push_concluido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.status = 'Concluído' AND OLD.status IS DISTINCT FROM 'Concluído'
     AND NEW.criado_por IS NOT NULL
     AND NEW.criado_por IS DISTINCT FROM NEW.concluido_por THEN
    PERFORM private.enqueue_push_notification('chamado_concluido', jsonb_build_object(
      'id', NEW.id, 'unidade', NEW.unidade, 'categoria', NEW.categoria, 'descricao', NEW.descricao,
      'criado_por', NEW.criado_por, 'concluido_por_nome', NEW.concluido_por_nome,
      'aberto_em', NEW.created_at, 'concluido_em', NEW.concluido_em
    ));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.tg_chamados_push_concluido() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chamados_push_after_concluido ON public.chamados;
CREATE TRIGGER chamados_push_after_concluido
AFTER UPDATE OF status ON public.chamados
FOR EACH ROW EXECUTE FUNCTION private.tg_chamados_push_concluido();
