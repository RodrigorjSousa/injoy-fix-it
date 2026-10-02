-- 0028 — Bonificação: quem pode registrar avaliações (Mayara, recepção, tela liberada,
-- gestor) também pode EDITAR avaliações. Excluir continua só com gestor/admin.
-- Requer private.pode_registrar_bonificacao (migração "bonificacao_registro_liberado").

CREATE OR REPLACE FUNCTION public.editar_bonificacao_conjunta(_registro_id uuid, _data date, _nome_hospede text, _nota_funcionarios numeric, _nota_limpeza numeric, _nota_geral numeric, _observacao_recepcao text, _observacao_limpeza text, _teve_elogio boolean, _unidade text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_original public.registros_bonificacao%ROWTYPE; v_grupo uuid; v_recepcao_id uuid; v_limpeza_id uuid;
BEGIN
  IF NOT private.pode_registrar_bonificacao(auth.uid()) THEN
    RAISE EXCEPTION 'Seu usuário não tem permissão para editar avaliações de bonificação.';
  END IF;
  IF _unidade NOT IN ('Botafogo', 'Ipanema') OR _data IS NULL OR length(btrim(coalesce(_nome_hospede, ''))) = 0 OR length(_nome_hospede) > 120
    OR length(coalesce(_observacao_recepcao, '')) > 500 OR length(coalesce(_observacao_limpeza, '')) > 500 THEN
    RAISE EXCEPTION 'Dados da avaliação inválidos.';
  END IF;
  IF _nota_funcionarios IS NULL OR _nota_limpeza IS NULL OR _nota_geral IS NULL
    OR _nota_funcionarios NOT BETWEEN 0 AND 10 OR _nota_limpeza NOT BETWEEN 0 AND 10 OR _nota_geral NOT BETWEEN 0 AND 10 THEN
    RAISE EXCEPTION 'Informe as três notas entre 0 e 10.';
  END IF;
  SELECT * INTO v_original FROM public.registros_bonificacao WHERE id = _registro_id FOR UPDATE;
  IF NOT FOUND OR v_original.unidade <> _unidade THEN RAISE EXCEPTION 'Avaliação não encontrada nesta unidade.'; END IF;
  v_grupo := coalesce(v_original.avaliacao_id, gen_random_uuid());
  -- Lock the entire pair and reject ambiguous or malformed groups.
  PERFORM 1 FROM public.registros_bonificacao WHERE avaliacao_id = v_grupo ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.registros_bonificacao WHERE avaliacao_id = v_grupo AND unidade <> _unidade) THEN
    RAISE EXCEPTION 'Avaliação inconsistente entre unidades.';
  END IF;
  SELECT id INTO v_recepcao_id FROM public.registros_bonificacao WHERE avaliacao_id = v_grupo AND setor = 'recepcao' LIMIT 1;
  SELECT id INTO v_limpeza_id FROM public.registros_bonificacao WHERE avaliacao_id = v_grupo AND setor = 'camareiras' LIMIT 1;
  IF v_original.setor = 'recepcao' THEN v_recepcao_id := v_original.id; ELSE v_limpeza_id := v_original.id; END IF;
  IF (SELECT count(*) FROM public.registros_bonificacao WHERE avaliacao_id = v_grupo) > 2 THEN RAISE EXCEPTION 'Grupo de avaliação inconsistente.'; END IF;

  IF v_recepcao_id IS NULL THEN
    INSERT INTO public.registros_bonificacao (data, nome_hospede, nota_funcionarios, nota_geral, observacao, teve_elogio, unidade, setor, criado_por, avaliacao_id)
    VALUES (_data, btrim(_nome_hospede), _nota_funcionarios, _nota_geral, nullif(btrim(_observacao_recepcao), ''), coalesce(_teve_elogio, false), _unidade, 'recepcao', auth.uid(), v_grupo);
  ELSE
    UPDATE public.registros_bonificacao SET data = _data, nome_hospede = btrim(_nome_hospede), nota_funcionarios = _nota_funcionarios, nota_geral = _nota_geral, observacao = nullif(btrim(_observacao_recepcao), ''), teve_elogio = coalesce(_teve_elogio, false), avaliacao_id = v_grupo
    WHERE id = v_recepcao_id AND unidade = _unidade;
  END IF;
  IF v_limpeza_id IS NULL THEN
    INSERT INTO public.registros_bonificacao (data, nome_hospede, nota_funcionarios, nota_limpeza, nota_geral, observacao, teve_elogio, unidade, setor, criado_por, avaliacao_id)
    VALUES (_data, btrim(_nome_hospede), _nota_limpeza, _nota_limpeza, _nota_geral, nullif(btrim(_observacao_limpeza), ''), coalesce(_teve_elogio, false), _unidade, 'camareiras', auth.uid(), v_grupo);
  ELSE
    UPDATE public.registros_bonificacao SET data = _data, nome_hospede = btrim(_nome_hospede), nota_limpeza = _nota_limpeza, nota_geral = _nota_geral, observacao = nullif(btrim(_observacao_limpeza), ''), teve_elogio = coalesce(_teve_elogio, false), avaliacao_id = v_grupo
    WHERE id = v_limpeza_id AND unidade = _unidade;
  END IF;
END; $function$;
REVOKE ALL ON FUNCTION public.editar_bonificacao_conjunta(uuid, date, text, numeric, numeric, numeric, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_bonificacao_conjunta(uuid, date, text, numeric, numeric, numeric, text, text, boolean, text) TO authenticated;
