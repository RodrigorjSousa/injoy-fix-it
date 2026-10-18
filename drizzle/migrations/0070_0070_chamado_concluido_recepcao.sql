-- Aviso de chamado finalizado também para a RECEPÇÃO (quarto liberado).
-- A 0069 só mandava quando quem abriu era diferente de quem fechou; agora manda em todo fechamento
-- e leva quem fechou, para o servidor não avisar a própria pessoa. Idempotente.

CREATE OR REPLACE FUNCTION private.tg_chamados_push_concluido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.status = 'Concluído' AND OLD.status IS DISTINCT FROM 'Concluído' THEN
    PERFORM private.enqueue_push_notification('chamado_concluido', jsonb_build_object(
      'id', NEW.id, 'unidade', NEW.unidade, 'categoria', NEW.categoria, 'descricao', NEW.descricao,
      'criado_por', NEW.criado_por, 'concluido_por', NEW.concluido_por,
      'concluido_por_nome', NEW.concluido_por_nome,
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