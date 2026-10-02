-- 0025 — Ponto com intervalo de almoço (4 batidas): entrada, saída para almoço,
-- volta do almoço e saída. O almoço é opcional: depois da entrada a pessoa escolhe
-- "Saída para almoço" ou "Encerrar expediente". Relatório passa a mostrar o
-- intervalo e alertar intervalo curto/ausente (CLT art. 71: mínimo 1 h em jornada
-- acima de 6 h; 15 min entre 4 e 6 h).

ALTER TABLE public.ponto_batidas DROP CONSTRAINT IF EXISTS ponto_batidas_tipo_check;
ALTER TABLE public.ponto_batidas ADD CONSTRAINT ponto_batidas_tipo_check
  CHECK (tipo IN ('entrada', 'saida_almoco', 'volta_almoco', 'saida'));

-- Jornada aberta de uma pessoa: última entrada (até 18 h) ainda sem saída final,
-- e o tipo da última batida dessa jornada.
CREATE OR REPLACE FUNCTION private.ponto_jornada_aberta(_colaborador_id uuid)
RETURNS TABLE (entrada_id uuid, data_ref date, unidade text, ultimo_tipo text, ultimo_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT b.id, b.data_ref, b.unidade, b.registrado_em
    FROM public.ponto_batidas b
    WHERE b.colaborador_id = _colaborador_id AND b.tipo = 'entrada' AND b.status <> 'recusada'
      AND b.registrado_em > now() - interval '18 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.ponto_batidas s
        WHERE s.colaborador_id = b.colaborador_id AND s.tipo = 'saida' AND s.status <> 'recusada'
          AND s.registrado_em > b.registrado_em
      )
    ORDER BY b.registrado_em DESC LIMIT 1
  )
  SELECT e.id, e.data_ref, e.unidade, l.tipo, l.registrado_em
  FROM e
  CROSS JOIN LATERAL (
    SELECT x.tipo, x.registrado_em FROM public.ponto_batidas x
    WHERE x.colaborador_id = _colaborador_id AND x.status <> 'recusada' AND x.registrado_em >= e.registrado_em
    ORDER BY x.registrado_em DESC LIMIT 1
  ) l
$$;
REVOKE ALL ON FUNCTION private.ponto_jornada_aberta(uuid) FROM PUBLIC, anon, authenticated;

-- O primeiro da lista é o padrão quando o aparelho não informa o tipo.
CREATE OR REPLACE FUNCTION private.ponto_proximos_tipos(_ultimo_tipo text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _ultimo_tipo
    WHEN 'entrada' THEN ARRAY['saida_almoco', 'saida']
    WHEN 'saida_almoco' THEN ARRAY['volta_almoco', 'saida']
    WHEN 'volta_almoco' THEN ARRAY['saida']
    ELSE ARRAY['entrada']
  END
$$;

DROP FUNCTION IF EXISTS public.ponto_registrar(jsonb, numeric, numeric, numeric, boolean, text, text, text, uuid);
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
    v_data_ref := v_hoje;
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
REVOKE ALL ON FUNCTION public.ponto_registrar(jsonb, numeric, numeric, numeric, boolean, text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_registrar(jsonb, numeric, numeric, numeric, boolean, text, text, text, uuid, text) TO authenticated;

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
    'ultimo_tipo_aberto', (SELECT j.ultimo_tipo FROM private.ponto_jornada_aberta(v_colab.id) j),
    'proximos_tipos', to_jsonb(private.ponto_proximos_tipos((SELECT j.ultimo_tipo FROM private.ponto_jornada_aberta(v_colab.id) j))),
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

CREATE OR REPLACE FUNCTION public.ponto_lancar_manual(
  _colaborador_id uuid, _tipo text, _registrado_em timestamptz, _unidade text, _motivo text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_data_ref date := (_registrado_em AT TIME ZONE 'America/Sao_Paulo')::date;
  v_entrada public.ponto_batidas%ROWTYPE;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF _tipo NOT IN ('entrada', 'saida_almoco', 'volta_almoco', 'saida') OR _unidade NOT IN ('Botafogo', 'Ipanema') THEN
    RAISE EXCEPTION 'Tipo ou unidade inválidos';
  END IF;
  IF nullif(trim(coalesce(_motivo, '')), '') IS NULL THEN RAISE EXCEPTION 'Informe o motivo do lançamento manual'; END IF;
  IF _tipo <> 'entrada' THEN
    SELECT * INTO v_entrada FROM public.ponto_batidas
    WHERE colaborador_id = _colaborador_id AND tipo = 'entrada' AND status <> 'recusada'
      AND registrado_em < _registrado_em AND registrado_em > _registrado_em - interval '18 hours'
    ORDER BY registrado_em DESC LIMIT 1;
    IF v_entrada.id IS NOT NULL THEN v_data_ref := v_entrada.data_ref; END IF;
  END IF;
  INSERT INTO public.ponto_batidas (colaborador_id, unidade, tipo, registrado_em, data_ref, origem, status, motivos,
    registrado_por, revisado_por, revisado_em, observacao)
  VALUES (_colaborador_id, _unidade, _tipo, _registrado_em, v_data_ref, 'manual', 'aprovada', ARRAY['lancamento_manual'],
    auth.uid(), auth.uid(), now(), trim(_motivo))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_lancar_manual(uuid, text, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_lancar_manual(uuid, text, timestamptz, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.ponto_quiosque_lista(text);
CREATE OR REPLACE FUNCTION public.ponto_quiosque_lista(_unidade text)
RETURNS TABLE (colaborador_id uuid, nome text, vinculo text, setor text, cadastro_facial boolean,
               entrada_aberta boolean, ultimo_tipo text, proximos_tipos text[])
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
    j.entrada_id IS NOT NULL,
    j.ultimo_tipo,
    private.ponto_proximos_tipos(j.ultimo_tipo)
  FROM public.escala_colaboradores c
  LEFT JOIN LATERAL private.ponto_jornada_aberta(c.id) j ON true
  WHERE c.ativo AND c.ponto_habilitado AND c.unidade IN (_unidade, 'Ambas')
  ORDER BY c.vinculo, c.nome;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_quiosque_lista(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_quiosque_lista(text) TO authenticated;

-- Relatório diário com almoço
DROP VIEW IF EXISTS public.ponto_dia;
CREATE VIEW public.ponto_dia
WITH (security_invoker = true)
AS
WITH batidas AS (
  SELECT b.colaborador_id, b.data_ref AS data,
    min(b.registrado_em) FILTER (WHERE b.tipo = 'entrada') AS entrada_real,
    min(b.registrado_em) FILTER (WHERE b.tipo = 'saida_almoco') AS almoco_saida,
    max(b.registrado_em) FILTER (WHERE b.tipo = 'volta_almoco') AS almoco_volta,
    max(b.registrado_em) FILTER (WHERE b.tipo = 'saida') AS saida_real,
    (array_agg(b.unidade ORDER BY b.registrado_em))[1] AS unidade_batida,
    count(*) FILTER (WHERE b.status = 'pendente') AS pendentes,
    bool_or(b.origem = 'manual') AS tem_manual
  FROM public.ponto_batidas b
  WHERE b.status <> 'recusada'
  GROUP BY b.colaborador_id, b.data_ref
), escala AS (
  SELECT d.colaborador_id, d.data, d.unidade, d.status AS status_escala, d.turno,
    d.horas_contratadas,
    (SELECT p.intervalo_minutos FROM public.escala_padroes p
      WHERE p.colaborador_id = d.colaborador_id AND p.vigente_ate IS NULL LIMIT 1) AS intervalo_previsto,
    CASE WHEN d.hora_entrada IS NOT NULL THEN (d.data + d.hora_entrada) AT TIME ZONE 'America/Sao_Paulo' END AS entrada_prevista,
    CASE WHEN d.hora_entrada IS NOT NULL AND d.hora_saida IS NOT NULL THEN
      ((d.data + CASE WHEN d.hora_saida <= d.hora_entrada THEN 1 ELSE 0 END) + d.hora_saida) AT TIME ZONE 'America/Sao_Paulo'
    END AS saida_prevista
  FROM public.escala_dias d
  WHERE d.status IN ('trabalho', 'extra', 'folga', 'falta', 'atestado', 'ferias')
), base AS (
  SELECT
    coalesce(b.colaborador_id, e.colaborador_id) AS colaborador_id,
    coalesce(b.data, e.data) AS data,
    b.entrada_real, b.almoco_saida, b.almoco_volta, b.saida_real, b.unidade_batida, b.pendentes, b.tem_manual,
    e.unidade AS unidade_escala, e.status_escala, e.turno, e.horas_contratadas, e.intervalo_previsto,
    e.entrada_prevista, e.saida_prevista,
    CASE WHEN b.almoco_saida IS NOT NULL AND b.almoco_volta IS NOT NULL AND b.almoco_volta > b.almoco_saida
         THEN round(extract(epoch FROM b.almoco_volta - b.almoco_saida) / 60) END AS intervalo_min,
    CASE WHEN b.entrada_real IS NOT NULL AND b.saida_real IS NOT NULL
         THEN round(extract(epoch FROM b.saida_real - b.entrada_real) / 60) END AS permanencia_min
  FROM batidas b
  FULL OUTER JOIN escala e ON e.colaborador_id = b.colaborador_id AND e.data = b.data
  WHERE b.colaborador_id IS NOT NULL OR e.status_escala IN ('trabalho', 'extra')
)
SELECT
  x.colaborador_id,
  c.nome,
  c.vinculo,
  c.setor,
  x.data,
  coalesce(x.unidade_escala, x.unidade_batida) AS unidade,
  x.status_escala,
  x.turno,
  x.entrada_prevista,
  x.saida_prevista,
  x.entrada_real,
  x.almoco_saida,
  x.almoco_volta,
  x.saida_real,
  x.intervalo_min,
  x.intervalo_previsto AS intervalo_previsto_min,
  CASE WHEN x.permanencia_min IS NOT NULL THEN x.permanencia_min - coalesce(x.intervalo_min, 0) END AS minutos_trabalhados,
  CASE WHEN x.status_escala = 'extra' AND x.horas_contratadas IS NOT NULL THEN round(x.horas_contratadas * 60)
       WHEN x.entrada_prevista IS NOT NULL AND x.saida_prevista IS NOT NULL
       THEN round(extract(epoch FROM x.saida_prevista - x.entrada_prevista) / 60) - coalesce(x.intervalo_previsto, 0)
       WHEN x.horas_contratadas IS NOT NULL THEN round(x.horas_contratadas * 60) END AS minutos_previstos,
  CASE WHEN x.entrada_real > x.entrada_prevista
       THEN round(extract(epoch FROM x.entrada_real - x.entrada_prevista) / 60) ELSE 0 END AS atraso_min,
  CASE WHEN x.saida_real < x.saida_prevista
       THEN round(extract(epoch FROM x.saida_prevista - x.saida_real) / 60) ELSE 0 END AS saida_antecipada_min,
  CASE WHEN x.saida_real > x.saida_prevista
       THEN round(extract(epoch FROM x.saida_real - x.saida_prevista) / 60) ELSE 0 END AS apos_horario_min,
  (x.status_escala IN ('trabalho', 'extra') AND x.entrada_real IS NULL
    AND x.data < (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS falta_sem_registro,
  (x.status_escala IN ('folga', 'ferias', 'atestado') AND x.entrada_real IS NOT NULL) AS trabalhou_fora_da_escala,
  (x.entrada_real IS NOT NULL AND x.saida_real IS NULL
    AND x.data < (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS sem_saida,
  (x.almoco_saida IS NOT NULL AND x.almoco_volta IS NULL) AS almoco_sem_volta,
  (x.permanencia_min > 360 AND x.almoco_saida IS NULL) AS sem_intervalo,
  (x.intervalo_min IS NOT NULL AND (
     (x.permanencia_min > 360 AND x.intervalo_min < 60) OR
     (x.permanencia_min > 240 AND x.permanencia_min <= 360 AND x.intervalo_min < 15)
  )) AS intervalo_curto,
  EXISTS (SELECT 1 FROM public.feriados f WHERE f.data = x.data) AS feriado,
  coalesce(x.pendentes, 0) AS batidas_pendentes,
  coalesce(x.tem_manual, false) AS tem_lancamento_manual
FROM base x
JOIN public.escala_colaboradores c ON c.id = x.colaborador_id;

GRANT SELECT ON public.ponto_dia TO authenticated;
GRANT ALL ON public.ponto_dia TO service_role;
