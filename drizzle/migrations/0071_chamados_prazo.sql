-- Prazo dos chamados: quem foi chamado tem 3 dias (72 h desde a abertura) para concluir.
-- Passou do prazo e não está Concluído → aviso URGENTE para o técnico responsável e os gestores,
-- repetido a cada 24 h enquanto continuar aberto. O agendamento fica na 0072. Idempotente.

ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS prazo_avisado_em timestamptz;

CREATE OR REPLACE FUNCTION private.chamados_avisar_atrasados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  r record;
  v_qtd integer := 0;
BEGIN
  FOR r IN
    SELECT c.id, c.unidade, c.categoria, c.descricao, c.responsavel_id, c.responsavel_nome, c.status, c.created_at
    FROM public.chamados c
    WHERE c.status <> 'Concluído'
      AND c.created_at < now() - interval '3 days'
      AND (c.prazo_avisado_em IS NULL OR c.prazo_avisado_em < now() - interval '23 hours 30 minutes')
    ORDER BY c.created_at
    LIMIT 200
  LOOP
    PERFORM private.enqueue_push_notification('chamado_atrasado', jsonb_build_object(
      'id', r.id, 'unidade', r.unidade, 'categoria', r.categoria, 'descricao', r.descricao,
      'responsavel_id', r.responsavel_id, 'responsavel_nome', r.responsavel_nome, 'status', r.status,
      'aberto_em', r.created_at,
      'dias_aberto', floor(extract(epoch FROM now() - r.created_at) / 86400)::int
    ));
    UPDATE public.chamados SET prazo_avisado_em = now() WHERE id = r.id;
    v_qtd := v_qtd + 1;
  END LOOP;
  RETURN v_qtd;
END;
$$;
REVOKE ALL ON FUNCTION private.chamados_avisar_atrasados() FROM PUBLIC, anon, authenticated;
