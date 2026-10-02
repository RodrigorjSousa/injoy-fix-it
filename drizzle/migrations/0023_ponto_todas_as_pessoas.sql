-- 0023 — Ponto: todas as pessoas da equipe (fixos e freelancers) e controle de quem participa.
--
-- * escala_colaboradores.ponto_habilitado: o gestor liga/desliga quem bate ponto no app.
-- * O ponto da recepção (quiosque) passa a aceitar QUALQUER pessoa ativa e habilitada
--   (fixo ou freelancer), sempre confirmando pelo rosto 1:1.
-- * Nova lista ponto_quiosque_lista(unidade) com fixos e freelancers.

ALTER TABLE public.escala_colaboradores
  ADD COLUMN IF NOT EXISTS ponto_habilitado boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.ponto_registrar(
  _descritor jsonb,
  _latitude numeric,
  _longitude numeric,
  _precisao_m numeric,
  _vivacidade_ok boolean,
  _device_id text,
  _selfie_path text,
  _modo text DEFAULT 'app',
  _colaborador_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab public.escala_colaboradores%ROWTYPE;
  v_bio public.ponto_biometria%ROWTYPE;
  v_cfg public.ponto_config%ROWTYPE;
  v_unidade text;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_aberta public.ponto_batidas%ROWTYPE;
  v_ultima timestamptz;
  v_tipo text;
  v_data_ref date;
  v_dist numeric;
  v_face numeric;
  v_face_ok boolean;
  v_dentro boolean;
  v_device_ok boolean;
  v_motivos text[] := '{}';
  v_status text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login para bater o ponto'; END IF;
  IF _modo NOT IN ('app', 'quiosque') THEN RAISE EXCEPTION 'Modo inválido'; END IF;

  IF _modo = 'app' THEN
    SELECT * INTO v_colab FROM public.escala_colaboradores WHERE id = private.ponto_colaborador_do_usuario(v_uid);
    IF v_colab.id IS NULL THEN
      RAISE EXCEPTION 'Seu usuário ainda não está ligado à escala. Procure o gestor.';
    END IF;
    IF NOT v_colab.ponto_habilitado THEN
      RAISE EXCEPTION 'Você não está habilitado para o ponto do app. Procure o gestor.';
    END IF;
  ELSE
    IF NOT (private.has_role(v_uid, 'recepcao') OR private.has_role(v_uid, 'gestor') OR private.has_role(v_uid, 'admin')) THEN
      RAISE EXCEPTION 'Somente a recepção ou o gestor podem usar o ponto da recepção';
    END IF;
    SELECT * INTO v_colab FROM public.escala_colaboradores WHERE id = _colaborador_id AND ativo AND ponto_habilitado;
    IF v_colab.id IS NULL THEN RAISE EXCEPTION 'Pessoa não encontrada ou não habilitada para o ponto'; END IF;
  END IF;

  IF _selfie_path IS NOT NULL AND split_part(_selfie_path, '/', 1) <> v_uid::text THEN
    RAISE EXCEPTION 'Caminho da selfie inválido';
  END IF;

  -- Evita batida dupla por toque repetido
  SELECT max(registrado_em) INTO v_ultima FROM public.ponto_batidas
  WHERE colaborador_id = v_colab.id AND status <> 'recusada';
  IF v_ultima IS NOT NULL AND now() - v_ultima < interval '2 minutes' THEN
    RAISE EXCEPTION 'Batida já registrada há instantes';
  END IF;

  -- Entrada aberta nas últimas 18 h → esta batida é a saída
  SELECT b.* INTO v_aberta FROM public.ponto_batidas b
  WHERE b.colaborador_id = v_colab.id AND b.tipo = 'entrada' AND b.status <> 'recusada'
    AND b.registrado_em > now() - interval '18 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.ponto_batidas s
      WHERE s.colaborador_id = b.colaborador_id AND s.tipo = 'saida' AND s.status <> 'recusada'
        AND s.registrado_em > b.registrado_em
    )
  ORDER BY b.registrado_em DESC LIMIT 1;

  IF v_aberta.id IS NOT NULL THEN
    v_tipo := 'saida'; v_data_ref := v_aberta.data_ref; v_unidade := v_aberta.unidade;
  ELSE
    v_tipo := 'entrada'; v_data_ref := v_hoje;
    -- Unidade: a da escala de hoje; senão a mais próxima pelo GPS; senão a do cadastro
    SELECT d.unidade INTO v_unidade FROM public.escala_dias d
    WHERE d.colaborador_id = v_colab.id AND d.data = v_hoje AND d.status IN ('trabalho', 'extra')
    ORDER BY d.hora_entrada NULLS LAST LIMIT 1;
    IF v_unidade IS NULL THEN
      SELECT c.unidade INTO v_unidade FROM public.ponto_config c
      WHERE c.latitude IS NOT NULL AND _latitude IS NOT NULL
      ORDER BY private.ponto_distancia_m(_latitude, _longitude, c.latitude, c.longitude) LIMIT 1;
    END IF;
    IF v_unidade IS NULL THEN
      v_unidade := CASE WHEN v_colab.unidade IN ('Botafogo', 'Ipanema') THEN v_colab.unidade ELSE 'Botafogo' END;
    END IF;
  END IF;

  SELECT * INTO v_cfg FROM public.ponto_config WHERE unidade = v_unidade;

  -- Rosto (1:1)
  SELECT * INTO v_bio FROM public.ponto_biometria WHERE colaborador_id = v_colab.id;
  IF v_bio.colaborador_id IS NULL THEN
    v_face_ok := false; v_motivos := array_append(v_motivos, 'sem_cadastro_facial');
  ELSIF _descritor IS NULL OR NOT private.ponto_descritor_valido(_descritor) THEN
    v_face_ok := false; v_motivos := array_append(v_motivos, 'rosto_nao_detectado');
  ELSE
    v_face := round(private.ponto_face_distancia(_descritor, v_bio.descritores), 4);
    v_face_ok := v_face IS NOT NULL AND v_face <= coalesce(v_cfg.limiar_face, 0.5);
    IF NOT v_face_ok THEN v_motivos := array_append(v_motivos, 'rosto_nao_confere'); END IF;
  END IF;

  IF NOT coalesce(_vivacidade_ok, false) THEN v_motivos := array_append(v_motivos, 'prova_de_vida_falhou'); END IF;

  -- Local
  IF _latitude IS NULL OR _longitude IS NULL THEN
    v_dentro := NULL; v_motivos := array_append(v_motivos, 'sem_localizacao');
  ELSIF v_cfg.latitude IS NULL THEN
    v_dentro := NULL; -- unidade ainda sem coordenadas cadastradas: não bloqueia
  ELSE
    v_dist := private.ponto_distancia_m(_latitude, _longitude, v_cfg.latitude, v_cfg.longitude);
    -- Desconta a imprecisão informada pelo GPS (até 50 m) antes de considerar fora
    v_dentro := v_dist - least(coalesce(_precisao_m, 0), 50) <= v_cfg.raio_m;
    IF NOT v_dentro THEN v_motivos := array_append(v_motivos, 'fora_da_unidade'); END IF;
  END IF;

  -- Aparelho (só no modo app)
  IF _modo = 'app' THEN
    v_device_ok := v_bio.device_id IS NULL OR v_bio.device_id = _device_id;
    IF NOT v_device_ok THEN v_motivos := array_append(v_motivos, 'aparelho_diferente'); END IF;
  END IF;

  v_status := CASE WHEN cardinality(v_motivos) = 0 THEN 'valida' ELSE 'pendente' END;

  INSERT INTO public.ponto_batidas (
    colaborador_id, unidade, tipo, data_ref, origem, latitude, longitude, precisao_m,
    distancia_m, dentro_raio, face_distancia, face_ok, vivacidade_ok, device_id, device_ok,
    selfie_path, status, motivos, registrado_por
  ) VALUES (
    v_colab.id, v_unidade, v_tipo, v_data_ref, CASE WHEN _modo = 'app' THEN 'app' ELSE 'quiosque' END,
    _latitude, _longitude, _precisao_m, v_dist, v_dentro, v_face, v_face_ok, coalesce(_vivacidade_ok, false),
    _device_id, v_device_ok, _selfie_path, v_status, v_motivos, v_uid
  ) RETURNING id INTO v_id;

  IF v_status = 'pendente' THEN
    PERFORM private.enqueue_push_notification('ponto_pendente', jsonb_build_object(
      'id', v_id, 'nome', v_colab.nome, 'tipo', v_tipo, 'unidade', v_unidade, 'motivos', to_jsonb(v_motivos)
    ));
  END IF;

  RETURN jsonb_build_object(
    'id', v_id, 'tipo', v_tipo, 'status', v_status, 'motivos', to_jsonb(v_motivos),
    'registrado_em', now(), 'unidade', v_unidade, 'nome', v_colab.nome
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_registrar(jsonb, numeric, numeric, numeric, boolean, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_registrar(jsonb, numeric, numeric, numeric, boolean, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ponto_meu_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_colab public.escala_colaboradores%ROWTYPE;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_result jsonb;
BEGIN
  SELECT * INTO v_colab FROM public.escala_colaboradores WHERE id = private.ponto_colaborador_do_usuario(auth.uid());
  IF v_colab.id IS NULL THEN RETURN jsonb_build_object('vinculado', false); END IF;

  SELECT jsonb_build_object(
    'vinculado', true,
    'colaborador_id', v_colab.id,
    'nome', v_colab.nome,
    'habilitado', v_colab.ponto_habilitado,
    'cadastro_facial', EXISTS (SELECT 1 FROM public.ponto_biometria b WHERE b.colaborador_id = v_colab.id),
    'aparelho_vinculado', (SELECT b.device_id FROM public.ponto_biometria b WHERE b.colaborador_id = v_colab.id),
    'escala_hoje', (
      SELECT jsonb_agg(jsonb_build_object('unidade', d.unidade, 'turno', d.turno, 'status', d.status,
        'hora_entrada', d.hora_entrada, 'hora_saida', d.hora_saida) ORDER BY d.hora_entrada)
      FROM public.escala_dias d
      JOIN public.escala_meses m ON m.unidade = d.unidade AND m.setor = d.setor
        AND m.competencia = date_trunc('month', d.data)::date AND m.status = 'publicada'
      WHERE d.colaborador_id = v_colab.id AND d.data = v_hoje
    ),
    'batidas_recentes', (
      SELECT jsonb_agg(jsonb_build_object('id', b.id, 'tipo', b.tipo, 'registrado_em', b.registrado_em,
        'status', b.status, 'motivos', to_jsonb(b.motivos), 'unidade', b.unidade) ORDER BY b.registrado_em DESC)
      FROM (SELECT * FROM public.ponto_batidas
            WHERE colaborador_id = v_colab.id AND registrado_em > now() - interval '36 hours'
            ORDER BY registrado_em DESC LIMIT 6) b
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_meu_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_meu_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.ponto_quiosque_lista(_unidade text)
RETURNS TABLE (colaborador_id uuid, nome text, vinculo text, setor text, cadastro_facial boolean, entrada_aberta boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'recepcao') OR private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito à recepção e aos gestores';
  END IF;
  RETURN QUERY
  SELECT c.id, c.nome, c.vinculo, c.setor,
    EXISTS (SELECT 1 FROM public.ponto_biometria b WHERE b.colaborador_id = c.id),
    EXISTS (
      SELECT 1 FROM public.ponto_batidas e
      WHERE e.colaborador_id = c.id AND e.tipo = 'entrada' AND e.status <> 'recusada'
        AND e.registrado_em > now() - interval '18 hours'
        AND NOT EXISTS (SELECT 1 FROM public.ponto_batidas s WHERE s.colaborador_id = c.id AND s.tipo = 'saida'
                        AND s.status <> 'recusada' AND s.registrado_em > e.registrado_em)
    )
  FROM public.escala_colaboradores c
  WHERE c.ativo AND c.ponto_habilitado AND c.unidade IN (_unidade, 'Ambas')
  ORDER BY c.vinculo, c.nome;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_quiosque_lista(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_quiosque_lista(text) TO authenticated;
