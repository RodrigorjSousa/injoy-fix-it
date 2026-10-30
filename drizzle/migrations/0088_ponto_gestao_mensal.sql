-- 0088 — Ponto: pedidos do funcionário, espelho com ciência, fechamento do mês e lembrete de saída
-- (30/10/2026).
--
-- * ponto_solicitacoes: o funcionário pede "esqueci de bater" (tipo, data e hora) ou
--   "justificativa" (atraso/falta/saída antes, podendo pedir abono). O gestor aprova ou recusa
--   (motivo obrigatório para recusar). Aprovar "esqueci" cria a batida (origem manual, aprovada).
--   Aprovar justificativa com abono faz o dia não descontar do banco de horas.
-- * ponto_espelho_ciencia: o funcionário confirma que viu o espelho de um mês encerrado
--   (com comentário opcional, ex.: "discordo do dia 12"). Guarda os totais que ele viu.
-- * ponto_meu_espelho: dados do próprio funcionário para o espelho (dias, banco, abonos, ciência).
-- * ponto_fechamentos: o gestor fecha um mês encerrado. Mês fechado não aceita lançamento
--   manual, revisão, ajuste do banco, aprovação de pedido ou atestado (travas por gatilho).
--   As batidas em tempo real (app/recepção) nunca são bloqueadas. Reabrir exige motivo e fica
--   registrado em ponto_fechamentos_log.
-- * private.ponto_lembrar_saidas: avisa por push quem está com a jornada aberta 30 min depois
--   do fim da escala (ou 10 h depois da entrada, sem escala). Um aviso por jornada. O
--   agendamento (cron) fica na 0089.
-- Idempotente.

-- ---------------------------------------------------------------------------
-- Mês fechado
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_fechamentos (
  competencia date PRIMARY KEY CHECK (competencia = date_trunc('month', competencia)::date),
  fechado_em timestamptz NOT NULL DEFAULT now(),
  fechado_por uuid,
  resumo jsonb NOT NULL DEFAULT '[]'::jsonb
);
GRANT SELECT ON public.ponto_fechamentos TO authenticated;
GRANT ALL ON public.ponto_fechamentos TO service_role;
ALTER TABLE public.ponto_fechamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam fechamentos" ON public.ponto_fechamentos;
CREATE POLICY "Gestores consultam fechamentos" ON public.ponto_fechamentos FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.ponto_fechamentos_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia date NOT NULL,
  acao text NOT NULL CHECK (acao IN ('fechou', 'reabriu')),
  motivo text,
  feito_por uuid,
  feito_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ponto_fechamentos_log TO authenticated;
GRANT ALL ON public.ponto_fechamentos_log TO service_role;
ALTER TABLE public.ponto_fechamentos_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam log de fechamentos" ON public.ponto_fechamentos_log;
CREATE POLICY "Gestores consultam log de fechamentos" ON public.ponto_fechamentos_log FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION private.ponto_mes_fechado(_data date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _data IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ponto_fechamentos WHERE competencia = date_trunc('month', _data)::date
  )
$$;
REVOKE ALL ON FUNCTION private.ponto_mes_fechado(date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.ponto_erro_mes_fechado(_data date)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'O mês % está fechado. Para alterar, reabra em Ponto Facial › Fechamento.',
    to_char(_data, 'MM/YYYY');
END;
$$;
REVOKE ALL ON FUNCTION private.ponto_erro_mes_fechado(date) FROM PUBLIC, anon, authenticated;

-- Batidas: em mês fechado só entram as batidas em tempo real (app/recepção)
CREATE OR REPLACE FUNCTION private.tg_ponto_batidas_mes_fechado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND private.ponto_mes_fechado(OLD.data_ref) THEN
    PERFORM private.ponto_erro_mes_fechado(OLD.data_ref);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.origem = 'manual' AND private.ponto_mes_fechado(NEW.data_ref) THEN
    PERFORM private.ponto_erro_mes_fechado(NEW.data_ref);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS tr_ponto_batidas_mes_fechado ON public.ponto_batidas;
CREATE TRIGGER tr_ponto_batidas_mes_fechado BEFORE INSERT OR UPDATE OR DELETE ON public.ponto_batidas
  FOR EACH ROW EXECUTE FUNCTION private.tg_ponto_batidas_mes_fechado();

-- Ajustes do banco
CREATE OR REPLACE FUNCTION private.tg_ponto_ajustes_mes_fechado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF private.ponto_mes_fechado(CASE WHEN TG_OP = 'DELETE' THEN OLD.data ELSE NEW.data END) THEN
    PERFORM private.ponto_erro_mes_fechado(CASE WHEN TG_OP = 'DELETE' THEN OLD.data ELSE NEW.data END);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS tr_ponto_ajustes_mes_fechado ON public.ponto_banco_ajustes;
CREATE TRIGGER tr_ponto_ajustes_mes_fechado BEFORE INSERT OR UPDATE OR DELETE ON public.ponto_banco_ajustes
  FOR EACH ROW EXECUTE FUNCTION private.tg_ponto_ajustes_mes_fechado();

-- Atestados: aprovar/recusar/cancelar não pode mexer em mês fechado
CREATE OR REPLACE FUNCTION private.tg_ponto_atestados_mes_fechado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mes date;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT f.competencia INTO v_mes FROM public.ponto_fechamentos f
    WHERE f.competencia BETWEEN date_trunc('month', NEW.data_inicio)::date AND date_trunc('month', NEW.data_fim)::date
    ORDER BY f.competencia LIMIT 1;
    IF v_mes IS NOT NULL THEN PERFORM private.ponto_erro_mes_fechado(v_mes); END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_ponto_atestados_mes_fechado ON public.ponto_atestados;
CREATE TRIGGER tr_ponto_atestados_mes_fechado BEFORE UPDATE ON public.ponto_atestados
  FOR EACH ROW EXECUTE FUNCTION private.tg_ponto_atestados_mes_fechado();

-- Fechar / reabrir
CREATE OR REPLACE FUNCTION public.ponto_fechar_mes(_competencia date, _resumo jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mes date := date_trunc('month', _competencia)::date;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF _competencia IS NULL THEN RAISE EXCEPTION 'Informe o mês'; END IF;
  IF v_mes >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date THEN
    RAISE EXCEPTION 'Só é possível fechar um mês que já terminou';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ponto_fechamentos WHERE competencia = v_mes) THEN
    RAISE EXCEPTION 'O mês % já está fechado', to_char(v_mes, 'MM/YYYY');
  END IF;
  INSERT INTO public.ponto_fechamentos (competencia, fechado_por, resumo)
  VALUES (v_mes, auth.uid(), coalesce(_resumo, '[]'::jsonb));
  INSERT INTO public.ponto_fechamentos_log (competencia, acao, feito_por) VALUES (v_mes, 'fechou', auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_fechar_mes(date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_fechar_mes(date, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.ponto_reabrir_mes(_competencia date, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mes date := date_trunc('month', _competencia)::date;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF nullif(trim(coalesce(_motivo, '')), '') IS NULL THEN RAISE EXCEPTION 'Informe o motivo para reabrir'; END IF;
  DELETE FROM public.ponto_fechamentos WHERE competencia = v_mes;
  IF NOT FOUND THEN RAISE EXCEPTION 'O mês % não está fechado', to_char(v_mes, 'MM/YYYY'); END IF;
  INSERT INTO public.ponto_fechamentos_log (competencia, acao, motivo, feito_por)
  VALUES (v_mes, 'reabriu', trim(_motivo), auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_reabrir_mes(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_reabrir_mes(date, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Pedidos do funcionário
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.escala_colaboradores(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('esqueci_batida', 'justificativa')),
  data date NOT NULL,
  tipo_batida text CHECK (tipo_batida IS NULL OR tipo_batida IN ('entrada', 'saida_almoco', 'volta_almoco', 'saida')),
  horario timestamptz,
  unidade text CHECK (unidade IS NULL OR unidade IN ('Botafogo', 'Ipanema')),
  pede_abono boolean NOT NULL DEFAULT false,
  motivo text NOT NULL CHECK (length(trim(motivo)) > 0),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'recusada')),
  abonado boolean NOT NULL DEFAULT false,
  batida_id uuid REFERENCES public.ponto_batidas(id) ON DELETE SET NULL,
  enviado_por uuid,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  revisado_por uuid,
  revisado_em timestamptz,
  resposta text,
  CHECK (tipo <> 'esqueci_batida' OR (tipo_batida IS NOT NULL AND horario IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ponto_solicitacoes_colab_idx ON public.ponto_solicitacoes (colaborador_id, data);
CREATE INDEX IF NOT EXISTS ponto_solicitacoes_pendentes_idx ON public.ponto_solicitacoes (status) WHERE status = 'pendente';
GRANT SELECT ON public.ponto_solicitacoes TO authenticated;
GRANT ALL ON public.ponto_solicitacoes TO service_role;
ALTER TABLE public.ponto_solicitacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam solicitacoes" ON public.ponto_solicitacoes;
CREATE POLICY "Gestores consultam solicitacoes" ON public.ponto_solicitacoes FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Funcionario consulta as proprias solicitacoes" ON public.ponto_solicitacoes;
CREATE POLICY "Funcionario consulta as proprias solicitacoes" ON public.ponto_solicitacoes FOR SELECT TO authenticated
  USING (colaborador_id = private.ponto_meu_colaborador());

CREATE OR REPLACE FUNCTION public.ponto_solicitar(
  _tipo text, _data date, _tipo_batida text, _hora time, _motivo text, _pede_abono boolean DEFAULT false
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab public.escala_colaboradores%ROWTYPE;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_horario timestamptz;
  v_unidade text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login para enviar o pedido'; END IF;
  SELECT * INTO v_colab FROM public.escala_colaboradores WHERE id = private.ponto_colaborador_do_usuario(v_uid);
  IF v_colab.id IS NULL THEN RAISE EXCEPTION 'Seu usuário ainda não está ligado à escala. Procure o gestor.'; END IF;
  IF _tipo NOT IN ('esqueci_batida', 'justificativa') THEN RAISE EXCEPTION 'Tipo de pedido inválido'; END IF;
  IF _data IS NULL THEN RAISE EXCEPTION 'Informe o dia'; END IF;
  IF _data > v_hoje THEN RAISE EXCEPTION 'O dia não pode ser no futuro'; END IF;
  IF _data < v_hoje - 31 THEN RAISE EXCEPTION 'Pedido com mais de 31 dias: fale com o gestor'; END IF;
  IF private.ponto_mes_fechado(_data) THEN PERFORM private.ponto_erro_mes_fechado(_data); END IF;
  IF nullif(trim(coalesce(_motivo, '')), '') IS NULL THEN RAISE EXCEPTION 'Explique o motivo do pedido'; END IF;

  SELECT d.unidade INTO v_unidade FROM public.escala_dias d
  WHERE d.colaborador_id = v_colab.id AND d.data = _data AND d.unidade IN ('Botafogo', 'Ipanema')
  ORDER BY (d.status IN ('trabalho', 'extra')) DESC, d.hora_entrada NULLS LAST LIMIT 1;
  IF v_unidade IS NULL AND v_colab.unidade IN ('Botafogo', 'Ipanema') THEN v_unidade := v_colab.unidade; END IF;

  IF _tipo = 'esqueci_batida' THEN
    IF _tipo_batida NOT IN ('entrada', 'saida_almoco', 'volta_almoco', 'saida') THEN
      RAISE EXCEPTION 'Escolha qual batida esqueceu';
    END IF;
    IF _hora IS NULL THEN RAISE EXCEPTION 'Informe o horário'; END IF;
    v_horario := (_data + _hora) AT TIME ZONE 'America/Sao_Paulo';
    IF v_horario > now() THEN RAISE EXCEPTION 'O horário não pode ser no futuro'; END IF;
  END IF;

  INSERT INTO public.ponto_solicitacoes (colaborador_id, tipo, data, tipo_batida, horario, unidade, pede_abono, motivo, enviado_por)
  VALUES (v_colab.id, _tipo, _data,
          CASE WHEN _tipo = 'esqueci_batida' THEN _tipo_batida END, v_horario, v_unidade,
          _tipo = 'justificativa' AND coalesce(_pede_abono, false), trim(_motivo), v_uid)
  RETURNING id INTO v_id;

  PERFORM private.enqueue_push_notification('ponto_solicitacao', jsonb_build_object(
    'id', v_id, 'nome', v_colab.nome, 'tipo', _tipo, 'data', _data, 'tipo_batida', _tipo_batida
  ));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_solicitar(text, date, text, time, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_solicitar(text, date, text, time, text, boolean) TO authenticated;

-- Gestor aprova ou recusa. _abonar vale para justificativa (padrão: o que o funcionário pediu).
-- _unidade e _horario permitem corrigir o "esqueci de bater" antes de aprovar.
CREATE OR REPLACE FUNCTION public.ponto_revisar_solicitacao(
  _id uuid, _aprovar boolean, _resposta text DEFAULT NULL, _abonar boolean DEFAULT NULL,
  _unidade text DEFAULT NULL, _horario timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_s public.ponto_solicitacoes%ROWTYPE;
  v_resposta text := nullif(trim(coalesce(_resposta, '')), '');
  v_unidade text;
  v_horario timestamptz;
  v_data_ref date;
  v_entrada public.ponto_batidas%ROWTYPE;
  v_batida uuid;
  v_abonar boolean := false;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  SELECT * INTO v_s FROM public.ponto_solicitacoes WHERE id = _id FOR UPDATE;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF v_s.status <> 'pendente' THEN RAISE EXCEPTION 'Este pedido já foi revisado'; END IF;
  IF NOT _aprovar AND v_resposta IS NULL THEN RAISE EXCEPTION 'Informe o motivo da recusa'; END IF;
  IF private.ponto_mes_fechado(v_s.data) THEN PERFORM private.ponto_erro_mes_fechado(v_s.data); END IF;

  IF _aprovar AND v_s.tipo = 'esqueci_batida' THEN
    v_unidade := coalesce(nullif(_unidade, ''), v_s.unidade, 'Botafogo');
    IF v_unidade NOT IN ('Botafogo', 'Ipanema') THEN RAISE EXCEPTION 'Unidade inválida'; END IF;
    v_horario := coalesce(_horario, v_s.horario);
    IF v_horario > now() THEN RAISE EXCEPTION 'O horário não pode ser no futuro'; END IF;
    v_data_ref := (v_horario AT TIME ZONE 'America/Sao_Paulo')::date;
    IF v_s.tipo_batida <> 'entrada' THEN
      SELECT * INTO v_entrada FROM public.ponto_batidas
      WHERE colaborador_id = v_s.colaborador_id AND tipo = 'entrada' AND status <> 'recusada'
        AND registrado_em < v_horario AND registrado_em > v_horario - interval '18 hours'
      ORDER BY registrado_em DESC LIMIT 1;
      IF v_entrada.id IS NOT NULL THEN v_data_ref := v_entrada.data_ref; END IF;
    END IF;
    INSERT INTO public.ponto_batidas (colaborador_id, unidade, tipo, registrado_em, data_ref, origem, status, motivos,
      registrado_por, revisado_por, revisado_em, observacao)
    VALUES (v_s.colaborador_id, v_unidade, v_s.tipo_batida, v_horario, v_data_ref, 'manual', 'aprovada',
      ARRAY['solicitacao_funcionario'], v_s.enviado_por, auth.uid(), now(),
      'Pedido do funcionário: ' || v_s.motivo || coalesce(' · Gestor: ' || v_resposta, ''))
    RETURNING id INTO v_batida;
  END IF;

  IF _aprovar AND v_s.tipo = 'justificativa' THEN
    v_abonar := coalesce(_abonar, v_s.pede_abono);
  END IF;

  UPDATE public.ponto_solicitacoes
  SET status = CASE WHEN _aprovar THEN 'aprovada' ELSE 'recusada' END,
      abonado = v_abonar, batida_id = v_batida,
      unidade = coalesce(v_unidade, unidade), horario = coalesce(v_horario, horario),
      revisado_por = auth.uid(), revisado_em = now(), resposta = v_resposta
  WHERE id = _id;

  IF v_s.enviado_por IS NOT NULL THEN
    PERFORM private.enqueue_push_notification('ponto_solicitacao_resposta', jsonb_build_object(
      'id', v_s.id, 'user_id', v_s.enviado_por, 'aprovado', _aprovar, 'tipo', v_s.tipo,
      'data', v_s.data, 'resposta', v_resposta
    ));
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN _aprovar THEN 'aprovada' ELSE 'recusada' END,
                            'batida_id', v_batida, 'abonado', v_abonar);
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_revisar_solicitacao(uuid, boolean, text, boolean, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_revisar_solicitacao(uuid, boolean, text, boolean, text, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- Ciência do espelho
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_espelho_ciencia (
  colaborador_id uuid NOT NULL REFERENCES public.escala_colaboradores(id) ON DELETE CASCADE,
  competencia date NOT NULL CHECK (competencia = date_trunc('month', competencia)::date),
  ciente_em timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  comentario text,
  totais jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (colaborador_id, competencia)
);
GRANT SELECT ON public.ponto_espelho_ciencia TO authenticated;
GRANT ALL ON public.ponto_espelho_ciencia TO service_role;
ALTER TABLE public.ponto_espelho_ciencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Gestores consultam ciencias" ON public.ponto_espelho_ciencia;
CREATE POLICY "Gestores consultam ciencias" ON public.ponto_espelho_ciencia FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Funcionario consulta a propria ciencia" ON public.ponto_espelho_ciencia;
CREATE POLICY "Funcionario consulta a propria ciencia" ON public.ponto_espelho_ciencia FOR SELECT TO authenticated
  USING (colaborador_id = private.ponto_meu_colaborador());

CREATE OR REPLACE FUNCTION public.ponto_dar_ciencia(_competencia date, _totais jsonb, _comentario text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_mes date := date_trunc('month', _competencia)::date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login'; END IF;
  v_colab := private.ponto_colaborador_do_usuario(v_uid);
  IF v_colab IS NULL THEN RAISE EXCEPTION 'Seu usuário ainda não está ligado à escala. Procure o gestor.'; END IF;
  IF _competencia IS NULL THEN RAISE EXCEPTION 'Informe o mês'; END IF;
  IF v_mes >= date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date THEN
    RAISE EXCEPTION 'A ciência só pode ser dada depois que o mês termina';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ponto_espelho_ciencia WHERE colaborador_id = v_colab AND competencia = v_mes) THEN
    RAISE EXCEPTION 'Você já deu ciência deste mês';
  END IF;
  INSERT INTO public.ponto_espelho_ciencia (colaborador_id, competencia, user_id, comentario, totais)
  VALUES (v_colab, v_mes, v_uid, nullif(trim(coalesce(_comentario, '')), ''), coalesce(_totais, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_dar_ciencia(date, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_dar_ciencia(date, jsonb, text) TO authenticated;

-- Dados do próprio espelho (o funcionário não lê ponto_dia/banco direto)
CREATE OR REPLACE FUNCTION public.ponto_meu_espelho(_inicio date, _fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_colab public.escala_colaboradores%ROWTYPE;
  v_cfg public.ponto_banco_config%ROWTYPE;
  v_desde date;
BEGIN
  SELECT * INTO v_colab FROM public.escala_colaboradores WHERE id = private.ponto_colaborador_do_usuario(auth.uid());
  IF v_colab.id IS NULL THEN RETURN jsonb_build_object('vinculado', false); END IF;
  IF _inicio IS NULL OR _fim IS NULL OR _fim < _inicio OR _fim - _inicio > 62 THEN
    RAISE EXCEPTION 'Período inválido';
  END IF;
  SELECT * INTO v_cfg FROM public.ponto_banco_config WHERE colaborador_id = v_colab.id;
  v_desde := least(_inicio, coalesce(v_cfg.inicio, DATE '2026-10-01'));

  RETURN jsonb_build_object(
    'vinculado', true,
    'colaborador', jsonb_build_object('id', v_colab.id, 'nome', v_colab.nome, 'setor', v_colab.setor, 'vinculo', v_colab.vinculo),
    'config', CASE WHEN v_cfg.colaborador_id IS NULL THEN NULL
                   ELSE jsonb_build_object('colaborador_id', v_cfg.colaborador_id, 'modo', v_cfg.modo, 'inicio', v_cfg.inicio) END,
    'linhas', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.data) FROM public.ponto_dia d
                        WHERE d.colaborador_id = v_colab.id AND d.data BETWEEN v_desde AND _fim), '[]'::jsonb),
    'ajustes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'colaborador_id', a.colaborador_id, 'data', a.data,
                           'minutos', a.minutos, 'tipo', a.tipo, 'motivo', a.motivo) ORDER BY a.data)
                         FROM public.ponto_banco_ajustes a
                         WHERE a.colaborador_id = v_colab.id AND a.data <= _fim), '[]'::jsonb),
    'abonos', coalesce((SELECT jsonb_agg(jsonb_build_object('colaborador_id', s.colaborador_id, 'data', s.data))
                        FROM public.ponto_solicitacoes s
                        WHERE s.colaborador_id = v_colab.id AND s.status = 'aprovada' AND s.abonado
                          AND s.data <= _fim), '[]'::jsonb),
    'ciencia', (SELECT jsonb_build_object('ciente_em', c.ciente_em, 'comentario', c.comentario)
                FROM public.ponto_espelho_ciencia c
                WHERE c.colaborador_id = v_colab.id AND c.competencia = date_trunc('month', _inicio)::date),
    'fechado', private.ponto_mes_fechado(_inicio)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ponto_meu_espelho(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ponto_meu_espelho(date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- Lembrete de saída
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_lembretes (
  entrada_id uuid PRIMARY KEY REFERENCES public.ponto_batidas(id) ON DELETE CASCADE,
  enviado_em timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ponto_lembretes TO service_role;
ALTER TABLE public.ponto_lembretes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.ponto_lembrar_saidas()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_qtd integer := 0;
BEGIN
  FOR r IN
    WITH abertas AS (
      SELECT e.id AS entrada_id, e.colaborador_id, e.data_ref, e.registrado_em AS entrada_em
      FROM public.ponto_batidas e
      WHERE e.tipo = 'entrada' AND e.status <> 'recusada'
        AND e.registrado_em > now() - interval '18 hours'
        AND NOT EXISTS (
          SELECT 1 FROM public.ponto_batidas s
          WHERE s.colaborador_id = e.colaborador_id AND s.tipo = 'saida' AND s.status <> 'recusada'
            AND s.registrado_em > e.registrado_em)
        AND NOT EXISTS (
          SELECT 1 FROM public.ponto_batidas n
          WHERE n.colaborador_id = e.colaborador_id AND n.tipo = 'entrada' AND n.status <> 'recusada'
            AND n.registrado_em > e.registrado_em)
        AND NOT EXISTS (SELECT 1 FROM public.ponto_lembretes l WHERE l.entrada_id = e.id)
    )
    SELECT a.*, c.nome, f.user_id,
      (SELECT ((d.data + CASE WHEN d.hora_saida <= d.hora_entrada THEN 1 ELSE 0 END) + d.hora_saida)
                AT TIME ZONE 'America/Sao_Paulo'
       FROM public.escala_dias d
       WHERE d.colaborador_id = a.colaborador_id AND d.data = a.data_ref AND d.status IN ('trabalho', 'extra')
         AND d.hora_entrada IS NOT NULL AND d.hora_saida IS NOT NULL
       ORDER BY d.hora_saida DESC LIMIT 1) AS saida_prevista
    FROM abertas a
    JOIN public.escala_colaboradores c ON c.id = a.colaborador_id
    LEFT JOIN public.funcionarios f ON f.id = c.funcionario_id
  LOOP
    CONTINUE WHEN r.user_id IS NULL;
    CONTINUE WHEN now() < coalesce(r.saida_prevista + interval '30 minutes', r.entrada_em + interval '10 hours');
    INSERT INTO public.ponto_lembretes (entrada_id) VALUES (r.entrada_id) ON CONFLICT DO NOTHING;
    PERFORM private.enqueue_push_notification('ponto_lembrete_saida', jsonb_build_object(
      'id', r.entrada_id, 'user_id', r.user_id, 'nome', r.nome,
      'saida_prevista', r.saida_prevista, 'entrada_em', r.entrada_em
    ));
    v_qtd := v_qtd + 1;
  END LOOP;
  RETURN v_qtd;
END;
$$;
REVOKE ALL ON FUNCTION private.ponto_lembrar_saidas() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
