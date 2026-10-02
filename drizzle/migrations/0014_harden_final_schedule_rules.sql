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
    WITH shifts AS (
      SELECT d.colaborador_id, c.nome, d.unidade, d.valor_combinado,
        coalesce(m.nome,
          CASE d.motivo_chamada
            WHEN 'reforco_ocupacao' THEN 'Reforço'
            WHEN 'cobertura_falta' THEN 'Cobertura de falta'
            ELSE 'Plantão'
          END
        ) AS modalidade,
        d.horas_contratadas
      FROM public.escala_dias d
      JOIN public.escala_colaboradores c ON c.id = d.colaborador_id
      LEFT JOIN public.escala_freelance_modalidades m ON m.id = d.modalidade_id
      WHERE d.unidade = _unidade
        AND date_trunc('month', d.data)::date = _competencia
        AND d.status = 'extra'
    ), grouped AS (
      SELECT colaborador_id, nome, unidade, modalidade, horas_contratadas,
        valor_combinado, count(*)::integer AS quantidade
      FROM shifts
      GROUP BY colaborador_id, nome, unidade, modalidade, horas_contratadas, valor_combinado
    )
    SELECT colaborador_id, nome, unidade,
      sum(quantidade)::integer AS qtd,
      coalesce(sum(valor_combinado * quantidade), 0)::numeric AS total,
      string_agg(
        concat(quantidade, '× ', modalidade, ' ', coalesce(trim(to_char(horas_contratadas, 'FM999990D##')), '?'), ' h (',
          CASE WHEN valor_combinado IS NULL THEN 'valor pendente'
               ELSE to_char(valor_combinado * quantidade, 'FM"R$ "999G999G990D00') END, ')'),
        ' + ' ORDER BY modalidade, horas_contratadas, valor_combinado
      ) AS detalhe
    FROM grouped
    GROUP BY colaborador_id, nome, unidade
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

  UPDATE public.fin_lancamentos l
  SET status = 'cancelado',
      observacoes = concat_ws(' ', nullif(l.observacoes, ''), 'Cancelado automaticamente: não há mais plantões desta pessoa na escala.')
  WHERE l.origem_escala IS NOT NULL
    AND l.unidade = _unidade
    AND l.competencia = _competencia
    AND l.status <> 'pago'
    AND NOT EXISTS (
      SELECT 1
      FROM public.escala_dias d
      WHERE d.status = 'extra'
        AND d.unidade = _unidade
        AND date_trunc('month', d.data)::date = _competencia
        AND l.origem_escala = d.colaborador_id::text || ':' || _competencia::text || ':' || d.unidade
    );

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_sincronizar_financeiro(text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_sincronizar_financeiro(text,date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.escala_registrar_alteracao_publicada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_publicada boolean;
  v_user_id uuid;
  v_row public.escala_dias%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_motivo text;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT EXISTS (
    SELECT 1 FROM public.escala_meses m
    WHERE m.unidade = v_row.unidade AND m.setor = v_row.setor
      AND m.competencia = date_trunc('month', v_row.data)::date
      AND m.status = 'publicada'
  ) INTO v_publicada;

  v_before := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  v_after := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  v_motivo := coalesce(CASE WHEN TG_OP = 'DELETE' THEN OLD.motivo ELSE NEW.motivo END, 'Alteração administrativa');

  IF v_publicada AND v_before IS DISTINCT FROM v_after THEN
    INSERT INTO public.escala_alteracoes (escala_dia_id, alterado_por, antes, depois, motivo)
    VALUES (v_row.id, auth.uid(), v_before, v_after, v_motivo);

    SELECT f.user_id INTO v_user_id
    FROM public.escala_colaboradores c
    JOIN public.funcionarios f ON f.id = c.funcionario_id
    WHERE c.id = v_row.colaborador_id;

    IF v_user_id IS NOT NULL THEN
      PERFORM private.enqueue_push_notification('escala_alterada', jsonb_build_object(
        'id', v_row.id,
        'user_id', v_user_id,
        'data', v_row.data,
        'antes', CASE WHEN TG_OP = 'INSERT' THEN 'sem escala' ELSE OLD.status END,
        'depois', CASE WHEN TG_OP = 'DELETE' THEN 'removido' ELSE NEW.status END,
        'motivo', v_motivo
      ));
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_registrar_alteracao_publicada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escala_registrar_alteracao_publicada() TO service_role;

CREATE TRIGGER tr_escala_dias_auditoria_insert
AFTER INSERT ON public.escala_dias
FOR EACH ROW EXECUTE FUNCTION public.escala_registrar_alteracao_publicada();

CREATE TRIGGER tr_escala_dias_auditoria_delete
AFTER DELETE ON public.escala_dias
FOR EACH ROW EXECUTE FUNCTION public.escala_registrar_alteracao_publicada();
