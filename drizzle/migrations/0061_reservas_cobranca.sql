-- Tela RESERVAS (Recepção): lista de reservas com saldo em aberto que a recepção deve cobrar no Cloudbeds.
-- Regras de cobrança em src/lib/reservas/cobranca.ts; a lista é gravada pelo servidor
-- (/api/public/reservas-cobranca, a cada 1 h — agendamento na migração 0062).
--
-- Quem vê (nesta ordem):
--   1. gestor/admin sempre;
--   2. se o gestor marcou a pessoa em "Quem vê", vale o que ele marcou (liberado ou bloqueado);
--   3. senão: só quem tem "reservas" nas telas personalizadas de Equipe.
-- A Recepção NÃO vê por padrão: o gestor escolhe qual recepcionista vê (decisão do Rodrigo, 16/10/2026).
--
-- Idempotente. Sem FK para auth.users e sem INSERT de dados (o Lovable recusa).

-- ------------------------------------------------------------------ acessos
CREATE TABLE IF NOT EXISTS public.reservas_acessos (
  user_id uuid PRIMARY KEY,
  liberado boolean NOT NULL,
  definido_por uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reservas_acessos TO authenticated;
GRANT ALL ON public.reservas_acessos TO service_role;
ALTER TABLE public.reservas_acessos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam acessos de reservas" ON public.reservas_acessos;
CREATE POLICY "Gestores consultam acessos de reservas" ON public.reservas_acessos
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION private.pode_ver_reservas(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT _uid IS NOT NULL AND (
    private.has_role(_uid, 'gestor') OR private.has_role(_uid, 'admin')
    OR coalesce(
      (SELECT a.liberado FROM public.reservas_acessos a WHERE a.user_id = _uid),
      EXISTS (
        SELECT 1 FROM public.funcionarios f
        WHERE f.user_id = _uid AND f.telas_permitidas IS NOT NULL
          AND 'reservas' = ANY (f.telas_permitidas)
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION private.pode_ver_reservas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.pode_ver_reservas(uuid) TO authenticated, service_role;

-- O app pergunta ao banco se o usuário logado vê a tela (rota, menu e tela usam esta mesma fonte).
CREATE OR REPLACE FUNCTION public.minha_permissao_reservas()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT jsonb_build_object(
    've', private.pode_ver_reservas(auth.uid()),
    'gestor', coalesce(private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'), false)
  );
$$;
REVOKE ALL ON FUNCTION public.minha_permissao_reservas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_permissao_reservas() TO authenticated;

CREATE OR REPLACE FUNCTION public.reservas_acessos_listar()
RETURNS TABLE (user_id uuid, nome text, email text, papeis text[], gestor boolean, ve boolean, origem text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Somente gestor ou administrador escolhe quem vê as Reservas.';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    coalesce(nullif(btrim(f.nome), ''), u.email)::text,
    u.email::text,
    coalesce((SELECT array_agg(r.role::text ORDER BY r.role::text) FROM public.user_roles r WHERE r.user_id = u.id), '{}'::text[]),
    (private.has_role(u.id, 'gestor') OR private.has_role(u.id, 'admin')),
    private.pode_ver_reservas(u.id),
    CASE
      WHEN private.has_role(u.id, 'gestor') OR private.has_role(u.id, 'admin') THEN 'gestor'
      WHEN a.user_id IS NOT NULL THEN CASE WHEN a.liberado THEN 'liberado' ELSE 'bloqueado' END
      WHEN private.pode_ver_reservas(u.id) THEN 'equipe'
      ELSE 'sem_acesso'
    END
  FROM auth.users u
  LEFT JOIN LATERAL (
    SELECT fx.nome FROM public.funcionarios fx WHERE fx.user_id = u.id ORDER BY fx.nome LIMIT 1
  ) f ON true
  LEFT JOIN public.reservas_acessos a ON a.user_id = u.id
  WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
     OR EXISTS (SELECT 1 FROM public.funcionarios fx WHERE fx.user_id = u.id)
  -- Recepção primeiro (é quem o gestor costuma liberar), depois quem já vê, depois o resto.
  ORDER BY private.has_role(u.id, 'recepcao') DESC, 6 DESC, 2;
END;
$$;
REVOKE ALL ON FUNCTION public.reservas_acessos_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservas_acessos_listar() TO authenticated;

-- _liberado NULL = volta ao padrão (só vê quem tem "reservas" em Equipe › Telas).
CREATE OR REPLACE FUNCTION public.reservas_definir_acesso(_user_id uuid, _liberado boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Somente gestor ou administrador escolhe quem vê as Reservas.';
  END IF;
  IF _liberado IS NULL THEN
    DELETE FROM public.reservas_acessos WHERE user_id = _user_id;
  ELSE
    INSERT INTO public.reservas_acessos (user_id, liberado, definido_por, updated_at)
    VALUES (_user_id, _liberado, auth.uid(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET liberado = EXCLUDED.liberado, definido_por = EXCLUDED.definido_por, updated_at = now();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reservas_definir_acesso(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservas_definir_acesso(uuid, boolean) TO authenticated;

-- ------------------------------------------------------------------ lista de cobrança
-- Uma linha por reserva (unidade + nº). O servidor atualiza os dados do Cloudbeds e NUNCA
-- mexe em cobrado/observacao (colunas da recepção). ativa = está na lista agora.
CREATE TABLE IF NOT EXISTS public.reservas_cobranca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade text NOT NULL,
  reservation_id text NOT NULL,
  property_id text,
  hospede text NOT NULL DEFAULT '',
  data_reserva date,
  checkin date,
  checkout date,
  plano text,
  origem text,
  saldo numeric(12,2) NOT NULL DEFAULT 0,
  status_cloudbeds text,
  motivo text,
  ativa boolean NOT NULL DEFAULT true,
  entrou_em timestamptz NOT NULL DEFAULT now(),
  saiu_em timestamptz,
  motivo_saida text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  -- preenchido pela recepção
  cobrado text,
  observacao text,
  marcado_por uuid,
  marcado_nome text,
  marcado_em timestamptz,
  CONSTRAINT reservas_cobranca_unidade_ck CHECK (unidade IN ('Botafogo', 'Ipanema')),
  CONSTRAINT reservas_cobranca_motivo_ck CHECK (motivo IS NULL OR motivo IN ('nr_checkin_proximo', 'nr_8o_dia', 'standard')),
  CONSTRAINT reservas_cobranca_cobrado_ck CHECK (cobrado IS NULL OR cobrado IN ('sim', 'recusado', 'link_enviado', 'cancelada')),
  CONSTRAINT reservas_cobranca_unica UNIQUE (unidade, reservation_id)
);
CREATE INDEX IF NOT EXISTS reservas_cobranca_ativa_idx ON public.reservas_cobranca (unidade, ativa);
GRANT SELECT ON public.reservas_cobranca TO authenticated;
GRANT ALL ON public.reservas_cobranca TO service_role;
ALTER TABLE public.reservas_cobranca ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Quem vê Reservas consulta a lista" ON public.reservas_cobranca;
CREATE POLICY "Quem vê Reservas consulta a lista" ON public.reservas_cobranca
  FOR SELECT TO authenticated
  USING (private.pode_ver_reservas(auth.uid()));

-- Recepção preenche "Cobrado?" e "Observação" (única escrita permitida ao app).
CREATE OR REPLACE FUNCTION public.reservas_cobranca_marcar(_id uuid, _cobrado text, _observacao text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE v_nome text;
BEGIN
  IF NOT private.pode_ver_reservas(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não está liberado nas Reservas.';
  END IF;
  IF _cobrado IS NOT NULL AND _cobrado NOT IN ('sim', 'recusado', 'link_enviado', 'cancelada') THEN
    RAISE EXCEPTION 'Opção de "Cobrado?" inválida: %', _cobrado;
  END IF;
  SELECT coalesce(nullif(btrim(f.nome), ''), u.email) INTO v_nome
  FROM auth.users u
  LEFT JOIN LATERAL (
    SELECT fx.nome FROM public.funcionarios fx WHERE fx.user_id = u.id ORDER BY fx.nome LIMIT 1
  ) f ON true
  WHERE u.id = auth.uid();

  UPDATE public.reservas_cobranca
     SET cobrado = _cobrado,
         observacao = nullif(btrim(coalesce(_observacao, '')), ''),
         marcado_por = auth.uid(),
         marcado_nome = v_nome,
         marcado_em = now()
   WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva não encontrada na lista.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reservas_cobranca_marcar(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservas_cobranca_marcar(uuid, text, text) TO authenticated;

-- ------------------------------------------------------------------ histórico
-- Cada reserva é registrada UMA vez, no momento em que entra na lista.
CREATE TABLE IF NOT EXISTS public.reservas_cobranca_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  unidade text NOT NULL,
  reservation_id text NOT NULL,
  hospede text NOT NULL DEFAULT '',
  saldo numeric(12,2) NOT NULL DEFAULT 0,
  motivo text,
  notificado boolean NOT NULL DEFAULT false,
  CONSTRAINT reservas_cobranca_historico_unica UNIQUE (unidade, reservation_id)
);
GRANT SELECT ON public.reservas_cobranca_historico TO authenticated;
GRANT ALL ON public.reservas_cobranca_historico TO service_role;
ALTER TABLE public.reservas_cobranca_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestor consulta historico de cobranca" ON public.reservas_cobranca_historico;
CREATE POLICY "Gestor consulta historico de cobranca" ON public.reservas_cobranca_historico
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------ conferência (só gestor)
-- Todas as reservas consultadas na última atualização, com o plano lido e a classificação.
CREATE TABLE IF NOT EXISTS public.reservas_cobranca_conferencia (
  unidade text NOT NULL,
  reservation_id text NOT NULL,
  hospede text,
  status_cloudbeds text,
  data_reserva date,
  checkin date,
  origem text,
  planos text,
  nr boolean NOT NULL DEFAULT false,
  saldo numeric(12,2) NOT NULL DEFAULT 0,
  motivo text,
  exclusao text,
  entra_em date,
  consultado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade, reservation_id)
);
GRANT SELECT ON public.reservas_cobranca_conferencia TO authenticated;
GRANT ALL ON public.reservas_cobranca_conferencia TO service_role;
ALTER TABLE public.reservas_cobranca_conferencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestor consulta conferencia de cobranca" ON public.reservas_cobranca_conferencia;
CREATE POLICY "Gestor consulta conferencia de cobranca" ON public.reservas_cobranca_conferencia
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------------ situação da atualização
CREATE TABLE IF NOT EXISTS public.reservas_cobranca_sync (
  unidade text PRIMARY KEY,
  ultima_tentativa timestamptz,
  ultima_ok timestamptz,
  erro text,
  consultadas integer,
  CONSTRAINT reservas_cobranca_sync_unidade_ck CHECK (unidade IN ('Botafogo', 'Ipanema'))
);
GRANT SELECT ON public.reservas_cobranca_sync TO authenticated;
GRANT ALL ON public.reservas_cobranca_sync TO service_role;
ALTER TABLE public.reservas_cobranca_sync ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Quem vê Reservas consulta a atualizacao" ON public.reservas_cobranca_sync;
CREATE POLICY "Quem vê Reservas consulta a atualizacao" ON public.reservas_cobranca_sync
  FOR SELECT TO authenticated
  USING (private.pode_ver_reservas(auth.uid()));

-- ------------------------------------------------------------------ avisos no celular
-- Quem recebe o aviso "reservas novas para cobrar" (usado pelo servidor de push).
CREATE OR REPLACE FUNCTION public.reservas_destinatarios()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT DISTINCT u.id FROM auth.users u WHERE private.pode_ver_reservas(u.id);
$$;
REVOKE ALL ON FUNCTION public.reservas_destinatarios() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservas_destinatarios() TO service_role;

-- O servidor chama esta função para disparar o push pelo caminho de sempre (push-dispatcher).
CREATE OR REPLACE FUNCTION public.reservas_cobranca_notificar(_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  PERFORM private.enqueue_push_notification('reservas_cobranca', _payload);
END;
$$;
REVOKE ALL ON FUNCTION public.reservas_cobranca_notificar(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservas_cobranca_notificar(jsonb) TO service_role;

-- ------------------------------------------------------------------ chamada do agendamento
-- Mesmo endereço e segredo do push-dispatcher (app_settings), trocando o caminho.
CREATE OR REPLACE FUNCTION private.run_reservas_cobranca_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_url text; v_secret text;
BEGIN
  SELECT replace(value, '/api/public/push-dispatcher', '/api/public/reservas-cobranca')
    INTO v_url FROM public.app_settings WHERE key = 'push_dispatcher_url';
  SELECT value INTO v_secret FROM public.app_settings WHERE key = 'push_dispatcher_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'run_reservas_cobranca_sync: push_dispatcher_url/secret não configurados';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatcher-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'run_reservas_cobranca_sync failed: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION private.run_reservas_cobranca_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.run_reservas_cobranca_sync() TO service_role;

-- ------------------------------------------------------------------ tempo real
-- A tela atualiza sozinha quando outra recepcionista marca "Cobrado?" ou quando o servidor recalcula.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reservas_cobranca'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reservas_cobranca;
  END IF;
END $$;