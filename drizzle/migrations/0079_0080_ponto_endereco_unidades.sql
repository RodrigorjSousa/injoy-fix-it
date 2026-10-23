-- 0080 — Ponto: endereço das unidades gravado no servidor (23/10/2026).
--
-- O app publicado chamava ponto_verificar_local, mas a 0077 não estava aplicada no banco
-- ("Could not find the function public.ponto_verificar_local ... in the schema cache").
-- Esta migração é COMPLETA e independente: recria tudo da 0077 + 0079 e grava as coordenadas
-- dos endereços das unidades (pode ser aplicada mesmo que a 0077/0079 já tenham sido).
--
-- * Botafogo: R. Estácio Coimbra, 80 — CEP 22260-010 → -22.951187, -43.186294
-- * Ipanema:  R. Joana Angélica, 247 — CEP 22420-030 → -22.980758, -43.204902
--   (coordenadas do Google Maps para os endereços informados pelo Rodrigo)
-- * As coordenadas ficam em private.ponto_endereco_unidade() e são copiadas para ponto_config.
--   Se ponto_config ficar sem coordenadas, o servidor usa as do endereço.
-- * Batida só a até raio_m (100 m) de Botafogo OU Ipanema, tolerando 30 m de imprecisão do GPS;
--   sem prova de vida; rosto que não confere e aparelho diferente vão para pendência.
-- Idempotente (CREATE OR REPLACE).

-- ---------------------------------------------------------------------------
-- Endereço (coordenadas) de cada unidade
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.ponto_endereco_unidade()
RETURNS TABLE (unidade text, endereco text, latitude numeric, longitude numeric)
LANGUAGE sql IMMUTABLE AS $$
  VALUES
    ('Botafogo'::text, 'R. Estácio Coimbra, 80 - Botafogo, Rio de Janeiro - RJ, 22260-010'::text,
     -22.951187::numeric, -43.186294::numeric),
    ('Ipanema'::text, 'R. Joana Angélica, 247 - Ipanema, Rio de Janeiro - RJ, 22420-030'::text,
     -22.980758::numeric, -43.204902::numeric)
$$;
REVOKE ALL ON FUNCTION private.ponto_endereco_unidade() FROM PUBLIC, anon, authenticated;

-- Grava as coordenadas dos endereços na configuração do ponto (raio padrão 100 m)
DO $$
BEGIN
  UPDATE public.ponto_config c
  SET latitude = e.latitude, longitude = e.longitude
  FROM private.ponto_endereco_unidade() e
  WHERE e.unidade = c.unidade;
END
$$;

-- ---------------------------------------------------------------------------
-- Unidade mais próxima com coordenadas cadastradas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.ponto_local(_latitude numeric, _longitude numeric, _precisao_m numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg record;
  v_tem_coord boolean;
  v_dentro boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.ponto_config c LEFT JOIN private.ponto_endereco_unidade() e ON e.unidade = c.unidade
                 WHERE coalesce(c.latitude, e.latitude) IS NOT NULL)
  INTO v_tem_coord;
  IF NOT v_tem_coord THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', 'unidades_sem_coordenadas',
      'mensagem', 'As unidades ainda não têm a localização cadastrada. O gestor precisa salvar em Ponto Facial › Configurações.');
  END IF;
  IF _latitude IS NULL OR _longitude IS NULL THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', 'sem_localizacao',
      'mensagem', 'Localização não recebida. Ative a localização do celular e permita o acesso para o app.');
  END IF;
  IF _precisao_m IS NOT NULL AND _precisao_m > 200 THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', 'localizacao_imprecisa', 'precisao_m', round(_precisao_m),
      'mensagem', format('Localização imprecisa (± %s m). Ative a localização precisa (GPS) e tente de novo perto de uma janela.', round(_precisao_m)));
  END IF;

  SELECT x.unidade, x.raio_m, x.distancia
  INTO v_cfg
  FROM (
    SELECT c.unidade, c.raio_m,
           private.ponto_distancia_m(_latitude, _longitude,
             coalesce(c.latitude, e.latitude), coalesce(c.longitude, e.longitude)) AS distancia
    FROM public.ponto_config c
    LEFT JOIN private.ponto_endereco_unidade() e ON e.unidade = c.unidade
    WHERE coalesce(c.latitude, e.latitude) IS NOT NULL
  ) x
  ORDER BY x.distancia - x.raio_m
  LIMIT 1;

  v_dentro := v_cfg.distancia - least(coalesce(_precisao_m, 0), 30) <= v_cfg.raio_m;
  RETURN jsonb_build_object(
    'permitido', v_dentro,
    'motivo', CASE WHEN v_dentro THEN NULL ELSE 'fora_da_unidade' END,
    'unidade', v_cfg.unidade,
    'distancia_m', round(v_cfg.distancia),
    'raio_m', v_cfg.raio_m,
    'precisao_m', round(_precisao_m),
    'mensagem', CASE WHEN v_dentro THEN format('Você está em %s.', v_cfg.unidade)
      ELSE format('Você está a %s m de %s. O ponto só pode ser registrado a até %s m de Botafogo ou Ipanema.',
                  round(v_cfg.distancia), v_cfg.unidade, v_cfg.raio_m) END
  );
END;
$$;
REVOKE ALL ON FUNCTION private.ponto_local(numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;

-- Conferência antes de abrir a câmera (não grava nada)
CREATE OR REPLACE FUNCTION public.ponto_verificar_local(_latitude numeric, _longitude numeric, _precisao_m numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para bater o ponto'; END IF;
  RETURN private.ponto_local(_latitude, _longitude, _precisao_m);
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_verificar_local(numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_verificar_local(numeric, numeric, numeric) TO authenticated;

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

-- Recarrega o cache da API para o app enxergar as funções na hora
NOTIFY pgrst, 'reload schema';
