-- 0038 — Ponto: banco de horas, horas extras e atestados médicos.
--
-- * ponto_banco_config: por pessoa, se as horas a mais vão para o BANCO ou são
--   PAGAS como extra, e a data em que o banco começa a contar.
-- * ponto_banco_ajustes: lançamentos do gestor no banco (saldo inicial, folga
--   compensada, pagamento do saldo, correção), sempre com motivo.
-- * ponto_atestados: o funcionário envia o atestado (foto ou PDF no bucket
--   privado "ponto", pasta <uid>/atestados/) e o gestor aprova ou recusa.
--   Ao aprovar, os dias de trabalho/falta da escala no período viram "atestado"
--   (origem manual, para a escala gerada não sobrescrever). Os dias alterados
--   ficam guardados para o gestor poder cancelar o atestado depois.
--
-- O cálculo das extras (50% / 100%) e dos débitos é feito no app
-- (src/lib/ponto-banco.ts) a partir da view ponto_dia.
-- Migração idempotente: pode ser aplicada de novo sem erro.

-- ---------------------------------------------------------------------------
-- Configuração do banco por pessoa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_banco_config (
  colaborador_id uuid PRIMARY KEY REFERENCES public.escala_colaboradores(id) ON DELETE CASCADE,
  modo text NOT NULL DEFAULT 'pagamento' CHECK (modo IN ('banco', 'pagamento')),
  inicio date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.ponto_banco_config TO authenticated;
GRANT ALL ON public.ponto_banco_config TO service_role;
ALTER TABLE public.ponto_banco_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam config do banco" ON public.ponto_banco_config;
CREATE POLICY "Gestores consultam config do banco" ON public.ponto_banco_config FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.ponto_banco_salvar_config(_colaborador_id uuid, _modo text, _inicio date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF _modo NOT IN ('banco', 'pagamento') THEN RAISE EXCEPTION 'Modo inválido'; END IF;
  IF _inicio IS NULL THEN RAISE EXCEPTION 'Informe a data de início do banco'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.escala_colaboradores WHERE id = _colaborador_id) THEN
    RAISE EXCEPTION 'Pessoa não encontrada';
  END IF;
  INSERT INTO public.ponto_banco_config (colaborador_id, modo, inicio, updated_by)
  VALUES (_colaborador_id, _modo, _inicio, auth.uid())
  ON CONFLICT (colaborador_id) DO UPDATE
    SET modo = EXCLUDED.modo, inicio = EXCLUDED.inicio, updated_at = now(), updated_by = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_banco_salvar_config(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_banco_salvar_config(uuid, text, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Ajustes manuais do banco
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_banco_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.escala_colaboradores(id) ON DELETE RESTRICT,
  data date NOT NULL,
  minutos integer NOT NULL CHECK (minutos <> 0 AND abs(minutos) <= 100000),
  tipo text NOT NULL CHECK (tipo IN ('saldo_inicial', 'folga_compensada', 'pagamento', 'correcao')),
  motivo text NOT NULL CHECK (length(trim(motivo)) > 0),
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ponto_banco_ajustes_colab_idx ON public.ponto_banco_ajustes (colaborador_id, data);
GRANT SELECT ON public.ponto_banco_ajustes TO authenticated;
GRANT ALL ON public.ponto_banco_ajustes TO service_role;
ALTER TABLE public.ponto_banco_ajustes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam ajustes do banco" ON public.ponto_banco_ajustes;
CREATE POLICY "Gestores consultam ajustes do banco" ON public.ponto_banco_ajustes FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

-- Folga compensada e pagamento sempre DIMINUEM o saldo; saldo inicial e
-- correção usam o sinal informado.
CREATE OR REPLACE FUNCTION public.ponto_banco_lancar_ajuste(
  _colaborador_id uuid, _data date, _minutos integer, _tipo text, _motivo text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_min integer := _minutos;
  v_id uuid;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF _tipo NOT IN ('saldo_inicial', 'folga_compensada', 'pagamento', 'correcao') THEN
    RAISE EXCEPTION 'Tipo de ajuste inválido';
  END IF;
  IF coalesce(_minutos, 0) = 0 THEN RAISE EXCEPTION 'Informe a quantidade de horas'; END IF;
  IF nullif(trim(coalesce(_motivo, '')), '') IS NULL THEN RAISE EXCEPTION 'Informe o motivo do ajuste'; END IF;
  IF _data IS NULL THEN RAISE EXCEPTION 'Informe a data do ajuste'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.escala_colaboradores WHERE id = _colaborador_id) THEN
    RAISE EXCEPTION 'Pessoa não encontrada';
  END IF;
  IF _tipo IN ('folga_compensada', 'pagamento') THEN v_min := -abs(_minutos); END IF;
  INSERT INTO public.ponto_banco_ajustes (colaborador_id, data, minutos, tipo, motivo, criado_por)
  VALUES (_colaborador_id, _data, v_min, _tipo, trim(_motivo), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_banco_lancar_ajuste(uuid, date, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_banco_lancar_ajuste(uuid, date, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ponto_banco_excluir_ajuste(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  DELETE FROM public.ponto_banco_ajustes WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ajuste não encontrado'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_banco_excluir_ajuste(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_banco_excluir_ajuste(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Atestados médicos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_atestados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.escala_colaboradores(id) ON DELETE RESTRICT,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  arquivo_path text NOT NULL,
  arquivo_nome text,
  observacao text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado', 'cancelado')),
  enviado_por uuid,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  revisado_por uuid,
  revisado_em timestamptz,
  resposta text,
  dias_alterados jsonb NOT NULL DEFAULT '[]'::jsonb,
  CHECK (data_fim >= data_inicio)
);
CREATE INDEX IF NOT EXISTS ponto_atestados_colab_idx ON public.ponto_atestados (colaborador_id, data_inicio);
CREATE INDEX IF NOT EXISTS ponto_atestados_pendentes_idx ON public.ponto_atestados (status) WHERE status = 'pendente';
GRANT SELECT ON public.ponto_atestados TO authenticated;
GRANT ALL ON public.ponto_atestados TO service_role;
ALTER TABLE public.ponto_atestados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam atestados" ON public.ponto_atestados;
CREATE POLICY "Gestores consultam atestados" ON public.ponto_atestados FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Funcionario consulta os proprios atestados" ON public.ponto_atestados;
CREATE POLICY "Funcionario consulta os proprios atestados" ON public.ponto_atestados FOR SELECT TO authenticated
  USING (colaborador_id = private.ponto_meu_colaborador());

-- Funcionário envia o próprio atestado (o arquivo já foi enviado ao storage)
CREATE OR REPLACE FUNCTION public.ponto_enviar_atestado(
  _data_inicio date, _data_fim date, _arquivo_path text, _arquivo_nome text, _observacao text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab public.escala_colaboradores%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login para enviar o atestado'; END IF;
  SELECT * INTO v_colab FROM public.escala_colaboradores WHERE id = private.ponto_colaborador_do_usuario(v_uid);
  IF v_colab.id IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está ligado à escala. Procure o gestor.';
  END IF;
  IF _data_inicio IS NULL OR _data_fim IS NULL THEN RAISE EXCEPTION 'Informe as datas do atestado'; END IF;
  IF _data_fim < _data_inicio THEN RAISE EXCEPTION 'A data final é antes da data inicial'; END IF;
  IF _data_fim - _data_inicio > 60 THEN RAISE EXCEPTION 'Atestado com mais de 60 dias: entregue ao gestor pessoalmente'; END IF;
  IF _data_inicio < (now() AT TIME ZONE 'America/Sao_Paulo')::date - 90 THEN
    RAISE EXCEPTION 'Atestado com mais de 90 dias: entregue ao gestor pessoalmente';
  END IF;
  IF _arquivo_path IS NULL OR split_part(_arquivo_path, '/', 1) <> v_uid::text
     OR split_part(_arquivo_path, '/', 2) <> 'atestados' THEN
    RAISE EXCEPTION 'Arquivo do atestado inválido';
  END IF;

  INSERT INTO public.ponto_atestados (colaborador_id, data_inicio, data_fim, arquivo_path, arquivo_nome, observacao, enviado_por)
  VALUES (v_colab.id, _data_inicio, _data_fim, _arquivo_path, nullif(trim(coalesce(_arquivo_nome, '')), ''),
          nullif(trim(coalesce(_observacao, '')), ''), v_uid)
  RETURNING id INTO v_id;

  PERFORM private.enqueue_push_notification('ponto_atestado', jsonb_build_object(
    'id', v_id, 'nome', v_colab.nome, 'data_inicio', _data_inicio, 'data_fim', _data_fim
  ));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_enviar_atestado(date, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_enviar_atestado(date, date, text, text, text) TO authenticated;

-- Gestor aprova (os dias da escala viram "atestado") ou recusa (motivo obrigatório)
CREATE OR REPLACE FUNCTION public.ponto_revisar_atestado(_id uuid, _aprovar boolean, _resposta text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_at public.ponto_atestados%ROWTYPE;
  v_dias jsonb := '[]'::jsonb;
  v_resposta text := nullif(trim(coalesce(_resposta, '')), '');
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  SELECT * INTO v_at FROM public.ponto_atestados WHERE id = _id FOR UPDATE;
  IF v_at.id IS NULL THEN RAISE EXCEPTION 'Atestado não encontrado'; END IF;
  IF v_at.status <> 'pendente' THEN RAISE EXCEPTION 'Este atestado já foi revisado'; END IF;
  IF NOT _aprovar AND v_resposta IS NULL THEN RAISE EXCEPTION 'Informe o motivo da recusa'; END IF;

  IF _aprovar THEN
    -- Guarda como cada dia estava antes, para poder desfazer
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'data', d.data, 'status', d.status, 'origem', d.origem, 'motivo', d.motivo
    ) ORDER BY d.data), '[]'::jsonb)
    INTO v_dias
    FROM public.escala_dias d
    WHERE d.colaborador_id = v_at.colaborador_id
      AND d.data BETWEEN v_at.data_inicio AND v_at.data_fim
      AND d.status IN ('trabalho', 'falta');

    UPDATE public.escala_dias d
    SET status = 'atestado', origem = 'manual', motivo = 'Atestado médico'
    WHERE d.colaborador_id = v_at.colaborador_id
      AND d.data BETWEEN v_at.data_inicio AND v_at.data_fim
      AND d.status IN ('trabalho', 'falta');
  END IF;

  UPDATE public.ponto_atestados
  SET status = CASE WHEN _aprovar THEN 'aprovado' ELSE 'recusado' END,
      revisado_por = auth.uid(), revisado_em = now(), resposta = v_resposta, dias_alterados = v_dias
  WHERE id = _id;

  IF v_at.enviado_por IS NOT NULL THEN
    PERFORM private.enqueue_push_notification('ponto_atestado_resposta', jsonb_build_object(
      'id', v_at.id, 'user_id', v_at.enviado_por, 'aprovado', _aprovar, 'resposta', v_resposta
    ));
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN _aprovar THEN 'aprovado' ELSE 'recusado' END,
                            'dias_alterados', jsonb_array_length(v_dias));
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_revisar_atestado(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_revisar_atestado(uuid, boolean, text) TO authenticated;

-- Gestor cancela um atestado aprovado: os dias voltam a ser como eram
-- (só os que continuam marcados como atestado).
CREATE OR REPLACE FUNCTION public.ponto_cancelar_atestado(_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_at public.ponto_atestados%ROWTYPE;
  v_motivo text := nullif(trim(coalesce(_motivo, '')), '');
  v_dia jsonb;
  v_restaurados integer := 0;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'Informe o motivo do cancelamento'; END IF;
  SELECT * INTO v_at FROM public.ponto_atestados WHERE id = _id FOR UPDATE;
  IF v_at.id IS NULL THEN RAISE EXCEPTION 'Atestado não encontrado'; END IF;
  IF v_at.status <> 'aprovado' THEN RAISE EXCEPTION 'Só é possível cancelar atestado aprovado'; END IF;

  FOR v_dia IN SELECT * FROM jsonb_array_elements(v_at.dias_alterados) LOOP
    UPDATE public.escala_dias
    SET status = v_dia->>'status', origem = v_dia->>'origem', motivo = v_dia->>'motivo'
    WHERE id = (v_dia->>'id')::uuid AND status = 'atestado';
    IF FOUND THEN v_restaurados := v_restaurados + 1; END IF;
  END LOOP;

  UPDATE public.ponto_atestados
  SET status = 'cancelado', revisado_por = auth.uid(), revisado_em = now(),
      resposta = 'Cancelado: ' || v_motivo
  WHERE id = _id;

  RETURN jsonb_build_object('dias_restaurados', v_restaurados);
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_cancelar_atestado(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_cancelar_atestado(uuid, text) TO authenticated;
