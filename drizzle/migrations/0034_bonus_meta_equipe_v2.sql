-- Versão 2 da 0033 (que não foi aplicada): sem inserção de dados e sem chave estrangeira para a
-- tabela de logins, conforme as regras da ferramenta de migração do Lovable. Os dados iniciais (regras e participantes) são
-- criados pela função public.bonus_meta_preparar(), chamada pelo app na primeira vez.
--
-- Meta da equipe: quando as 3 médias do mês (Geral, Funcionário, Limpeza) ficam em 9 ou mais,
-- cada participante ganha um valor extra (padrão R$ 100). Para receber esta e a bonificação
-- por avaliações, a pessoa não pode passar de 3 atrasos no mês nem ter falta sem justificativa.
--
-- Atraso = entrada mais de N minutos (padrão 10) depois do horário do turno na Escala do app.
-- Entrada vem do Pontomais (quem está ligado lá) ou do ponto facial do app.
-- Falta  = dia de trabalho na escala sem nenhuma entrada (ou marcado "falta" na escala).
-- O gestor pode marcar atraso/falta como justificado, ou lançar ocorrência à mão.
-- Pode ser aplicada mais de uma vez sem problema.

-- ------------------------------------------------------------------ tabelas
CREATE TABLE IF NOT EXISTS public.bonus_meta_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ativo boolean NOT NULL DEFAULT true,
  valor_por_pessoa numeric(10,2) NOT NULL DEFAULT 100 CHECK (valor_por_pessoa >= 0),
  nota_minima numeric(4,2) NOT NULL DEFAULT 9 CHECK (nota_minima BETWEEN 0 AND 10),
  tolerancia_minutos int NOT NULL DEFAULT 10 CHECK (tolerancia_minutos BETWEEN 0 AND 120),
  max_atrasos int NOT NULL DEFAULT 3 CHECK (max_atrasos BETWEEN 0 AND 31),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bonus_meta_participantes (
  funcionario_id uuid PRIMARY KEY REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  colaborador_id uuid REFERENCES public.escala_colaboradores(id) ON DELETE SET NULL,
  unidade text NOT NULL DEFAULT 'Botafogo' CHECK (unidade IN ('Botafogo', 'Ipanema', 'Ambas')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bonus_meta_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  data date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('atraso', 'falta')),
  minutos int,
  hora_prevista time,
  hora_entrada time,
  fonte text,
  origem text NOT NULL DEFAULT 'auto' CHECK (origem IN ('auto', 'manual')),
  justificada boolean NOT NULL DEFAULT false,
  motivo text,
  revisado_por uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, data, tipo)
);
CREATE INDEX IF NOT EXISTS bonus_meta_ocorrencias_data_idx ON public.bonus_meta_ocorrencias (data);

GRANT SELECT ON public.bonus_meta_config, public.bonus_meta_participantes, public.bonus_meta_ocorrencias TO authenticated;
GRANT ALL ON public.bonus_meta_config, public.bonus_meta_participantes, public.bonus_meta_ocorrencias TO service_role;
ALTER TABLE public.bonus_meta_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_meta_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_meta_ocorrencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos leem config meta" ON public.bonus_meta_config;
CREATE POLICY "Todos leem config meta" ON public.bonus_meta_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Gestor le participantes meta" ON public.bonus_meta_participantes;
CREATE POLICY "Gestor le participantes meta" ON public.bonus_meta_participantes FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Gestor e o proprio leem ocorrencias meta" ON public.bonus_meta_ocorrencias;
CREATE POLICY "Gestor e o proprio leem ocorrencias meta" ON public.bonus_meta_ocorrencias FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = funcionario_id AND f.user_id = auth.uid())
  );

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION private.bonus_meta_eh_gestor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
$$;
REVOKE ALL ON FUNCTION private.bonus_meta_eh_gestor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.bonus_meta_eh_gestor() TO authenticated, service_role;

-- Cria as regras padrão e, se ainda não houver ninguém, os participantes iniciais (pelo nome).
-- Chamada pelo app (gestor) e pela atualização automática. Não faz nada se já estiver pronto.
CREATE OR REPLACE FUNCTION public.bonus_meta_preparar()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.bonus_meta_eh_gestor() THEN RETURN; END IF;
  INSERT INTO public.bonus_meta_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  IF EXISTS (SELECT 1 FROM public.bonus_meta_participantes) THEN RETURN; END IF;
  INSERT INTO public.bonus_meta_participantes (funcionario_id, colaborador_id, unidade)
  SELECT DISTINCT ON (n.nome) f.id, c.id, coalesce(nullif(c.unidade, ''), 'Botafogo')
  FROM (VALUES ('raquel'), ('julia'), ('mayara'), ('gleidiane'), ('lucivaldo'), ('flavio')) AS n(nome)
  JOIN public.funcionarios f
    ON translate(lower(btrim(f.nome)), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ ('(^|\s)' || n.nome || '(\s|$)')
  LEFT JOIN LATERAL (
    SELECT ec.id, ec.unidade FROM public.escala_colaboradores ec
    WHERE ec.ativo AND ec.vinculo = 'fixo'
      AND (ec.funcionario_id = f.id
           OR translate(lower(btrim(ec.nome)), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ ('(^|\s)' || n.nome || '(\s|$)'))
    ORDER BY (ec.funcionario_id = f.id) DESC NULLS LAST, ec.created_at
    LIMIT 1
  ) c ON true
  ORDER BY n.nome, (f.user_id IS NOT NULL) DESC, (f.pontomais_employee_id IS NOT NULL) DESC, f.nome
  ON CONFLICT (funcionario_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.bonus_meta_preparar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonus_meta_preparar() TO authenticated, service_role;

-- ------------------------------------------------------------- apuração
-- Recalcula atrasos/faltas automáticos do mês. Preserva justificativas e lançamentos manuais.
CREATE OR REPLACE FUNCTION public.bonus_meta_apurar(_mes date DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_inicio date := date_trunc('month', coalesce(_mes, v_hoje))::date;
  v_fim date := least((date_trunc('month', coalesce(_mes, v_hoje)) + interval '1 month - 1 day')::date, v_hoje);
  v_tol int;
  v_total int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.bonus_meta_eh_gestor() THEN
    RAISE EXCEPTION 'Somente gestor ou administrador recalcula a meta.';
  END IF;
  PERFORM public.bonus_meta_preparar();
  SELECT tolerancia_minutos INTO v_tol FROM public.bonus_meta_config WHERE id = 1;
  v_tol := coalesce(v_tol, 10);

  CREATE TEMP TABLE IF NOT EXISTS _bm_calc (
    funcionario_id uuid, data date, tipo text, minutos int, hora_prevista time, hora_entrada time, fonte text
  ) ON COMMIT DROP;
  TRUNCATE _bm_calc;

  WITH colabs AS (
    SELECT p.funcionario_id, array_agg(DISTINCT c.id) AS ids
    FROM public.bonus_meta_participantes p
    JOIN public.escala_colaboradores c ON (c.funcionario_id = p.funcionario_id OR c.id = p.colaborador_id)
    WHERE p.ativo
    GROUP BY p.funcionario_id
  ),
  dias AS (
    SELECT k.funcionario_id, d.data, d.status, d.hora_entrada AS prevista, k.ids AS colabs
    FROM colabs k
    JOIN public.escala_dias d ON d.colaborador_id = ANY (k.ids)
    WHERE d.data BETWEEN v_inicio AND v_fim AND d.status IN ('trabalho', 'falta')
  ),
  dia AS (
    SELECT DISTINCT ON (funcionario_id, data) funcionario_id, data, status, prevista, colabs
    FROM dias ORDER BY funcionario_id, data, (status = 'falta') DESC, prevista
  ),
  entradas AS (
    SELECT x.*,
      (SELECT r.entrada FROM public.registro_ponto_pontomais r
        WHERE r.funcionario_id = x.funcionario_id AND r.data = x.data) AS ent_pm,
      (SELECT min((b.registrado_em AT TIME ZONE 'America/Sao_Paulo')::time) FROM public.ponto_batidas b
        WHERE b.colaborador_id = ANY (x.colabs) AND b.data_ref = x.data AND b.tipo = 'entrada'
          AND b.status <> 'recusada') AS ent_app
    FROM dia x
  )
  INSERT INTO _bm_calc
  SELECT funcionario_id, data,
    CASE WHEN status = 'falta' OR coalesce(ent_pm, ent_app) IS NULL THEN 'falta' ELSE 'atraso' END,
    CASE WHEN status <> 'falta' AND coalesce(ent_pm, ent_app) IS NOT NULL
         THEN (extract(epoch FROM (coalesce(ent_pm, ent_app) - prevista)) / 60)::int END,
    prevista, coalesce(ent_pm, ent_app),
    CASE WHEN ent_pm IS NOT NULL THEN 'pontomais' WHEN ent_app IS NOT NULL THEN 'app' WHEN status = 'falta' THEN 'escala' ELSE 'sem batida' END
  FROM entradas
  WHERE
    -- falta: marcada na escala, ou dia já passado sem nenhuma entrada
    (status = 'falta' OR (coalesce(ent_pm, ent_app) IS NULL AND data < v_hoje))
    OR (prevista IS NOT NULL AND coalesce(ent_pm, ent_app) IS NOT NULL
        AND coalesce(ent_pm, ent_app) > prevista + make_interval(mins => v_tol)
        -- ignora turnos que viram a meia-noite (entrada "antes" do horário = outro dia)
        AND coalesce(ent_pm, ent_app) - prevista < interval '8 hours');

  -- remove automáticas que não valem mais (ex.: batida chegou depois)
  DELETE FROM public.bonus_meta_ocorrencias o
  WHERE o.origem = 'auto' AND o.data BETWEEN v_inicio AND v_fim
    AND NOT EXISTS (SELECT 1 FROM _bm_calc c WHERE c.funcionario_id = o.funcionario_id AND c.data = o.data AND c.tipo = o.tipo);

  INSERT INTO public.bonus_meta_ocorrencias AS o (funcionario_id, data, tipo, minutos, hora_prevista, hora_entrada, fonte, origem)
  SELECT funcionario_id, data, tipo, minutos, hora_prevista, hora_entrada, fonte, 'auto' FROM _bm_calc
  ON CONFLICT (funcionario_id, data, tipo) DO UPDATE
    SET minutos = EXCLUDED.minutos, hora_prevista = EXCLUDED.hora_prevista,
        hora_entrada = EXCLUDED.hora_entrada, fonte = EXCLUDED.fonte, updated_at = now()
    WHERE o.origem = 'auto';

  SELECT count(*) INTO v_total FROM _bm_calc;
  RETURN v_total;
END $$;
REVOKE ALL ON FUNCTION public.bonus_meta_apurar(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonus_meta_apurar(date) TO authenticated, service_role;

-- --------------------------------------------------------------- situação
-- Gestor vê todos; funcionário vê só a própria linha.
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
    -- ainda sem regras salvas: usa os padrões
    v_cfg.ativo := true; v_cfg.valor_por_pessoa := 100; v_cfg.nota_minima := 9;
    v_cfg.tolerancia_minutos := 10; v_cfg.max_atrasos := 3;
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.nome), '[]'::jsonb) INTO v_lista
  FROM (
    SELECT p.funcionario_id, f.nome, p.unidade, p.ativo,
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
    GROUP BY p.funcionario_id, f.nome, p.unidade, p.ativo, f.user_id, f.pontomais_employee_id, f.cpf
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

-- ------------------------------------------------------- ações do gestor
CREATE OR REPLACE FUNCTION public.bonus_meta_salvar_config(_ativo boolean, _valor numeric, _nota numeric, _tolerancia int, _max_atrasos int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.bonus_meta_eh_gestor() THEN RAISE EXCEPTION 'Somente gestor ou administrador altera a meta.'; END IF;
  INSERT INTO public.bonus_meta_config AS c (id, ativo, valor_por_pessoa, nota_minima, tolerancia_minutos, max_atrasos)
  VALUES (1, _ativo, _valor, _nota, _tolerancia, _max_atrasos)
  ON CONFLICT (id) DO UPDATE SET ativo = EXCLUDED.ativo, valor_por_pessoa = EXCLUDED.valor_por_pessoa,
    nota_minima = EXCLUDED.nota_minima, tolerancia_minutos = EXCLUDED.tolerancia_minutos,
    max_atrasos = EXCLUDED.max_atrasos, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.bonus_meta_salvar_participante(_funcionario_id uuid, _unidade text, _ativo boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.bonus_meta_eh_gestor() THEN RAISE EXCEPTION 'Somente gestor ou administrador altera participantes.'; END IF;
  IF _unidade NOT IN ('Botafogo', 'Ipanema', 'Ambas') THEN RAISE EXCEPTION 'Unidade inválida.'; END IF;
  INSERT INTO public.bonus_meta_participantes (funcionario_id, unidade, ativo, colaborador_id)
  VALUES (_funcionario_id, _unidade, coalesce(_ativo, true),
    (SELECT ec.id FROM public.escala_colaboradores ec WHERE ec.funcionario_id = _funcionario_id AND ec.ativo ORDER BY ec.created_at LIMIT 1))
  ON CONFLICT (funcionario_id) DO UPDATE SET unidade = EXCLUDED.unidade, ativo = EXCLUDED.ativo;
END $$;

CREATE OR REPLACE FUNCTION public.bonus_meta_remover_participante(_funcionario_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.bonus_meta_eh_gestor() THEN RAISE EXCEPTION 'Somente gestor ou administrador altera participantes.'; END IF;
  DELETE FROM public.bonus_meta_participantes WHERE funcionario_id = _funcionario_id;
END $$;

CREATE OR REPLACE FUNCTION public.bonus_meta_justificar(_ocorrencia_id uuid, _justificada boolean, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.bonus_meta_eh_gestor() THEN RAISE EXCEPTION 'Somente gestor ou administrador justifica ocorrências.'; END IF;
  UPDATE public.bonus_meta_ocorrencias
    SET justificada = coalesce(_justificada, false), motivo = nullif(btrim(coalesce(_motivo, '')), ''),
        revisado_por = auth.uid(), updated_at = now()
  WHERE id = _ocorrencia_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ocorrência não encontrada.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bonus_meta_lancar(_funcionario_id uuid, _data date, _tipo text, _minutos int, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.bonus_meta_eh_gestor() THEN RAISE EXCEPTION 'Somente gestor ou administrador lança ocorrências.'; END IF;
  IF _tipo NOT IN ('atraso', 'falta') OR _data IS NULL THEN RAISE EXCEPTION 'Informe data e tipo (atraso ou falta).'; END IF;
  INSERT INTO public.bonus_meta_ocorrencias (funcionario_id, data, tipo, minutos, origem, motivo, revisado_por, fonte)
  VALUES (_funcionario_id, _data, _tipo, _minutos, 'manual', nullif(btrim(coalesce(_motivo, '')), ''), auth.uid(), 'gestor')
  ON CONFLICT (funcionario_id, data, tipo) DO UPDATE
    SET origem = 'manual', minutos = EXCLUDED.minutos, motivo = EXCLUDED.motivo, justificada = false,
        revisado_por = auth.uid(), updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.bonus_meta_excluir_ocorrencia(_ocorrencia_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.bonus_meta_eh_gestor() THEN RAISE EXCEPTION 'Somente gestor ou administrador exclui ocorrências.'; END IF;
  DELETE FROM public.bonus_meta_ocorrencias WHERE id = _ocorrencia_id AND origem = 'manual';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Só ocorrências lançadas à mão podem ser excluídas. Para as automáticas, marque como justificada.';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.bonus_meta_salvar_config(boolean, numeric, numeric, int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bonus_meta_salvar_participante(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bonus_meta_remover_participante(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bonus_meta_justificar(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bonus_meta_lancar(uuid, date, text, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bonus_meta_excluir_ocorrencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonus_meta_salvar_config(boolean, numeric, numeric, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bonus_meta_salvar_participante(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bonus_meta_remover_participante(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bonus_meta_justificar(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bonus_meta_lancar(uuid, date, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bonus_meta_excluir_ocorrencia(uuid) TO authenticated;

-- ------------------------------------------- atualização automática (3x/dia)
-- Chama o app para buscar as batidas do Pontomais do mês e recalcular a meta.
CREATE OR REPLACE FUNCTION private.run_bonus_meta_sync()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text; v_secret text;
BEGIN
  SELECT replace(value, '/api/public/push-dispatcher', '/api/public/bonus-meta')
    INTO v_url FROM public.app_settings WHERE key = 'push_dispatcher_url';
  SELECT value INTO v_secret FROM public.app_settings WHERE key = 'push_dispatcher_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    PERFORM public.bonus_meta_apurar(NULL);
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatcher-secret', v_secret),
    body := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'run_bonus_meta_sync failed: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION private.run_bonus_meta_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.run_bonus_meta_sync() TO service_role;
-- O agendamento (3x/dia) fica na migração 0035, separada.
