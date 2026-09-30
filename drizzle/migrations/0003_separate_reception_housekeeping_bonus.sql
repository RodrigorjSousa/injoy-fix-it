ALTER TABLE public.registros_bonificacao
  ADD COLUMN setor TEXT NOT NULL DEFAULT 'recepcao',
  ADD COLUMN nota_limpeza NUMERIC;

UPDATE public.registros_bonificacao
SET setor = 'recepcao'
WHERE setor IS NULL OR setor NOT IN ('recepcao', 'camareiras');

ALTER TABLE public.registros_bonificacao
  ADD CONSTRAINT registros_bonificacao_setor_valido
    CHECK (setor IN ('recepcao', 'camareiras')),
  ADD CONSTRAINT registros_bonificacao_notas_validas
    CHECK (
      nota_geral BETWEEN 0 AND 10
      AND nota_funcionarios BETWEEN 0 AND 10
      AND (nota_limpeza IS NULL OR nota_limpeza BETWEEN 0 AND 10)
    ),
  ADD CONSTRAINT registros_bonificacao_nota_setor_coerente
    CHECK (
      (setor = 'recepcao' AND nota_limpeza IS NULL)
      OR (setor = 'camareiras' AND nota_limpeza IS NOT NULL)
    );

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
  SELECT * INTO v_cfg
  FROM public.config_bonificacao
  ORDER BY created_at ASC
  LIMIT 1;

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
    NEW.valor_calculado := CASE
      WHEN v_nota_setor >= 10 THEN v_cfg.valor_nota_10
      ELSE v_cfg.valor_nota_9
    END;
  ELSIF v_positivas = 1 THEN
    NEW.valor_calculado := v_cfg.penalidade_1_ruim;
  ELSE
    NEW.valor_calculado := v_cfg.penalidade_2_ruins;
  END IF;

  IF NEW.teve_elogio THEN
    NEW.valor_calculado := NEW.valor_calculado + v_cfg.valor_elogio;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.calcular_registro_bonificacao() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_registro_bonificacao() TO service_role;

CREATE TRIGGER calcular_registro_bonificacao_antes_salvar
  BEFORE INSERT OR UPDATE OF nota_funcionarios, nota_geral, nota_limpeza, teve_elogio, setor, valor_calculado
  ON public.registros_bonificacao
  FOR EACH ROW
  EXECUTE FUNCTION public.calcular_registro_bonificacao();

CREATE INDEX idx_registros_bonificacao_setor_mes
  ON public.registros_bonificacao (unidade, setor, data DESC);