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
  _count integer := 0;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF _unidade NOT IN ('Botafogo','Ipanema') OR _setor NOT IN ('manutencao','recepcao','camareiras') OR _competencia <> date_trunc('month', _competencia)::date THEN
    RAISE EXCEPTION 'Parâmetros de escala inválidos';
  END IF;

  DELETE FROM public.escala_dias
   WHERE unidade = _unidade AND setor = _setor
     AND date_trunc('month', data)::date = _competencia
     AND origem = 'gerado';

  INSERT INTO public.escala_dias (
    colaborador_id, unidade, setor, data, turno, hora_entrada, hora_saida,
    status, origem, motivo, updated_by
  )
  SELECT x.colaborador_id, _unidade, _setor, x.data, x.turno,
         x.hora_entrada, x.hora_saida, x.status, 'gerado', NULL, auth.uid()
    FROM jsonb_to_recordset(COALESCE(_dias, '[]'::jsonb)) AS x(
      colaborador_id uuid, data date, turno text, hora_entrada time,
      hora_saida time, status text
    )
   WHERE x.data >= _competencia
     AND x.data < (_competencia + interval '1 month')
     AND x.turno IN ('manha','noite','dia')
     AND x.status IN ('trabalho','folga')
     AND NOT EXISTS (
       SELECT 1 FROM public.escala_dias d
        WHERE d.colaborador_id=x.colaborador_id AND d.data=x.data
          AND d.turno=x.turno AND d.origem='manual'
     )
  ON CONFLICT (colaborador_id, data, turno) DO NOTHING;
  GET DIAGNOSTICS _count = ROW_COUNT;

  INSERT INTO public.escala_meses (unidade,setor,competencia,status)
  VALUES (_unidade,_setor,_competencia,'rascunho')
  ON CONFLICT (unidade,setor,competencia) DO UPDATE
    SET status='rascunho', publicada_em=NULL, publicada_por=NULL;
  RETURN _count;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_regenerar_mes(text,text,date,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_regenerar_mes(text,text,date,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.escala_publicar_mes(_unidade text, _setor text, _competencia date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  INSERT INTO public.escala_meses (unidade,setor,competencia,status,publicada_em,publicada_por)
  VALUES (_unidade,_setor,_competencia,'publicada',now(),auth.uid())
  ON CONFLICT (unidade,setor,competencia) DO UPDATE
    SET status='publicada', publicada_em=now(), publicada_por=auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.escala_publicar_mes(text,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_publicar_mes(text,text,date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.minha_escala_publicada(_inicio date, _fim date)
RETURNS TABLE(
  id uuid, data date, unidade text, setor text, turno text,
  hora_entrada time, hora_saida time, status text, motivo text,
  publicada_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id,d.data,d.unidade,d.setor,d.turno,d.hora_entrada,d.hora_saida,
         d.status,d.motivo,m.publicada_em
    FROM public.escala_dias d
    JOIN public.escala_colaboradores c ON c.id=d.colaborador_id
    JOIN public.funcionarios f ON f.id=c.funcionario_id AND f.user_id=auth.uid()
    JOIN public.escala_meses m ON m.unidade=d.unidade AND m.setor=d.setor
      AND m.competencia=date_trunc('month',d.data)::date AND m.status='publicada'
   WHERE d.data BETWEEN _inicio AND _fim
   ORDER BY d.data,d.turno;
$$;
REVOKE ALL ON FUNCTION public.minha_escala_publicada(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_escala_publicada(date,date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.escala_registrar_alteracao_publicada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.escala_meses m
    WHERE m.unidade = OLD.unidade AND m.setor = OLD.setor
      AND m.competencia = date_trunc('month', OLD.data)::date
      AND m.status = 'publicada'
  ) THEN
    INSERT INTO public.escala_alteracoes (escala_dia_id, alterado_por, antes, depois, motivo)
    VALUES (OLD.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW), NEW.motivo);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_registrar_alteracao_publicada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escala_registrar_alteracao_publicada() TO service_role;