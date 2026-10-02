-- 0017 — Correções da revisão (escala publicada, sincronização de freelancers e políticas do financeiro)
--
-- 1) Auditoria da escala: o trigger AFTER DELETE gravava em escala_alteracoes uma
--    referência (FK) para o dia que acabou de ser apagado, o que fazia o DELETE
--    falhar. Na prática, uma escala publicada não podia ser regerada nem ter dias
--    removidos. Agora a FK vira ON DELETE SET NULL e a auditoria guarda também
--    colaborador e data, para o histórico continuar legível.
-- 2) Regerar mês: deixa de apagar e recriar tudo. Só mexe nos dias automáticos que
--    realmente mudaram e mantém o mês publicado (os funcionários continuam vendo a
--    escala). Assim também não dispara uma notificação por dia sem mudança real.
-- 3) Freelancers → Financeiro: a soma só acontecia ao publicar. Agora qualquer
--    inclusão, alteração ou remoção de plantão de freelancer atualiza o lançamento
--    previsto do mês na hora. Plantões sem valor não quebram mais a sincronização.
-- 4) Financeiro: as políticas exigiam created_by = usuário também na edição, então
--    um gestor não conseguia editar/marcar como pago lançamento criado por outro
--    (ou pela escala). created_by agora só é exigido na criação.

-- ---------------------------------------------------------------------------
-- 1) Auditoria da escala
-- ---------------------------------------------------------------------------
ALTER TABLE public.escala_alteracoes
  ADD COLUMN IF NOT EXISTS colaborador_id uuid REFERENCES public.escala_colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data date;

ALTER TABLE public.escala_alteracoes ALTER COLUMN escala_dia_id DROP NOT NULL;

DO $$
DECLARE v_con text;
BEGIN
  SELECT c.conname INTO v_con
  FROM pg_constraint c
  WHERE c.conrelid = 'public.escala_alteracoes'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'public.escala_dias'::regclass;
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.escala_alteracoes DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE public.escala_alteracoes
  ADD CONSTRAINT escala_alteracoes_escala_dia_id_fkey
  FOREIGN KEY (escala_dia_id) REFERENCES public.escala_dias(id) ON DELETE SET NULL;

UPDATE public.escala_alteracoes a
SET colaborador_id = d.colaborador_id, data = d.data
FROM public.escala_dias d
WHERE d.id = a.escala_dia_id AND (a.colaborador_id IS NULL OR a.data IS NULL);

CREATE INDEX IF NOT EXISTS escala_alteracoes_colab_data_idx
  ON public.escala_alteracoes (colaborador_id, data);

CREATE OR REPLACE FUNCTION public.escala_registrar_alteracao_publicada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_publicada boolean;
  v_user_id uuid;
  v_row public.escala_dias%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_cmp_before jsonb;
  v_cmp_after jsonb;
  v_motivo text;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT EXISTS (
    SELECT 1 FROM public.escala_meses m
    WHERE m.unidade = v_row.unidade AND m.setor = v_row.setor
      AND m.competencia = date_trunc('month', v_row.data)::date
      AND m.status = 'publicada'
  ) INTO v_publicada;

  IF NOT v_publicada THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_before := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  v_after  := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  -- Ignora mudanças só de campos técnicos (updated_at / updated_by)
  v_cmp_before := v_before - 'updated_at' - 'updated_by';
  v_cmp_after  := v_after  - 'updated_at' - 'updated_by';
  IF v_cmp_before = v_cmp_after THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_motivo := coalesce(CASE WHEN TG_OP = 'DELETE' THEN OLD.motivo ELSE NEW.motivo END, 'Alteração administrativa');

  INSERT INTO public.escala_alteracoes (escala_dia_id, colaborador_id, data, alterado_por, antes, depois, motivo)
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_row.id END,
    v_row.colaborador_id, v_row.data, auth.uid(), v_before, v_after, v_motivo
  );

  -- Notifica só quando o status do dia muda (trabalho/folga/falta/...)
  IF (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END)
     IS DISTINCT FROM (CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.status END) THEN
    SELECT f.user_id INTO v_user_id
    FROM public.escala_colaboradores c
    JOIN public.funcionarios f ON f.id = c.funcionario_id
    WHERE c.id = v_row.colaborador_id;

    IF v_user_id IS NOT NULL THEN
      PERFORM private.enqueue_push_notification('escala_alterada', jsonb_build_object(
        'id', v_row.id,
        'user_id', v_user_id,
        'data', v_row.data,
        'antes', CASE WHEN TG_OP = 'INSERT' THEN 'sem escala' ELSE OLD.status END,
        'depois', CASE WHEN TG_OP = 'DELETE' THEN 'removido' ELSE NEW.status END,
        'motivo', v_motivo
      ));
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_registrar_alteracao_publicada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escala_registrar_alteracao_publicada() TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Regerar mês sem apagar tudo e sem despublicar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escala_regenerar_mes(
  _unidade text,
  _setor text,
  _competencia date,
  _dias jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _deleted integer := 0;
  _upserted integer := 0;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  IF _unidade NOT IN ('Botafogo','Ipanema') OR _setor NOT IN ('manutencao','recepcao','camareiras') OR _competencia <> date_trunc('month', _competencia)::date THEN
    RAISE EXCEPTION 'Parâmetros de escala inválidos';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _escala_novos (
    colaborador_id uuid, data date, turno text, hora_entrada time, hora_saida time, status text
  ) ON COMMIT DROP;
  TRUNCATE _escala_novos;

  INSERT INTO _escala_novos
  SELECT x.colaborador_id, x.data, x.turno, x.hora_entrada, x.hora_saida, x.status
  FROM jsonb_to_recordset(COALESCE(_dias, '[]'::jsonb)) AS x(
    colaborador_id uuid, data date, turno text, hora_entrada time, hora_saida time, status text
  )
  WHERE x.data >= _competencia
    AND x.data < (_competencia + interval '1 month')
    AND x.turno IN ('manha','noite','dia')
    AND x.status IN ('trabalho','folga');

  -- Remove só os dias automáticos que deixaram de existir no novo cálculo
  DELETE FROM public.escala_dias d
  WHERE d.unidade = _unidade AND d.setor = _setor
    AND d.data >= _competencia AND d.data < (_competencia + interval '1 month')
    AND d.origem = 'gerado'
    AND NOT EXISTS (
      SELECT 1 FROM _escala_novos n
      WHERE n.colaborador_id = d.colaborador_id AND n.data = d.data AND n.turno = d.turno
    );
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  -- Insere os novos e atualiza só os automáticos que mudaram; dias manuais nunca são tocados
  INSERT INTO public.escala_dias (
    colaborador_id, unidade, setor, data, turno, hora_entrada, hora_saida,
    status, origem, motivo, updated_by
  )
  SELECT n.colaborador_id, _unidade, _setor, n.data, n.turno,
         n.hora_entrada, n.hora_saida, n.status, 'gerado', NULL, auth.uid()
  FROM _escala_novos n
  ON CONFLICT (colaborador_id, data, turno) DO UPDATE
    SET hora_entrada = EXCLUDED.hora_entrada,
        hora_saida   = EXCLUDED.hora_saida,
        status       = EXCLUDED.status,
        updated_by   = EXCLUDED.updated_by
    WHERE public.escala_dias.origem = 'gerado'
      AND (public.escala_dias.status, public.escala_dias.hora_entrada, public.escala_dias.hora_saida)
          IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.hora_entrada, EXCLUDED.hora_saida);
  GET DIAGNOSTICS _upserted = ROW_COUNT;

  -- Mantém o status atual do mês (publicada continua publicada)
  INSERT INTO public.escala_meses (unidade, setor, competencia, status)
  VALUES (_unidade, _setor, _competencia, 'rascunho')
  ON CONFLICT (unidade, setor, competencia) DO NOTHING;

  RETURN _deleted + _upserted;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_regenerar_mes(text,text,date,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_regenerar_mes(text,text,date,jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Freelancers → Financeiro automático
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.escala_sincronizar_financeiro_interno(
  _unidade text,
  _competencia date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria uuid;
  v_count integer := 0;
  v_item record;
  v_existing record;
  v_key text;
  v_user uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
BEGIN
  SELECT id INTO v_categoria
  FROM public.fin_categorias
  WHERE lower(nome) IN ('freelancers (diárias)', 'freelancers (diarias)', 'freelancers')
    AND tipo = 'despesa'
  ORDER BY CASE WHEN lower(nome) = 'freelancers (diárias)' THEN 0 ELSE 1 END, ordem
  LIMIT 1;

  IF v_categoria IS NULL THEN
    RAISE WARNING 'Categoria Freelancers (diárias) não encontrada; sincronização ignorada';
    RETURN 0;
  END IF;

  FOR v_item IN
    WITH shifts AS (
      SELECT d.colaborador_id, c.nome, d.unidade, d.valor_combinado,
        coalesce(m.nome,
          CASE d.motivo_chamada
            WHEN 'reforco_ocupacao' THEN 'Reforço'
            WHEN 'cobertura_falta' THEN 'Cobertura de falta'
            ELSE 'Plantão'
          END
        ) AS modalidade,
        d.horas_contratadas
      FROM public.escala_dias d
      JOIN public.escala_colaboradores c ON c.id = d.colaborador_id
      LEFT JOIN public.escala_freelance_modalidades m ON m.id = d.modalidade_id
      WHERE d.unidade = _unidade
        AND date_trunc('month', d.data)::date = _competencia
        AND d.status = 'extra'
    ), grouped AS (
      SELECT colaborador_id, nome, unidade, modalidade, horas_contratadas,
        valor_combinado, count(*)::integer AS quantidade
      FROM shifts
      GROUP BY colaborador_id, nome, unidade, modalidade, horas_contratadas, valor_combinado
    )
    SELECT colaborador_id, nome, unidade,
      sum(quantidade)::integer AS qtd,
      coalesce(sum(valor_combinado * quantidade), 0)::numeric AS total,
      string_agg(
        concat(quantidade, '× ', modalidade, ' ', coalesce(trim(to_char(horas_contratadas, 'FM999990D##')), '?'), ' h (',
          CASE WHEN valor_combinado IS NULL THEN 'valor pendente'
               ELSE to_char(valor_combinado * quantidade, 'FM"R$ "999G999G990D00') END, ')'),
        ' + ' ORDER BY modalidade, horas_contratadas, valor_combinado
      ) AS detalhe
    FROM grouped
    GROUP BY colaborador_id, nome, unidade
  LOOP
    v_key := v_item.colaborador_id::text || ':' || _competencia::text || ':' || v_item.unidade;
    SELECT id, status INTO v_existing
    FROM public.fin_lancamentos
    WHERE origem_escala = v_key;

    -- Sem valor (todos os plantões com valor pendente): não cria lançamento;
    -- aparece como "sem valor" em escala_alertas_financeiros.
    IF v_item.total <= 0 THEN
      CONTINUE;
    END IF;

    IF v_existing.id IS NULL THEN
      INSERT INTO public.fin_lancamentos (
        tipo, unidade, categoria_id, descricao, valor, competencia, status,
        freelancer_nome, qtd_diarias, origem_escala, created_by
      ) VALUES (
        'despesa', v_item.unidade, v_categoria, v_item.detalhe, v_item.total,
        _competencia, 'previsto', v_item.nome, v_item.qtd, v_key, v_user
      );
      v_count := v_count + 1;
    ELSIF v_existing.status <> 'pago' THEN
      UPDATE public.fin_lancamentos
      SET descricao = v_item.detalhe,
          valor = v_item.total,
          categoria_id = v_categoria,
          freelancer_nome = v_item.nome,
          qtd_diarias = v_item.qtd,
          unidade = v_item.unidade,
          competencia = _competencia,
          status = CASE WHEN status = 'cancelado' THEN 'previsto' ELSE status END
      WHERE id = v_existing.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  UPDATE public.fin_lancamentos l
  SET status = 'cancelado',
      observacoes = concat_ws(' ', nullif(l.observacoes, ''), 'Cancelado automaticamente: não há mais plantões desta pessoa na escala.')
  WHERE l.origem_escala IS NOT NULL
    AND l.unidade = _unidade
    AND l.competencia = _competencia
    AND l.status NOT IN ('pago', 'cancelado')
    AND NOT EXISTS (
      SELECT 1
      FROM public.escala_dias d
      WHERE d.status = 'extra'
        AND d.unidade = _unidade
        AND date_trunc('month', d.data)::date = _competencia
        AND l.origem_escala = d.colaborador_id::text || ':' || _competencia::text || ':' || d.unidade
    );

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION private.escala_sincronizar_financeiro_interno(text,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.escala_sincronizar_financeiro_interno(text,date) TO service_role;

-- Função pública (botões/publicação) continua exigindo gestor
CREATE OR REPLACE FUNCTION public.escala_sincronizar_financeiro(
  _unidade text,
  _competencia date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Acesso restrito aos gestores';
  END IF;
  RETURN private.escala_sincronizar_financeiro_interno(_unidade, _competencia);
END;
$$;
REVOKE ALL ON FUNCTION public.escala_sincronizar_financeiro(text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_sincronizar_financeiro(text,date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.tg_escala_dias_sync_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'extra' THEN
    PERFORM private.escala_sincronizar_financeiro_interno(OLD.unidade, date_trunc('month', OLD.data)::date);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'extra'
     AND (TG_OP = 'INSERT' OR OLD.status <> 'extra'
          OR OLD.unidade <> NEW.unidade
          OR date_trunc('month', OLD.data) <> date_trunc('month', NEW.data)) THEN
    PERFORM private.escala_sincronizar_financeiro_interno(NEW.unidade, date_trunc('month', NEW.data)::date);
  END IF;
  -- Obs.: quando OLD e NEW são 'extra' no mesmo mês/unidade, a sincronização feita
  -- para OLD já enxerga a linha nova (trigger AFTER), então não precisa repetir.
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.tg_escala_dias_sync_financeiro() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_escala_dias_sync_financeiro ON public.escala_dias;
CREATE TRIGGER tr_escala_dias_sync_financeiro
AFTER INSERT OR UPDATE OR DELETE ON public.escala_dias
FOR EACH ROW EXECUTE FUNCTION private.tg_escala_dias_sync_financeiro();

-- Recalcula os meses que já têm plantões de freelancer
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT unidade, date_trunc('month', data)::date AS competencia
    FROM public.escala_dias WHERE status = 'extra'
  LOOP
    PERFORM private.escala_sincronizar_financeiro_interno(r.unidade, r.competencia);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Financeiro: created_by exigido só na criação
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('fin_lancamentos',     'Gestores administram lancamentos financeiros',   'lancamentos financeiros'),
      ('fin_recorrencias',    'Gestores administram recorrencias financeiras',  'recorrencias financeiras'),
      ('fin_indicadores_mes', 'Gestores administram indicadores financeiros',   'indicadores financeiros')
    ) AS v(tabela, politica, rotulo)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.politica, t.tabela);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Gestores consultam ' || t.rotulo, t.tabela);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Gestores criam ' || t.rotulo, t.tabela);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Gestores alteram ' || t.rotulo, t.tabela);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Gestores excluem ' || t.rotulo, t.tabela);

    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))$p$,
      'Gestores consultam ' || t.rotulo, t.tabela);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK ((private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role)) AND created_by = auth.uid())$p$,
      'Gestores criam ' || t.rotulo, t.tabela);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))$p$,
      'Gestores alteram ' || t.rotulo, t.tabela);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))$p$,
      'Gestores excluem ' || t.rotulo, t.tabela);
  END LOOP;
END $$;
