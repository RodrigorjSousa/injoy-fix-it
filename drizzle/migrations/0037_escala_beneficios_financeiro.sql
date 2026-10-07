-- Escala: lança o vale alimentação e o vale transporte no Financeiro (um lançamento por
-- funcionário, por benefício e por unidade). Idempotente.

ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS origem_beneficio text;
CREATE UNIQUE INDEX IF NOT EXISTS fin_lancamentos_origem_beneficio_uidx
  ON public.fin_lancamentos (origem_beneficio) WHERE origem_beneficio IS NOT NULL;

INSERT INTO public.fin_categorias (nome, grupo, tipo, ordem)
SELECT 'Vale alimentação', 'pessoal', 'despesa', 0
WHERE NOT EXISTS (SELECT 1 FROM public.fin_categorias WHERE nome = 'Vale alimentação' AND tipo = 'despesa');
INSERT INTO public.fin_categorias (nome, grupo, tipo, ordem)
SELECT 'Vale transporte', 'pessoal', 'despesa', 0
WHERE NOT EXISTS (SELECT 1 FROM public.fin_categorias WHERE nome = 'Vale transporte' AND tipo = 'despesa');

-- _itens: [{colaborador_id, nome, tipo: 'va'|'vt', unidade, valor, qtd, descricao}]
-- Cria ou atualiza o lançamento previsto de cada item; não mexe no que já está pago e cancela os
-- lançamentos previstos de benefício do mês que não estão mais na lista (ex.: pessoa sem dias).
CREATE OR REPLACE FUNCTION public.escala_lancar_beneficios(_competencia date, _itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_cat uuid;
  v_key text;
  v_valor numeric;
  v_unid text;
  v_tipo text;
  v_func uuid;
  v_exist record;
  v_keys text[] := ARRAY[]::text[];
  v_criados int := 0;
  v_atualizados int := 0;
  v_pagos int := 0;
  v_cancelados int := 0;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF _competencia IS NULL OR extract(day FROM _competencia) <> 1 THEN
    RAISE EXCEPTION 'Competência inválida (use o dia 1 do mês)';
  END IF;
  IF jsonb_typeof(_itens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Lista de itens inválida';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    v_tipo := v_item->>'tipo';
    v_unid := v_item->>'unidade';
    v_valor := round(coalesce((v_item->>'valor')::numeric, 0), 2);
    IF v_tipo NOT IN ('va', 'vt') THEN RAISE EXCEPTION 'Tipo de benefício inválido'; END IF;
    IF v_unid NOT IN ('Botafogo', 'Ipanema', 'Ambas') THEN RAISE EXCEPTION 'Unidade inválida'; END IF;
    IF v_valor <= 0 THEN CONTINUE; END IF;

    SELECT id INTO v_cat FROM public.fin_categorias
    WHERE tipo = 'despesa' AND nome = CASE v_tipo WHEN 'va' THEN 'Vale alimentação' ELSE 'Vale transporte' END
    ORDER BY ordem LIMIT 1;
    IF v_cat IS NULL THEN RAISE EXCEPTION 'Categoria de vale não encontrada'; END IF;

    SELECT funcionario_id INTO v_func FROM public.escala_colaboradores WHERE id = (v_item->>'colaborador_id')::uuid;
    v_key := v_tipo || ':' || (v_item->>'colaborador_id') || ':' || _competencia::text || ':' || v_unid;
    v_keys := array_append(v_keys, v_key);

    SELECT id, status INTO v_exist FROM public.fin_lancamentos WHERE origem_beneficio = v_key;
    IF v_exist.id IS NULL THEN
      INSERT INTO public.fin_lancamentos (tipo, unidade, categoria_id, descricao, valor, competencia, status,
        funcionario_id, freelancer_nome, qtd_diarias, origem_beneficio, created_by)
      VALUES ('despesa', v_unid, v_cat, left(coalesce(v_item->>'descricao', ''), 500) || '', v_valor, _competencia, 'previsto',
        v_func, NULL, NULL, v_key, auth.uid());
      v_criados := v_criados + 1;
    ELSIF v_exist.status = 'pago' THEN
      v_pagos := v_pagos + 1;
    ELSE
      UPDATE public.fin_lancamentos
      SET descricao = left(coalesce(v_item->>'descricao', descricao), 500), valor = v_valor, categoria_id = v_cat,
          unidade = v_unid, competencia = _competencia, funcionario_id = v_func,
          status = CASE WHEN status = 'cancelado' THEN 'previsto' ELSE status END
      WHERE id = v_exist.id;
      v_atualizados := v_atualizados + 1;
    END IF;
  END LOOP;

  UPDATE public.fin_lancamentos
  SET status = 'cancelado',
      observacoes = concat_ws(' ', nullif(observacoes, ''), 'Cancelado automaticamente: o benefício deixou de constar no cálculo da escala.')
  WHERE origem_beneficio IS NOT NULL
    AND competencia = _competencia
    AND status NOT IN ('pago', 'cancelado')
    AND NOT (origem_beneficio = ANY (v_keys));
  GET DIAGNOSTICS v_cancelados = ROW_COUNT;

  RETURN jsonb_build_object('criados', v_criados, 'atualizados', v_atualizados, 'ja_pagos', v_pagos, 'cancelados', v_cancelados);
END;
$$;
REVOKE ALL ON FUNCTION public.escala_lancar_beneficios(date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_lancar_beneficios(date, jsonb) TO authenticated, service_role;
