CREATE OR REPLACE FUNCTION public.fin_folha_lancar(
  _competencia date,
  _itens jsonb,
  _beneficios jsonb,
  _plantoes jsonb,
  _resumo jsonb DEFAULT '[]'::jsonb,
  _total numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_cat uuid;
  v_key text;
  v_keys text[] := ARRAY[]::text[];
  v_valor numeric;
  v_unid text;
  v_colab record;
  v_exist record;
  v_dia record;
  v_venc date;
  v_dia_pag smallint;
  v_criados int := 0;
  v_atualizados int := 0;
  v_pagos int := 0;
  v_cancelados int := 0;
  v_plantoes int := 0;
  v_plantoes_pagos int := 0;
  v_benef jsonb := '{}'::jsonb;
  v_chaves text[] := ARRAY[]::text[];
  v_zerados int := 0;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF _competencia IS NULL OR extract(day FROM _competencia) <> 1 THEN
    RAISE EXCEPTION 'Competência inválida (use o dia 1 do mês)';
  END IF;
  IF jsonb_typeof(_itens) IS DISTINCT FROM 'array'
     OR jsonb_typeof(_beneficios) IS DISTINCT FROM 'array'
     OR jsonb_typeof(_plantoes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Dados da folha inválidos';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_plantoes) LOOP
    v_valor := round(coalesce((v_item->>'valor')::numeric, 0), 2);
    IF v_valor < 0 THEN RAISE EXCEPTION 'Valor de plantão inválido'; END IF;
    SELECT d.id, d.colaborador_id, d.unidade, d.valor_combinado INTO v_dia
    FROM public.escala_dias d
    WHERE d.id = (v_item->>'id')::uuid
      AND d.status = 'extra'
      AND date_trunc('month', d.data)::date = _competencia;
    IF v_dia.id IS NULL THEN CONTINUE; END IF;
    IF v_dia.valor_combinado IS NOT DISTINCT FROM v_valor THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.fin_lancamentos l
      WHERE l.origem_escala = v_dia.colaborador_id::text || ':' || _competencia::text || ':' || v_dia.unidade
        AND l.status = 'pago'
    ) THEN
      v_plantoes_pagos := v_plantoes_pagos + 1;
      CONTINUE;
    END IF;
    UPDATE public.escala_dias SET valor_combinado = v_valor, updated_by = auth.uid(), updated_at = now()
    WHERE id = v_dia.id;
    v_plantoes := v_plantoes + 1;
    v_chaves := array_append(v_chaves, v_dia.colaborador_id::text || ':' || _competencia::text || ':' || v_dia.unidade);
  END LOOP;

  UPDATE public.fin_lancamentos l
  SET status = 'cancelado',
      observacoes = concat_ws(' ', nullif(l.observacoes, ''), 'Cancelado pela folha: pago como hora extra.')
  WHERE l.origem_escala = ANY (v_chaves)
    AND l.status NOT IN ('pago', 'cancelado')
    AND NOT EXISTS (
      SELECT 1 FROM public.escala_dias d
      WHERE d.status = 'extra'
        AND date_trunc('month', d.data)::date = _competencia
        AND d.colaborador_id::text || ':' || _competencia::text || ':' || d.unidade = l.origem_escala
        AND coalesce(d.valor_combinado, 0) > 0
    );
  GET DIAGNOSTICS v_zerados = ROW_COUNT;

  v_benef := public.escala_lancar_beneficios(_competencia, _beneficios);

  SELECT id INTO v_cat FROM public.fin_categorias
  WHERE tipo = 'despesa' AND lower(nome) IN ('salários', 'salarios', 'folha de pagamento')
  ORDER BY CASE lower(nome) WHEN 'salários' THEN 0 WHEN 'salarios' THEN 1 ELSE 2 END, ordem
  LIMIT 1;
  IF v_cat IS NULL THEN
    INSERT INTO public.fin_categorias (nome, grupo, tipo, ordem)
    VALUES ('Salários', 'pessoal', 'despesa', 0)
    ON CONFLICT (nome, tipo) DO NOTHING;
    SELECT id INTO v_cat FROM public.fin_categorias
    WHERE tipo = 'despesa' AND nome = 'Salários' LIMIT 1;
  END IF;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'Categoria Salários não encontrada'; END IF;

  SELECT dia_pagamento INTO v_dia_pag FROM public.fin_folha_config WHERE id = 1;
  v_venc := (_competencia + interval '1 month')::date + (coalesce(v_dia_pag, 5) - 1);

  FOR v_item IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    v_valor := round(coalesce((v_item->>'valor')::numeric, 0), 2);
    v_unid := v_item->>'unidade';
    IF v_unid NOT IN ('Botafogo', 'Ipanema', 'Ambas') THEN RAISE EXCEPTION 'Unidade inválida'; END IF;
    IF v_valor <= 0 THEN CONTINUE; END IF;
    SELECT c.id, c.nome, c.funcionario_id INTO v_colab
    FROM public.escala_colaboradores c WHERE c.id = (v_item->>'colaborador_id')::uuid;
    IF v_colab.id IS NULL THEN RAISE EXCEPTION 'Pessoa da folha não encontrada'; END IF;

    v_key := 'folha:' || v_colab.id::text || ':' || _competencia::text || ':' || v_unid;
    v_keys := array_append(v_keys, v_key);
    SELECT id, status INTO v_exist FROM public.fin_lancamentos WHERE origem_folha = v_key;
    IF v_exist.id IS NULL THEN
      INSERT INTO public.fin_lancamentos (tipo, unidade, categoria_id, descricao, valor, competencia,
        data_vencimento, status, funcionario_id, freelancer_nome, origem_folha, created_by)
      VALUES ('despesa', v_unid, v_cat, left(coalesce(v_item->>'descricao', 'Folha'), 500), v_valor, _competencia,
        v_venc, 'a_pagar', v_colab.funcionario_id,
        CASE WHEN v_colab.funcionario_id IS NULL THEN v_colab.nome END, v_key, auth.uid());
      v_criados := v_criados + 1;
    ELSIF v_exist.status = 'pago' THEN
      v_pagos := v_pagos + 1;
    ELSE
      UPDATE public.fin_lancamentos
      SET descricao = left(coalesce(v_item->>'descricao', descricao), 500), valor = v_valor,
          categoria_id = v_cat, unidade = v_unid, funcionario_id = v_colab.funcionario_id,
          freelancer_nome = CASE WHEN v_colab.funcionario_id IS NULL THEN v_colab.nome END,
          status = CASE WHEN status = 'cancelado' THEN 'a_pagar' ELSE status END,
          data_vencimento = coalesce(data_vencimento, v_venc)
      WHERE id = v_exist.id;
      v_atualizados := v_atualizados + 1;
    END IF;
  END LOOP;

  UPDATE public.fin_lancamentos
  SET status = 'cancelado',
      observacoes = concat_ws(' ', nullif(observacoes, ''), 'Cancelado automaticamente: saiu da folha do mês.')
  WHERE origem_folha IS NOT NULL
    AND competencia = _competencia
    AND status NOT IN ('pago', 'cancelado')
    AND NOT (origem_folha = ANY (v_keys));
  GET DIAGNOSTICS v_cancelados = ROW_COUNT;

  INSERT INTO public.fin_folha_meses (competencia, total, resumo, lancado_em, lancado_por)
  VALUES (_competencia, round(coalesce(_total, 0), 2), coalesce(_resumo, '[]'::jsonb), now(), auth.uid())
  ON CONFLICT (competencia) DO UPDATE
  SET total = EXCLUDED.total, resumo = EXCLUDED.resumo, lancado_em = now(), lancado_por = auth.uid();

  RETURN jsonb_build_object(
    'criados', v_criados, 'atualizados', v_atualizados, 'ja_pagos', v_pagos, 'cancelados', v_cancelados,
    'plantoes_atualizados', v_plantoes, 'diarias_canceladas', v_zerados, 'plantoes_ja_pagos', v_plantoes_pagos, 'beneficios', v_benef);
END;
$$;
REVOKE ALL ON FUNCTION public.fin_folha_lancar(date, jsonb, jsonb, jsonb, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_folha_lancar(date, jsonb, jsonb, jsonb, jsonb, numeric) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';