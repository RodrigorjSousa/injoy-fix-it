CREATE OR REPLACE FUNCTION private.pode_registrar_bonificacao(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND (
    private.has_role(_uid, 'gestor'::public.app_role)
    OR private.has_role(_uid, 'admin'::public.app_role)
    OR private.has_role(_uid, 'recepcao'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.funcionarios f
      WHERE f.user_id = _uid
        AND (
          'bonificacao' = ANY (coalesce(f.telas_permitidas, '{}'::text[]))
          OR btrim(f.nome) ~* '(^|\s)mayara(\s|$)'
        )
    )
  )
$$;
REVOKE ALL ON FUNCTION private.pode_registrar_bonificacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.pode_registrar_bonificacao(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_bonificacao_conjunta(_data date, _nome_hospede text, _nota_funcionarios numeric, _nota_limpeza numeric, _nota_geral numeric, _observacao text, _teve_elogio boolean, _unidade text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_avaliacao uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.'; END IF;
  IF NOT private.pode_registrar_bonificacao(auth.uid()) THEN
    RAISE EXCEPTION 'Seu usuário não tem permissão para registrar avaliações de bonificação. Peça ao gestor para liberar a tela Bonificação.';
  END IF;
  IF _unidade NOT IN ('Botafogo', 'Ipanema') OR _data IS NULL OR length(btrim(coalesce(_nome_hospede, ''))) = 0 OR length(_nome_hospede) > 120 THEN
    RAISE EXCEPTION 'Unidade, data ou nome do hóspede inválido.';
  END IF;
  IF _nota_funcionarios IS NULL OR _nota_limpeza IS NULL OR _nota_geral IS NULL
    OR _nota_funcionarios NOT BETWEEN 0 AND 10 OR _nota_limpeza NOT BETWEEN 0 AND 10 OR _nota_geral NOT BETWEEN 0 AND 10 THEN
    RAISE EXCEPTION 'Informe as três notas entre 0 e 10.';
  END IF;
  INSERT INTO public.registros_bonificacao (data, nome_hospede, nota_funcionarios, nota_limpeza, nota_geral, observacao, teve_elogio, unidade, setor, criado_por, avaliacao_id)
  VALUES (_data, btrim(_nome_hospede), _nota_funcionarios, NULL, _nota_geral, nullif(btrim(_observacao), ''), coalesce(_teve_elogio, false), _unidade, 'recepcao', auth.uid(), v_avaliacao);
  INSERT INTO public.registros_bonificacao (data, nome_hospede, nota_funcionarios, nota_limpeza, nota_geral, observacao, teve_elogio, unidade, setor, criado_por, avaliacao_id)
  VALUES (_data, btrim(_nome_hospede), _nota_limpeza, _nota_limpeza, _nota_geral, nullif(btrim(_observacao), ''), coalesce(_teve_elogio, false), _unidade, 'camareiras', auth.uid(), v_avaliacao);
END; $function$;
REVOKE ALL ON FUNCTION public.registrar_bonificacao_conjunta(date, text, numeric, numeric, numeric, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_bonificacao_conjunta(date, text, numeric, numeric, numeric, text, boolean, text) TO authenticated;

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

DROP POLICY IF EXISTS "Recepcao gestor admin insert registros bonif" ON public.registros_bonificacao;
DROP POLICY IF EXISTS "Autorizados inserem registros bonif" ON public.registros_bonificacao;
CREATE POLICY "Autorizados inserem registros bonif"
  ON public.registros_bonificacao FOR INSERT
  TO authenticated
  WITH CHECK (private.pode_registrar_bonificacao(auth.uid()));

DROP POLICY IF EXISTS "Autorizados leem config bonificacao" ON public.config_bonificacao;
CREATE POLICY "Autorizados leem config bonificacao"
  ON public.config_bonificacao FOR SELECT
  TO authenticated
  USING (private.pode_registrar_bonificacao(auth.uid()));