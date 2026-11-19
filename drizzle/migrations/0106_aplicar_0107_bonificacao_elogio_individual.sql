-- Bonificação: o comentário individual (elogio nominal) passa a ser SÓ da pessoa elogiada.
-- Decisão do Rodrigo, 19/11/2026: "a Julia teve um comentário individual: apenas ela recebe R$ 20".
--   1) O valor da avaliação do setor (Recepção / Camareiras) deixa de somar o elogio. Avaliações já lançadas
--      não são recalculadas (o histórico fica como estava).
--   2) Quem lança a avaliação escolhe o(s) nome(s) elogiado(s); cada nome vira uma linha em bonus_elogios
--      (Bonificação › Pagamento soma R$ valor_elogio por linha, com as mesmas regras de atrasos/faltas).
--   3) Apagar uma avaliação apaga os elogios ligados a ela (antes ficavam soltos e continuavam contando).
-- Sem inserção de dados. Idempotente.

-- 1) Valor do setor sem o elogio --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_registro_bonificacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_cfg public.config_bonificacao%ROWTYPE;
  v_nota_setor NUMERIC;
  v_positivas INTEGER;
BEGIN
  SELECT * INTO v_cfg FROM public.config_bonificacao ORDER BY created_at ASC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'As regras de bonificação ainda não foram configuradas.';
  END IF;
  IF NEW.setor NOT IN ('recepcao', 'camareiras') THEN
    RAISE EXCEPTION 'Tipo de bonificação inválido.';
  END IF;
  IF NEW.nota_geral < 0 OR NEW.nota_geral > 10 THEN
    RAISE EXCEPTION 'A nota geral deve estar entre 0 e 10.';
  END IF;
  IF NEW.setor = 'camareiras' THEN
    IF NEW.nota_limpeza IS NULL OR NEW.nota_limpeza < 0 OR NEW.nota_limpeza > 10 THEN
      RAISE EXCEPTION 'A nota de limpeza deve estar entre 0 e 10.';
    END IF;
    v_nota_setor := NEW.nota_limpeza;
    NEW.nota_funcionarios := NEW.nota_limpeza;
  ELSE
    IF NEW.nota_funcionarios < 0 OR NEW.nota_funcionarios > 10 THEN
      RAISE EXCEPTION 'A nota dos funcionários deve estar entre 0 e 10.';
    END IF;
    v_nota_setor := NEW.nota_funcionarios;
    NEW.nota_limpeza := NULL;
  END IF;
  v_positivas := (CASE WHEN v_nota_setor >= 9 THEN 1 ELSE 0 END)
    + (CASE WHEN NEW.nota_geral >= 9 THEN 1 ELSE 0 END);
  IF v_positivas = 2 THEN
    NEW.valor_calculado := CASE WHEN v_nota_setor >= 10 THEN v_cfg.valor_nota_10 ELSE v_cfg.valor_nota_9 END;
  ELSIF v_positivas = 1 THEN
    NEW.valor_calculado := v_cfg.penalidade_1_ruim;
  ELSE
    NEW.valor_calculado := v_cfg.penalidade_2_ruins;
  END IF;
  -- O elogio nominal NÃO entra mais aqui: vai só para a pessoa elogiada (bonus_elogios).
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.calcular_registro_bonificacao() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_registro_bonificacao() TO service_role;

-- 2) Quem pode ser elogiado (nomes para quem lança a avaliação) -------------------------------------------
CREATE OR REPLACE FUNCTION public.bonificacao_pessoas_elogio()
RETURNS TABLE (id uuid, nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NOT private.pode_registrar_bonificacao(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não está liberado para lançar avaliações. Peça ao gestor em Bonificação › Acessos.';
  END IF;
  RETURN QUERY SELECT f.id, f.nome::text FROM public.funcionarios f ORDER BY f.nome;
END; $function$;
REVOKE ALL ON FUNCTION public.bonificacao_pessoas_elogio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonificacao_pessoas_elogio() TO authenticated;

-- Elogiados de uma avaliação (para a tela de editar).
CREATE OR REPLACE FUNCTION public.bonificacao_elogiados(_avaliacao_ref uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NOT private.pode_registrar_bonificacao(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não está liberado na Bonificação.';
  END IF;
  RETURN QUERY SELECT e.funcionario_id FROM public.bonus_elogios e WHERE e.avaliacao_ref = _avaliacao_ref;
END; $function$;
REVOKE ALL ON FUNCTION public.bonificacao_elogiados(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonificacao_elogiados(uuid) TO authenticated;

-- Grava exatamente estes elogiados para a avaliação (tira quem saiu, inclui quem entrou).
CREATE OR REPLACE FUNCTION private.bonificacao_gravar_elogiados(_avaliacao_ref uuid, _elogiados uuid[], _uid uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_base public.registros_bonificacao%ROWTYPE; v_lista uuid[] := coalesce(_elogiados, '{}'::uuid[]);
BEGIN
  SELECT * INTO v_base FROM public.registros_bonificacao
   WHERE avaliacao_id = _avaliacao_ref OR id = _avaliacao_ref
   ORDER BY setor LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  IF cardinality(v_lista) > 10 THEN RAISE EXCEPTION 'No máximo 10 pessoas por elogio.'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_lista) x(fid) WHERE NOT EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = x.fid)) THEN
    RAISE EXCEPTION 'Pessoa elogiada não encontrada no cadastro de funcionários.';
  END IF;
  DELETE FROM public.bonus_elogios
   WHERE avaliacao_ref = _avaliacao_ref AND NOT (funcionario_id = ANY (v_lista));
  INSERT INTO public.bonus_elogios (data, unidade, funcionario_id, avaliacao_ref, nome_hospede, comentario, created_by)
  SELECT v_base.data, v_base.unidade, x.fid, _avaliacao_ref, v_base.nome_hospede,
         (SELECT string_agg(DISTINCT r.observacao, ' · ') FROM public.registros_bonificacao r
           WHERE (r.avaliacao_id = _avaliacao_ref OR r.id = _avaliacao_ref) AND r.observacao IS NOT NULL),
         _uid
    FROM (SELECT DISTINCT unnest(v_lista) AS fid) x
  ON CONFLICT (avaliacao_ref, funcionario_id) WHERE avaliacao_ref IS NOT NULL DO NOTHING;
  -- Data, unidade e hóspede acompanham a avaliação (se ela foi editada).
  UPDATE public.bonus_elogios SET data = v_base.data, unidade = v_base.unidade, nome_hospede = v_base.nome_hospede
   WHERE avaliacao_ref = _avaliacao_ref;
END; $function$;
REVOKE ALL ON FUNCTION private.bonificacao_gravar_elogiados(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;

-- Lançar avaliação + elogiados numa chamada só (devolve o id da avaliação).
CREATE OR REPLACE FUNCTION public.registrar_bonificacao_com_elogios(_data date, _nome_hospede text, _nota_funcionarios numeric, _nota_limpeza numeric, _nota_geral numeric, _observacao text, _teve_elogio boolean, _unidade text, _elogiados uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_avaliacao uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.'; END IF;
  IF NOT private.pode_registrar_bonificacao(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não está liberado para lançar avaliações. Peça ao gestor para liberar em Bonificação › Acessos.';
  END IF;
  IF _unidade NOT IN ('Botafogo', 'Ipanema') OR _data IS NULL OR length(btrim(coalesce(_nome_hospede, ''))) = 0 OR length(_nome_hospede) > 120 THEN
    RAISE EXCEPTION 'Unidade, data ou nome do hóspede inválido.';
  END IF;
  IF _nota_funcionarios IS NULL OR _nota_limpeza IS NULL OR _nota_geral IS NULL
    OR _nota_funcionarios NOT BETWEEN 0 AND 10 OR _nota_limpeza NOT BETWEEN 0 AND 10 OR _nota_geral NOT BETWEEN 0 AND 10 THEN
    RAISE EXCEPTION 'Informe as três notas entre 0 e 10.';
  END IF;
  IF coalesce(_teve_elogio, false) AND cardinality(coalesce(_elogiados, '{}'::uuid[])) = 0 THEN
    RAISE EXCEPTION 'Escolha quem foi elogiado pelo nome.';
  END IF;
  INSERT INTO public.registros_bonificacao (data, nome_hospede, nota_funcionarios, nota_limpeza, nota_geral, observacao, teve_elogio, unidade, setor, criado_por, avaliacao_id)
  VALUES (_data, btrim(_nome_hospede), _nota_funcionarios, NULL, _nota_geral, nullif(btrim(_observacao), ''), coalesce(_teve_elogio, false), _unidade, 'recepcao', auth.uid(), v_avaliacao);
  INSERT INTO public.registros_bonificacao (data, nome_hospede, nota_funcionarios, nota_limpeza, nota_geral, observacao, teve_elogio, unidade, setor, criado_por, avaliacao_id)
  VALUES (_data, btrim(_nome_hospede), _nota_limpeza, _nota_limpeza, _nota_geral, nullif(btrim(_observacao), ''), coalesce(_teve_elogio, false), _unidade, 'camareiras', auth.uid(), v_avaliacao);
  IF coalesce(_teve_elogio, false) THEN
    PERFORM private.bonificacao_gravar_elogiados(v_avaliacao, _elogiados, auth.uid());
  END IF;
  RETURN v_avaliacao;
END; $function$;
REVOKE ALL ON FUNCTION public.registrar_bonificacao_com_elogios(date, text, numeric, numeric, numeric, text, boolean, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_bonificacao_com_elogios(date, text, numeric, numeric, numeric, text, boolean, text, uuid[]) TO authenticated;

-- Ao editar: troca os elogiados (lista vazia = sem elogio).
CREATE OR REPLACE FUNCTION public.bonificacao_definir_elogiados(_avaliacao_ref uuid, _elogiados uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.'; END IF;
  IF NOT private.pode_editar_bonificacao(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não está liberado para editar avaliações. Peça ao gestor para liberar em Bonificação › Acessos.';
  END IF;
  PERFORM private.bonificacao_gravar_elogiados(_avaliacao_ref, _elogiados, auth.uid());
END; $function$;
REVOKE ALL ON FUNCTION public.bonificacao_definir_elogiados(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonificacao_definir_elogiados(uuid, uuid[]) TO authenticated;

-- 3) Avaliação apagada leva junto os elogios dela ---------------------------------------------------------
CREATE OR REPLACE FUNCTION private.bonificacao_apagar_elogios_orfaos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_ref uuid := coalesce(OLD.avaliacao_id, OLD.id);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.registros_bonificacao r WHERE r.avaliacao_id = v_ref OR r.id = v_ref) THEN
    DELETE FROM public.bonus_elogios WHERE avaliacao_ref = v_ref;
  END IF;
  RETURN NULL;
END; $function$;
REVOKE ALL ON FUNCTION private.bonificacao_apagar_elogios_orfaos() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bonificacao_apagar_elogios_orfaos ON public.registros_bonificacao;
CREATE TRIGGER bonificacao_apagar_elogios_orfaos
  AFTER DELETE ON public.registros_bonificacao
  FOR EACH ROW EXECUTE FUNCTION private.bonificacao_apagar_elogios_orfaos();