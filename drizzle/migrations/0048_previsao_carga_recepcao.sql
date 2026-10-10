-- Previsão de carga visível para a Recepção (ou quem o gestor liberar) e pedido de reforço
-- que o gestor autoriza. Idempotente.
--
-- Quem vê a tela "Previsão de Carga":
--   * gestor/admin;
--   * quem tem 'previsao-carga' marcado em Equipe › Telas disponíveis (funcionarios.telas_permitidas);
--   * Recepção, enquanto o cadastro dela não tiver lista de telas personalizada.

CREATE OR REPLACE FUNCTION private.pode_ver_previsao_carga(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT _uid IS NOT NULL AND (
    private.has_role(_uid, 'gestor') OR private.has_role(_uid, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.funcionarios f
      WHERE f.user_id = _uid AND f.telas_permitidas IS NOT NULL
        AND 'previsao-carga' = ANY (f.telas_permitidas)
    )
    OR (
      private.has_role(_uid, 'recepcao')
      AND NOT EXISTS (
        SELECT 1 FROM public.funcionarios f
        WHERE f.user_id = _uid AND f.telas_permitidas IS NOT NULL
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION private.pode_ver_previsao_carga(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.pode_ver_previsao_carga(uuid) TO authenticated, service_role;

-- Para a tela e o menu perguntarem ao banco (uma única regra).
CREATE OR REPLACE FUNCTION public.minha_permissao_previsao_carga()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT private.pode_ver_previsao_carga(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.minha_permissao_previsao_carga() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_permissao_previsao_carga() TO authenticated;

DROP POLICY IF EXISTS "Liberados consultam previsoes de carga" ON public.previsao_carga;
CREATE POLICY "Liberados consultam previsoes de carga" ON public.previsao_carga
  FOR SELECT TO authenticated USING (private.pode_ver_previsao_carga(auth.uid()));

-- ------------------------------------------------------------ pedidos de reforço
CREATE TABLE IF NOT EXISTS public.previsao_reforco_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade text NOT NULL CHECK (unidade IN ('Botafogo','Ipanema')),
  data date NOT NULL,
  nivel text CHECK (nivel IS NULL OR nivel IN ('verde','amarelo','vermelho')),
  ocupacao_pct numeric,
  gerais integer,
  mensagem text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','autorizado','negado')),
  solicitado_por uuid NOT NULL,
  solicitado_nome text,
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  decidido_por uuid,
  decidido_nome text,
  decidido_em timestamptz,
  resposta text
);
CREATE INDEX IF NOT EXISTS previsao_reforco_pedidos_data_idx ON public.previsao_reforco_pedidos (data, unidade);
GRANT SELECT ON public.previsao_reforco_pedidos TO authenticated;
GRANT ALL ON public.previsao_reforco_pedidos TO service_role;
ALTER TABLE public.previsao_reforco_pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Liberados consultam pedidos de reforco" ON public.previsao_reforco_pedidos;
CREATE POLICY "Liberados consultam pedidos de reforco" ON public.previsao_reforco_pedidos
  FOR SELECT TO authenticated USING (private.pode_ver_previsao_carga(auth.uid()));

-- Recepção pede reforço para um dia. Só um pedido aberto por unidade/dia.
CREATE OR REPLACE FUNCTION public.previsao_pedir_reforco(_unidade text, _data date, _mensagem text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_prev public.previsao_carga%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT private.pode_ver_previsao_carga(v_uid) THEN
    RAISE EXCEPTION 'Seu login não está liberado na Previsão de Carga.';
  END IF;
  IF _unidade NOT IN ('Botafogo','Ipanema') THEN RAISE EXCEPTION 'Unidade inválida'; END IF;
  IF _data IS NULL OR _data < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Escolha hoje ou um dia futuro.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.previsao_reforco_pedidos
             WHERE unidade = _unidade AND data = _data AND status IN ('pendente','autorizado')) THEN
    RAISE EXCEPTION 'Já existe um pedido de reforço aberto ou autorizado para este dia.';
  END IF;

  SELECT coalesce(f.nome, u.email) INTO v_nome
  FROM auth.users u LEFT JOIN public.funcionarios f ON f.user_id = u.id
  WHERE u.id = v_uid ORDER BY f.nome LIMIT 1;

  SELECT * INTO v_prev FROM public.previsao_carga
  WHERE unidade = _unidade AND data = _data ORDER BY calculado_em DESC LIMIT 1;

  INSERT INTO public.previsao_reforco_pedidos (unidade, data, nivel, ocupacao_pct, gerais, mensagem, solicitado_por, solicitado_nome)
  VALUES (_unidade, _data, v_prev.nivel, v_prev.ocupacao_carga_pct,
          coalesce(v_prev.qtd_geral, 0) + coalesce(v_prev.qtd_geral_checkin, 0),
          nullif(trim(coalesce(_mensagem, '')), ''), v_uid, v_nome)
  RETURNING id INTO v_id;

  PERFORM private.enqueue_push_notification('previsao_reforco', jsonb_build_object(
    'id', v_id, 'unidade', _unidade, 'data', _data, 'nome', v_nome,
    'nivel', v_prev.nivel, 'ocupacao_pct', round(coalesce(v_prev.ocupacao_carga_pct, 0)),
    'mensagem', nullif(trim(coalesce(_mensagem, '')), '')
  ));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.previsao_pedir_reforco(text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsao_pedir_reforco(text, date, text) TO authenticated;

-- Gestor autoriza ou nega; quem pediu recebe a resposta.
CREATE OR REPLACE FUNCTION public.previsao_decidir_reforco(_id uuid, _autorizar boolean, _resposta text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_p public.previsao_reforco_pedidos%ROWTYPE;
BEGIN
  IF NOT (private.has_role(v_uid, 'gestor') OR private.has_role(v_uid, 'admin')) THEN
    RAISE EXCEPTION 'Só o gestor autoriza reforço.';
  END IF;
  SELECT * INTO v_p FROM public.previsao_reforco_pedidos WHERE id = _id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

  SELECT coalesce(f.nome, u.email) INTO v_nome
  FROM auth.users u LEFT JOIN public.funcionarios f ON f.user_id = u.id
  WHERE u.id = v_uid ORDER BY f.nome LIMIT 1;

  UPDATE public.previsao_reforco_pedidos
  SET status = CASE WHEN _autorizar THEN 'autorizado' ELSE 'negado' END,
      decidido_por = v_uid, decidido_nome = v_nome, decidido_em = now(),
      resposta = nullif(trim(coalesce(_resposta, '')), '')
  WHERE id = _id;

  PERFORM private.enqueue_push_notification('previsao_reforco_resposta', jsonb_build_object(
    'id', _id, 'user_id', v_p.solicitado_por, 'unidade', v_p.unidade, 'data', v_p.data,
    'autorizado', _autorizar, 'resposta', nullif(trim(coalesce(_resposta, '')), '')
  ));
END;
$$;
REVOKE ALL ON FUNCTION public.previsao_decidir_reforco(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsao_decidir_reforco(uuid, boolean, text) TO authenticated;

-- Quem pediu pode cancelar enquanto está pendente.
CREATE OR REPLACE FUNCTION public.previsao_cancelar_reforco(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  DELETE FROM public.previsao_reforco_pedidos
  WHERE id = _id AND status = 'pendente'
    AND (solicitado_por = auth.uid() OR private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
  IF NOT FOUND THEN RAISE EXCEPTION 'Só dá para cancelar um pedido pendente feito por você.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.previsao_cancelar_reforco(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsao_cancelar_reforco(uuid) TO authenticated;
