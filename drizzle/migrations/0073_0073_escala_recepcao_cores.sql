-- Escala para a Recepção (só leitura + incluir/remover freelancer) e cor de identidade por pessoa.
-- Idempotente. Sem INSERT de dados.
--
-- Quem acessa: gestor/admin, quem tem a tela 'escala' liberada em Equipe, ou a Recepção enquanto o cadastro
-- dela não tiver lista personalizada de telas. A Recepção NUNCA publica, gera o mês, edita fixos ou vê valores.

ALTER TABLE public.escala_colaboradores ADD COLUMN IF NOT EXISTS cor text;
ALTER TABLE public.escala_colaboradores DROP CONSTRAINT IF EXISTS escala_colaboradores_cor_check;
ALTER TABLE public.escala_colaboradores ADD CONSTRAINT escala_colaboradores_cor_check
  CHECK (cor IS NULL OR cor ~ '^#[0-9a-fA-F]{6}$');

CREATE OR REPLACE FUNCTION private.pode_ver_escala_recepcao(_uid uuid)
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
      WHERE f.user_id = _uid AND f.telas_permitidas IS NOT NULL AND 'escala' = ANY (f.telas_permitidas)
    )
    OR (
      private.has_role(_uid, 'recepcao')
      AND NOT EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.user_id = _uid AND f.telas_permitidas IS NOT NULL)
    )
  );
$$;
REVOKE ALL ON FUNCTION private.pode_ver_escala_recepcao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.pode_ver_escala_recepcao(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.minha_permissao_escala_recepcao()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$ SELECT private.pode_ver_escala_recepcao(auth.uid()); $$;
REVOKE ALL ON FUNCTION public.minha_permissao_escala_recepcao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_permissao_escala_recepcao() TO authenticated;

-- Cores: a da pessoa, ou (se não escolheram) uma da paleta pela ordem de cadastro. Qualquer logado lê
-- (só id, nome e cor), para o app inteiro pintar o nome da pessoa igual.
CREATE OR REPLACE FUNCTION public.cores_equipe()
RETURNS TABLE (colaborador_id uuid, funcionario_id uuid, user_id uuid, nome text, cor text, cor_propria boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  WITH paleta AS (
    SELECT ARRAY['#2563eb','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2','#db2777','#65a30d',
                 '#ea580c','#4f46e5','#0d9488','#be123c','#a16207','#9333ea','#0284c7','#15803d',
                 '#c2410c','#6d28d9','#0f766e','#e11d48','#4d7c0f','#1d4ed8','#b45309','#a21caf'] AS p
  ), ord AS (
    SELECT c.*, row_number() OVER (ORDER BY c.created_at, c.id) AS n FROM public.escala_colaboradores c
  )
  SELECT o.id, o.funcionario_id, f.user_id, o.nome,
         coalesce(o.cor, (SELECT p[((o.n - 1) % 24)::int + 1] FROM paleta)),
         o.cor IS NOT NULL
  FROM ord o LEFT JOIN public.funcionarios f ON f.id = o.funcionario_id
  WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.cores_equipe() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cores_equipe() TO authenticated;

-- Painel da Recepção: toda a escala do período, sem valores, motivos ou vales.
CREATE OR REPLACE FUNCTION public.escala_recepcao_painel(_inicio date, _fim date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT private.pode_ver_escala_recepcao(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não está liberado na Escala.';
  END IF;
  IF _inicio IS NULL OR _fim IS NULL OR _fim < _inicio OR _fim - _inicio > 62 THEN
    RAISE EXCEPTION 'Período inválido.';
  END IF;
  RETURN jsonb_build_object(
    'colaboradores', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'setor', c.setor, 'unidade', c.unidade, 'vinculo', c.vinculo,
        'turno_padrao', c.turno_padrao, 'ativo', c.ativo,
        'hora_entrada', to_char(c.hora_entrada, 'HH24:MI')) ORDER BY c.nome)
      FROM public.escala_colaboradores c), '[]'::jsonb),
    'dias', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'colaborador_id', d.colaborador_id, 'unidade', d.unidade, 'setor', d.setor,
        'data', d.data, 'turno', d.turno,
        'hora_entrada', to_char(d.hora_entrada, 'HH24:MI'), 'hora_saida', to_char(d.hora_saida, 'HH24:MI'),
        'status', d.status, 'extra', d.modalidade_id IS NOT NULL,
        'removivel', (d.status = 'extra' AND d.modalidade_id IS NOT NULL AND d.data >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
                      AND d.motivo ILIKE '%pela recepção%' AND c.vinculo = 'freelance')
      ) ORDER BY d.data, d.unidade)
      FROM public.escala_dias d JOIN public.escala_colaboradores c ON c.id = d.colaborador_id
      WHERE d.data BETWEEN _inicio AND _fim AND d.status <> 'folga'), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.escala_recepcao_painel(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_recepcao_painel(date, date) TO authenticated;

-- Opções do formulário: freelancers e as modalidades (sem preço).
CREATE OR REPLACE FUNCTION public.escala_recepcao_opcoes(_unidade text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT private.pode_ver_escala_recepcao(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não está liberado na Escala.';
  END IF;
  RETURN jsonb_build_object(
    'freelancers', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'setor', c.setor,
        'hora_entrada', to_char(c.hora_entrada, 'HH24:MI')) ORDER BY c.setor, c.nome)
      FROM public.escala_colaboradores c
      WHERE c.ativo AND c.vinculo = 'freelance' AND c.unidade IN (_unidade, 'Ambas')), '[]'::jsonb),
    'modalidades', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'horas', m.horas, 'motivo', m.motivo) ORDER BY m.ordem, m.nome)
      FROM public.escala_freelance_modalidades m
      WHERE m.ativo AND m.unidade IN (_unidade, 'Ambas')), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.escala_recepcao_opcoes(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_recepcao_opcoes(text) TO authenticated;

-- Lança um freelancer (dia extra) usando o valor combinado da modalidade; a Recepção não digita nem vê valor.
CREATE OR REPLACE FUNCTION public.escala_recepcao_lancar(
  _unidade text, _data date, _colaborador_id uuid, _modalidade_id uuid,
  _hora_entrada time DEFAULT NULL, _substitui uuid DEFAULT NULL, _mensagem text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_quem text;
  v_col public.escala_colaboradores%ROWTYPE;
  v_mod public.escala_freelance_modalidades%ROWTYPE;
  v_entrada time;
  v_id uuid;
BEGIN
  IF NOT private.pode_ver_escala_recepcao(v_uid) THEN
    RAISE EXCEPTION 'Seu login não está liberado na Escala.';
  END IF;
  IF _unidade NOT IN ('Botafogo', 'Ipanema') THEN RAISE EXCEPTION 'Unidade inválida'; END IF;
  IF _data IS NULL OR _data < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Escolha hoje ou um dia futuro.';
  END IF;
  SELECT * INTO v_col FROM public.escala_colaboradores
  WHERE id = _colaborador_id AND ativo AND vinculo = 'freelance' AND unidade IN (_unidade, 'Ambas');
  IF v_col.id IS NULL THEN RAISE EXCEPTION 'Freelancer não encontrado para %.', _unidade; END IF;
  SELECT * INTO v_mod FROM public.escala_freelance_modalidades
  WHERE id = _modalidade_id AND ativo AND unidade IN (_unidade, 'Ambas');
  IF v_mod.id IS NULL THEN RAISE EXCEPTION 'Modalidade inválida para %.', _unidade; END IF;
  IF EXISTS (SELECT 1 FROM public.escala_dias WHERE colaborador_id = v_col.id AND data = _data) THEN
    RAISE EXCEPTION '% já está na escala em %.', v_col.nome, to_char(_data, 'DD/MM');
  END IF;
  v_entrada := coalesce(_hora_entrada, v_col.hora_entrada, '08:00'::time);
  SELECT coalesce(f.nome, u.email) INTO v_quem
  FROM auth.users u LEFT JOIN public.funcionarios f ON f.user_id = u.id
  WHERE u.id = v_uid ORDER BY f.nome LIMIT 1;
  INSERT INTO public.escala_dias (
    colaborador_id, unidade, setor, data, turno, hora_entrada, hora_saida, status, origem,
    substitui_colaborador_id, motivo, modalidade_id, motivo_chamada, horas_contratadas, valor_combinado, updated_by
  ) VALUES (
    v_col.id, _unidade, v_col.setor, _data, coalesce(v_col.turno_padrao, 'dia'), v_entrada,
    (v_entrada + make_interval(mins => (v_mod.horas * 60)::int))::time, 'extra', 'manual',
    _substitui,
    left(concat('Lançado pela recepção (', coalesce(v_quem, 'Recepção'), ')',
      CASE WHEN nullif(btrim(coalesce(_mensagem, '')), '') IS NOT NULL THEN ': ' || btrim(_mensagem) END), 500),
    v_mod.id, v_mod.motivo, v_mod.horas, v_mod.valor, v_uid
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_recepcao_lancar(text, date, uuid, uuid, time, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_recepcao_lancar(text, date, uuid, uuid, time, uuid, text) TO authenticated;

-- Remove só freelancer lançado pela recepção, de hoje em diante.
CREATE OR REPLACE FUNCTION public.escala_recepcao_remover(_dia_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NOT private.pode_ver_escala_recepcao(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não está liberado na Escala.';
  END IF;
  SELECT (d.status = 'extra' AND d.modalidade_id IS NOT NULL AND c.vinculo = 'freelance'
          AND d.data >= (now() AT TIME ZONE 'America/Sao_Paulo')::date AND d.motivo ILIKE '%pela recepção%')
  INTO v_ok
  FROM public.escala_dias d JOIN public.escala_colaboradores c ON c.id = d.colaborador_id
  WHERE d.id = _dia_id;
  IF v_ok IS NULL THEN RAISE EXCEPTION 'Plantão não encontrado.'; END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'Só dá para remover freelancer lançado pela recepção, de hoje em diante.'; END IF;
  DELETE FROM public.previsao_reforco_pedidos WHERE escala_dia_id = _dia_id;
  DELETE FROM public.escala_dias WHERE id = _dia_id;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_recepcao_remover(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_recepcao_remover(uuid) TO authenticated;
