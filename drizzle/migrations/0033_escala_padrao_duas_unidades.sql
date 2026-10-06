-- Escala: colaborador fixo que trabalha nas duas unidades (ex.: Flavio na manutenção,
-- 12 dias em Botafogo e 10 em Ipanema). Idempotente.

-- 1) Padrão com divisão por unidade: dias da semana em Ipanema (os demais em Botafogo)
--    e proporção mensal desejada.
ALTER TABLE public.escala_padroes ADD COLUMN IF NOT EXISTS dias_ipanema smallint[];
ALTER TABLE public.escala_padroes ADD COLUMN IF NOT EXISTS proporcao_botafogo smallint;
ALTER TABLE public.escala_padroes ADD COLUMN IF NOT EXISTS proporcao_ipanema smallint;

ALTER TABLE public.escala_padroes DROP CONSTRAINT IF EXISTS escala_padroes_dias_ipanema_ck;
ALTER TABLE public.escala_padroes ADD CONSTRAINT escala_padroes_dias_ipanema_ck
  CHECK (dias_ipanema IS NULL OR dias_ipanema <@ ARRAY[0,1,2,3,4,5,6]::smallint[]);
ALTER TABLE public.escala_padroes DROP CONSTRAINT IF EXISTS escala_padroes_proporcao_ck;
ALTER TABLE public.escala_padroes ADD CONSTRAINT escala_padroes_proporcao_ck
  CHECK ((proporcao_botafogo IS NULL OR proporcao_botafogo BETWEEN 0 AND 31)
     AND (proporcao_ipanema IS NULL OR proporcao_ipanema BETWEEN 0 AND 31));

-- 2) Gerar o mês: quando um dia automático muda de unidade (Botafogo <-> Ipanema),
--    o registro passa para a nova unidade em vez de ficar preso na antiga.
CREATE OR REPLACE FUNCTION public.escala_regenerar_mes(
  _unidade text,
  _setor text,
  _competencia date,
  _dias jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _deleted integer := 0;
  _upserted integer := 0;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF _unidade NOT IN ('Botafogo','Ipanema') OR _setor NOT IN ('manutencao','recepcao','camareiras') OR _competencia <> date_trunc('month', _competencia)::date THEN
    RAISE EXCEPTION 'Parâmetros de escala inválidos';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _escala_novos (
    colaborador_id uuid, data date, turno text, hora_entrada time, hora_saida time, status text
  ) ON COMMIT DROP;
  TRUNCATE _escala_novos;

  INSERT INTO _escala_novos
  SELECT x.colaborador_id, x.data, x.turno, x.hora_entrada, x.hora_saida, x.status
  FROM jsonb_to_recordset(COALESCE(_dias, '[]'::jsonb)) AS x(
    colaborador_id uuid, data date, turno text, hora_entrada time, hora_saida time, status text
  )
  WHERE x.data >= _competencia
    AND x.data < (_competencia + interval '1 month')
    AND x.turno IN ('manha','noite','dia')
    AND x.status IN ('trabalho','folga');

  -- Remove só os dias automáticos que deixaram de existir no novo cálculo
  DELETE FROM public.escala_dias d
  WHERE d.unidade = _unidade AND d.setor = _setor
    AND d.data >= _competencia AND d.data < (_competencia + interval '1 month')
    AND d.origem = 'gerado'
    AND NOT EXISTS (
      SELECT 1 FROM _escala_novos n
      WHERE n.colaborador_id = d.colaborador_id AND n.data = d.data AND n.turno = d.turno
    );
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  -- Insere os novos e atualiza só os automáticos que mudaram; dias manuais nunca são tocados
  INSERT INTO public.escala_dias (
    colaborador_id, unidade, setor, data, turno, hora_entrada, hora_saida,
    status, origem, motivo, updated_by
  )
  SELECT n.colaborador_id, _unidade, _setor, n.data, n.turno,
         n.hora_entrada, n.hora_saida, n.status, 'gerado', NULL, auth.uid()
  FROM _escala_novos n
  ON CONFLICT (colaborador_id, data, turno) DO UPDATE
    SET unidade      = EXCLUDED.unidade,
        setor        = EXCLUDED.setor,
        hora_entrada = EXCLUDED.hora_entrada,
        hora_saida   = EXCLUDED.hora_saida,
        status       = EXCLUDED.status,
        updated_by   = EXCLUDED.updated_by
    WHERE public.escala_dias.origem = 'gerado'
      AND (public.escala_dias.unidade, public.escala_dias.setor, public.escala_dias.status, public.escala_dias.hora_entrada, public.escala_dias.hora_saida)
          IS DISTINCT FROM (EXCLUDED.unidade, EXCLUDED.setor, EXCLUDED.status, EXCLUDED.hora_entrada, EXCLUDED.hora_saida);
  GET DIAGNOSTICS _upserted = ROW_COUNT;

  -- Mantém o status atual do mês (publicada continua publicada)
  INSERT INTO public.escala_meses (unidade, setor, competencia, status)
  VALUES (_unidade, _setor, _competencia, 'rascunho')
  ON CONFLICT (unidade, setor, competencia) DO NOTHING;

  RETURN _deleted + _upserted;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_regenerar_mes(text,text,date,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_regenerar_mes(text,text,date,jsonb) TO authenticated, service_role;
