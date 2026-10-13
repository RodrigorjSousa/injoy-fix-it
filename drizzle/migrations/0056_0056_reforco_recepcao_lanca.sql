-- Reforço de limpeza: a Recepção LANÇA o freelancer direto (sem autorização) e o gestor só é avisado.
-- - previsao_lancar_reforco: cria o plantão de reforço na Escala (status extra → vai sozinho ao Financeiro),
--   cadastra o freelancer se o nome for novo, registra em previsao_reforco_pedidos (status 'lancado')
--   e manda push ao gestor.
-- - previsao_reforco_opcoes: freelancers e valor padrão para o formulário da Recepção (que não lê a Escala).
-- - previsao_excluir_reforco: o gestor exclui qualquer pedido/lançamento (e o plantão ligado a ele).
-- Idempotente.

ALTER TABLE public.previsao_reforco_pedidos ADD COLUMN IF NOT EXISTS escala_dia_id uuid;
ALTER TABLE public.previsao_reforco_pedidos ADD COLUMN IF NOT EXISTS freelancer_nome text;
ALTER TABLE public.previsao_reforco_pedidos ADD COLUMN IF NOT EXISTS valor numeric(10,2);
ALTER TABLE public.previsao_reforco_pedidos DROP CONSTRAINT IF EXISTS previsao_reforco_pedidos_escala_dia_fk;
ALTER TABLE public.previsao_reforco_pedidos ADD CONSTRAINT previsao_reforco_pedidos_escala_dia_fk
  FOREIGN KEY (escala_dia_id) REFERENCES public.escala_dias(id) ON DELETE SET NULL;
ALTER TABLE public.previsao_reforco_pedidos DROP CONSTRAINT IF EXISTS previsao_reforco_pedidos_status_check;
ALTER TABLE public.previsao_reforco_pedidos ADD CONSTRAINT previsao_reforco_pedidos_status_check
  CHECK (status IN ('pendente', 'autorizado', 'negado', 'lancado'));

-- Opções do formulário: freelancers da limpeza da unidade (só nome e horário, sem valores combinados)
-- e o valor/horas padrão da modalidade de reforço.
CREATE OR REPLACE FUNCTION public.previsao_reforco_opcoes(_unidade text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_mod public.escala_freelance_modalidades%ROWTYPE;
BEGIN
  IF NOT private.pode_ver_previsao_carga(auth.uid()) THEN
    RAISE EXCEPTION 'Seu login não está liberado na Previsão de Carga.';
  END IF;
  SELECT * INTO v_mod FROM public.escala_freelance_modalidades
  WHERE ativo AND motivo = 'reforco_ocupacao' AND unidade IN (_unidade, 'Ambas')
  ORDER BY (unidade = _unidade) DESC, ordem, valor
  LIMIT 1;
  RETURN jsonb_build_object(
    'freelancers', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'hora_entrada', to_char(c.hora_entrada, 'HH24:MI')) ORDER BY c.nome)
      FROM public.escala_colaboradores c
      WHERE c.ativo AND c.vinculo = 'freelance' AND c.setor = 'camareiras' AND c.unidade IN (_unidade, 'Ambas')
    ), '[]'::jsonb),
    'modalidade', v_mod.nome,
    'valor_padrao', coalesce(v_mod.valor, 150),
    'horas_padrao', coalesce(v_mod.horas, 8)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.previsao_reforco_opcoes(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsao_reforco_opcoes(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.previsao_lancar_reforco(
  _unidade text,
  _data date,
  _colaborador_id uuid,
  _novo_nome text,
  _valor numeric,
  _hora_entrada time DEFAULT NULL,
  _mensagem text DEFAULT NULL
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
  v_prev public.previsao_carga%ROWTYPE;
  v_nome text := nullif(btrim(regexp_replace(coalesce(_novo_nome, ''), '\s+', ' ', 'g')), '');
  v_horas numeric;
  v_entrada time;
  v_dia uuid;
  v_id uuid;
BEGIN
  IF NOT private.pode_ver_previsao_carga(v_uid) THEN
    RAISE EXCEPTION 'Seu login não está liberado na Previsão de Carga.';
  END IF;
  IF _unidade NOT IN ('Botafogo', 'Ipanema') THEN RAISE EXCEPTION 'Unidade inválida'; END IF;
  IF _data IS NULL OR _data < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Escolha hoje ou um dia futuro.';
  END IF;
  IF _valor IS NULL OR _valor < 0 THEN RAISE EXCEPTION 'Informe o valor do reforço.'; END IF;

  -- Freelancer: da lista ou nome novo (cria o cadastro básico; reaproveita se o nome já existir).
  IF _colaborador_id IS NOT NULL THEN
    SELECT * INTO v_col FROM public.escala_colaboradores
    WHERE id = _colaborador_id AND ativo AND vinculo = 'freelance' AND setor = 'camareiras'
      AND unidade IN (_unidade, 'Ambas');
    IF v_col.id IS NULL THEN RAISE EXCEPTION 'Freelancer não encontrado para %.', _unidade; END IF;
  ELSE
    IF v_nome IS NULL OR length(v_nome) < 3 THEN RAISE EXCEPTION 'Escolha o freelancer ou digite o nome completo.'; END IF;
    SELECT * INTO v_col FROM public.escala_colaboradores
    WHERE lower(nome) = lower(v_nome) AND setor = 'camareiras' AND unidade IN (_unidade, 'Ambas')
    ORDER BY (unidade = _unidade) DESC LIMIT 1;
    IF v_col.id IS NULL THEN
      INSERT INTO public.escala_colaboradores (nome, setor, unidade, vinculo, turno_padrao, ativo)
      VALUES (initcap(v_nome), 'camareiras', _unidade, 'freelance', 'dia', true)
      RETURNING * INTO v_col;
    ELSIF v_col.vinculo <> 'freelance' THEN
      RAISE EXCEPTION '% é fixo(a) na escala. Para chamar um fixo de folga, fale com o gestor.', v_col.nome;
    ELSIF NOT v_col.ativo THEN
      UPDATE public.escala_colaboradores SET ativo = true WHERE id = v_col.id RETURNING * INTO v_col;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.escala_dias WHERE colaborador_id = v_col.id AND data = _data) THEN
    RAISE EXCEPTION '% já está na escala em %.', v_col.nome, to_char(_data, 'DD/MM');
  END IF;

  SELECT * INTO v_mod FROM public.escala_freelance_modalidades
  WHERE ativo AND motivo = 'reforco_ocupacao' AND unidade IN (_unidade, 'Ambas')
  ORDER BY (unidade = _unidade) DESC, ordem, valor
  LIMIT 1;
  v_horas := coalesce(v_mod.horas, 8);
  v_entrada := coalesce(_hora_entrada, v_col.hora_entrada, '08:00'::time);

  SELECT coalesce(f.nome, u.email) INTO v_quem
  FROM auth.users u LEFT JOIN public.funcionarios f ON f.user_id = u.id
  WHERE u.id = v_uid ORDER BY f.nome LIMIT 1;

  INSERT INTO public.escala_dias (
    colaborador_id, unidade, setor, data, turno, hora_entrada, hora_saida, status, origem,
    motivo, modalidade_id, motivo_chamada, horas_contratadas, valor_combinado, updated_by
  ) VALUES (
    v_col.id, _unidade, 'camareiras', _data, coalesce(v_col.turno_padrao, 'dia'), v_entrada,
    (v_entrada + make_interval(mins => (v_horas * 60)::int))::time, 'extra', 'manual',
    left(concat('Reforço lançado pela recepção (', coalesce(v_quem, 'Recepção'), ')',
                CASE WHEN nullif(btrim(coalesce(_mensagem, '')), '') IS NOT NULL THEN ': ' || btrim(_mensagem) END), 500),
    v_mod.id, 'reforco_ocupacao', v_horas, round(_valor, 2), v_uid
  ) RETURNING id INTO v_dia;

  SELECT * INTO v_prev FROM public.previsao_carga
  WHERE unidade = _unidade AND data = _data ORDER BY calculado_em DESC LIMIT 1;

  INSERT INTO public.previsao_reforco_pedidos (
    unidade, data, nivel, ocupacao_pct, gerais, mensagem, status, solicitado_por, solicitado_nome,
    escala_dia_id, freelancer_nome, valor
  ) VALUES (
    _unidade, _data, v_prev.nivel, v_prev.ocupacao_carga_pct,
    coalesce(v_prev.qtd_geral, 0) + coalesce(v_prev.qtd_geral_checkin, 0),
    nullif(btrim(coalesce(_mensagem, '')), ''), 'lancado', v_uid, v_quem,
    v_dia, v_col.nome, round(_valor, 2)
  ) RETURNING id INTO v_id;

  PERFORM private.enqueue_push_notification('previsao_reforco', jsonb_build_object(
    'id', v_id, 'lancado', true, 'unidade', _unidade, 'data', _data, 'nome', v_quem,
    'freelancer', v_col.nome, 'valor', round(_valor, 2),
    'nivel', v_prev.nivel, 'ocupacao_pct', round(coalesce(v_prev.ocupacao_carga_pct, 0)),
    'mensagem', nullif(btrim(coalesce(_mensagem, '')), '')
  ));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.previsao_lancar_reforco(text, date, uuid, text, numeric, time, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsao_lancar_reforco(text, date, uuid, text, numeric, time, text) TO authenticated;

-- Gestor exclui um pedido ou lançamento (qualquer situação) e, se houver, o plantão ligado a ele.
CREATE OR REPLACE FUNCTION public.previsao_excluir_reforco(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_dia uuid;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'gestor') OR private.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Só o gestor exclui reforços.';
  END IF;
  SELECT escala_dia_id INTO v_dia FROM public.previsao_reforco_pedidos WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  DELETE FROM public.previsao_reforco_pedidos WHERE id = _id;
  IF v_dia IS NOT NULL THEN
    DELETE FROM public.escala_dias WHERE id = v_dia;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.previsao_excluir_reforco(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsao_excluir_reforco(uuid) TO authenticated;
