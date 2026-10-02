-- 0019 — Ponto no app com reconhecimento facial (controle interno; o ponto oficial
-- continua sendo a Pontomais).
--
-- Regras:
-- * 2 batidas por dia (entrada e saída). O tipo é decidido no servidor: se há uma
--   entrada aberta nas últimas 18 h, a próxima batida é a saída (turno da noite
--   que vira o dia fica no dia da entrada).
-- * Horário sempre do servidor (now()), nunca do relógio do celular.
-- * O rosto é comparado no SERVIDOR (1:1) contra o cadastro biométrico; o celular
--   só envia o vetor numérico do rosto (128 números), nunca recebe o cadastro.
-- * Falhou rosto, prova de vida, GPS fora do raio ou aparelho diferente →
--   a batida é registrada como PENDENTE, com selfie, para o gestor aprovar.
-- * Biometria é dado sensível (LGPD art. 11): só é cadastrada com consentimento
--   registrado, só gestores leem, e pode ser apagada a qualquer momento.

-- ---------------------------------------------------------------------------
-- Configuração por unidade
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_config (
  unidade text PRIMARY KEY CHECK (unidade IN ('Botafogo', 'Ipanema')),
  latitude numeric(9,6),
  longitude numeric(9,6),
  raio_m integer NOT NULL DEFAULT 100 CHECK (raio_m BETWEEN 20 AND 2000),
  tolerancia_min integer NOT NULL DEFAULT 10 CHECK (tolerancia_min BETWEEN 0 AND 60),
  limiar_face numeric(4,3) NOT NULL DEFAULT 0.500 CHECK (limiar_face > 0 AND limiar_face < 1.5),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.ponto_config (unidade) VALUES ('Botafogo'), ('Ipanema') ON CONFLICT DO NOTHING;
GRANT SELECT, UPDATE ON public.ponto_config TO authenticated;
GRANT ALL ON public.ponto_config TO service_role;
ALTER TABLE public.ponto_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam config do ponto" ON public.ponto_config;
CREATE POLICY "Gestores consultam config do ponto" ON public.ponto_config FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Gestores alteram config do ponto" ON public.ponto_config;
CREATE POLICY "Gestores alteram config do ponto" ON public.ponto_config FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS tr_ponto_config_updated ON public.ponto_config;
CREATE TRIGGER tr_ponto_config_updated BEFORE UPDATE ON public.ponto_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Cadastro biométrico (somente o vetor do rosto, sem foto)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_biometria (
  colaborador_id uuid PRIMARY KEY REFERENCES public.escala_colaboradores(id) ON DELETE CASCADE,
  descritores jsonb NOT NULL CHECK (jsonb_typeof(descritores) = 'array' AND jsonb_array_length(descritores) BETWEEN 1 AND 10),
  device_id text,
  consentimento_em timestamptz NOT NULL,
  consentimento_versao text NOT NULL,
  cadastrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.ponto_biometria TO authenticated;
GRANT ALL ON public.ponto_biometria TO service_role;
ALTER TABLE public.ponto_biometria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam biometria" ON public.ponto_biometria;
CREATE POLICY "Gestores consultam biometria" ON public.ponto_biometria FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Gestores apagam biometria" ON public.ponto_biometria;
CREATE POLICY "Gestores apagam biometria" ON public.ponto_biometria FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS tr_ponto_biometria_updated ON public.ponto_biometria;
CREATE TRIGGER tr_ponto_biometria_updated BEFORE UPDATE ON public.ponto_biometria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION private.ponto_colaborador_do_usuario(_uid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id FROM public.escala_colaboradores c
  JOIN public.funcionarios f ON f.id = c.funcionario_id
  WHERE f.user_id = _uid AND c.ativo
  ORDER BY c.vinculo = 'fixo' DESC, c.created_at
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION private.ponto_colaborador_do_usuario(uuid) FROM PUBLIC, anon, authenticated;

-- Versão sem parâmetro para as políticas de acesso (só devolve o do próprio usuário)
CREATE OR REPLACE FUNCTION private.ponto_meu_colaborador()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.ponto_colaborador_do_usuario(auth.uid())
$$;
REVOKE ALL ON FUNCTION private.ponto_meu_colaborador() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.ponto_meu_colaborador() TO authenticated;

-- ---------------------------------------------------------------------------
-- Batidas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_batidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.escala_colaboradores(id) ON DELETE RESTRICT,
  unidade text NOT NULL CHECK (unidade IN ('Botafogo', 'Ipanema')),
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  data_ref date NOT NULL,
  origem text NOT NULL DEFAULT 'app' CHECK (origem IN ('app', 'quiosque', 'manual')),
  latitude numeric(9,6),
  longitude numeric(9,6),
  precisao_m numeric,
  distancia_m numeric,
  dentro_raio boolean,
  face_distancia numeric,
  face_ok boolean,
  vivacidade_ok boolean,
  device_id text,
  device_ok boolean,
  selfie_path text,
  status text NOT NULL CHECK (status IN ('valida', 'pendente', 'aprovada', 'recusada')),
  motivos text[] NOT NULL DEFAULT '{}',
  registrado_por uuid,
  revisado_por uuid,
  revisado_em timestamptz,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ponto_batidas_colab_data_idx ON public.ponto_batidas (colaborador_id, data_ref);
CREATE INDEX IF NOT EXISTS ponto_batidas_data_idx ON public.ponto_batidas (data_ref, unidade);
CREATE INDEX IF NOT EXISTS ponto_batidas_pendentes_idx ON public.ponto_batidas (status) WHERE status = 'pendente';
GRANT SELECT ON public.ponto_batidas TO authenticated;
GRANT ALL ON public.ponto_batidas TO service_role;
ALTER TABLE public.ponto_batidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam batidas" ON public.ponto_batidas;
CREATE POLICY "Gestores consultam batidas" ON public.ponto_batidas FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Funcionario consulta as proprias batidas" ON public.ponto_batidas;
CREATE POLICY "Funcionario consulta as proprias batidas" ON public.ponto_batidas FOR SELECT TO authenticated
  USING (colaborador_id = private.ponto_meu_colaborador());

-- Selfies: o bucket privado "ponto" é criado pela ferramenta de armazenamento do
-- Lovable e as políticas ficam na migração 0020 (o banco não permite gravar
-- direto em storage.buckets por migração).

-- ---------------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.ponto_distancia_m(_lat1 numeric, _lng1 numeric, _lat2 numeric, _lng2 numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _lat1 IS NULL OR _lng1 IS NULL OR _lat2 IS NULL OR _lng2 IS NULL THEN NULL ELSE
    round((2 * 6371000 * asin(sqrt(
      power(sin(radians((_lat2 - _lat1)::float8) / 2), 2) +
      cos(radians(_lat1::float8)) * cos(radians(_lat2::float8)) * power(sin(radians((_lng2 - _lng1)::float8) / 2), 2)
    )))::numeric, 1) END
$$;

-- Menor distância euclidiana entre o vetor enviado e os vetores cadastrados
CREATE OR REPLACE FUNCTION private.ponto_face_distancia(_descritor jsonb, _cadastro jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT min(dist) FROM (
    SELECT sqrt(sum(power((a.v)::float8 - (b.v)::float8, 2)))::numeric AS dist
    FROM jsonb_array_elements(_cadastro) WITH ORDINALITY AS s(vec, sid)
    CROSS JOIN LATERAL jsonb_array_elements_text(s.vec) WITH ORDINALITY AS b(v, i)
    JOIN jsonb_array_elements_text(_descritor) WITH ORDINALITY AS a(v, i) ON a.i = b.i
    GROUP BY s.sid
    HAVING count(*) = 128
  ) d
$$;

CREATE OR REPLACE FUNCTION private.ponto_descritor_valido(_d jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(_d) = 'array' AND jsonb_array_length(_d) = 128
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_d) e WHERE jsonb_typeof(e) <> 'number')
$$;


-- ---------------------------------------------------------------------------
-- Registrar batida
-- _modo 'app'      → o próprio funcionário, no aparelho dele
-- _modo 'quiosque' → freelancer no aparelho da recepção (recepção ou gestor logado),
--                    escolhendo o nome e confirmando pelo rosto (1:1)
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
  ELSE
    IF NOT (private.has_role(v_uid, 'recepcao') OR private.has_role(v_uid, 'gestor') OR private.has_role(v_uid, 'admin')) THEN
      RAISE EXCEPTION 'Somente a recepção ou o gestor podem usar o ponto de freelancer';
    END IF;
    SELECT * INTO v_colab FROM public.escala_colaboradores WHERE id = _colaborador_id AND ativo AND vinculo = 'freelance';
    IF v_colab.id IS NULL THEN RAISE EXCEPTION 'Freelancer não encontrado'; END IF;
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

-- ---------------------------------------------------------------------------
-- Situação do próprio funcionário (tela "Bater ponto")
-- ---------------------------------------------------------------------------
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

-- Lista de freelancers para o ponto da recepção (sem dados sensíveis)
CREATE OR REPLACE FUNCTION public.ponto_freelancers_quiosque(_unidade text)
RETURNS TABLE (colaborador_id uuid, nome text, cadastro_facial boolean, entrada_aberta boolean)
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
  SELECT c.id, c.nome,
    EXISTS (SELECT 1 FROM public.ponto_biometria b WHERE b.colaborador_id = c.id),
    EXISTS (
      SELECT 1 FROM public.ponto_batidas e
      WHERE e.colaborador_id = c.id AND e.tipo = 'entrada' AND e.status <> 'recusada'
        AND e.registrado_em > now() - interval '18 hours'
        AND NOT EXISTS (SELECT 1 FROM public.ponto_batidas s WHERE s.colaborador_id = c.id AND s.tipo = 'saida'
                        AND s.status <> 'recusada' AND s.registrado_em > e.registrado_em)
    )
  FROM public.escala_colaboradores c
  WHERE c.ativo AND c.vinculo = 'freelance' AND c.unidade IN (_unidade, 'Ambas')
  ORDER BY c.nome;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_freelancers_quiosque(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_freelancers_quiosque(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Funções do gestor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ponto_cadastrar_biometria(
  _colaborador_id uuid,
  _descritores jsonb,
  _device_id text,
  _consentimento boolean,
  _consentimento_versao text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF NOT coalesce(_consentimento, false) THEN
    RAISE EXCEPTION 'É obrigatório registrar o consentimento do colaborador';
  END IF;
  IF jsonb_typeof(_descritores) <> 'array' OR jsonb_array_length(_descritores) NOT BETWEEN 3 AND 10 THEN
    RAISE EXCEPTION 'Envie de 3 a 10 amostras do rosto';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_descritores) d WHERE NOT private.ponto_descritor_valido(d)) THEN
    RAISE EXCEPTION 'Amostra de rosto inválida';
  END IF;
  INSERT INTO public.ponto_biometria (colaborador_id, descritores, device_id, consentimento_em, consentimento_versao, cadastrado_por)
  VALUES (_colaborador_id, _descritores, nullif(_device_id, ''), now(), _consentimento_versao, auth.uid())
  ON CONFLICT (colaborador_id) DO UPDATE
    SET descritores = EXCLUDED.descritores,
        device_id = coalesce(EXCLUDED.device_id, public.ponto_biometria.device_id),
        consentimento_em = EXCLUDED.consentimento_em,
        consentimento_versao = EXCLUDED.consentimento_versao,
        cadastrado_por = EXCLUDED.cadastrado_por;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_cadastrar_biometria(uuid, jsonb, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_cadastrar_biometria(uuid, jsonb, text, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ponto_vincular_aparelho(_colaborador_id uuid, _device_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  UPDATE public.ponto_biometria SET device_id = nullif(_device_id, '') WHERE colaborador_id = _colaborador_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_vincular_aparelho(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_vincular_aparelho(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ponto_revisar(_batida_id uuid, _aprovar boolean, _observacao text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  UPDATE public.ponto_batidas
  SET status = CASE WHEN _aprovar THEN 'aprovada' ELSE 'recusada' END,
      revisado_por = auth.uid(), revisado_em = now(),
      observacao = nullif(trim(coalesce(_observacao, '')), '')
  WHERE id = _batida_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batida não encontrada'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_revisar(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_revisar(uuid, boolean, text) TO authenticated;

-- Lançamento manual (esquecimento, celular sem bateria etc.)
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
  IF _tipo NOT IN ('entrada', 'saida') OR _unidade NOT IN ('Botafogo', 'Ipanema') THEN
    RAISE EXCEPTION 'Tipo ou unidade inválidos';
  END IF;
  IF nullif(trim(coalesce(_motivo, '')), '') IS NULL THEN RAISE EXCEPTION 'Informe o motivo do lançamento manual'; END IF;
  IF _tipo = 'saida' THEN
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

-- ---------------------------------------------------------------------------
-- Relatório diário: previsto (escala) x realizado (batidas)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.ponto_dia
WITH (security_invoker = true)
AS
WITH batidas AS (
  SELECT b.colaborador_id, b.data_ref AS data,
    min(b.registrado_em) FILTER (WHERE b.tipo = 'entrada') AS entrada_real,
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
    CASE WHEN d.hora_entrada IS NOT NULL THEN (d.data + d.hora_entrada) AT TIME ZONE 'America/Sao_Paulo' END AS entrada_prevista,
    CASE WHEN d.hora_entrada IS NOT NULL AND d.hora_saida IS NOT NULL THEN
      ((d.data + CASE WHEN d.hora_saida <= d.hora_entrada THEN 1 ELSE 0 END) + d.hora_saida) AT TIME ZONE 'America/Sao_Paulo'
    END AS saida_prevista
  FROM public.escala_dias d
  WHERE d.status IN ('trabalho', 'extra', 'folga', 'falta', 'atestado', 'ferias')
)
SELECT
  coalesce(b.colaborador_id, e.colaborador_id) AS colaborador_id,
  c.nome,
  c.vinculo,
  c.setor,
  coalesce(b.data, e.data) AS data,
  coalesce(e.unidade, b.unidade_batida) AS unidade,
  e.status_escala,
  e.turno,
  e.entrada_prevista,
  e.saida_prevista,
  b.entrada_real,
  b.saida_real,
  CASE WHEN b.entrada_real IS NOT NULL AND b.saida_real IS NOT NULL
       THEN round(extract(epoch FROM b.saida_real - b.entrada_real) / 60) END AS minutos_trabalhados,
  CASE WHEN e.entrada_prevista IS NOT NULL AND e.saida_prevista IS NOT NULL
       THEN round(extract(epoch FROM e.saida_prevista - e.entrada_prevista) / 60)
       WHEN e.horas_contratadas IS NOT NULL THEN round(e.horas_contratadas * 60) END AS minutos_previstos,
  CASE WHEN b.entrada_real > e.entrada_prevista
       THEN round(extract(epoch FROM b.entrada_real - e.entrada_prevista) / 60) ELSE 0 END AS atraso_min,
  CASE WHEN b.saida_real < e.saida_prevista
       THEN round(extract(epoch FROM e.saida_prevista - b.saida_real) / 60) ELSE 0 END AS saida_antecipada_min,
  CASE WHEN b.saida_real > e.saida_prevista
       THEN round(extract(epoch FROM b.saida_real - e.saida_prevista) / 60) ELSE 0 END AS apos_horario_min,
  (e.status_escala IN ('trabalho', 'extra') AND b.entrada_real IS NULL
    AND coalesce(b.data, e.data) < (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS falta_sem_registro,
  (e.status_escala IN ('folga', 'ferias', 'atestado') AND b.entrada_real IS NOT NULL) AS trabalhou_fora_da_escala,
  (b.entrada_real IS NOT NULL AND b.saida_real IS NULL
    AND coalesce(b.data, e.data) < (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS sem_saida,
  EXISTS (SELECT 1 FROM public.feriados f WHERE f.data = coalesce(b.data, e.data)) AS feriado,
  coalesce(b.pendentes, 0) AS batidas_pendentes,
  coalesce(b.tem_manual, false) AS tem_lancamento_manual
FROM batidas b
FULL OUTER JOIN escala e ON e.colaborador_id = b.colaborador_id AND e.data = b.data
JOIN public.escala_colaboradores c ON c.id = coalesce(b.colaborador_id, e.colaborador_id)
WHERE b.colaborador_id IS NOT NULL OR e.status_escala IN ('trabalho', 'extra');

GRANT SELECT ON public.ponto_dia TO authenticated;
GRANT ALL ON public.ponto_dia TO service_role;
