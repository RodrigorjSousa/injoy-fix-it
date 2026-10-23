-- 0079 — Ponto: sem prova de vida (23/10/2026).
--
-- A prova de vida (piscar os olhos) impedia o Flávio de bater o ponto. O app passa a fazer só a
-- captura simples da foto (com o reconhecimento do rosto 1:1 quando o rosto aparece), e o
-- servidor deixa de marcar "prova_de_vida_falhou". Continua igual à 0077: localização obrigatória
-- a até 100 m de Botafogo ou Ipanema, rosto que não confere e aparelho diferente vão para pendência.
-- Idempotente (CREATE OR REPLACE). Depende da 0077 (private.ponto_local).

-- ---------------------------------------------------------------------------
-- Registrar batida (mesma assinatura da 0025/0026/0077)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ponto_registrar(
  _descritor jsonb,
  _latitude numeric,
  _longitude numeric,
  _precisao_m numeric,
  _vivacidade_ok boolean,
  _device_id text,
  _selfie_path text,
  _modo text DEFAULT 'app',
  _colaborador_id uuid DEFAULT NULL,
  _tipo text DEFAULT NULL
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
  v_local jsonb;
  v_unidade text;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_jornada record;
  v_permitidos text[];
  v_ultima timestamptz;
  v_tipo text;
  v_data_ref date;
  v_dist numeric;
  v_face numeric;
  v_face_ok boolean;
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

  -- Local: obrigatório e a até raio_m de uma das unidades
  v_local := private.ponto_local(_latitude, _longitude, _precisao_m);
  IF NOT (v_local->>'permitido')::boolean THEN
    RAISE EXCEPTION '%', v_local->>'mensagem';
  END IF;
  v_dist := (v_local->>'distancia_m')::numeric;

  -- Evita batida dupla por toque repetido
  SELECT max(registrado_em) INTO v_ultima FROM public.ponto_batidas
  WHERE colaborador_id = v_colab.id AND status <> 'recusada';
  IF v_ultima IS NOT NULL AND now() - v_ultima < interval '2 minutes' THEN
    RAISE EXCEPTION 'Batida já registrada há instantes';
  END IF;

  -- Jornada aberta (entrada nas últimas 18 h ainda sem saída final)
  SELECT * INTO v_jornada FROM private.ponto_jornada_aberta(v_colab.id);
  v_permitidos := private.ponto_proximos_tipos(v_jornada.ultimo_tipo);
  v_tipo := coalesce(_tipo, v_permitidos[1]);
  IF NOT (v_tipo = ANY (v_permitidos)) THEN
    RAISE EXCEPTION 'Agora não é possível registrar "%". Opções: %', v_tipo, array_to_string(v_permitidos, ', ');
  END IF;

  IF v_jornada.entrada_id IS NOT NULL THEN
    v_data_ref := v_jornada.data_ref; v_unidade := v_jornada.unidade;
  ELSE
    -- Entrada: a unidade onde a pessoa está
    v_data_ref := v_hoje; v_unidade := v_local->>'unidade';
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

  -- Prova de vida (piscar) desligada desde 23/10/2026: não gera mais pendência.

  -- Aparelho (só no modo app). Sem aparelho vinculado: vincula este no primeiro uso.
  IF _modo = 'app' THEN
    IF v_bio.colaborador_id IS NOT NULL AND v_bio.device_id IS NULL AND nullif(_device_id, '') IS NOT NULL
       AND _device_id <> 'sem-armazenamento' THEN
      UPDATE public.ponto_biometria SET device_id = _device_id WHERE colaborador_id = v_colab.id;
      v_bio.device_id := _device_id;
    END IF;
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
    _latitude, _longitude, _precisao_m, v_dist, true, v_face, v_face_ok, coalesce(_vivacidade_ok, false),
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
REVOKE ALL ON FUNCTION public.ponto_registrar(jsonb, numeric, numeric, numeric, boolean, text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_registrar(jsonb, numeric, numeric, numeric, boolean, text, text, text, uuid, text) TO authenticated;
