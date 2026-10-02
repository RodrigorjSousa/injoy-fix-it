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
        concat(quantidade, '× ', modalidade, ' ', trim(to_char(horas_contratadas, 'FM999990D##')), ' h (',
          to_char(valor_combinado * quantidade, 'FM"R$ "999G999G990D00'), ')'),
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

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_sincronizar_financeiro(text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_sincronizar_financeiro(text,date) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.escala_alertas_financeiros
WITH (security_invoker = true)
AS
WITH expected AS (
  SELECT d.colaborador_id, d.unidade, date_trunc('month', d.data)::date AS competencia,
    c.nome, count(*)::integer AS qtd, coalesce(sum(d.valor_combinado), 0)::numeric AS total,
    count(*) FILTER (WHERE d.valor_combinado IS NULL OR d.valor_combinado <= 0)::integer AS sem_valor
  FROM public.escala_dias d
  JOIN public.escala_colaboradores c ON c.id = d.colaborador_id
  WHERE d.status = 'extra'
  GROUP BY d.colaborador_id, d.unidade, date_trunc('month', d.data)::date, c.nome
), uncovered AS (
  SELECT d.unidade, date_trunc('month', d.data)::date AS competencia,
    count(*)::integer AS faltas_descobertas
  FROM public.escala_dias d
  WHERE d.status = 'falta'
    AND NOT EXISTS (
      SELECT 1 FROM public.escala_dias x
      WHERE x.data = d.data AND x.unidade = d.unidade AND x.setor = d.setor
        AND x.status = 'extra' AND x.substitui_colaborador_id = d.colaborador_id
    )
  GROUP BY d.unidade, date_trunc('month', d.data)::date
)
SELECT e.colaborador_id, e.unidade, e.competencia, e.nome, e.qtd, e.total, e.sem_valor,
  coalesce(u.faltas_descobertas, 0) AS faltas_descobertas,
  l.id AS lancamento_id, l.status AS lancamento_status, l.valor AS valor_lancamento,
  (l.status = 'pago' AND l.valor IS DISTINCT FROM e.total) AS divergencia_pago
FROM expected e
LEFT JOIN uncovered u ON u.unidade = e.unidade AND u.competencia = e.competencia
LEFT JOIN public.fin_lancamentos l
  ON l.origem_escala = e.colaborador_id::text || ':' || e.competencia::text || ':' || e.unidade;

GRANT SELECT ON public.escala_alertas_financeiros TO authenticated;
GRANT ALL ON public.escala_alertas_financeiros TO service_role;
