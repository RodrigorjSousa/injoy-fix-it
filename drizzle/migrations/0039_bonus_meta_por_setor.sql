-- Meta por setor (nota individual):
--   Recepção                 -> ganha o extra quando a nota "Funcionário" do mês fica na nota mínima ou acima.
--   Camareiras / Manutenção  -> ganha o extra quando a nota "Limpeza" do mês fica na nota mínima ou acima.
-- A nota Geral deixa de contar. Regras de atraso/falta continuam iguais.
-- Sem inserção/alteração de dados: o setor de quem já está na lista é deduzido da Escala até o
-- gestor escolher na aba Meta equipe. Pode ser aplicada mais de uma vez.

ALTER TABLE public.bonus_meta_participantes ADD COLUMN IF NOT EXISTS setor text;
ALTER TABLE public.bonus_meta_participantes DROP CONSTRAINT IF EXISTS bonus_meta_participantes_setor_check;
ALTER TABLE public.bonus_meta_participantes
  ADD CONSTRAINT bonus_meta_participantes_setor_check CHECK (setor IS NULL OR setor IN ('recepcao', 'camareiras'));

-- Setor efetivo: o escolhido pelo gestor ou, se vazio, o da Escala (manutenção conta como camareiras).
CREATE OR REPLACE FUNCTION private.bonus_meta_setor(_funcionario_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT p.setor FROM public.bonus_meta_participantes p WHERE p.funcionario_id = _funcionario_id),
    (SELECT CASE WHEN ec.setor = 'recepcao' THEN 'recepcao' ELSE 'camareiras' END
       FROM public.bonus_meta_participantes p
       JOIN public.escala_colaboradores ec ON ec.id = p.colaborador_id OR ec.funcionario_id = p.funcionario_id
      WHERE p.funcionario_id = _funcionario_id
      ORDER BY (ec.id = p.colaborador_id) DESC, ec.created_at
      LIMIT 1),
    'recepcao'
  )
$$;
REVOKE ALL ON FUNCTION private.bonus_meta_setor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.bonus_meta_setor(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bonus_meta_situacao(_mes date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_inicio date := date_trunc('month', coalesce(_mes, v_hoje))::date;
  v_fim date := (date_trunc('month', coalesce(_mes, v_hoje)) + interval '1 month - 1 day')::date;
  v_gestor boolean := private.bonus_meta_eh_gestor();
  v_cfg public.bonus_meta_config%ROWTYPE;
  v_lista jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada. Entre novamente.'; END IF;
  SELECT * INTO v_cfg FROM public.bonus_meta_config WHERE id = 1;
  IF NOT FOUND THEN
    v_cfg.ativo := true; v_cfg.valor_por_pessoa := 100; v_cfg.nota_minima := 9;
    v_cfg.tolerancia_minutos := 10; v_cfg.max_atrasos := 3;
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.nome), '[]'::jsonb) INTO v_lista
  FROM (
    SELECT p.funcionario_id, f.nome, p.unidade, p.ativo,
      private.bonus_meta_setor(p.funcionario_id) AS setor,
      (p.setor IS NOT NULL) AS setor_definido,
      (f.user_id = auth.uid()) AS sou_eu,
      (f.pontomais_employee_id IS NOT NULL OR f.cpf IS NOT NULL) AS pontomais,
      count(*) FILTER (WHERE o.tipo = 'atraso' AND NOT o.justificada) AS atrasos,
      count(*) FILTER (WHERE o.tipo = 'falta' AND NOT o.justificada) AS faltas,
      CASE
        WHEN count(*) FILTER (WHERE o.tipo = 'falta' AND NOT o.justificada) > 0
          OR count(*) FILTER (WHERE o.tipo = 'atraso' AND NOT o.justificada) > v_cfg.max_atrasos THEN 'perdeu'
        WHEN count(*) FILTER (WHERE o.tipo = 'atraso' AND NOT o.justificada) >= greatest(v_cfg.max_atrasos - 1, 1) THEN 'risco'
        ELSE 'ok'
      END AS situacao
    FROM public.bonus_meta_participantes p
    JOIN public.funcionarios f ON f.id = p.funcionario_id
    LEFT JOIN public.bonus_meta_ocorrencias o
      ON o.funcionario_id = p.funcionario_id AND o.data BETWEEN v_inicio AND v_fim
    WHERE (p.ativo OR v_gestor) AND (v_gestor OR f.user_id = auth.uid())
    GROUP BY p.funcionario_id, f.nome, p.unidade, p.ativo, p.setor, f.user_id, f.pontomais_employee_id, f.cpf
  ) t;

  RETURN jsonb_build_object(
    'gestor', v_gestor,
    'config', jsonb_build_object('ativo', v_cfg.ativo, 'valor_por_pessoa', v_cfg.valor_por_pessoa,
      'nota_minima', v_cfg.nota_minima, 'tolerancia_minutos', v_cfg.tolerancia_minutos, 'max_atrasos', v_cfg.max_atrasos),
    'participantes_ativos', (SELECT count(*) FROM public.bonus_meta_participantes WHERE ativo),
    'pessoas', v_lista
  );
END $$;
REVOKE ALL ON FUNCTION public.bonus_meta_situacao(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonus_meta_situacao(date) TO authenticated;

-- Salvar participante agora inclui o setor (recepcao | camareiras).
DROP FUNCTION IF EXISTS public.bonus_meta_salvar_participante(uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.bonus_meta_salvar_participante(_funcionario_id uuid, _unidade text, _ativo boolean, _setor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.bonus_meta_eh_gestor() THEN RAISE EXCEPTION 'Somente gestor ou administrador altera participantes.'; END IF;
  IF _unidade NOT IN ('Botafogo', 'Ipanema', 'Ambas') THEN RAISE EXCEPTION 'Unidade inválida.'; END IF;
  IF _setor IS NOT NULL AND _setor NOT IN ('recepcao', 'camareiras') THEN RAISE EXCEPTION 'Setor inválido.'; END IF;
  INSERT INTO public.bonus_meta_participantes (funcionario_id, unidade, ativo, setor, colaborador_id)
  VALUES (_funcionario_id, _unidade, coalesce(_ativo, true), _setor,
    (SELECT ec.id FROM public.escala_colaboradores ec WHERE ec.funcionario_id = _funcionario_id AND ec.ativo ORDER BY ec.created_at LIMIT 1))
  ON CONFLICT (funcionario_id) DO UPDATE
    SET unidade = EXCLUDED.unidade, ativo = EXCLUDED.ativo,
        setor = coalesce(EXCLUDED.setor, public.bonus_meta_participantes.setor);
END $$;
REVOKE ALL ON FUNCTION public.bonus_meta_salvar_participante(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonus_meta_salvar_participante(uuid, text, boolean, text) TO authenticated;
