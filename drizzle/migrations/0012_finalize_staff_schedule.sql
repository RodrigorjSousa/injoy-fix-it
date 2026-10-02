ALTER TABLE public.escala_meses
  ADD COLUMN IF NOT EXISTS justificativa_publicacao text;

ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS origem_escala text;

CREATE UNIQUE INDEX IF NOT EXISTS fin_lancamentos_origem_escala_uidx
  ON public.fin_lancamentos (origem_escala)
  WHERE origem_escala IS NOT NULL;

CREATE OR REPLACE FUNCTION public.escala_sincronizar_financeiro(
  _unidade text,
  _competencia date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria uuid;
  v_count integer := 0;
  v_item record;
  v_existing record;
  v_key text;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;

  SELECT id INTO v_categoria
  FROM public.fin_categorias
  WHERE lower(nome) IN ('freelancers (diárias)', 'freelancers (diarias)', 'freelancers')
    AND tipo = 'despesa'
  ORDER BY CASE WHEN lower(nome) = 'freelancers (diárias)' THEN 0 ELSE 1 END, ordem
  LIMIT 1;

  IF v_categoria IS NULL THEN
    RAISE EXCEPTION 'Cadastre a categoria financeira Freelancers (diárias)';
  END IF;

  FOR v_item IN
    SELECT
      d.colaborador_id,
      c.nome,
      d.unidade,
      count(*)::integer AS qtd,
      coalesce(sum(d.valor_combinado), 0)::numeric AS total,
      string_agg(
        concat(g.qtd, '× ', g.modalidade, ' ', trim(to_char(g.horas, 'FM999990D##')), ' h (',
          to_char(g.valor, 'FM"R$ "999G999G990D00'), ')'),
        ' + ' ORDER BY g.modalidade, g.horas, g.valor
      ) AS detalhe
    FROM public.escala_dias d
    JOIN public.escala_colaboradores c ON c.id = d.colaborador_id
    JOIN LATERAL (
      SELECT count(*)::integer AS qtd,
        coalesce(m.nome,
          CASE d.motivo_chamada
            WHEN 'reforco_ocupacao' THEN 'Reforço'
            WHEN 'cobertura_falta' THEN 'Cobertura de falta'
            ELSE 'Plantão'
          END
        ) AS modalidade,
        d.horas_contratadas AS horas,
        d.valor_combinado AS valor
      FROM public.escala_dias dx
      LEFT JOIN public.escala_freelance_modalidades m ON m.id = dx.modalidade_id
      WHERE dx.colaborador_id = d.colaborador_id
        AND dx.unidade = d.unidade
        AND date_trunc('month', dx.data)::date = _competencia
        AND dx.status = 'extra'
      GROUP BY coalesce(m.nome,
          CASE dx.motivo_chamada
            WHEN 'reforco_ocupacao' THEN 'Reforço'
            WHEN 'cobertura_falta' THEN 'Cobertura de falta'
            ELSE 'Plantão'
          END), dx.horas_contratadas, dx.valor_combinado
    ) g ON true
    WHERE d.unidade = _unidade
      AND date_trunc('month', d.data)::date = _competencia
      AND d.status = 'extra'
    GROUP BY d.colaborador_id, c.nome, d.unidade
  LOOP
    v_key := v_item.colaborador_id::text || ':' || _competencia::text || ':' || v_item.unidade;
    SELECT id, status INTO v_existing
    FROM public.fin_lancamentos
    WHERE origem_escala = v_key;

    IF v_existing.id IS NULL THEN
      INSERT INTO public.fin_lancamentos (
        tipo, unidade, categoria_id, descricao, valor, competencia, status,
        freelancer_nome, qtd_diarias, origem_escala, created_by
      ) VALUES (
        'despesa', v_item.unidade, v_categoria, v_item.detalhe, v_item.total,
        _competencia, 'previsto', v_item.nome, v_item.qtd, v_key, auth.uid()
      );
      v_count := v_count + 1;
    ELSIF v_existing.status <> 'pago' THEN
      UPDATE public.fin_lancamentos
      SET descricao = v_item.detalhe,
          valor = v_item.total,
          categoria_id = v_categoria,
          freelancer_nome = v_item.nome,
          qtd_diarias = v_item.qtd,
          unidade = v_item.unidade,
          competencia = _competencia
      WHERE id = v_existing.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_sincronizar_financeiro(text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_sincronizar_financeiro(text,date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.escala_publicar_mes(
  _unidade text,
  _setor text,
  _competencia date,
  _justificativa text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF _unidade NOT IN ('Botafogo','Ipanema') OR _setor NOT IN ('manutencao','recepcao','camareiras') THEN
    RAISE EXCEPTION 'Unidade ou setor inválido';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.escala_dias
    WHERE unidade = _unidade AND setor = _setor
      AND data >= _competencia AND data < (_competencia + interval '1 month')
  ) THEN
    RAISE EXCEPTION 'Gere a escala antes de publicar';
  END IF;

  INSERT INTO public.escala_meses (unidade, setor, competencia, status, publicada_em, publicada_por, justificativa_publicacao)
  VALUES (_unidade, _setor, _competencia, 'publicada', now(), auth.uid(), nullif(trim(_justificativa), ''))
  ON CONFLICT (unidade, setor, competencia) DO UPDATE
    SET status = 'publicada', publicada_em = now(), publicada_por = auth.uid(),
        justificativa_publicacao = nullif(trim(_justificativa), '');

  PERFORM public.escala_sincronizar_financeiro(_unidade, _competencia);
END;
$$;
REVOKE ALL ON FUNCTION public.escala_publicar_mes(text,text,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_publicar_mes(text,text,date,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.escala_publicar_mes(_unidade text, _setor text, _competencia date)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.escala_publicar_mes(_unidade, _setor, _competencia, NULL); $$;
REVOKE ALL ON FUNCTION public.escala_publicar_mes(text,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_publicar_mes(text,text,date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.tg_escala_meses_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'publicada' AND (TG_OP = 'INSERT' OR OLD.publicada_em IS DISTINCT FROM NEW.publicada_em) THEN
    PERFORM private.enqueue_push_notification('escala_publicada', jsonb_build_object(
      'id', NEW.id,
      'unidade', NEW.unidade,
      'setor', NEW.setor,
      'competencia', NEW.competencia
    ));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.tg_escala_meses_push() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.tg_escala_meses_push() TO service_role;

DROP TRIGGER IF EXISTS escala_meses_push_after_write ON public.escala_meses;
CREATE TRIGGER escala_meses_push_after_write
AFTER INSERT OR UPDATE ON public.escala_meses
FOR EACH ROW EXECUTE FUNCTION private.tg_escala_meses_push();

CREATE OR REPLACE FUNCTION public.escala_registrar_alteracao_publicada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_publicada boolean;
  v_user_id uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.escala_meses m
    WHERE m.unidade = NEW.unidade AND m.setor = NEW.setor
      AND m.competencia = date_trunc('month', NEW.data)::date
      AND m.status = 'publicada'
  ) INTO v_publicada;

  IF v_publicada AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
    INSERT INTO public.escala_alteracoes (escala_dia_id, alterado_por, antes, depois, motivo)
    VALUES (NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW), NEW.motivo);

    SELECT f.user_id INTO v_user_id
    FROM public.escala_colaboradores c
    JOIN public.funcionarios f ON f.id = c.funcionario_id
    WHERE c.id = NEW.colaborador_id;

    IF v_user_id IS NOT NULL THEN
      PERFORM private.enqueue_push_notification('escala_alterada', jsonb_build_object(
        'id', NEW.id,
        'user_id', v_user_id,
        'data', NEW.data,
        'antes', OLD.status,
        'depois', NEW.status,
        'motivo', NEW.motivo
      ));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_registrar_alteracao_publicada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escala_registrar_alteracao_publicada() TO service_role;

CREATE OR REPLACE VIEW public.escala_prevista_dia
WITH (security_invoker = true)
AS
SELECT
  d.colaborador_id,
  c.funcionario_id,
  d.data,
  d.unidade,
  d.turno,
  d.hora_entrada,
  d.hora_saida,
  d.status
FROM public.escala_dias d
JOIN public.escala_colaboradores c ON c.id = d.colaborador_id;

GRANT SELECT ON public.escala_prevista_dia TO authenticated;
GRANT ALL ON public.escala_prevista_dia TO service_role;
